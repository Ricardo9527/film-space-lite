import * as THREE from "/vendor/three/three.module.js";

export const focusPlaneSurfaceLayer = 29;

const fullScreenVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const focusIntersectionFragmentShader = /* glsl */`
  #include <packing>

  varying vec2 vUv;
  uniform sampler2D tDepth;
  uniform mat4 cameraProjectionMatrixInverse;
  uniform mat4 cameraWorldMatrix;
  uniform vec3 focusPlanePoint;
  uniform vec3 focusPlaneNormal;
  uniform vec3 focusColor;
  uniform float focusBandWidth;

  void main() {
    float depth = unpackRGBAToDepth(texture2D(tDepth, vUv));
    if (depth >= 0.999999) discard;

    vec4 clipPosition = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 viewPosition = cameraProjectionMatrixInverse * clipPosition;
    viewPosition /= viewPosition.w;
    vec3 worldPosition = (cameraWorldMatrix * viewPosition).xyz;
    float planeDistance = abs(dot(
      worldPosition - focusPlanePoint,
      normalize(focusPlaneNormal)
    ));
    float band = 1.0 - smoothstep(focusBandWidth * 0.35, focusBandWidth, planeDistance);
    if (band <= 0.001) discard;

    gl_FragColor = vec4(focusColor * (0.72 + band * 0.4), band * 0.88);
    #include <colorspace_fragment>
  }
`;

export class CameraFocusPlaneIntersectionRenderer {
  constructor() {
    this.size = new THREE.Vector2();
    this.depthTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      blending: THREE.NoBlending,
      side: THREE.DoubleSide,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: this.depthTarget.texture },
        cameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
        cameraWorldMatrix: { value: new THREE.Matrix4() },
        focusPlanePoint: { value: new THREE.Vector3() },
        focusPlaneNormal: { value: new THREE.Vector3(0, 0, -1) },
        focusColor: { value: new THREE.Color(0x73d7ff) },
        focusBandWidth: { value: 0.04 },
      },
      vertexShader: fullScreenVertexShader,
      fragmentShader: focusIntersectionFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.fullScreenScene = new THREE.Scene();
    this.fullScreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fullScreenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  render(renderer, scene, camera, options) {
    const target = renderer.getRenderTarget();
    const width = target?.width || renderer.getDrawingBufferSize(this.size).x;
    const height = target?.height || this.size.y;
    if (this.depthTarget.width !== width || this.depthTarget.height !== height) {
      this.depthTarget.setSize(width, height);
    }

    const originalOverrideMaterial = scene.overrideMaterial;
    const originalLayerMask = camera.layers.mask;
    const originalAutoClear = renderer.autoClear;
    try {
      camera.layers.set(focusPlaneSurfaceLayer);
      scene.overrideMaterial = this.depthMaterial;
      renderer.autoClear = true;
      renderer.setRenderTarget(this.depthTarget);
      renderer.clear();
      renderer.render(scene, camera);

      scene.overrideMaterial = originalOverrideMaterial;
      camera.layers.mask = originalLayerMask;
      this.material.uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      this.material.uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      this.material.uniforms.focusPlanePoint.value.copy(options.planePoint);
      this.material.uniforms.focusPlaneNormal.value.copy(options.planeNormal).normalize();
      this.material.uniforms.focusBandWidth.value = Math.max(0.005, Number(options.bandWidth) || 0.04);
      renderer.setRenderTarget(target);
      renderer.autoClear = false;
      renderer.render(this.fullScreenScene, this.fullScreenCamera);
    } finally {
      scene.overrideMaterial = originalOverrideMaterial;
      camera.layers.mask = originalLayerMask;
      renderer.autoClear = originalAutoClear;
      renderer.setRenderTarget(target);
    }
  }

  dispose() {
    this.depthTarget.dispose();
    this.depthMaterial.dispose();
    this.material.dispose();
    this.fullScreenScene.children[0]?.geometry?.dispose();
  }
}
