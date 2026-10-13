import * as THREE from "/vendor/three/three.module.js";
import {
  maximumBokehRadiusPixels,
  normalizeDepthOfFieldOptics,
  vogelDiskKernel,
} from "./camera-depth-of-field-model.js";

const bokehKernel = vogelDiskKernel(80);
const farSampleCalls = shaderDiskSampleCalls("addFarSample", bokehKernel, "sum");
const nearInfluenceSampleCalls = shaderNearInfluenceSampleCalls();
const bokehRadiusCalibration = 2.4;
const nearFieldSpreadCalibration = 1.7;

const fullScreenVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const opticalShader = /* glsl */`
  #include <packing>

  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 texelSize;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focusDistance;
  uniform float aperture;
  uniform float focalLength;
  uniform float sensorWidth;
  uniform float maxBlurRadiusPixels;

  float viewDistanceAt(vec2 uv) {
    float depth = texture2D(tDepth, clamp(uv, vec2(0.0), vec2(1.0))).x;
    return -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  }

  float signedCircleOfConfusionRadiusPixels(vec2 uv) {
    float objectDistance = max(viewDistanceAt(uv), 0.001);
    float focalLengthMeters = focalLength / 1000.0;
    float sensorWidthMeters = sensorWidth / 1000.0;
    float safeFocusDistance = max(focusDistance, focalLengthMeters + 0.001);
    float circleDiameterMeters = (
      focalLengthMeters * focalLengthMeters * (objectDistance - safeFocusDistance)
    ) / (
      max(aperture, 0.1)
      * objectDistance
      * max(safeFocusDistance - focalLengthMeters, 0.001)
    );
    float imageWidthPixels = 1.0 / texelSize.x;
    return clamp(
      circleDiameterMeters / sensorWidthMeters * imageWidthPixels * 0.5,
      -maxBlurRadiusPixels,
      maxBlurRadiusPixels
    );
  }

  vec2 blurData(float radiusPixels) {
    float radius = clamp(radiusPixels, 0.0, maxBlurRadiusPixels);
    return vec2(
      smoothstep(0.35, 1.0, radius),
      radius / maxBlurRadiusPixels
    );
  }

  float calibratedBokehRadius(float radiusPixels) {
    float calibration = mix(
      1.0,
      ${bokehRadiusCalibration.toFixed(1)},
      smoothstep(1.0, 3.0, radiusPixels)
    );
    return radiusPixels * calibration;
  }
`;

const circleOfConfusionFragmentShader = /* glsl */`
  ${opticalShader}

  void main() {
    float signedRadius = signedCircleOfConfusionRadiusPixels(vUv);
    float nearRadius = calibratedBokehRadius(max(-signedRadius, 0.0));
    nearRadius *= mix(
      1.0,
      ${nearFieldSpreadCalibration.toFixed(1)},
      smoothstep(1.0, 3.0, nearRadius)
    );
    vec2 nearData = blurData(nearRadius);
    vec2 farData = blurData(calibratedBokehRadius(max(signedRadius, 0.0)));
    gl_FragColor = vec4(nearData, farData);
  }
`;

const nearCircleOfConfusionBlurFragmentShader = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tCoC;
  uniform vec2 sourceTexelSize;
  uniform float maxBlurRadiusPixels;

  void addNearInfluence(inout vec2 best, vec2 direction) {
    vec2 sampleUv = clamp(
      vUv + direction * sourceTexelSize * maxBlurRadiusPixels,
      vec2(0.0),
      vec2(1.0)
    );
    vec2 source = texture2D(tCoC, sampleUv).rg;
    float sourceRadius = source.y * maxBlurRadiusPixels;
    float sampleDistance = length(direction) * maxBlurRadiusPixels;
    float feather = max(1.5, sourceRadius * 0.12);
    float reachesPixel = 1.0 - smoothstep(
      sourceRadius - feather,
      sourceRadius + feather,
      sampleDistance
    );
    float influence = source.x * reachesPixel;
    if (influence > best.x) best.x = influence;
    if (influence > 0.001) best.y = max(best.y, source.y);
  }

  void main() {
    vec2 best = texture2D(tCoC, vUv).rg;
    ${nearInfluenceSampleCalls}
    gl_FragColor = vec4(best, 0.0, 1.0);
  }
`;

const nearSourceFragmentShader = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tCoC;

  void main() {
    vec2 coc = texture2D(tCoC, vUv).rg;
    // Geometry coverage stays opaque while CoC only controls blur strength.
    float coverage = step(0.000001, coc.g);
    vec3 color = texture2D(tColor, vUv).rgb;
    gl_FragColor = vec4(color * coverage, coverage);
  }
`;

const nearBlurFragmentShader = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tNearSource;
  uniform sampler2D tNearCoC;
  uniform vec2 texelSize;
  uniform vec2 direction;
  uniform float maxBlurRadiusPixels;

  void addTap(inout vec4 sum, float position, float weight, float radiusPixels) {
    vec2 sampleUv = clamp(
      vUv + direction * texelSize * position * radiusPixels,
      vec2(0.0),
      vec2(1.0)
    );
    sum += texture2D(tNearSource, sampleUv) * weight;
  }

  void main() {
    vec2 influence = texture2D(tNearCoC, vUv).rg;
    if (influence.x <= 0.001 || influence.y <= 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float radiusPixels = influence.y * maxBlurRadiusPixels * 0.5;
    vec4 sum = vec4(0.0);
    addTap(sum, -1.000, 0.0092, radiusPixels);
    addTap(sum, -0.833, 0.0227, radiusPixels);
    addTap(sum, -0.667, 0.0489, radiusPixels);
    addTap(sum, -0.500, 0.0919, radiusPixels);
    addTap(sum, -0.333, 0.1506, radiusPixels);
    addTap(sum, -0.167, 0.2155, radiusPixels);
    addTap(sum,  0.000, 0.2485, radiusPixels);
    addTap(sum,  0.167, 0.2155, radiusPixels);
    addTap(sum,  0.333, 0.1506, radiusPixels);
    addTap(sum,  0.500, 0.0919, radiusPixels);
    addTap(sum,  0.667, 0.0489, radiusPixels);
    addTap(sum,  0.833, 0.0227, radiusPixels);
    addTap(sum,  1.000, 0.0092, radiusPixels);
    gl_FragColor = sum / 1.3270;
  }
`;

const backgroundSourceFragmentShader = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tCoC;
  uniform sampler2D tFar;

  void main() {
    vec3 beauty = texture2D(tColor, vUv).rgb;
    vec4 coc = texture2D(tCoC, vUv);
    vec4 farField = texture2D(tFar, vUv);
    float blendFar = min(farField.a, 0.5) * 2.0;
    vec3 background = mix(beauty, farField.rgb, blendFar);
    float validBackground = 1.0 - step(0.000001, coc.g);
    gl_FragColor = vec4(background, validBackground);
  }
`;

const backgroundInpaintFragmentShader = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tSource;
  uniform vec2 texelSize;
  uniform float jumpDistance;

  void addBackgroundSample(inout vec4 sum, vec2 direction) {
    vec4 sampleValue = texture2D(
      tSource,
      clamp(vUv + direction * texelSize * jumpDistance, vec2(0.0), vec2(1.0))
    );
    sum.rgb += sampleValue.rgb * sampleValue.a;
    sum.a += sampleValue.a;
  }

  void main() {
    vec4 center = texture2D(tSource, vUv);
    if (center.a > 0.999) {
      gl_FragColor = center;
      return;
    }
    vec4 sum = vec4(0.0);
    addBackgroundSample(sum, vec2( 1.0,  0.0));
    addBackgroundSample(sum, vec2(-1.0,  0.0));
    addBackgroundSample(sum, vec2( 0.0,  1.0));
    addBackgroundSample(sum, vec2( 0.0, -1.0));
    addBackgroundSample(sum, vec2( 0.7071,  0.7071));
    addBackgroundSample(sum, vec2(-0.7071,  0.7071));
    addBackgroundSample(sum, vec2( 0.7071, -0.7071));
    addBackgroundSample(sum, vec2(-0.7071, -0.7071));
    gl_FragColor = sum.a > 0.001
      ? vec4(sum.rgb / sum.a, 1.0)
      : vec4(0.0);
  }
`;

const farFieldFragmentShader = /* glsl */`
  ${opticalShader}

  void addFarSample(inout vec4 sum, vec2 direction, float radiusPixels) {
    vec2 sampleUv = clamp(
      vUv + direction * texelSize * radiusPixels,
      vec2(0.0),
      vec2(1.0)
    );
    float sampleRadius = max(signedCircleOfConfusionRadiusPixels(sampleUv), 0.0);
    float weight = smoothstep(0.2, 0.8, sampleRadius);
    vec3 sampleColor = texture2D(tColor, sampleUv).rgb;
    sum += vec4(sampleColor * weight, weight);
  }

  void main() {
    float radiusPixels = max(signedCircleOfConfusionRadiusPixels(vUv), 0.0);
    float blendAmount = smoothstep(0.35, 1.0, radiusPixels);
    if (blendAmount <= 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec4 sum = vec4(0.0);
    ${farSampleCalls}
    vec3 sourceColor = texture2D(tColor, vUv).rgb;
    vec3 blurredColor = sum.a > 0.001 ? sum.rgb / sum.a : sourceColor;
    gl_FragColor = vec4(blurredColor, blendAmount);
  }
`;

const compositeFragmentShader = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tNearCoC;
  uniform sampler2D tNear;
  uniform sampler2D tFar;
  uniform sampler2D tBackground;

  void main() {
    vec4 beauty = texture2D(tColor, vUv);
    vec4 nearInfluence = texture2D(tNearCoC, vUv);
    vec4 nearField = texture2D(tNear, vUv);
    vec4 farField = texture2D(tFar, vUv);
    vec4 backgroundPlate = texture2D(tBackground, vUv);
    float blendNear = clamp(nearInfluence.r, 0.0, 1.0);
    float blendFar = min(farField.a, 0.5) * 2.0;
    vec3 farResult = mix(beauty.rgb, farField.rgb, blendFar);
    vec3 cleanBackground = backgroundPlate.a > 0.001
      ? backgroundPlate.rgb
      : farResult;
    vec3 blurredNearResult = (
      cleanBackground * (1.0 - clamp(nearField.a, 0.0, 1.0))
      + nearField.rgb
    );
    vec3 result = mix(farResult, blurredNearResult, blendNear);
    gl_FragColor = vec4(result, beauty.a);
    #include <colorspace_fragment>
  }
`;

export class CameraDepthOfFieldRenderer {
  constructor() {
    this.size = new THREE.Vector2();
    this.colorTarget = createColorTarget(true);
    this.circleOfConfusionTarget = createColorTarget(false);
    this.nearCircleOfConfusionTarget = createColorTarget(false);
    this.nearSourceTarget = createColorTarget(false);
    this.nearHorizontalTarget = createColorTarget(false);
    this.nearTarget = createColorTarget(false);
    this.farTarget = createColorTarget(false);
    this.backgroundSourceTarget = createColorTarget(false);
    this.backgroundInpaintTargetA = createColorTarget(false);
    this.backgroundInpaintTargetB = createColorTarget(false);
    this.circleOfConfusionMaterial = createOpticalMaterial(
      circleOfConfusionFragmentShader,
      this.colorTarget.texture,
      this.colorTarget.depthTexture
    );
    this.nearCircleOfConfusionMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tCoC: { value: this.circleOfConfusionTarget.texture },
        sourceTexelSize: { value: new THREE.Vector2(1, 1) },
        maxBlurRadiusPixels: { value: 96 },
      },
      vertexShader: fullScreenVertexShader,
      fragmentShader: nearCircleOfConfusionBlurFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.nearSourceMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tCoC: { value: this.circleOfConfusionTarget.texture },
      },
      vertexShader: fullScreenVertexShader,
      fragmentShader: nearSourceFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.nearHorizontalMaterial = createNearBlurMaterial(
      this.nearSourceTarget.texture,
      this.nearCircleOfConfusionTarget.texture,
      new THREE.Vector2(1, 0)
    );
    this.nearVerticalMaterial = createNearBlurMaterial(
      this.nearHorizontalTarget.texture,
      this.nearCircleOfConfusionTarget.texture,
      new THREE.Vector2(0, 1)
    );
    this.farMaterial = createOpticalMaterial(
      farFieldFragmentShader,
      this.colorTarget.texture,
      this.colorTarget.depthTexture
    );
    this.backgroundSourceMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tCoC: { value: this.circleOfConfusionTarget.texture },
        tFar: { value: this.farTarget.texture },
      },
      vertexShader: fullScreenVertexShader,
      fragmentShader: backgroundSourceFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.backgroundInpaintMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tSource: { value: this.backgroundSourceTarget.texture },
        texelSize: { value: new THREE.Vector2(1, 1) },
        jumpDistance: { value: 1 },
      },
      vertexShader: fullScreenVertexShader,
      fragmentShader: backgroundInpaintFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tNearCoC: { value: this.nearCircleOfConfusionTarget.texture },
        tNear: { value: this.nearTarget.texture },
        tFar: { value: this.farTarget.texture },
        tBackground: { value: this.backgroundInpaintTargetB.texture },
      },
      vertexShader: fullScreenVertexShader,
      fragmentShader: compositeFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.fullScreenScene = new THREE.Scene();
    this.fullScreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fullScreenQuad = new THREE.Mesh(geometry, this.compositeMaterial);
    this.fullScreenScene.add(this.fullScreenQuad);
  }

  render(renderer, scene, camera, options = {}) {
    const target = options.target || null;
    if (options.enabled !== true) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      return;
    }

    const width = target?.width || renderer.getDrawingBufferSize(this.size).x;
    const height = target?.height || this.size.y;
    const effectWidth = Math.max(1, Math.round(width * 0.5));
    const effectHeight = Math.max(1, Math.round(height * 0.5));
    this.resizeTargets(width, height, effectWidth, effectHeight);

    const optics = normalizeDepthOfFieldOptics(options);
    const maxBlurRadiusPixels = maximumBokehRadiusPixels(width);
    this.updateOpticalUniforms(camera, optics, width, height, maxBlurRadiusPixels);

    const originalTarget = renderer.getRenderTarget();
    const originalAutoClear = renderer.autoClear;
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(this.colorTarget);
      renderer.clear();
      renderer.render(scene, camera);

      this.renderPass(renderer, this.circleOfConfusionTarget, this.circleOfConfusionMaterial);
      this.renderPass(
        renderer,
        this.nearCircleOfConfusionTarget,
        this.nearCircleOfConfusionMaterial
      );

      this.renderPass(renderer, this.nearSourceTarget, this.nearSourceMaterial);
      this.renderPass(renderer, this.nearHorizontalTarget, this.nearHorizontalMaterial);
      this.renderPass(renderer, this.nearTarget, this.nearVerticalMaterial);

      this.renderPass(renderer, this.farTarget, this.farMaterial);

      this.renderPass(renderer, this.backgroundSourceTarget, this.backgroundSourceMaterial);
      let backgroundSource = this.backgroundSourceTarget;
      let backgroundTarget = this.backgroundInpaintTargetA;
      for (const jumpDistance of [1, 2, 4, 8, 16, 32]) {
        this.backgroundInpaintMaterial.uniforms.tSource.value = backgroundSource.texture;
        this.backgroundInpaintMaterial.uniforms.jumpDistance.value = jumpDistance;
        this.renderPass(renderer, backgroundTarget, this.backgroundInpaintMaterial);
        backgroundSource = backgroundTarget;
        backgroundTarget = backgroundTarget === this.backgroundInpaintTargetA
          ? this.backgroundInpaintTargetB
          : this.backgroundInpaintTargetA;
      }
      this.compositeMaterial.uniforms.tBackground.value = backgroundSource.texture;

      this.renderPass(renderer, target, this.compositeMaterial);
    } finally {
      this.fullScreenQuad.material = this.compositeMaterial;
      renderer.autoClear = originalAutoClear;
      renderer.setRenderTarget(originalTarget);
    }
  }

  resizeTargets(width, height, effectWidth, effectHeight) {
    if (this.colorTarget.width !== width || this.colorTarget.height !== height) {
      this.colorTarget.setSize(width, height);
      this.circleOfConfusionTarget.setSize(width, height);
      this.nearCircleOfConfusionMaterial.uniforms.sourceTexelSize.value.set(
        1 / width,
        1 / height
      );
    }
    if (
      this.nearCircleOfConfusionTarget.width !== effectWidth
      || this.nearCircleOfConfusionTarget.height !== effectHeight
    ) {
      this.nearCircleOfConfusionTarget.setSize(effectWidth, effectHeight);
      this.nearSourceTarget.setSize(effectWidth, effectHeight);
      this.nearHorizontalTarget.setSize(effectWidth, effectHeight);
      this.nearTarget.setSize(effectWidth, effectHeight);
      this.farTarget.setSize(effectWidth, effectHeight);
      this.backgroundSourceTarget.setSize(effectWidth, effectHeight);
      this.backgroundInpaintTargetA.setSize(effectWidth, effectHeight);
      this.backgroundInpaintTargetB.setSize(effectWidth, effectHeight);
      for (const material of [this.nearHorizontalMaterial, this.nearVerticalMaterial]) {
        material.uniforms.texelSize.value.set(1 / effectWidth, 1 / effectHeight);
      }
      this.backgroundInpaintMaterial.uniforms.texelSize.value.set(
        1 / effectWidth,
        1 / effectHeight
      );
    }
  }

  updateOpticalUniforms(camera, optics, width, height, maxBlurRadiusPixels) {
    for (const material of [
      this.circleOfConfusionMaterial,
      this.farMaterial,
    ]) {
      material.uniforms.texelSize.value.set(1 / width, 1 / height);
      material.uniforms.cameraNear.value = camera.near;
      material.uniforms.cameraFar.value = camera.far;
      material.uniforms.focusDistance.value = optics.focusDistance;
      material.uniforms.aperture.value = optics.aperture;
      material.uniforms.focalLength.value = optics.focalLength;
      material.uniforms.sensorWidth.value = optics.sensorWidth;
      material.uniforms.maxBlurRadiusPixels.value = maxBlurRadiusPixels;
    }
    this.nearCircleOfConfusionMaterial.uniforms.maxBlurRadiusPixels.value = (
      maxBlurRadiusPixels
    );
    this.nearHorizontalMaterial.uniforms.maxBlurRadiusPixels.value = maxBlurRadiusPixels;
    this.nearVerticalMaterial.uniforms.maxBlurRadiusPixels.value = maxBlurRadiusPixels;
  }

  renderPass(renderer, target, material) {
    this.fullScreenQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.fullScreenScene, this.fullScreenCamera);
  }

  dispose() {
    this.colorTarget.dispose();
    this.circleOfConfusionTarget.dispose();
    this.nearCircleOfConfusionTarget.dispose();
    this.nearSourceTarget.dispose();
    this.nearHorizontalTarget.dispose();
    this.nearTarget.dispose();
    this.farTarget.dispose();
    this.backgroundSourceTarget.dispose();
    this.backgroundInpaintTargetA.dispose();
    this.backgroundInpaintTargetB.dispose();
    this.circleOfConfusionMaterial.dispose();
    this.nearCircleOfConfusionMaterial.dispose();
    this.nearSourceMaterial.dispose();
    this.nearHorizontalMaterial.dispose();
    this.nearVerticalMaterial.dispose();
    this.farMaterial.dispose();
    this.backgroundSourceMaterial.dispose();
    this.backgroundInpaintMaterial.dispose();
    this.compositeMaterial.dispose();
    this.fullScreenQuad.geometry.dispose();
  }
}

function createColorTarget(withDepth) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: withDepth,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });
  if (withDepth) {
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
  }
  return target;
}

function createOpticalMaterial(fragmentShader, colorTexture, depthTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: colorTexture },
      tDepth: { value: depthTexture },
      texelSize: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: 0.05 },
      cameraFar: { value: 120 },
      focusDistance: { value: 5 },
      aperture: { value: 2.8 },
      focalLength: { value: 35 },
      sensorWidth: { value: 36 },
      maxBlurRadiusPixels: { value: 96 },
    },
    vertexShader: fullScreenVertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function createNearBlurMaterial(sourceTexture, circleOfConfusionTexture, direction) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tNearSource: { value: sourceTexture },
      tNearCoC: { value: circleOfConfusionTexture },
      texelSize: { value: new THREE.Vector2(1, 1) },
      direction: { value: direction },
      maxBlurRadiusPixels: { value: 96 },
    },
    vertexShader: fullScreenVertexShader,
    fragmentShader: nearBlurFragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function shaderDiskSampleCalls(functionName, kernel, accumulator) {
  return kernel.map(({ x, y }) => (
    `${functionName}(${accumulator}, vec2(${x.toFixed(7)}, ${y.toFixed(7)}), radiusPixels);`
  )).join("\n    ");
}

function shaderNearInfluenceSampleCalls() {
  const rings = [
    { radius: 0.02, samples: 8 },
    { radius: 0.04, samples: 8 },
    { radius: 0.08, samples: 8 },
    { radius: 0.125, samples: 8 },
    { radius: 0.1875, samples: 8 },
    { radius: 0.25, samples: 8 },
    { radius: 0.375, samples: 12 },
    { radius: 0.5, samples: 12 },
    { radius: 0.75, samples: 12 },
    { radius: 1, samples: 12 },
  ];
  return rings.flatMap(({ radius, samples }, ringIndex) => (
    Array.from({ length: samples }, (_, sampleIndex) => {
      const angle = (sampleIndex + (ringIndex % 2) * 0.5) / samples * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return `addNearInfluence(best, vec2(${x.toFixed(7)}, ${y.toFixed(7)}));`;
    })
  )).join("\n    ");
}
