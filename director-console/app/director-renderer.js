import { visibleContentBounds, updateCameraFarFromBounds } from "./camera-clipping.js";

import { outputAssetDependencies } from "./output-assets.js";
import { createBlockingFigure, applyBlockingFigurePose } from "./blocking-figure.js";
import * as THREE from "/vendor/three/three.module.js";
import { OrbitControls } from "/vendor/three/controls/OrbitControls.js";

import { GLTFLoader } from "/vendor/three/loaders/GLTFLoader.js";

import { blockoutImageUV, visibleBlockoutImages } from "./blockout-image.js";
import { environmentAssetURL, referenceImageAssetURL } from "./project-api.js";

import { projectOutputResolution, clothingColors, actorColor, motionPathPoints, visualEnvironmentQuaternionFromRotationDegrees, visualEnvironmentRotationDegrees } from "./project-model.js";

import { actorPlaybackPlan } from "./playback-engine.js";

import { cameraSensorGate, outputVerticalFov, overscanVerticalFov } from "./camera-composition.js";
import {
  cameraOpticalRollDegrees,
  setCameraOpticalRollDegrees,
} from "./camera-aim.js";
import {
  cameraFocalLengthMaximum,
  cameraFocalLengthMinimum,
} from "./camera-track.js";
import {
  actorTransformHandleScale,
  cameraAuthoringTranslationSpeedScale,
  cameraNavigationReferenceDistance,
  clearSceneNavigationTransientState,
  dollyWheelDeltaForPinch,
  focalLengthAfterWheel,
  normalizedWheelDelta,
  orbitDistanceAfterWheel,
  planarNavigationBasis,
  sceneAuthoringModeActive,
  sceneCameraRotationLocked,
  sceneNavigationForView,
  sphericalOrbitAfterPointer,
  translateCameraNavigationTargets,
  worldUnitsPerScreenPixel,
} from "./camera-viewport-navigation.js";

import { createBlockoutGeometry } from "./blockout-geometry.js";
import { CameraDepthOfFieldRenderer } from "./camera-depth-of-field.js";
import { focusPlaneGroundIntersection } from "./camera-focus-plane.js";
import {
  CameraFocusPlaneIntersectionRenderer,
  focusPlaneSurfaceLayer,
} from "./camera-focus-plane-overlay.js";

const editorCameraPlanarMaxSpeed = 5.5;
const editorCameraVerticalSpeed = 2.4;
const editorCameraAcceleration = 8;
const editorCameraDeceleration = 10;
const shotCameraLookSpeed = THREE.MathUtils.degToRad(48);
const shotCameraRollSpeed = THREE.MathUtils.degToRad(48);
const shotCameraRollStep = THREE.MathUtils.degToRad(1);
const shotCameraOrbitMinDistance = 0.12;
const shotCameraOrbitMaxDistance = 250;
const editorCameraFocusDuration = 0.32;
const guideBackgroundColor = new THREE.Color(0x101216);
const cameraGuideColor = new THREE.Color(0xd4a75f);
const cameraAimTargetColor = new THREE.Color(0x72d2cb);
const cameraGuideFadeNearDistance = 0.75;
const cameraGuideFadeFarDistance = 2;
const cameraKeyframeFadeNearDistance = 0.18;
const cameraKeyframeFadeFarDistance = 0.9;
const cameraGuideFadeResponse = 12;
const sceneGroundGridRenderOffset = 0.002;

const editorCameraKeyCodes = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);
const planarCameraKeyCodes = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
const translationCameraKeyCodes = new Set([...planarCameraKeyCodes, "KeyQ", "KeyE"]);
const precisionCameraKeyCodes = new Set(["ShiftLeft", "ShiftRight"]);
const shotCameraKeyCodes = new Set([
  ...editorCameraKeyCodes,
  "BracketLeft",
  "BracketRight",
]);

function matchesLetterShortcut(event, letter, code) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  return event.key?.toLowerCase() === letter || event.code === code;
}

export class DirectorRenderer {
  constructor(options) {
    this.viewport = options.viewport;
    this.onSelect = options.onSelect || (() => {});
    this.onSelectSceneObject = options.onSelectSceneObject || (() => {});
    this.onAddMove = options.onAddMove || (() => {});
    this.onSelectPathPoint = options.onSelectPathPoint || (() => {});
    this.onClearPathPointSelection = options.onClearPathPointSelection || (() => {});
    this.onPathPointPreview = options.onPathPointPreview || (() => {});
    this.onPathPointCommit = options.onPathPointCommit || (() => {});
    this.onSelectCameraKeyframe = options.onSelectCameraKeyframe || (() => {});
    this.onCameraKeyframePreview = options.onCameraKeyframePreview || (() => {});
    this.onCameraKeyframeCommit = options.onCameraKeyframeCommit || (() => {});
    this.onCameraAimTargetPreview = options.onCameraAimTargetPreview || (() => {});
    this.onCameraAimTargetCommit = options.onCameraAimTargetCommit || (() => {});
    // 机位锁定态用：拖视口的时候把数字实时喂回检查器。落库不在这里 ——
    // 那要按 K，所以不需要「松手」的信号。
    this.onSceneCameraMoved = options.onSceneCameraMoved || (() => {});
    this.onTransformPreview = options.onTransformPreview || (() => {});
    this.onTransformCommit = options.onTransformCommit || (() => {});
    this.onSceneObjectTransformPreview = options.onSceneObjectTransformPreview || (() => {});
    this.onSceneObjectTransformCommit = options.onSceneObjectTransformCommit || (() => {});
    this.onPlacementChange = options.onPlacementChange || (() => {});
    this.onShotCameraPoseChange = options.onShotCameraPoseChange || (() => {});
    this.onFocalLengthPreview = options.onFocalLengthPreview || (() => {});
    this.onFocusDistancePicked = options.onFocusDistancePicked || (() => {});
    this.onEnvironmentStatus = options.onEnvironmentStatus || (() => {});

    this.project = null;
    this.samples = new Map();
    this.selectedActorID = null;
    this.topViewLock = null;
    this.selectedObject = null;
    this.sceneObjectSelectionEnabled = false;
    this.selectedPathPointID = null;
    this.playbackStatus = "idle";
    this.timelineSeeking = false;
    this.editable = true;
    this.actorMotionEditable = true;
    this.shotCameraEditable = false;
    this.previewActive = false;
    this.transformDragging = false;
    this.moveDragging = null;
    this.rotationDragging = null;
    this.placingMove = false;
    this.actors = new Map();
    this.pickTargets = [];
    this.sceneObjectPickTargets = [];
    this.pathPointTargets = [];
    this.pathPointDragging = null;
    this.cameraKeyframeTargets = [];
    this.cameraKeyframeGuides = [];
    this.cameraKeyframeDragging = null;
    this.cameraAimTargetGuideState = [];
    this.cameraAimTargetGuideKey = "";
    this.cameraAimTargetTargets = [];
    this.cameraAimTargetDragging = null;
    
    
    
    this.cameraTrackPose = null;
    this.cameraTrackLocked = false;
    this.cameraAimRotationLocked = false;
    this.cameraAimEvaluation = null;
    this.viewportMode = "edit";
    this.editViewMode = "scene";
    this.shotAspectRatio = "16:9";
    this.shotFrameHeightFraction = 0.84;
    this.sceneFramePreviewEnabled = false;
    this.sceneFrameAspectRatio = "16:9";
    this.sceneFrameHeightFraction = 0.84;
    this.authoringGuidesVisible = true;
    this.cameraKeys = new Set();
    this.cameraPrecisionKeys = new Set();
    this.cameraNavigationSpeedMultipliers = { scene: 1, camera: 1 };
    this.cameraPlanarVelocity = new THREE.Vector2();
    this.sceneCameraPlanarBasis = null;
    this.shotCameraPlanarBasis = null;
    this.cameraAuthoringTranslationContext = null;
    this.cameraFocusTransition = null;
    this.shotCameraDragging = null;
    this.focusPicking = false;
    this.focusPickingMode = null;
    this.focusPickTargets = [];
    this.focusPlaneVisible = true;
    this.shotObservationTarget = null;
    this.cameraGuideState = null;
    this.cameraGuideKey = "";
    this.cameraRigGuide = null;
    this.outputRenderer = null;
    
    this.outputDepthOfFieldRenderer = null;
    this.outputResolution = null;
    this.outputAnimationSampling = null;
    
    
    
    
    
    
    
    
    
    
    
    this.environmentEntries = new Map();
    this.environmentGroupEntries = new Map();
    this.blockoutKey = "";
    this.blockoutImageLoads = new Map();
    this.onBlockoutImageError = options.onBlockoutImageError || (() => {});

    this.scene = new THREE.Scene();
    this.depthOfFieldRenderer = new CameraDepthOfFieldRenderer();
    this.focusPlaneIntersectionRenderer = new CameraFocusPlaneIntersectionRenderer();
    this.focusPlaneScene = new THREE.Scene();
    this.focusGroundLine = createFocusGroundLine();
    this.focusPlaneScene.add(this.focusGroundLine);
    this.scene.background = new THREE.Color(0x101216);
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.05, 120);
    this.camera.filmGauge = 36;
    this.camera.userData.focalLength = 35;
    this.camera.position.set(4.8, 4.2, 6.6);
    this.camera.lookAt(0, 0.85, 0);
    this.shotCamera = new THREE.PerspectiveCamera(44, 1, 0.05, 120);
    this.shotCamera.filmGauge = 36;
    this.shotCamera.userData.focalLength = 35;
    this.shotCamera.userData.focusDistance = 5;
    this.shotCamera.userData.aperture = 2.8;
    this.shotCamera.userData.depthOfFieldEnabled = false;
    this.shotCamera.position.copy(this.camera.position);
    this.shotCamera.quaternion.copy(this.camera.quaternion);
    // 机位视角走自己的相机，和 Shot View 一样：自由相机从头到尾不动，
    // 所以退出时不需要「记住来路再还原」——它根本没走开过。
    this.setupCamera = new THREE.PerspectiveCamera(44, 1, 0.05, 120);
    this.setupCamera.filmGauge = 36;
    this.setupCamera.userData.focalLength = 35;
    this.setupCamera.userData.focusDistance = 5;
    this.setupCamera.userData.aperture = 2.8;
    this.setupCamera.userData.depthOfFieldEnabled = false;
    this.setupViewActive = false;
    this.setupFrameAspectRatio = "16:9";
    this.setupFrameHeightFraction = 0.84;
    this.setupRollDegrees = 0;
    this.setupCameraDirty = false;

    this.diagnostics = new URLSearchParams(window.location.search).has("diagnostics");
    this.frameTimes = [];
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "director-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "三维场景编辑视图");
    this.renderer.domElement.setAttribute(
      "aria-keyshortcuts",
      "F T W A S D Q E Shift+W Shift+A Shift+S Shift+D Shift+Q Shift+E ArrowUp ArrowDown ArrowLeft ArrowRight BracketLeft BracketRight"
    );
    this.renderer.domElement.dataset.viewportMode = this.viewportMode;
    this.renderer.domElement.dataset.editViewMode = this.editViewMode;
    this.viewport.appendChild(this.renderer.domElement);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 0.85, 0);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 1.2;
    this.orbit.maxDistance = 45;
    this.orbit.maxPolarAngle = Math.PI - 0.025;

    // 机位有自己的一套 orbit，各自持有各自的 target —— 换成挪 orbit.object 的话，
    // 自由相机的 target 就得存起来再还原，又回到「记住来路」那条老路上。
    // 两套永远只有一套 enabled。
    this.setupOrbit = new OrbitControls(this.setupCamera, this.renderer.domElement);
    this.setupOrbit.enableDamping = true;
    this.setupOrbit.dampingFactor = 0.08;
    this.setupOrbit.minDistance = 0.2;
    this.setupOrbit.maxDistance = 120;
    this.setupOrbit.maxPolarAngle = Math.PI - 0.025;
    this.setupOrbit.enabled = false;

    this.actorTransformHandle = this.createActorTransformHandle();
    this.scene.add(this.actorTransformHandle);
    
    
    
    

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.name = "FloorHitPlane";
    this.scene.add(this.floor);

    this.environmentGroup = new THREE.Group();
    this.environmentGroup.name = "VisualEnvironment";
    this.scene.add(this.environmentGroup);
    this.blockoutRoot = new THREE.Group();
    this.blockoutRoot.name = "BlockoutEnvironment";
    this.scene.add(this.blockoutRoot);

    this.guides = new THREE.Group();
    this.guides.name = "AuthoringGuides";
    this.scene.add(this.guides);
    this.cameraGuides = new THREE.Group();
    this.cameraGuides.name = "CameraAuthoringGuides";
    this.scene.add(this.cameraGuides);
    this.cameraAimTargetGuides = new THREE.Group();
    this.cameraAimTargetGuides.name = "CameraAimTargetGuides";
    this.scene.add(this.cameraAimTargetGuides);
    
    this.gltfLoader = new GLTFLoader();
    
    
    this.lastFrameAt = performance.now();

    this.addSceneBase();
    this.setupEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
    this.resize();
    this.animate();

    window.__filmSpaceDirectorDebug = {
      renderer: this,
      actorIDs: () => Array.from(this.actors.keys()),
    };
  }

  addSceneBase() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f49, 2.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.75);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb7d9, 0.55);
    fill.position.set(-5, 3, -4);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(24, 24, 0x6b707b, 0x343840);
    this.grid.name = "SceneGroundGrid";
    // Keep the authored floor at Y=0. The grid is a renderer adapter and sits
    // just above coplanar ground geometry so orbiting never causes z-fighting.
    this.grid.position.y = sceneGroundGridRenderOffset;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.56;
    this.grid.material.depthWrite = false;
    this.scene.add(this.grid);

    this.origin = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 24),
      new THREE.MeshBasicMaterial({ color: 0x747b86, transparent: true, opacity: 0.5 })
    );
    this.origin.rotation.x = -Math.PI / 2;
    this.origin.position.y = 0.004;
    this.scene.add(this.origin);
  }

  createActorTransformHandle() {
    const handle = new THREE.Group();
    handle.name = "ActorTransformHandle";
    handle.visible = false;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0b46d,
      transparent: true,
      opacity: 0.82,
      depthTest: false,
    });
    const puckMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0b46d,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.014, 8, 64), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 30;
    handle.add(ring);

    const headingNotch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.045), puckMaterial);
    headingNotch.position.set(0, 0.014, 0.52);
    headingNotch.renderOrder = 31;
    handle.add(headingNotch);

    const movePuck = new THREE.Mesh(new THREE.CircleGeometry(0.105, 32), puckMaterial);
    movePuck.rotation.x = -Math.PI / 2;
    movePuck.renderOrder = 31;
    handle.add(movePuck);

    const moveHitTarget = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 32),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    moveHitTarget.name = "ActorMoveHandleHit";
    moveHitTarget.rotation.x = -Math.PI / 2;
    handle.add(moveHitTarget);

    const rotationHitTarget = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.075, 6, 64),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    rotationHitTarget.name = "ActorRotationHandleHit";
    rotationHitTarget.rotation.x = Math.PI / 2;
    handle.add(rotationHitTarget);
    handle.userData.moveHitTarget = moveHitTarget;
    handle.userData.rotationHitTarget = rotationHitTarget;
    handle.userData.ring = ring;
    handle.userData.headingNotch = headingNotch;
    handle.userData.movePuck = movePuck;
    return handle;
  }

  setupEvents() {
    this.renderer.domElement.addEventListener("wheel", (event) => {
      if (this.viewportMode !== "edit") return;
      const delta = normalizedWheelDelta(
        event.deltaY,
        event.deltaMode,
        this.viewport.clientHeight
      );
      if (event.ctrlKey) {
        if (this.isShotEditView() && !this.shotCameraEditable) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        const dollyDelta = dollyWheelDeltaForPinch(delta);
        const changed = this.isShotEditView()
          ? this.dollyShotCamera(dollyDelta)
          : this.dollySceneCamera(dollyDelta);
        if (changed && this.isShotEditView()) this.notifyShotCameraPoseChange();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (this.isShotEditView() && !this.shotCameraEditable) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const activeCamera = this.isShotEditView()
        ? this.shotCamera
        : this.isSetupViewActive() ? this.setupCamera : this.camera;
      const focalLength = focalLengthAfterWheel(
        activeCamera.userData.focalLength,
        delta
      );
      if (this.setCurrentFocalLength(focalLength)) {
        this.onFocalLengthPreview({
          view: this.isShotEditView() ? "shot" : "scene",
          focalLength,
        });
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, passive: false });

    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      this.renderer.domElement.focus({ preventScroll: true });
      if (this.focusPicking && event.button === 0) {
        const focusPick = this.pickShotFocus(event);
        if (focusPick) {
          this.setFocusPicking(false);
          this.onFocusDistancePicked(focusPick);
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        this.isShotEditView()
        && this.shotCameraEditable
        && (event.button === 0 || event.button === 2)
        && (event.button !== 0 || !this.cameraAimRotationLocked)
      ) {
        const target = this.resolveShotObservationTarget();
        this.shotCameraDragging = {
          pointerID: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          mode: event.button === 2 ? "pan" : "orbit",
          target: target.clone(),
          moved: false,
        };
        this.renderer.domElement.setPointerCapture?.(event.pointerId);
        this.renderer.domElement.classList.add("adjusting-shot-camera");
        event.preventDefault();
        return;
      }
      if (!this.isSceneAuthoringModeActive()) return;
      if (this.transformDragging) return;
      // OrbitControls owns non-primary buttons in Scene View. Editing and selection stay
      // left-button-only so right-button panning never grabs a handle or changes selection.
      if (event.button !== 0) return;
      const aimTarget = this.pickCameraAimTarget(event);
      if (aimTarget?.userData.cameraAimKeyframeID && event.button === 0) {
        const position = aimTarget.parent.getWorldPosition(new THREE.Vector3());
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          this.activeSceneNavigation().camera.getWorldDirection(new THREE.Vector3()).normalize(),
          position
        );
        const pointerPoint = this.pickPlane(event, plane);
        if (pointerPoint) {
          this.cameraAimTargetDragging = {
            keyframeID: aimTarget.userData.cameraAimKeyframeID,
            pointerID: event.pointerId,
            plane,
            offset: position.clone().sub(pointerPoint),
            position,
            moved: false,
          };
          this.setActiveSceneOrbitEnabled(false);
          this.renderer.domElement.classList.add("moving-camera-aim-target");
          this.renderer.domElement.setPointerCapture?.(event.pointerId);
        }
        event.preventDefault();
        return;
      }
      const cameraKeyframe = this.pickCameraKeyframe(event);
      if (cameraKeyframe?.userData.cameraKeyframeID && event.button === 0) {
        const keyframeID = cameraKeyframe.userData.cameraKeyframeID;
        this.onSelectCameraKeyframe(keyframeID);
        if (this.shotCameraEditable) {
          const position = cameraKeyframe.getWorldPosition(new THREE.Vector3());
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            this.activeSceneNavigation().camera.getWorldDirection(new THREE.Vector3()).normalize(),
            position
          );
          const pointerPoint = this.pickPlane(event, plane);
          if (pointerPoint) {
            this.cameraKeyframeDragging = {
              keyframeID,
              pointerID: event.pointerId,
              plane,
              offset: position.clone().sub(pointerPoint),
              position,
              moved: false,
            };
            this.setActiveSceneOrbitEnabled(false);
            this.renderer.domElement.classList.add("moving-camera-keyframe");
            this.renderer.domElement.setPointerCapture?.(event.pointerId);
          }
        }
        event.preventDefault();
        return;
      }
      if (this.pickMoveHandle(event)) {
        const target = this.selectedTransformTarget();
        const group = target?.object || null;
        const worldPosition = group?.getWorldPosition(new THREE.Vector3()) || null;
        const point = worldPosition ? this.pickHorizontalPlane(event, worldPosition.y) : null;
        if (group && point) {
          const actor = target.kind === "actor"
            ? this.project?.scene?.actors?.find((candidate) => candidate.id === group.userData.actorID)
            : null;
          const startPoint = actor ? motionPathPoints(actor)[0] : null;
          this.transformDragging = true;
          this.moveDragging = {
            kind: target.kind,
            id: target.id,
            parentID: target.parentID,
            target: group,
            actorID: target.kind === "actor" ? group.userData.actorID : null,
            pathPointID: startPoint?.id || null,
            moveWholeBlocking: target.kind !== "actor"
              || event.shiftKey
              || !startPoint?.id,
            pointerID: event.pointerId,
            startPointer: point.clone(),
            startPosition: group.position.clone(),
            startWorldPosition: worldPosition,
            position: group.position.clone(),
            moved: false,
          };
          this.setActiveSceneOrbitEnabled(false);
          this.renderer.domElement.classList.add("moving-actor");
          this.renderer.domElement.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          return;
        }
      }
      if (this.pickRotationHandle(event)) {
        const target = this.selectedTransformTarget();
        const group = target?.object || null;
        const environmentRotation = ["environment", "environmentGroup"].includes(target?.kind)
          ? visualEnvironmentRotationDegrees(target.kind === "environment"
              ? this.project?.scene?.environment?.visuals?.find((visual) => visual.id === target.id)
              : this.project?.scene?.environment?.groups?.find((group) => group.id === target.id))
          : null;
        const center = group?.getWorldPosition(new THREE.Vector3()) || null;
        const point = center ? this.pickHorizontalPlane(event, center.y) : null;
        if (group && point) {
          this.transformDragging = true;
          this.rotationDragging = {
            kind: target.kind,
            id: target.id,
            parentID: target.parentID,
            target: group,
            actorID: target.kind === "actor" ? group.userData.actorID : null,
            pointerID: event.pointerId,
            center,
            startPointerAngle: Math.atan2(point.x - center.x, point.z - center.z),
            startRotationY: environmentRotation
              ? THREE.MathUtils.degToRad(environmentRotation.yaw)
              : group.rotation.y,
            pitchDegrees: environmentRotation?.pitch || 0,
            rotationY: environmentRotation
              ? THREE.MathUtils.degToRad(environmentRotation.yaw)
              : group.rotation.y,
            moved: false,
          };
          this.setActiveSceneOrbitEnabled(false);
          this.renderer.domElement.classList.add("rotating-actor");
          this.renderer.domElement.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          return;
        }
      }
      const pathPoint = this.actorMotionEditable ? this.pickPathPoint(event) : null;
      if (pathPoint?.userData.pathPointID) {
        const { actorID, pathPointID } = pathPoint.userData;
        const authoredPosition = pathPoint.userData.pathPointPosition || pathPoint.position;
        this.onSelectPathPoint(actorID, pathPointID);
        this.pathPointDragging = {
          actorID,
          pathPointID,
          pointerID: event.pointerId,
          position: new THREE.Vector3(
            Number(authoredPosition.x || 0),
            Number(authoredPosition.y || 0),
            Number(authoredPosition.z || 0)
          ),
          moved: false,
        };
        this.setActiveSceneOrbitEnabled(false);
        this.renderer.domElement.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        return;
      }
      if (this.placingMove && this.selectedActorAllowsMotionEditing()) {
        const point = this.pickMoveTarget(event);
        if (point) {
          this.setMovePlacement(false);
          this.onAddMove({
            x: point.x,
            y: point.y,
            z: point.z,
          });
          event.preventDefault();
        }
        return;
      }
      const selectable = this.pickSceneEntity(event);
      if (this.sceneObjectSelectionEnabled && selectable?.userData.visualEnvironment) {
        this.onSelectSceneObject({
          kind: "environment",
          id: selectable.userData.visualEnvironmentID,
          parentID: null,
        });
      } else if (this.sceneObjectSelectionEnabled && selectable?.userData.blockoutObjectID) {
        this.onSelectSceneObject({
          kind: "blockoutObject",
          id: selectable.userData.blockoutObjectID,
          parentID: selectable.userData.blockoutGroupID,
        });
      } else if (selectable?.userData.actorID) {
        this.onSelect(selectable.userData.actorID);
      } else {
        this.onClearPathPointSelection();
      }
    });

    this.renderer.domElement.addEventListener("pointermove", (event) => {
      if (this.shotCameraDragging && event.pointerId === this.shotCameraDragging.pointerID) {
        const drag = this.shotCameraDragging;
        const deltaX = event.clientX - drag.x;
        const deltaY = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 0) {
          drag.moved = true;
          if (drag.mode === "pan") {
            this.panShotCamera(drag.target, deltaX, deltaY);
          } else {
            this.orbitShotCamera(drag.target, deltaX, deltaY);
          }
          this.notifyShotCameraPoseChange();
        }
        event.preventDefault();
        return;
      }
      if (!this.isSceneAuthoringModeActive() && !this.moveDragging && !this.rotationDragging && !this.pathPointDragging && !this.cameraKeyframeDragging && !this.cameraAimTargetDragging) return;
      if (this.cameraAimTargetDragging && event.pointerId === this.cameraAimTargetDragging.pointerID) {
        const drag = this.cameraAimTargetDragging;
        const point = this.pickPlane(event, drag.plane);
        if (!point) return;
        const position = point.add(drag.offset);
        if (!drag.moved && position.distanceToSquared(drag.position) < 0.000001) return;
        drag.position.copy(position);
        drag.moved = true;
        this.onCameraAimTargetPreview(drag.keyframeID, {
          x: position.x,
          y: position.y,
          z: position.z,
        });
        event.preventDefault();
        return;
      }
      if (this.cameraKeyframeDragging && event.pointerId === this.cameraKeyframeDragging.pointerID) {
        const drag = this.cameraKeyframeDragging;
        const point = this.pickPlane(event, drag.plane);
        if (!point) return;
        const position = point.add(drag.offset);
        if (!drag.moved && position.distanceToSquared(drag.position) < 0.000001) return;
        drag.position.copy(position);
        drag.moved = true;
        this.onCameraKeyframePreview(drag.keyframeID, {
          x: position.x,
          y: position.y,
          z: position.z,
        });
        event.preventDefault();
        return;
      }
      if (this.moveDragging && event.pointerId === this.moveDragging.pointerID) {
        const drag = this.moveDragging;
        const group = drag.kind === "actor" ? this.actors.get(drag.actorID) : drag.target;
        const point = this.pickHorizontalPlane(event, drag.startWorldPosition.y);
        if (!group || !point) return;
        const desiredWorld = drag.startWorldPosition.clone().add(new THREE.Vector3(
          point.x - drag.startPointer.x,
          0,
          point.z - drag.startPointer.z
        ));
        const localPosition = group.parent
          ? group.parent.worldToLocal(desiredWorld.clone())
          : desiredWorld;
        drag.position.set(
          localPosition.x,
          drag.startPosition.y,
          localPosition.z
        );
        const movedNow = drag.position.distanceToSquared(drag.startPosition) > 0.000001;
        if (!drag.moved && !movedNow) {
          event.preventDefault();
          return;
        }
        drag.moved = true;
        group.position.copy(drag.position);
        const position = { x: group.position.x, y: group.position.y, z: group.position.z };
        if (drag.kind !== "actor") {
          this.onSceneObjectTransformPreview(
            { kind: drag.kind, id: drag.id, parentID: drag.parentID },
            { position, rotationY: normalizeAngle(group.rotation.y) }
          );
        } else if (drag.moveWholeBlocking) {
          this.onTransformPreview(group.userData.actorID, {
            position,
            rotationY: normalizeAngle(group.rotation.y),
          });
        } else {
          this.onPathPointPreview(group.userData.actorID, drag.pathPointID, position);
        }
        event.preventDefault();
        return;
      }
      if (this.rotationDragging && event.pointerId === this.rotationDragging.pointerID) {
        const drag = this.rotationDragging;
        const group = drag.kind === "actor" ? this.actors.get(drag.actorID) : drag.target;
        const point = this.pickHorizontalPlane(event, drag.center.y);
        if (!group || !point) return;
        const pointerAngle = Math.atan2(point.x - drag.center.x, point.z - drag.center.z);
        drag.rotationY = normalizeAngle(
          drag.startRotationY + normalizeAngle(pointerAngle - drag.startPointerAngle)
        );
        const movedNow = Math.abs(normalizeAngle(drag.rotationY - drag.startRotationY)) > 0.001;
        if (!drag.moved && !movedNow) {
          event.preventDefault();
          return;
        }
        drag.moved = true;
        if (["environment", "environmentGroup"].includes(drag.kind)) {
          const quaternion = visualEnvironmentQuaternionFromRotationDegrees({
            pitch: drag.pitchDegrees,
            yaw: THREE.MathUtils.radToDeg(drag.rotationY),
          });
          group.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        } else {
          group.rotation.set(0, drag.rotationY, 0);
        }
        const pose = {
          position: { x: group.position.x, y: group.position.y, z: group.position.z },
          rotationY: drag.rotationY,
        };
        if (drag.kind === "actor") this.onTransformPreview(group.userData.actorID, pose);
        else this.onSceneObjectTransformPreview(
          { kind: drag.kind, id: drag.id, parentID: drag.parentID },
          pose
        );
        event.preventDefault();
        return;
      }
      if (this.pathPointDragging && event.pointerId === this.pathPointDragging.pointerID) {
        const point = this.pickHorizontalPlane(
          event,
          this.pathPointDragging.position.y
        );
        if (!point) return;
        const position = {
          x: point.x,
          y: this.pathPointDragging.position.y,
          z: point.z,
        };
        this.pathPointDragging.position.set(position.x, position.y, position.z);
        this.pathPointDragging.moved = true;
        this.onPathPointPreview(
          this.pathPointDragging.actorID,
          this.pathPointDragging.pathPointID,
          position
        );
        event.preventDefault();
        return;
      }
      const aimTargetHover = Boolean(this.pickCameraAimTarget(event));
      this.renderer.domElement.classList.toggle("camera-aim-target-hover", aimTargetHover);
      const cameraKeyframeHover = !aimTargetHover && Boolean(this.pickCameraKeyframe(event));
      this.renderer.domElement.classList.toggle("camera-keyframe-hover", cameraKeyframeHover);
      const moveHover = !cameraKeyframeHover && Boolean(this.pickMoveHandle(event));
      this.renderer.domElement.classList.toggle("move-handle-hover", moveHover);
      this.renderer.domElement.classList.toggle(
        "rotation-handle-hover",
        !cameraKeyframeHover && !moveHover && Boolean(this.pickRotationHandle(event))
      );
    });

    const finishPathPointDrag = (event) => {
      if (!this.pathPointDragging || event.pointerId !== this.pathPointDragging.pointerID) return;
      const drag = this.pathPointDragging;
      this.pathPointDragging = null;
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
      this.setActiveSceneOrbitEnabled(true);
      if (drag.moved) {
        this.onPathPointCommit(drag.actorID, drag.pathPointID, {
          x: drag.position.x,
          y: drag.position.y,
          z: drag.position.z,
        });
      }
      this.updateActorHandles();
      event.preventDefault();
    };
    this.renderer.domElement.addEventListener("pointerup", finishPathPointDrag);
    this.renderer.domElement.addEventListener("pointercancel", finishPathPointDrag);

    const finishCameraAimTargetDrag = (event) => {
      if (!this.cameraAimTargetDragging || event.pointerId !== this.cameraAimTargetDragging.pointerID) return;
      const drag = this.cameraAimTargetDragging;
      this.cameraAimTargetDragging = null;
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
      this.renderer.domElement.classList.remove("moving-camera-aim-target");
      this.setActiveSceneOrbitEnabled(true);
      if (drag.moved) {
        this.onCameraAimTargetCommit(drag.keyframeID, {
          x: drag.position.x,
          y: drag.position.y,
          z: drag.position.z,
        });
      }
      event.preventDefault();
    };
    this.renderer.domElement.addEventListener("pointerup", finishCameraAimTargetDrag);
    this.renderer.domElement.addEventListener("pointercancel", finishCameraAimTargetDrag);

    const finishCameraKeyframeDrag = (event) => {
      if (!this.cameraKeyframeDragging || event.pointerId !== this.cameraKeyframeDragging.pointerID) return;
      const drag = this.cameraKeyframeDragging;
      this.cameraKeyframeDragging = null;
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
      this.renderer.domElement.classList.remove("moving-camera-keyframe");
      this.setActiveSceneOrbitEnabled(true);
      if (drag.moved) {
        this.onCameraKeyframeCommit(drag.keyframeID, {
          x: drag.position.x,
          y: drag.position.y,
          z: drag.position.z,
        });
      }
      event.preventDefault();
    };
    this.renderer.domElement.addEventListener("pointerup", finishCameraKeyframeDrag);
    this.renderer.domElement.addEventListener("pointercancel", finishCameraKeyframeDrag);

    const finishMoveDrag = (event) => {
      if (!this.moveDragging || event.pointerId !== this.moveDragging.pointerID) return;
      const drag = this.moveDragging;
      const group = drag.kind === "actor" ? this.actors.get(drag.actorID) : drag.target;
      this.moveDragging = null;
      this.transformDragging = false;
      this.renderer.domElement.classList.remove("moving-actor");
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
      this.setActiveSceneOrbitEnabled(true);
      if (drag.moved && group) {
        const position = { x: drag.position.x, y: drag.position.y, z: drag.position.z };
        if (drag.kind !== "actor") {
          this.onSceneObjectTransformCommit(
            { kind: drag.kind, id: drag.id, parentID: drag.parentID },
            { position, rotationY: normalizeAngle(group.rotation.y) }
          );
        } else if (drag.moveWholeBlocking) {
          this.onTransformCommit(group.userData.actorID, {
            position,
            rotationY: normalizeAngle(group.rotation.y),
          });
        } else {
          this.onPathPointCommit(group.userData.actorID, drag.pathPointID, position);
        }
      }
      this.updateActorHandles();
      event.preventDefault();
    };
    this.renderer.domElement.addEventListener("pointerup", finishMoveDrag);
    this.renderer.domElement.addEventListener("pointercancel", finishMoveDrag);

    const finishRotationDrag = (event) => {
      if (!this.rotationDragging || event.pointerId !== this.rotationDragging.pointerID) return;
      const drag = this.rotationDragging;
      const group = drag.kind === "actor" ? this.actors.get(drag.actorID) : drag.target;
      this.rotationDragging = null;
      this.transformDragging = false;
      this.renderer.domElement.classList.remove("rotating-actor");
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
      this.setActiveSceneOrbitEnabled(true);
      if (drag.moved && group) {
        const pose = {
          position: { x: group.position.x, y: group.position.y, z: group.position.z },
          rotationY: drag.rotationY,
        };
        if (drag.kind === "actor") this.onTransformCommit(group.userData.actorID, pose);
        else this.onSceneObjectTransformCommit(
          { kind: drag.kind, id: drag.id, parentID: drag.parentID },
          pose
        );
      }
      this.updateActorHandles();
      event.preventDefault();
    };
    this.renderer.domElement.addEventListener("pointerup", finishRotationDrag);
    this.renderer.domElement.addEventListener("pointercancel", finishRotationDrag);
    const finishShotCameraDrag = (event) => {
      if (!this.shotCameraDragging || event.pointerId !== this.shotCameraDragging.pointerID) return;
      this.shotCameraDragging = null;
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
      this.renderer.domElement.classList.remove("adjusting-shot-camera");
      event.preventDefault();
    };
    this.renderer.domElement.addEventListener("pointerup", finishShotCameraDrag);
    this.renderer.domElement.addEventListener("pointercancel", finishShotCameraDrag);
    this.renderer.domElement.addEventListener("contextmenu", (event) => {
      if (!this.isShotEditView()) return;
      event.preventDefault();
    });
    this.renderer.domElement.addEventListener("pointerleave", () => {
      if (!this.moveDragging) this.renderer.domElement.classList.remove("move-handle-hover");
      if (!this.rotationDragging) this.renderer.domElement.classList.remove("rotation-handle-hover");
      if (!this.cameraKeyframeDragging) this.renderer.domElement.classList.remove("camera-keyframe-hover");
      if (!this.cameraAimTargetDragging) this.renderer.domElement.classList.remove("camera-aim-target-hover");
    });

    this.renderer.domElement.addEventListener("dblclick", (event) => {
      // 机位 C 只用于调整取景；双击也不能绕过 pointerdown 的 authoring 门禁去选演员、
      // 选布景或新增 Move。
      if (!this.isSceneAuthoringModeActive()) return;
      if (this.transformDragging) return;
      if (this.pickCameraAimTarget(event)?.userData.cameraAimKeyframeID) return;
      if (this.pickCameraKeyframe(event)?.userData.cameraKeyframeID) return;
      if (this.pickPathPoint(event)?.userData.pathPointID) return;
      const selectable = this.pickSceneEntity(event);
      if (this.sceneObjectSelectionEnabled && selectable?.userData.visualEnvironment) {
        this.onSelectSceneObject({
          kind: "environment",
          id: selectable.userData.visualEnvironmentID,
          parentID: null,
        });
        return;
      }
      if (this.sceneObjectSelectionEnabled && selectable?.userData.blockoutObjectID) {
        this.onSelectSceneObject({
          kind: "blockoutObject",
          id: selectable.userData.blockoutObjectID,
          parentID: selectable.userData.blockoutGroupID,
        });
        return;
      }
      if (selectable?.userData.actorID) {
        this.onSelect(selectable.userData.actorID);
        return;
      }
      if (!this.selectedActorAllowsMotionEditing()) return;
      const point = this.pickMoveTarget(event);
      if (point) this.onAddMove({ x: point.x, y: point.y, z: point.z });
    });

    window.addEventListener("keydown", (event) => {
      if (precisionCameraKeyCodes.has(event.code)) {
        this.cameraPrecisionKeys.add(event.code);
        return;
      }
      if (this.isShotEditView()) {
        if (!this.shotCameraEditable || !shotCameraKeyCodes.has(event.code) || shouldIgnoreCameraKey(event)) return;
        if (this.cameraAimRotationLocked && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
          event.preventDefault();
          return;
        }
        if (!event.repeat && (event.code === "BracketLeft" || event.code === "BracketRight")) {
          this.rollShotCamera(event.code === "BracketLeft" ? shotCameraRollStep : -shotCameraRollStep);
          this.notifyShotCameraPoseChange();
        }
        if (translationCameraKeyCodes.has(event.code) && !this.hasActiveTranslationCameraKey()) {
          this.captureCameraAuthoringTranslationContext();
        }
        if (planarCameraKeyCodes.has(event.code) && !this.hasActivePlanarCameraKey()) {
          this.shotCameraPlanarBasis = this.capturePlanarCameraBasis(this.shotCamera);
        }
        this.cameraKeys.add(event.code);
        event.preventDefault();
        return;
      }
      if (!this.isSceneEditView()) return;
      // F/T 是助记键（Focus / Top），跟随键面而不是物理键位，所以优先看 event.key；
      // WASD/Q/E/方向键是物理方位簇，继续用 event.code。
      if (matchesLetterShortcut(event, "f", "KeyF") && !shouldIgnoreCameraKey(event)) {
        if (!event.repeat && this.focusSelection()) event.preventDefault();
        return;
      }
      if (matchesLetterShortcut(event, "t", "KeyT") && !shouldIgnoreCameraKey(event)) {
        if (this.isSetupViewActive()) return;
        if (!event.repeat && this.toggleTopViewLock()) event.preventDefault();
        return;
      }
      // 【】是翻滚键。自由相机刻意保持地平线水平，所以只在机位视角下收它们。
      const cameraKeyCodes = this.isSetupViewActive() ? shotCameraKeyCodes : editorCameraKeyCodes;
      if (!cameraKeyCodes.has(event.code) || shouldIgnoreCameraKey(event)) return;
      this.cameraFocusTransition = null;
      if (
        this.isSetupViewActive()
        && translationCameraKeyCodes.has(event.code)
        && !this.hasActiveTranslationCameraKey()
      ) {
        this.captureCameraAuthoringTranslationContext();
      }
      if (planarCameraKeyCodes.has(event.code) && !this.hasActivePlanarCameraKey()) {
        this.sceneCameraPlanarBasis = this.captureScenePlanarBasis();
      }
      this.cameraKeys.add(event.code);
      event.preventDefault();
    });
    window.addEventListener("keyup", (event) => {
      if (precisionCameraKeyCodes.has(event.code)) {
        this.cameraPrecisionKeys.delete(event.code);
        return;
      }
      if (!shotCameraKeyCodes.has(event.code)) return;
      this.cameraKeys.delete(event.code);
      if (!this.hasActivePlanarCameraKey()) {
        if (this.cameraPlanarVelocity.lengthSq() === 0) {
          this.sceneCameraPlanarBasis = null;
          this.shotCameraPlanarBasis = null;
        }
      }
      if (
        !this.hasActiveTranslationCameraKey()
        && this.cameraPlanarVelocity.lengthSq() === 0
      ) {
        this.cameraAuthoringTranslationContext = null;
      }
    });
    window.addEventListener("blur", () => {
      this.cameraKeys.clear();
      this.cameraPrecisionKeys.clear();
      this.cameraPlanarVelocity.set(0, 0);
      this.sceneCameraPlanarBasis = null;
      this.shotCameraPlanarBasis = null;
      this.cameraAuthoringTranslationContext = null;
      this.cameraFocusTransition = null;
    });
    this.orbit.addEventListener("start", () => { this.cameraFocusTransition = null; });
    // change 是在 orbit.update() 内部发出来的 —— 那一刻地平线刚被抹平、翻滚还没补回去。
    // 直接在这儿通知，外面读到的就是零翻滚的姿势，会把翻滚写没。所以只置标记，
    // 真正的通知等帧循环补完翻滚再发。
    this.setupOrbit.addEventListener("change", () => { this.setupCameraDirty = true; });
  }

  sync(project, samples, options = {}) {
    this.project = project;
    this.samples = samples || new Map();
    const nextSelectedActorID = options.selectedActorID || null;
    if (this.selectedActorID !== nextSelectedActorID) this.cameraFocusTransition = null;
    this.selectedActorID = nextSelectedActorID;
    this.selectedObject = options.selectedObject || (
      nextSelectedActorID ? { kind: "actor", id: nextSelectedActorID, parentID: null } : null
    );
    
    this.sceneObjectSelectionEnabled = options.sceneObjectSelectionEnabled === true;
    this.selectedPathPointID = options.selectedPathPointID || null;
    this.playbackStatus = options.playbackStatus || "idle";
    this.timelineSeeking = options.timelineSeeking === true;
    this.editable = options.editable !== false;
    // 原始路径点在暂停时可编辑；人物本体的变换把手另按采样状态控制。
    const selectedActorBelongsToPair = null;
    this.actorMotionEditable = options.actorMotionEditable !== false
      && this.editable;
    this.shotCameraEditable = options.shotCameraEditable === true;
    this.previewActive = options.previewActive === true;
    this.authoringGuidesVisible = options.authoringGuidesVisible !== false;
    const groundVisible = project?.scene?.environment?.groundVisible !== false;
    this.grid.visible = groundVisible;
    this.renderer.domElement.dataset.sceneGround = groundVisible ? "visible" : "hidden";
    this.syncVisualEnvironment(project);
    this.syncBlockout(project);
    if (this.placingMove && !this.selectedActorAllowsMotionEditing()) this.setMovePlacement(false);

    const actors = (project?.scene?.actors || []).filter((actor) => actor.visible !== false);
    const liveIDs = new Set(actors.map((actor) => actor.id));
    for (const [id, group] of this.actors) {
      if (!liveIDs.has(id)) {
        this.destroyActor(group);
        this.actors.delete(id);
      }
    }

    for (const actor of actors) {
      let group = this.actors.get(actor.id);
      if (group && (
        group.userData.characterAssetID !== actor.characterAssetID
        || group.userData.clothingColorIndex !== actor.clothingColorIndex
        || group.userData.blockingColor !== actor.blockingColor
      )) {
        this.destroyActor(group);
        this.actors.delete(actor.id);
        group = null;
      }
      if (!group) {
        group = this.createActor(actor);
        this.actors.set(actor.id, group);
        this.scene.add(group);
      }
      this.updateActor(group, actor, this.samples.get(actor.id));
      
    }

    this.rebuildPickTargets();
    this.renderGuides(actors);
    this.guides.visible = this.isSceneAuthoringModeActive() && this.authoringGuidesVisible;
    this.updateActorHandles();
    this.renderer.domElement.dataset.actorCount = String(actors.length);
    this.renderer.domElement.dataset.playbackStatus = this.playbackStatus;
  }

  syncVisualEnvironment(project) {
    const groups = project?.scene?.environment?.groups || [];
    const visuals = project?.scene?.environment?.visuals || [];
    const currentGroupIDs = new Set(groups.map((group) => group.id));
    for (const [groupID, object] of this.environmentGroupEntries) {
      if (currentGroupIDs.has(groupID)) continue;
      this.environmentGroup.remove(object);
      this.environmentGroupEntries.delete(groupID);
    }
    for (const group of groups) this.syncVisualEnvironmentGroup(group);
    const currentIDs = new Set(visuals.map((visual) => visual.id));
    for (const [environmentID, entry] of this.environmentEntries) {
      if (currentIDs.has(environmentID)) continue;
      entry.loadGeneration += 1;
      this.clearVisualEnvironmentEntry(entry);
      entry.group.removeFromParent();
      this.environmentEntries.delete(environmentID);
      this.onEnvironmentStatus({
        environmentID,
        state: "removed",
        assetRef: null,
        triangles: 0,
        message: null,
      });
    }
    this.environmentGroup.visible = visuals.length > 0;
    this.renderer.domElement.dataset.environmentCount = String(visuals.length);
    for (const visual of visuals) this.syncVisualEnvironmentEntry(project, visual);
    this.updateEnvironmentDatasetState();
  }

  syncVisualEnvironmentGroup(authored) {
    let group = this.environmentGroupEntries.get(authored.id);
    if (!group) {
      group = new THREE.Group();
      group.name = `VisualEnvironmentGroup:${authored.id}`;
      group.userData.visualEnvironmentGroupID = authored.id;
      this.environmentGroup.add(group);
      this.environmentGroupEntries.set(authored.id, group);
    }
    const transform = authored.transform;
    group.position.set(
      Number(transform.position?.x || 0),
      Number(transform.position?.y || 0),
      Number(transform.position?.z || 0)
    );
    group.quaternion.set(
      Number(transform.quaternion?.x || 0),
      Number(transform.quaternion?.y || 0),
      Number(transform.quaternion?.z || 0),
      Number(transform.quaternion?.w ?? 1)
    ).normalize();
    group.scale.setScalar(Number(transform.uniformScale || 1));
    group.visible = authored.visible !== false;
  }

  syncVisualEnvironmentEntry(project, visual) {
    let entry = this.environmentEntries.get(visual.id);
    if (!entry) {
      const group = new THREE.Group();
      group.name = `VisualEnvironment:${visual.id}`;
      group.userData.visualEnvironmentID = visual.id;
      this.environmentGroup.add(group);
      entry = {
        group,
        object: null,
        assetKey: null,
        loadGeneration: 0,
        loadPromise: null,
        appearanceKey: null,
        status: { state: "empty", assetRef: null, triangles: 0, message: null },
      };
      this.environmentEntries.set(visual.id, entry);
    }

    const parent = visual.groupID
      ? this.environmentGroupEntries.get(visual.groupID) || this.environmentGroup
      : this.environmentGroup;
    if (entry.group.parent !== parent) parent.add(entry.group);

    const assetIdentity = visualEnvironmentAssetIdentity(visual.asset);
    const key = `${project.id}:${assetIdentity}`;
    this.applyVisualEnvironmentTransform(visual, entry);
    if (key === entry.assetKey) {
      this.applyVisualEnvironmentAppearance(visual, entry);
      return;
    }

    entry.loadGeneration += 1;
    const generation = entry.loadGeneration;
    entry.assetKey = key;
    this.clearVisualEnvironmentEntry(entry, { preserveGroup: true });
    
    const url = environmentAssetURL(project.id, visual.asset.ref);
    if (!url) {
      this.reportEnvironmentStatus(visual.id, entry, {
        state: "error",
        assetRef: visual.asset.ref,
        triangles: 0,
        message: "环境资产引用无效",
      });
      return;
    }

    this.reportEnvironmentStatus(visual.id, entry, {
      state: "loading",
      assetRef: visual.asset.ref,
      triangles: 0,
    });
    entry.loadPromise = this.gltfLoader.loadAsync(url).then((gltf) => {
      const root = gltf?.scene;
      if (!root) throw new Error("GLB 中没有可渲染场景");
      if (generation !== entry.loadGeneration || key !== entry.assetKey) {
        disposeObjectTree(root);
        return;
      }
      const fallbackMaterial = new THREE.MeshStandardMaterial({
        name: "FilmSpaceEnvironmentFallback",
        color: 0x8c9198,
        roughness: 0.86,
        metalness: 0.02,
      });
      let fallbackMaterialUsed = false;
      let triangles = 0;
      root.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (!materials.some(Boolean)) {
          object.material = fallbackMaterial;
          fallbackMaterialUsed = true;
        }
        const activeMaterials = Array.isArray(object.material) ? object.material : [object.material];
        activeMaterials.filter(Boolean).forEach(captureVisualEnvironmentMaterialAppearance);
        object.castShadow = false;
        object.receiveShadow = false;
        const geometry = object.geometry;
        triangles += geometry?.index
          ? Math.floor(geometry.index.count / 3)
          : Math.floor(Number(geometry?.attributes?.position?.count || 0) / 3);
      });
      if (!fallbackMaterialUsed) fallbackMaterial.dispose();
      entry.object = root;
      entry.group.add(root);
      const currentVisual = this.project?.scene?.environment?.visuals?.find(
        (candidate) => candidate.id === visual.id
      ) || visual;
      this.applyVisualEnvironmentTransform(currentVisual, entry);
      this.applyVisualEnvironmentAppearance(currentVisual, entry);
      this.rebuildPickTargets();
      this.updateActorHandles();
      this.reportEnvironmentStatus(visual.id, entry, {
        state: "ready",
        assetRef: visual.asset.ref,
        triangles,
      });
    }).catch((error) => {
      if (generation !== entry.loadGeneration || key !== entry.assetKey) return;
      const message = error?.message || String(error);
      this.reportEnvironmentStatus(visual.id, entry, {
        state: /404|not found/i.test(message) ? "missing" : "error",
        assetRef: visual.asset.ref,
        triangles: 0,
        message,
      });
      return null;
    });
  }

  syncBlockout(project) {
    const blockout = project?.scene?.blockout;
    const layerOpacity = THREE.MathUtils.clamp(Number(blockout?.opacity ?? 1), 0, 1);
    const layerVisible = blockout?.visible !== false;
    const layerLocked = blockout?.locked === true;
    const groups = blockout?.groups || [];
    const key = JSON.stringify({ layerOpacity, layerVisible, layerLocked, groups });
    if (key !== this.blockoutKey) {
      this.blockoutKey = key;
      disposeObjectChildren(this.blockoutRoot);
      this.blockoutImageLoads.clear();
      this.blockoutRoot.userData.authorVisible = layerVisible;
      this.blockoutRoot.userData.locked = layerLocked;
      for (const blockoutGroup of groups) {
        const group = new THREE.Group();
        group.name = `BlockoutGroup:${blockoutGroup.name}`;
        group.position.set(
          Number(blockoutGroup.position?.x || 0),
          Number(blockoutGroup.position?.y || 0),
          Number(blockoutGroup.position?.z || 0)
        );
        group.rotation.y = Number(blockoutGroup.rotationY || 0);
        group.scale.setScalar(Math.max(0.01, Number(blockoutGroup.scale || 1)));
        group.userData.authorVisible = blockoutGroup.visible !== false;
        group.userData.blockoutGroupID = blockoutGroup.id;
        group.userData.locked = layerLocked || blockoutGroup.locked === true;
        const groupOpacity = THREE.MathUtils.clamp(Number(blockoutGroup.opacity ?? 1), 0, 1);
        for (const blockoutObject of blockoutGroup.objects || []) {
          const object = new THREE.Group();
          object.name = `BlockoutObject:${blockoutObject.name}`;
          object.position.set(
            Number(blockoutObject.position?.x || 0),
            Number(blockoutObject.position?.y || 0),
            Number(blockoutObject.position?.z || 0)
          );
          object.rotation.y = Number(blockoutObject.rotationY || 0);
          object.scale.setScalar(Math.max(0.01, Number(blockoutObject.scale || 1)));
          object.userData.authorVisible = blockoutObject.visible !== false;
          object.userData.blockoutGroupID = blockoutGroup.id;
          object.userData.blockoutObjectID = blockoutObject.id;
          object.userData.locked = blockoutObject.locked === true || blockoutGroup.locked === true;
          const objectOpacity = THREE.MathUtils.clamp(Number(blockoutObject.opacity ?? 1), 0, 1);
          for (const primitive of blockoutObject.primitives || []) {
            const opacity = THREE.MathUtils.clamp(
              Number(primitive.opacity ?? 1) * objectOpacity * groupOpacity * layerOpacity,
              0,
              1
            );
            const transparent = opacity < 0.999;
            const material = new THREE.MeshStandardMaterial({
              name: "FilmSpaceBlockout",
              color: new THREE.Color(primitive.color || "#8793a3"),
              transparent,
              opacity,
              depthWrite: !transparent,
              roughness: 0.82,
              metalness: 0.02,
              side: primitive.kind === "plane" ? THREE.DoubleSide : THREE.FrontSide,
              polygonOffset: primitive.kind === "plane",
              polygonOffsetFactor: primitive.kind === "plane" ? 1 : 0,
              polygonOffsetUnits: primitive.kind === "plane" ? 1 : 0,
            });
            const mesh = new THREE.Mesh(createBlockoutGeometry(primitive.kind), material);
            mesh.name = `BlockoutPrimitive:${primitive.name}`;
            mesh.position.set(
              Number(primitive.position?.x || 0),
              Number(primitive.position?.y || 0),
              Number(primitive.position?.z || 0)
            );
            mesh.rotation.set(
              Number(primitive.rotation?.x || 0),
              Number(primitive.rotation?.y || 0),
              Number(primitive.rotation?.z || 0)
            );
            mesh.scale.set(
              Math.max(0.01, Number(primitive.size?.x || 1)),
              Math.max(0.01, Number(primitive.size?.y || 1)),
              Math.max(0.01, Number(primitive.size?.z || 1))
            );
            mesh.userData.authorVisible = primitive.visible !== false;
            mesh.userData.locked = primitive.locked === true || object.userData.locked;
            mesh.userData.blockoutGroupID = blockoutGroup.id;
            mesh.userData.blockoutObjectID = blockoutObject.id;
            mesh.userData.blockoutPrimitiveID = primitive.id;
            object.add(mesh);
          }
          if (blockoutObject.image) {
            const picture = blockoutObject.image;
            const geometry = createBlockoutGeometry("plane");
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: objectOpacity * groupOpacity * layerOpacity,
              transparent: true, alphaTest: 0.01, side: THREE.FrontSide, toneMapped: false });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `BlockoutImage:${blockoutObject.name}`;
            mesh.position.set(picture.position.x, picture.position.y, picture.position.z);
            mesh.rotation.set(picture.rotation.x, picture.rotation.y, picture.rotation.z);
            mesh.scale.set(picture.width, picture.height, 1);
            mesh.userData = { ...object.userData, authorVisible: true };
            object.add(mesh);
            const loadKey = `${blockoutGroup.id}/${blockoutObject.id}`;
            const entry = { error: null, promise: null };
            material.visible = false;
            entry.promise = new THREE.TextureLoader().loadAsync(referenceImageAssetURL(project.id, picture.asset.ref)).then(texture => {
              if (this.blockoutImageLoads.get(loadKey) !== entry) { texture.dispose(); return; }
              texture.colorSpace = THREE.SRGBColorSpace;
              const uv = blockoutImageUV(picture.crop);
              texture.offset.set(uv.offset.x, uv.offset.y);
              texture.repeat.set(uv.repeat.x, uv.repeat.y);
              material.map = texture;
              material.visible = true;
              material.needsUpdate = true;
            }).catch(error => {
              entry.error = new Error(`无法加载贴图 ${picture.asset.sourceName}: ${error.message || "图片缺失或无法解码"}`);
              if (this.blockoutImageLoads.get(loadKey) === entry) this.onBlockoutImageError(entry.error.message);
            });
            this.blockoutImageLoads.set(loadKey, entry);
          }
          group.add(object);
        }
        this.blockoutRoot.add(group);
      }
    }
    this.syncBlockoutVisibility();
    this.renderer.domElement.dataset.blockoutGroupCount = String(groups.length);
  }

  syncBlockoutVisibility(outputMode = !this.isSceneEditView()) {
    this.blockoutRoot.visible = this.blockoutRoot.userData.authorVisible !== false;
    for (const group of this.blockoutRoot.children) {
      group.visible = group.userData.authorVisible !== false;
      for (const object of group.children) {
        object.visible = object.userData.authorVisible !== false;
        for (const primitive of object.children) {
          primitive.visible = primitive.userData.authorVisible !== false;
        }
      }
    }
  }

  applyVisualEnvironmentTransform(visual, entry) {
    const transform = visual?.transform;
    if (!transform) return;
    entry.group.position.set(
      Number(transform.position?.x || 0),
      Number(transform.position?.y || 0),
      Number(transform.position?.z || 0)
    );
    entry.group.quaternion.set(
      Number(transform.quaternion?.x || 0),
      Number(transform.quaternion?.y || 0),
      Number(transform.quaternion?.z || 0),
      Number(transform.quaternion?.w ?? 1)
    ).normalize();
    const scale = Number(transform.uniformScale || 1);
    entry.group.scale.setScalar(scale);
    entry.group.visible = visual.visible !== false;
  }

  applyVisualEnvironmentAppearance(visual,entry) {
    if (!entry.object) return;
    const opacity = THREE.MathUtils.clamp(Number(visual.appearance.opacity),0,1);
    const materialMode = visual.appearance.materialMode;
    const key = materialMode + ':' + opacity;
    if (entry.appearanceKey === key) return;
    entry.appearanceKey = key;
    const materials = new Set();
    entry.object.traverse(object => {
      if (!object.isMesh || !object.material) return;
      if (materialMode === 'gray') { applyVisualEnvironmentGrayMaterial(object,opacity); return; }
      restoreVisualEnvironmentMeshMaterial(object);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    });
    materials.forEach(material => applyVisualEnvironmentMaterialAppearance(material,{opacity,materialMode,bodyColor:null}));
  }

  clearVisualEnvironmentEntry(entry, options = {}) {
    if (entry.object) {
      entry.group.remove(entry.object);
      restoreVisualEnvironmentMaterialAppearances(entry.object);
      disposeObjectTree(entry.object);
      entry.object = null;
    }
    entry.loadPromise = null;
    entry.appearanceKey = null;
    if (options.preserveGroup !== true) entry.assetKey = null;
  }

  reportEnvironmentStatus(environmentID, entry, status) {
    const normalized = {
      state: status.state,
      assetRef: status.assetRef || null,
      triangles: Number(status.triangles || 0),
      message: status.message || null,
    };
    if (JSON.stringify(normalized) === JSON.stringify(entry.status)) return;
    entry.status = normalized;
    this.updateEnvironmentDatasetState();
    this.onEnvironmentStatus({ environmentID, ...normalized });
  }

  updateEnvironmentDatasetState() {
    const states = [...this.environmentEntries.values()].map((entry) => entry.status.state);
    const state = states.some((value) => value === "error" || value === "missing")
      ? "error"
      : states.some((value) => value === "loading")
        ? "loading"
        : states.length && states.every((value) => value === "ready") ? "ready" : "empty";
    this.renderer.domElement.dataset.environmentState = state;
  }

  focusVisualEnvironment(environmentID) {
    const entry = this.environmentEntries.get(environmentID);
    if (!entry?.object || !entry.group.visible || !this.isSceneEditView()) return false;
    entry.group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(entry.group);
    if (bounds.isEmpty()) return false;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const direction = this.camera.position.clone().sub(this.orbit.target);
    if (direction.lengthSq() < 0.000001) direction.set(0.75, 0.55, 1);
    direction.normalize();
    const distance = this.editorCameraFitDistance(sphere.radius);
    this.orbit.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.configureEditorCameraRange(distance, sphere.radius);
    this.orbit.update();
    return true;
  }

  visualEnvironmentTargetPoint(environmentID, worldPosition = null) {
    const entry = this.environmentEntries.get(environmentID);
    if (!entry?.object) return null;
    entry.group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(entry.group);
    if (bounds.isEmpty()) return null;
    const point = worldPosition
      ? new THREE.Vector3(worldPosition.x, worldPosition.y, worldPosition.z)
      : bounds.getCenter(new THREE.Vector3());
    const local = entry.group.worldToLocal(point);
    return { x: local.x, y: local.y, z: local.z };
  }

  visualEnvironmentGroundedPosition(environmentID) {
    const visual = this.project?.scene?.environment?.visuals?.find(
      (candidate) => candidate.id === environmentID
    );
    const entry = this.environmentEntries.get(environmentID);
    if (!visual || !entry?.object) return null;
    entry.group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(entry.group);
    if (bounds.isEmpty()) return null;
    const localDelta = new THREE.Vector3(0, -bounds.min.y, 0);
    if (entry.group.parent && entry.group.parent !== this.environmentGroup) {
      const parentQuaternion = entry.group.parent.getWorldQuaternion(new THREE.Quaternion());
      const parentScale = entry.group.parent.getWorldScale(new THREE.Vector3());
      localDelta.applyQuaternion(parentQuaternion.invert()).divide(parentScale);
    }
    return {
      x: Number(visual.transform.position.x || 0) + localDelta.x,
      y: Number(visual.transform.position.y || 0) + localDelta.y,
      z: Number(visual.transform.position.z || 0) + localDelta.z,
    };
  }

  editorCameraFitDistance(radiusInput, padding = 1.18) {
    const radius = Math.max(0.01, Number(radiusInput || 0.01));
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(
      Math.tan(verticalFov / 2) * Math.max(this.camera.aspect, 0.01)
    );
    const limitingFov = Math.max(
      THREE.MathUtils.degToRad(12),
      Math.min(verticalFov, horizontalFov)
    );
    return Math.max(2, radius / Math.max(Math.sin(limitingFov / 2), 0.1) * padding);
  }

  configureEditorCameraRange(distanceInput, radiusInput) {
    const distance = Math.max(2, Number(distanceInput || 2));
    const radius = Math.max(0.01, Number(radiusInput || 0.01));
    this.orbit.maxDistance = Math.max(45, distance * 2.5, radius * 6);
    this.camera.near = Math.max(0.02, Math.min(0.5, radius * 0.0025));
    this.camera.far = Math.max(120, distance + radius * 6, this.orbit.maxDistance + radius * 2);
    this.camera.updateProjectionMatrix();
  }

  createActor(actor) {
    const group = new THREE.Group();
    group.name = 'Actor-' + actor.id;
    Object.assign(group.userData, { actorID: actor.id, characterAssetID: actor.characterAssetID,
      clothingColorIndex: actor.clothingColorIndex, blockingColor: actor.blockingColor, locked: actor.locked });
    const model = createBlockingFigure(actorColor(actor));
    group.add(model);
    group.userData.characterModel = model;
    group.traverse(object => { object.userData.actorID = actor.id; });
    return group;
  }

  

  

  updateActor(group, actor, sample) {
    const model = group.userData.characterModel;
    const pose = sample || {
      position: actor.position,
      rotationY: actor.rotationY,
      actionID: "idle",
      actionKind: "hold",
      actionElapsed: 0,
      speed: 0,
    };
    group.userData.lockedY = pose.position.y || 0;
    group.userData.pathPosition = pose.pathPosition || pose.position;
    group.userData.locked = actor.locked === true;
    group.visible = actor.visible !== false;
    group.scale.setScalar(actor.scale);
    if (!(this.transformDragging && actor.id === this.selectedActorID)) {
      group.position.set(pose.position.x, pose.position.y || 0, pose.position.z);
      group.rotation.set(0, pose.rotationY || 0, 0);
    }
    
    group.userData.continuesAfterCompletion = Boolean(pose.continuesAfterCompletion);
    this.applyAnimation(group, actor, pose);
  }

  applyAnimation(group, actor, pose) { applyBlockingFigurePose(group.userData.characterModel, { ...pose, rotationX: actor.rotationX, rotationZ: actor.rotationZ }); }

  

  

  

  

  async prepareBlockoutImages(project) {
    this.syncBlockout(project);
    for (const { groupID, objectID } of visibleBlockoutImages(project)) {
      const entry = this.blockoutImageLoads.get(`${groupID}/${objectID}`);
      await entry.promise;
      if (entry.error) throw entry.error;
    }
  }

  async prepareOutput(project) {
    
    await this.prepareBlockoutImages(project);
    this.syncVisualEnvironment(project);
    const { visuals, characterIDs, motionIDs } = outputAssetDependencies(project);
    for (const visual of visuals) {
      const entry = this.environmentEntries.get(visual.id);
      if (entry?.loadPromise) await entry.loadPromise;
      if (
        entry?.status.state !== "ready"
        || entry.status.assetRef !== visualEnvironmentAssetIdentity(visual.asset)
      ) {
        throw new Error(`输出前无法加载视觉环境资产：${visual.asset.sourceName}`);
      }
    }
    
  }

  

  

  

  

  

  

  

  // Viewfinder stream: a second small offscreen renderer that renders the same
  // recording-safe frame as MP4 output. Its output projection is applied only
  // for the synchronous offscreen draw, then the visible Edit/Camera projection
  // is restored.
  

  

  

  // Production VCam media source. Unlike the JPEG diagnostic path above,
  // this canvas is rendered directly and handed to WebRTC: no GPU→CPU pixel
  // readback, no per-frame image allocation, and no application-level encode.
  

  

  

  beginOutputRender(widthInput, heightInput) {
    const width = Math.max(16, Math.floor(Number(widthInput) || 0));
    const height = Math.max(16, Math.floor(Number(heightInput) || 0));
    this.endOutputRender();
    this.outputRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.outputRenderer.setPixelRatio(1);
    this.outputRenderer.setSize(width, height, false);
    this.outputRenderer.outputColorSpace = THREE.SRGBColorSpace;
    
    
    
    this.outputDepthOfFieldRenderer = new CameraDepthOfFieldRenderer();
    this.outputResolution = { width, height };
    this.shotCamera.aspect = width / height;
    this.shotCamera.fov = outputVerticalFov(
      THREE.MathUtils.clamp(
        Number(this.shotCamera.userData.focalLength || 35),
        cameraFocalLengthMinimum,
        cameraFocalLengthMaximum
      ),
      this.shotAspectRatio
    );
    this.shotCamera.updateProjectionMatrix();
  }

  async captureOutputFrame() {
    if (!this.outputRenderer || !this.outputResolution) throw new Error("输出渲染器尚未准备");
    await this.withRecordingSafeSceneAsync(async () => { this.updateCameraClipping(this.shotCamera); this.renderShotScene(this.outputRenderer,this.outputDepthOfFieldRenderer); });
    return new Promise((resolve,reject) => this.outputRenderer.domElement.toBlob(blob => blob ? resolve(blob) : reject(new Error("无法读取输出帧")),"image/png"));
  }

  renderShotScene(renderer, depthOfFieldRenderer, target = null) {
    this.renderCameraScene(
      renderer,
      depthOfFieldRenderer,
      this.shotCamera,
      this.shotAspectRatio,
      target
    );
  }

  updateCameraClipping(camera) {
    const bounds = visibleContentBounds([
      this.environmentGroup,
      this.blockoutRoot,
      ...this.actors.values(),
    ]);
    updateCameraFarFromBounds(camera, bounds);
  }

  renderCameraScene(renderer, depthOfFieldRenderer, camera, aspectRatio, target = null) {
    this.updateCameraClipping(camera);
    if (!depthOfFieldRenderer) { renderer.setRenderTarget(target); renderer.render(this.scene,camera); return; }
    depthOfFieldRenderer.render(renderer,this.scene,camera,{ target, enabled: camera.userData.depthOfFieldEnabled === true,
      focusDistance: camera.userData.focusDistance, aperture: camera.userData.aperture,
      focalLength: camera.userData.focalLength, sensorWidth: cameraSensorGate(aspectRatio).width });
  }

  

  renderFocusPlaneOverlay(viewCamera) {
    if (
      !this.focusPlaneVisible
      || this.viewportMode !== "edit"
      || !(this.isShotEditView() || this.isSetupViewActive())
    ) return;
    const focusCamera = this.isSetupViewActive() ? this.setupCamera : this.shotCamera;
    if (focusCamera.userData.depthOfFieldEnabled !== true) return;
    const distance = Math.max(0.1, Number(focusCamera.userData.focusDistance) || 5);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(focusCamera.quaternion);
    const planePoint = focusCamera.position.clone()
      .addScaledVector(forward, distance);
    const groundIntersection = focusPlaneGroundIntersection(planePoint, forward);
    if (groundIntersection && this.project?.scene?.environment?.groundVisible !== false) {
      const { radius } = this.sceneBounds();
      updateFocusGroundLine(
        this.focusGroundLine,
        groundIntersection,
        Math.max(6, radius * 2.2)
      );
      this.focusGroundLine.visible = true;
    } else {
      this.focusGroundLine.visible = false;
    }
    const originalAutoClear = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.render(this.focusPlaneScene, viewCamera);
      this.focusPlaneIntersectionRenderer.render(this.renderer, this.scene, viewCamera, {
        planePoint,
        planeNormal: forward,
        bandWidth: THREE.MathUtils.clamp(distance * 0.008, 0.025, 0.08),
      });
    } finally {
      this.renderer.autoClear = originalAutoClear;
    }
  }

  setFocusPlaneVisible(visible) {
    this.focusPlaneVisible = visible === true;
  }

  setFocusPicking(active, mode = "once") {
    this.focusPicking = active === true && (this.isShotEditView() || this.isSetupViewActive());
    this.focusPickingMode = this.focusPicking && mode === "tracking" ? "tracking" : this.focusPicking ? "once" : null;
    this.renderer.domElement.classList.toggle("picking-camera-focus", this.focusPicking);
    this.renderer.domElement.dataset.focusPicking = this.focusPickingMode || "off";
    return this.focusPicking;
  }

  pickShotFocus(event) {
    if (!(this.isShotEditView() || this.isSetupViewActive())) return null;
    const focusCamera = this.isSetupViewActive() ? this.setupCamera : this.shotCamera;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, focusCamera);
    const targets = this.project?.scene?.environment?.groundVisible !== false
      ? [...this.focusPickTargets, this.floor]
      : this.focusPickTargets;
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    focusCamera.updateMatrixWorld(true);
    const cameraPoint = hit.point.clone().applyMatrix4(focusCamera.matrixWorldInverse);
    const focusDistance = THREE.MathUtils.clamp(-cameraPoint.z, 0.1, 1000);
    const actorID = hit.object.userData.actorID || null;
    if (actorID) {
      const actor = this.project?.scene?.actors?.find((candidate) => candidate.id === actorID);
      const actorIndex = this.project?.scene?.actors?.findIndex((candidate) => candidate.id === actorID) ?? -1;
      const actorGroup = this.actors.get(actorID);
      const base = actorGroup?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3();
      const actorHeight = THREE.MathUtils.clamp(
        (hit.point.y - base.y) / (1.62 * Math.max(0.5, Number(actor?.scale || 1))),
        0,
        1
      );
      return {
        focusDistance,
        mode: this.focusPickingMode,
        label: `演员 ${String(Math.max(0, actorIndex) + 1).padStart(2, "0")} · ${focusBodyPartLabel(actorHeight)}`,
        target: { enabled: true, targetKind: "actor", targetActorID: actorID, actorHeight },
      };
    }
    const blockoutObject = ancestorNamed(hit.object, "BlockoutObject:");
    if (blockoutObject) {
      const localPosition = blockoutObject.worldToLocal(hit.point.clone());
      return {
        focusDistance,
        mode: this.focusPickingMode,
        label: blockoutObject.name.replace(/^BlockoutObject:/, "布景 · ") || "布景",
        target: {
          enabled: true,
          targetKind: "blockout",
          blockoutGroupID: blockoutObject.userData.blockoutGroupID,
          blockoutObjectID: blockoutObject.userData.blockoutObjectID,
          localPosition: vectorFromThree(localPosition),
        },
      };
    }
    if (hit.object.userData.visualEnvironment) {
      const environmentID = hit.object.userData.visualEnvironmentID;
      const entry = this.environmentEntries.get(environmentID);
      if (!entry) return null;
      const localPosition = entry.group.worldToLocal(hit.point.clone());
      const visual = this.project?.scene?.environment?.visuals?.find(
        (candidate) => candidate.id === environmentID
      );
      return {
        focusDistance,
        mode: this.focusPickingMode,
        label: visual?.asset?.sourceName || "视觉环境",
        target: {
          enabled: true,
          targetKind: "environment",
          environmentID,
          localPosition: vectorFromThree(localPosition),
        },
      };
    }
    return {
      focusDistance,
      mode: this.focusPickingMode,
      label: "场景固定点",
      target: {
        enabled: true,
        targetKind: "world",
        worldPosition: vectorFromThree(hit.point),
      },
    };
  }

  async captureViewportPNG(mode="visible") {
 if(mode==="camera"){
  await this.prepareOutput(this.project);
  const resolution=projectOutputResolution(this.project,this.shotAspectRatio);
  this.beginOutputRender(resolution.width,resolution.height);
  try{const blob=await this.captureOutputFrame();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
  finally{this.endOutputRender();}
 }
 const camera=this.isSceneEditView()?this.camera:this.shotCamera;
 if(camera===this.shotCamera)this.renderShotScene(this.renderer,this.depthOfFieldRenderer);
 else{this.updateCameraClipping(camera);this.renderer.render(this.scene,camera);}
 return this.renderer.domElement.toDataURL("image/png");
}

  recordingSafeHiddenObjects() {
    return [
      this.guides,
      this.cameraGuides,
      this.actorTransformHandle,
      this.origin,
      this.cameraRigGuide,
    ].filter(Boolean);
  }

  withRecordingSafeScene(render, cleanup = () => {}) {
    const hiddenObjects = this.recordingSafeHiddenObjects();
    const visibility = hiddenObjects.map((object) => object.visible);
    const blockoutVisibility = this.blockoutRoot.children.map((group) => ({
      group,
      visible: group.visible,
      objects: group.children.map((object) => ({
        object,
        visible: object.visible,
        primitives: object.children.map((primitive) => [primitive, primitive.visible]),
      })),
    }));
    hiddenObjects.forEach((object) => { object.visible = false; });
    this.syncBlockoutVisibility(true);
    try {
      return render();
    } finally {
      try {
        cleanup();
      } finally {
        hiddenObjects.forEach((object, index) => { object.visible = visibility[index]; });
        for (const state of blockoutVisibility) {
          state.group.visible = state.visible;
          for (const objectState of state.objects) {
            objectState.object.visible = objectState.visible;
            for (const [primitive, visible] of objectState.primitives) primitive.visible = visible;
          }
        }
      }
    }
  }

  async withRecordingSafeSceneAsync(render) {
    const hiddenObjects = this.recordingSafeHiddenObjects();
    const visibility = hiddenObjects.map((object) => object.visible);
    const blockoutVisibility = this.blockoutRoot.children.map((group) => ({
      group,
      visible: group.visible,
      objects: group.children.map((object) => ({
        object,
        visible: object.visible,
        primitives: object.children.map((primitive) => [primitive, primitive.visible]),
      })),
    }));
    hiddenObjects.forEach((object) => { object.visible = false; });
    this.syncBlockoutVisibility(true);
    try {
      return await render();
    } finally {
      hiddenObjects.forEach((object, index) => { object.visible = visibility[index]; });
      for (const state of blockoutVisibility) {
        state.group.visible = state.visible;
        for (const objectState of state.objects) {
          objectState.object.visible = objectState.visible;
          for (const [primitive, visible] of objectState.primitives) primitive.visible = visible;
        }
      }
    }
  }

  

  

  

  endOutputRender() {
    this.outputDepthOfFieldRenderer?.dispose();
    this.outputDepthOfFieldRenderer = null;
    
    if (this.outputRenderer) {
      this.outputRenderer.dispose();
      this.outputRenderer.forceContextLoss?.();
    }
    this.outputRenderer = null;
    this.outputResolution = null;
    this.refreshShotCameraProjection();
  }

  

  

  destroyActor(group) {
    if (!group) return;
    if (group.userData.mixer) {
      group.userData.mixer.stopAllAction();
      
    }
    this.scene.remove(group);
    group.traverse((object) => {
      if (!object.userData.sharedAssetGeometry) object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
  }

  rebuildPickTargets() {
    this.pickTargets = [];
    this.sceneObjectPickTargets = [];
    this.focusPickTargets = [];
    for (const group of this.actors.values()) {
      if (!group.visible) continue;
      group.traverse((object) => {
        if (!object.isMesh) return;
        object.layers.enable(focusPlaneSurfaceLayer);
        this.focusPickTargets.push(object);
        if (!group.userData.locked) this.pickTargets.push(object);
      });
    }
    for (const group of this.blockoutRoot.children) {
      if (!group.visible) continue;
      group.traverse((object) => {
        if (object.isMesh && object.visible) {
          object.layers.enable(focusPlaneSurfaceLayer);
          this.focusPickTargets.push(object);
          if (this.isSceneEditView()) this.sceneObjectPickTargets.push(object);
        }
      });
    }
    for (const [environmentID, entry] of this.environmentEntries) {
      if (!entry.group.visible || !entry.object) continue;
      entry.object.traverse((object) => {
        if (!object.isMesh || !object.visible) return;
        object.userData.visualEnvironment = true;
        object.userData.visualEnvironmentID = environmentID;
        object.layers.enable(focusPlaneSurfaceLayer);
        this.focusPickTargets.push(object);
        if (this.isSceneEditView()) this.sceneObjectPickTargets.push(object);
      });
    }
  }

  renderGuides(actors) {
    disposeObject(this.guides);
    this.guides.clear();
    this.pathPointTargets = [];
    for (const actor of actors) {
      if (actor.visible === false) continue;
      const selected = actor.id === this.selectedActorID;
      const actorColor = guideColorForActor(actor, selected ? 0.16 : 0.38);
      const lineOpacity = selected ? 0.68 : 0.26;
      const pointOpacity = selected ? 0.82 : 0.32;
      const direction = new THREE.Vector3(Math.sin(actor.rotationY), 0, Math.cos(actor.rotationY));
      const origin = new THREE.Vector3(
        actor.position.x,
        Number(actor.position.y || 0) + 0.05,
        actor.position.z
      );
      const tip = origin.clone().add(direction.multiplyScalar(0.5));
      this.guides.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([origin, tip]),
        new THREE.LineBasicMaterial({
          color: actorColor,
          transparent: true,
          opacity: lineOpacity,
          depthWrite: false,
        })
      ));

      let anchor = actor.position;
      for (const action of actor.motionActions) {
        if (action.kind === "move") {
          this.guides.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(anchor.x, Number(anchor.y || 0) + 0.026, anchor.z),
              new THREE.Vector3(
                action.position.x,
                Number(action.position.y || 0) + 0.026,
                action.position.z
              ),
            ]),
            new THREE.LineBasicMaterial({
              color: actorColor,
              transparent: true,
              opacity: lineOpacity,
              depthWrite: false,
            })
          ));
        }
        anchor = action.position;
      }
      for (const phase of actorPlaybackPlan(actor).phases) {
        if (!phase.intrinsicMotion || !Array.isArray(phase.trajectoryPoints)) continue;
        this.guides.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            phase.trajectoryPoints.map(
              (point) => new THREE.Vector3(point.x, Number(point.y || 0) + 0.028, point.z)
            )
          ),
          new THREE.LineBasicMaterial({
            color: actorColor,
            transparent: true,
            opacity: lineOpacity,
            depthWrite: false,
          })
        ));
      }

      for (const point of motionPathPoints(actor)) {
        const pointSelected = selected && point.id === this.selectedPathPointID;
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(pointSelected ? 0.11 : 0.085, pointSelected ? 0.11 : 0.085, 0.035, 24),
          new THREE.MeshBasicMaterial({
            color: pointSelected ? guideColorForActor(actor, 0) : actorColor,
            transparent: true,
            opacity: pointSelected ? 0.96 : pointOpacity,
            depthTest: false,
            depthWrite: false,
          })
        );
        marker.position.set(
          point.position.x,
          Number(point.position.y || 0) + 0.055,
          point.position.z
        );
        marker.renderOrder = 20;
        if (selected && !actor.locked && !point.fixedByActionID) {
          marker.userData.actorID = actor.id;
          marker.userData.pathPointID = point.id;
          marker.userData.pathPointPosition = { ...point.position };
          this.pathPointTargets.push(marker);
        }
        this.guides.add(marker);

        if (pointSelected) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.17, 0.014, 8, 32),
            new THREE.MeshBasicMaterial({
              color: guideColorForActor(actor, 0),
              transparent: true,
              opacity: 0.92,
              depthTest: false,
              depthWrite: false,
            })
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(
            point.position.x,
            Number(point.position.y || 0) + 0.058,
            point.position.z
          );
          ring.renderOrder = 21;
          this.guides.add(ring);
        }
      }
    }
  }

  setCameraAimTargetGuides(targets = []) {
    const states = targets.map((options) => {
      const position = finiteVector(options.position)
        ? {
            x: Number(options.position.x),
            y: Number(options.position.y),
            z: Number(options.position.z),
          }
        : null;
      return {
        keyframeID: typeof options.keyframeID === "string" ? options.keyframeID : null,
        position,
        visible: options.visible === true && Boolean(position),
        editable: options.editable === true,
      };
    }).filter((state) => state.visible && state.keyframeID);
    const key = JSON.stringify(states.map(({ keyframeID, editable }) => ({ keyframeID, editable })));
    if (key !== this.cameraAimTargetGuideKey) {
      disposeObject(this.cameraAimTargetGuides);
      this.cameraAimTargetGuides.clear();
      this.cameraAimTargetTargets = [];
      for (const state of states) {
        const guide = createCameraAimTargetGuide(state.keyframeID, state.editable);
        this.cameraAimTargetGuides.add(guide);
        if (state.editable) this.cameraAimTargetTargets.push(...guide.userData.hitTargets);
      }
      this.cameraAimTargetGuideKey = key;
    }
    states.forEach(({ position }, index) => {
      this.cameraAimTargetGuides.children[index].position.set(position.x, position.y, position.z);
    });
    this.cameraAimTargetGuideState = states;
    this.cameraAimTargetGuides.visible = this.isSceneAuthoringModeActive() && states.length > 0;
    this.renderer.domElement.dataset.cameraAimTarget = states.length ? "visible" : "hidden";
  }

  setCameraTrackGuide(track, options = {}) {
    const keyframes = Array.isArray(track?.keyframes)
      ? track.keyframes.filter(validCameraTrackPose).map((keyframe) => ({
          id: keyframe.id,
          time: Number(keyframe.time || 0),
          ...cloneCameraTrackPose(keyframe),
        }))
      : [];
    const pathPoses = Array.isArray(track?.pathPoses)
      ? track.pathPoses.filter(validCameraTrackPose).map(cloneCameraTrackPose)
      : [];
    const start = validCameraTrackPose(track?.start)
      ? cloneCameraTrackPose(track.start)
      : keyframes.find((keyframe) => keyframe.time === 0) || null;
    const end = validCameraTrackPose(track?.end)
      ? cloneCameraTrackPose(track.end)
      : keyframes.at(-1) || null;
    const requestedPose = validCameraTrackPose(options.pose) ? cloneCameraTrackPose(options.pose) : null;
    const selectedKeyframeID = typeof options.selectedKeyframeID === "string"
      ? options.selectedKeyframeID
      : null;
    const state = {
      start,
      end,
      keyframes,
      pathPoses,
      pose: requestedPose || start || end,
      aspectRatio: typeof options.aspectRatio === "string" ? options.aspectRatio : this.shotAspectRatio,
      visible: options.visible === true && Boolean(start || end),
      selectedKeyframeID,
      selectable: options.selectable === true,
      editable: options.editable === true,
    };
    const key = JSON.stringify({
      start,
      end,
      keyframes,
      pathPoses,
      aspectRatio: state.aspectRatio,
      selectedKeyframeID,
      selectable: state.selectable,
      editable: state.editable,
    });
    const structureChanged = key !== this.cameraGuideKey;
    this.cameraGuideState = state;
    this.cameraGuideKey = key;
    this.cameraGuides.visible = this.isSceneAuthoringModeActive() && state.visible;
    this.renderer.domElement.dataset.cameraGuides = start || end
      ? state.visible ? "visible" : "hidden"
      : "empty";
    this.renderer.domElement.dataset.cameraGuideStyle = "compact";
    this.renderer.domElement.dataset.cameraGuideAspectRatio = state.aspectRatio;
    this.renderer.domElement.dataset.cameraGuidePose = state.pose
      ? [state.pose.position.x, state.pose.position.y, state.pose.position.z]
        .map((value) => Number(value).toFixed(3)).join(",")
      : "";
    if (structureChanged) {
      disposeObject(this.cameraGuides);
      this.cameraGuides.clear();
      this.cameraKeyframeTargets = [];
      this.cameraKeyframeGuides = [];
      this.cameraRigGuide = null;
      const guidePathPoses = pathPoses.length > 1
        ? pathPoses
        : keyframes.length > 1
          ? keyframes
          : start && end ? [start, end] : [];
      if (guidePathPoses.length > 1) this.cameraGuides.add(createCameraTrackPath(guidePathPoses));
      const startKeyframe = keyframes.find((keyframe) => keyframe.time === 0) || null;
      const lastKeyframe = keyframes.at(-1) || null;
      const startGuide = start && createCameraEndpointGuide("A", start, {
        keyframeID: sameCameraPose(start, startKeyframe) ? startKeyframe.id : null,
        selected: startKeyframe?.id === selectedKeyframeID,
      });
      const endGuide = end && createCameraEndpointGuide("B", end, {
        keyframeID: sameCameraPose(end, lastKeyframe) ? lastKeyframe.id : null,
        selected: lastKeyframe?.id === selectedKeyframeID,
      });
      if (startGuide) {
        this.cameraGuides.add(startGuide);
        this.cameraKeyframeGuides.push(startGuide);
        if (state.selectable && startGuide.userData.hitTarget) this.cameraKeyframeTargets.push(startGuide.userData.hitTarget);
      }
      if (endGuide) {
        this.cameraGuides.add(endGuide);
        this.cameraKeyframeGuides.push(endGuide);
        if (state.selectable && endGuide.userData.hitTarget) this.cameraKeyframeTargets.push(endGuide.userData.hitTarget);
      }
      for (const keyframe of keyframes) {
        const representedByStart = startKeyframe?.id === keyframe.id && sameCameraPose(start, keyframe);
        const representedByEnd = lastKeyframe?.id === keyframe.id && sameCameraPose(end, keyframe);
        if (representedByStart || representedByEnd) continue;
        const guide = createCameraIntermediateGuide(keyframe, {
          selected: keyframe.id === selectedKeyframeID,
        });
        this.cameraGuides.add(guide);
        this.cameraKeyframeGuides.push(guide);
        if (state.selectable && guide.userData.hitTarget) this.cameraKeyframeTargets.push(guide.userData.hitTarget);
      }
      if (state.pose) {
        this.cameraRigGuide = createCameraRigGuide();
        this.cameraGuides.add(this.cameraRigGuide);
      }
    }
    if (this.cameraRigGuide && state.pose) updateCameraRigGuidePose(this.cameraRigGuide, state.pose, state.aspectRatio);
    if (this.cameraRigGuide) {
      this.renderer.domElement.dataset.cameraGuideBodyOffset = "0.140";
      this.renderer.domElement.dataset.cameraGuideBodyDepth = "0.170";
      this.updateCameraRigGuideFade(0, structureChanged);
    } else {
      delete this.renderer.domElement.dataset.cameraGuideFade;
      delete this.renderer.domElement.dataset.cameraGuideBodyOffset;
      delete this.renderer.domElement.dataset.cameraGuideBodyDepth;
    }
    this.updateCameraKeyframeGuideFade(0, structureChanged);
    this.renderer.domElement.dataset.cameraKeyframeEditing = state.editable ? "enabled" : "disabled";
  }

  updateCameraRigGuideFade(delta, immediate = false) {
    if (!this.cameraRigGuide) return;
    const observerCamera = this.activeSceneNavigation().camera;
    const distance = observerCamera.position.distanceTo(this.cameraRigGuide.position);
    const proximity = THREE.MathUtils.smoothstep(
      distance,
      cameraGuideFadeNearDistance,
      cameraGuideFadeFarDistance
    );
    const target = proximity * proximity;
    const current = Number.isFinite(this.cameraRigGuide.userData.proximityFade)
      ? this.cameraRigGuide.userData.proximityFade
      : target;
    const alpha = immediate ? 1 : 1 - Math.exp(-Math.max(delta, 0) * cameraGuideFadeResponse);
    const fade = THREE.MathUtils.lerp(current, target, alpha);
    setCameraRigGuideOpacity(this.cameraRigGuide, fade);
    this.renderer.domElement.dataset.cameraGuideFade = fade.toFixed(3);
  }

  updateCameraKeyframeGuideFade(delta, immediate = false) {
    const observerCamera = this.activeSceneNavigation().camera;
    let hiddenCount = 0;
    for (const guide of this.cameraKeyframeGuides) {
      const distance = observerCamera.position.distanceTo(guide.position);
      const target = THREE.MathUtils.smoothstep(
        distance,
        cameraKeyframeFadeNearDistance,
        cameraKeyframeFadeFarDistance
      );
      const current = Number.isFinite(guide.userData.proximityFade)
        ? guide.userData.proximityFade
        : target;
      const alpha = immediate ? 1 : 1 - Math.exp(-Math.max(delta, 0) * cameraGuideFadeResponse);
      const fade = THREE.MathUtils.lerp(current, target, alpha);
      const interactive = distance >= cameraKeyframeFadeNearDistance;
      setCameraKeyframeGuideOpacity(guide, fade, interactive);
      if (!interactive) hiddenCount += 1;
    }
    this.renderer.domElement.dataset.cameraKeyframesNearObserver = String(hiddenCount);
  }

  updateActorHandles() {
    const target = this.selectedTransformTarget();
    const group = target?.object || null;
    const available = Boolean(
      group
      && objectWorldVisible(group)
      && !target.locked
      && this.isSceneAuthoringModeActive()
      && this.editable
      && (
        this.playbackStatus === "idle"
      )
      && (target.kind !== "actor" || !this.selectedPathPointID)
      && !this.previewActive
    );
    this.updateActorTransformHandle(group, available);
  }

  selectedTransformTarget() {
    
    if (this.selectedObject?.kind === "blockoutObject") {
      if (!this.sceneObjectSelectionEnabled) return null;
      const group = this.blockoutRoot.children.find((candidate) => (
        candidate.userData.blockoutGroupID === this.selectedObject.parentID
      ));
      const object = group?.children.find((candidate) => (
        candidate.userData.blockoutObjectID === this.selectedObject.id
      ));
      const authoredGroup = this.project?.scene?.blockout?.groups?.find((candidate) => (
        candidate.id === this.selectedObject.parentID
      ));
      const authored = authoredGroup?.objects?.find((candidate) => (
        candidate.id === this.selectedObject.id
      ));
      return object && authored ? {
        kind: "blockoutObject",
        id: authored.id,
        parentID: authoredGroup.id,
        object,
        locked: this.project?.scene?.blockout?.locked === true
          || authoredGroup.locked === true
          || authored.locked === true,
      } : null;
    }
    if (this.selectedObject?.kind === "blockoutGroup") {
      if (!this.sceneObjectSelectionEnabled) return null;
      const object = this.blockoutRoot.children.find((group) => (
        group.userData.blockoutGroupID === this.selectedObject.id
      ));
      const authored = this.project?.scene?.blockout?.groups?.find((group) => (
        group.id === this.selectedObject.id
      ));
      return object && authored ? {
        kind: "blockoutGroup",
        id: authored.id,
        parentID: null,
        object,
        locked: this.project?.scene?.blockout?.locked === true || authored.locked === true,
      } : null;
    }
    if (this.selectedObject?.kind === "environment") {
      if (!this.sceneObjectSelectionEnabled) return null;
      const visual = this.project?.scene?.environment?.visuals?.find(
        (candidate) => candidate.id === this.selectedObject.id
      );
      const entry = this.environmentEntries.get(this.selectedObject.id);
      const parentGroup = visual?.groupID
        ? this.project?.scene?.environment?.groups?.find((group) => group.id === visual.groupID)
        : null;
      return visual && entry?.group.visible ? {
        kind: "environment",
        id: visual.id,
        parentID: visual.groupID || null,
        object: entry.group,
        locked: visual.locked === true || parentGroup?.locked === true,
      } : null;
    }
    if (this.selectedObject?.kind === "environmentGroup") {
      if (!this.sceneObjectSelectionEnabled) return null;
      const authored = this.project?.scene?.environment?.groups?.find(
        (group) => group.id === this.selectedObject.id
      );
      const object = this.environmentGroupEntries.get(this.selectedObject.id);
      return authored && object?.visible ? {
        kind: "environmentGroup",
        id: authored.id,
        parentID: null,
        object,
        locked: authored.locked === true,
      } : null;
    }
    const object = this.selectedActorID ? this.actors.get(this.selectedActorID) : null;
    const pairedAction = null;
    return object ? {
      kind: "actor",
      id: this.selectedActorID,
      parentID: null,
      object,
      locked: object.userData.locked === true,
      
    } : null;
  }

  updateActorTransformHandle(group = this.selectedTransformTarget()?.object || null, available = null) {
    const target = this.selectedTransformTarget();
    const shouldShow = available ?? Boolean(
      group
      && objectWorldVisible(group)
      && !target?.locked
      && this.isSceneAuthoringModeActive()
      && this.editable
      && (
        this.playbackStatus === "idle"
      )
      && (target?.kind !== "actor" || !this.selectedPathPointID)
      && !this.previewActive
    );
    this.actorTransformHandle.visible = shouldShow;
    if (!shouldShow) return;
    group.updateWorldMatrix(true, true);
    const worldPosition = group.getWorldPosition(new THREE.Vector3());
    const bounds = new THREE.Box3().setFromObject(group);
    this.actorTransformHandle.position.copy(worldPosition);
    this.actorTransformHandle.position.y = Number.isFinite(bounds.min.y)
      ? bounds.min.y + 0.035
      : worldPosition.y + 0.035;
    const worldQuaternion = group.getWorldQuaternion(new THREE.Quaternion());
    this.actorTransformHandle.rotation.setFromQuaternion(worldQuaternion, "YXZ");
    this.actorTransformHandle.rotation.x = 0;
    this.actorTransformHandle.rotation.z = 0;
    this.updateActorTransformHandleAppearance(group);
    const observerCamera = this.activeSceneNavigation().camera;
    const distance = observerCamera.position.distanceTo(this.actorTransformHandle.position);
    const scale = actorTransformHandleScale(distance, observerCamera.fov);
    this.actorTransformHandle.scale.setScalar(scale);
  }

  

  updateActorTransformHandleAppearance(group = this.selectedActorID ? this.actors.get(this.selectedActorID) : null) {
    if (!group) return;
    const emphasized = this.transformDragging
      || this.renderer.domElement.classList.contains("move-handle-hover")
      || this.renderer.domElement.classList.contains("rotation-handle-hover");
    const color = Number.isInteger(group.userData.clothingColorIndex)
      ? new THREE.Color(group.userData.blockingColor || clothingColors[group.userData.clothingColorIndex]).lerp(guideBackgroundColor, emphasized ? 0 : 0.16)
      : new THREE.Color(emphasized ? 0xf0c57f : 0xd9ad67);
    const ring = this.actorTransformHandle.userData.ring;
    const headingNotch = this.actorTransformHandle.userData.headingNotch;
    const movePuck = this.actorTransformHandle.userData.movePuck;
    ring.material.color.copy(color);
    ring.material.opacity = emphasized ? 0.9 : 0.62;
    headingNotch.material.color.copy(color);
    headingNotch.material.opacity = emphasized ? 1 : 0.82;
    movePuck.material.color.copy(color);
    movePuck.material.opacity = emphasized ? 1 : 0.82;
  }

  setMovePlacement(active) {
    this.placingMove = Boolean(
      active
      && this.selectedActorAllowsMotionEditing()
    );
    this.renderer.domElement.classList.toggle("placing-move", this.placingMove);
    this.onPlacementChange(this.placingMove);
  }

  selectedActorAllowsMotionEditing() {
    const actor = this.project?.scene?.actors?.find((candidate) => candidate.id === this.selectedActorID);
    return Boolean(
      this.isSceneAuthoringModeActive()
      && actor
      && actor.visible !== false
      && !actor.locked
      && this.actorMotionEditable
    );
  }

  // MCP `control_film_space_session` 的 view: "top" 入口，一次性跳转，不加锁。
  moveCameraToTopView() {
    if (!this.isSceneEditView()) return;
    this.cameraFocusTransition = null;
    const { focus, radius } = this.sceneBounds();
    const distance = this.editorCameraFitDistance(radius);
    this.orbit.target.copy(focus);
    this.camera.position.set(
      focus.x,
      focus.y + distance,
      focus.z + Math.max(0.01, radius * 0.001)
    );
    this.camera.lookAt(focus);
    this.configureEditorCameraRange(distance, radius);
    this.orbit.update();
  }

  resetSceneView() {
    this.releaseTopViewLock();
    this.cameraFocusTransition=null;
    this.cameraKeys.clear();
    this.cameraPrecisionKeys.clear();
    this.cameraPlanarVelocity.set(0,0);
    this.sceneCameraPlanarBasis=null;
    const damping=this.orbit.enableDamping;
    this.orbit.enableDamping=false;
    this.orbit.update();
    this.orbit.enableDamping=damping;
    this.orbit.target.set(0,.85,0);
    this.camera.position.set(4.8,4.2,6.6);
    this.camera.up.set(0,1,0);
    this.camera.lookAt(this.orbit.target);
    this.configureEditorCameraRange(this.camera.position.distanceTo(this.orbit.target),2);
    this.orbit.update();
  }

  // MCP view: "orbit" 入口。UI 上的「透视」按钮已移除，MCP 契约保留。
  moveCameraToOrbitView() {
    if (!this.isSceneEditView()) return;
    this.releaseTopViewLock();
    this.cameraFocusTransition = null;
    const { focus, radius } = this.sceneBounds();
    this.orbit.target.copy(focus);
    const distance = this.editorCameraFitDistance(radius);
    const direction = new THREE.Vector3(0.65, 0.52, 0.8).normalize();
    this.camera.position.copy(focus).addScaledVector(direction, distance);
    this.camera.lookAt(focus);
    this.configureEditorCameraRange(distance, radius);
    this.orbit.update();
  }

  get topViewLocked() {
    return this.topViewLock !== null;
  }

  // T 在「锁定顶视」和「进入顶视前的机位」之间来回切换。锁定期间禁用旋转，
  // 所以「是否在顶视」是一个布尔量，不需要靠几何比较去猜。
  toggleTopViewLock() {
    if (this.topViewLock) return this.releaseTopViewLock();
    if (!this.isSceneEditView()) return false;
    this.cameraPlanarVelocity.set(0, 0);
    this.sceneCameraPlanarBasis = null;
    // moveCameraToTopView() 会重算 near/far/maxDistance，一并记下才能真正复位。
    this.topViewLock = {
      position: this.camera.position.clone(),
      target: this.orbit.target.clone(),
      near: this.camera.near,
      far: this.camera.far,
      maxDistance: this.orbit.maxDistance,
    };
    this.moveCameraToTopView();
    this.orbit.enableRotate = false;
    this.renderer.domElement.dataset.topViewLocked = "true";
    return true;
  }

  releaseTopViewLock() {
    if (!this.topViewLock) return false;
    const restored = this.topViewLock;
    this.topViewLock = null;
    this.orbit.enableRotate = true;
    this.orbit.enabled = this.isSceneEditView();
    this.cameraFocusTransition = null;
    this.cameraPlanarVelocity.set(0, 0);
    this.cameraKeys.clear();
    this.cameraPrecisionKeys.clear();
    this.sceneCameraPlanarBasis = null;
    this.shotCameraPlanarBasis = null;
    this.cameraAuthoringTranslationContext = null;
    // 锁定期间平移/推拉会在 OrbitControls 里留下未消费的增量。先 flush 一次，
    // 否则恢复位姿之后的 update() 会把它叠加上去，让 T→T 回不到原点。
    this.orbit.update();
    this.camera.position.copy(restored.position);
    this.orbit.target.copy(restored.target);
    this.camera.near = restored.near;
    this.camera.far = restored.far;
    this.camera.updateProjectionMatrix();
    this.orbit.maxDistance = restored.maxDistance;
    this.orbit.update();
    delete this.renderer.domElement.dataset.topViewLocked;
    return true;
  }

  captureCameraPose() {
    const activeCamera = this.viewportMode === "camera" || this.editViewMode === "shot"
      ? this.shotCamera
      : this.camera;
    activeCamera.updateMatrixWorld(true);
    return {
      position: {
        x: activeCamera.position.x,
        y: activeCamera.position.y,
        z: activeCamera.position.z,
      },
      quaternion: {
        x: activeCamera.quaternion.x,
        y: activeCamera.quaternion.y,
        z: activeCamera.quaternion.z,
        w: activeCamera.quaternion.w,
      },
      focalLength: THREE.MathUtils.clamp(
        activeCamera === this.shotCamera
          ? Number(this.shotCamera.userData.focalLength || 35)
          : Number(this.camera.userData.focalLength || 35),
        cameraFocalLengthMinimum,
        cameraFocalLengthMaximum
      ),
      focusDistance: THREE.MathUtils.clamp(
        Number(activeCamera.userData.focusDistance || 5),
        0.1,
        1000
      ),
      aperture: THREE.MathUtils.clamp(
        Number(activeCamera.userData.aperture || 2.8),
        1.4,
        16
      ),
    };
  }

  captureSceneCameraPose() {
    this.camera.updateMatrixWorld(true);
    return cameraPoseFromThreeCamera(this.camera, this.camera.userData.focalLength);
  }

  setSceneCameraPose(pose) {
    if (!validCameraTrackPose(pose)) return false;
    const focusDistance = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(this.orbit.target),
      0.5,
      30
    );
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.camera.quaternion.set(
      pose.quaternion.x,
      pose.quaternion.y,
      pose.quaternion.z,
      pose.quaternion.w
    ).normalize();
    this.camera.userData.focalLength = THREE.MathUtils.clamp(
      Number(pose.focalLength),
      cameraFocalLengthMinimum,
      cameraFocalLengthMaximum
    );
    this.refreshSceneCameraProjection();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.orbit.target.copy(this.camera.position).addScaledVector(forward, focusDistance);
    this.camera.updateMatrixWorld(true);
    this.orbit.update();
    return true;
  }

  shotCameraEditorState() {
    const roll = cameraOpticalRollDegrees(this.shotCamera.quaternion);
    const neutralQuaternion = setCameraOpticalRollDegrees(this.shotCamera.quaternion, 0);
    const rotation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion(
        neutralQuaternion.x,
        neutralQuaternion.y,
        neutralQuaternion.z,
        neutralQuaternion.w
      ),
      "YXZ"
    );
    const pose = this.captureCameraPose();
    if (this.cameraTrackPose?.focusTrackingEvaluation) {
      pose.focusTrackingEvaluation = structuredClone(
        this.cameraTrackPose.focusTrackingEvaluation
      );
    }
    return {
      pose,
      rotationDegrees: {
        pitch: THREE.MathUtils.radToDeg(rotation.x),
        yaw: THREE.MathUtils.radToDeg(rotation.y),
        roll,
      },
    };
  }

  setShotCameraEditorValues(values = {}, options = {}) {
    if (!this.isShotEditView() || !this.shotCameraEditable || !this.cameraTrackPose) return false;
    const changesPose = Boolean(values.position || values.rotationDegrees);
    const position = values.position || {};
    this.shotCamera.position.set(
      finiteOr(position.x, this.shotCamera.position.x),
      finiteOr(position.y, this.shotCamera.position.y),
      finiteOr(position.z, this.shotCamera.position.z)
    );
    if (values.rotationDegrees) {
      const currentRoll = cameraOpticalRollDegrees(this.shotCamera.quaternion);
      const nextRoll = finiteOr(values.rotationDegrees.roll, currentRoll);
      if (!this.cameraAimRotationLocked) {
        const neutralQuaternion = setCameraOpticalRollDegrees(this.shotCamera.quaternion, 0);
        const current = new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion(
            neutralQuaternion.x,
            neutralQuaternion.y,
            neutralQuaternion.z,
            neutralQuaternion.w
          ),
          "YXZ"
        );
        const rotation = new THREE.Euler(
          THREE.MathUtils.degToRad(finiteOr(values.rotationDegrees.pitch, THREE.MathUtils.radToDeg(current.x))),
          THREE.MathUtils.degToRad(finiteOr(values.rotationDegrees.yaw, THREE.MathUtils.radToDeg(current.y))),
          0,
          "YXZ"
        );
        rotation.x = THREE.MathUtils.clamp(rotation.x, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
        this.shotCamera.quaternion.setFromEuler(rotation);
      }
      const nextQuaternion = setCameraOpticalRollDegrees(this.shotCamera.quaternion, nextRoll);
      this.shotCamera.quaternion.set(
        nextQuaternion.x,
        nextQuaternion.y,
        nextQuaternion.z,
        nextQuaternion.w
      );
    }
    if (Number.isFinite(Number(values.focalLength))) {
      this.shotCamera.userData.focalLength = THREE.MathUtils.clamp(
        Number(values.focalLength),
        cameraFocalLengthMinimum,
        cameraFocalLengthMaximum
      );
      this.refreshShotCameraProjection();
    }
    if (Number.isFinite(Number(values.focusDistance))) {
      this.setShotCameraOpticsPreview({ focusDistance: values.focusDistance });
    }
    if (Number.isFinite(Number(values.aperture))) {
      this.setShotCameraOpticsPreview({ aperture: values.aperture });
    }
    if (changesPose) this.shotObservationTarget = null;
    if (options.notify !== false) this.notifyShotCameraPoseChange();
    return true;
  }

  setShotCameraOpticsPreview(values = {}) {
    if (this.viewportMode !== "edit" || !this.shotCameraEditable || !this.cameraTrackPose) return false;
    if (Number.isFinite(Number(values.focusDistance))) {
      this.shotCamera.userData.focusDistance = THREE.MathUtils.clamp(
        Number(values.focusDistance),
        0.1,
        1000
      );
    }
    if (Number.isFinite(Number(values.aperture))) {
      this.shotCamera.userData.aperture = THREE.MathUtils.clamp(
        Number(values.aperture),
        1.4,
        16
      );
    }
    return true;
  }

  setCurrentFocalLength(value) {
    if (this.viewportMode !== "edit") return false;
    const focalLength = THREE.MathUtils.clamp(
      Number(value || 0),
      cameraFocalLengthMinimum,
      cameraFocalLengthMaximum
    );
    if (!Number.isFinite(focalLength)) return false;
    if (this.editViewMode === "shot") {
      if (!this.cameraTrackPose) return false;
      this.cameraTrackPose.focalLength = focalLength;
      this.shotCamera.userData.focalLength = focalLength;
      this.refreshShotCameraProjection();
      this.notifyShotCameraPoseChange();
      return true;
    }
    // 机位视角下双指变焦改的是机位相机，自由相机的焦距不动 —— 退出后你原来那个
    // 视角连焦距都还是原样。
    if (this.isSetupViewActive()) {
      this.setupCamera.userData.focalLength = focalLength;
      this.refreshSetupCameraProjection();
      return true;
    }
    this.camera.userData.focalLength = focalLength;
    this.refreshSceneCameraProjection();
    return true;
  }

  setSceneCameraFocalLength(value) {
    if (!this.isSceneEditView()) return false;
    return this.setCurrentFocalLength(value);
  }

  setCameraTrackPose(pose, options = {}) {
    if (!validCameraTrackPose(pose)) return false;
    const locked = options.locked === true;
    this.cameraTrackLocked = locked;
    this.cameraAimRotationLocked = options.rotationLocked === true;
    this.cameraAimEvaluation = pose.aimEvaluation
      ? structuredClone(pose.aimEvaluation)
      : null;
    this.cameraTrackPose = cloneCameraTrackPose(pose);
    this.applyCameraTrackPose(pose);
    this.renderer.domElement.dataset.cameraTrack = locked ? "playing" : "ready";
    this.renderer.domElement.dataset.cameraAimRotation = this.cameraAimRotationLocked ? "locked" : "free";
    return true;
  }

  clearCameraTrackPose() {
    this.cameraTrackPose = null;
    this.cameraTrackLocked = false;
    this.cameraAimRotationLocked = false;
    this.cameraAimEvaluation = null;
    delete this.renderer.domElement.dataset.cameraTrack;
    delete this.renderer.domElement.dataset.cameraAimRotation;
  }

  applyCameraTrackPose(pose) {
    if (!validCameraTrackPose(pose)) return;
    this.shotCamera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.shotCamera.quaternion.set(
      pose.quaternion.x,
      pose.quaternion.y,
      pose.quaternion.z,
      pose.quaternion.w
    ).normalize();
    this.shotCamera.userData.focalLength = THREE.MathUtils.clamp(
      Number(pose.focalLength),
      cameraFocalLengthMinimum,
      cameraFocalLengthMaximum
    );
    this.shotCamera.userData.focusDistance = THREE.MathUtils.clamp(
      Number(pose.focusDistance || 5),
      0.1,
      1000
    );
    this.shotCamera.userData.aperture = THREE.MathUtils.clamp(
      Number(pose.aperture || 2.8),
      1.4,
      16
    );
    this.shotCamera.userData.depthOfFieldEnabled = pose.depthOfFieldEnabled === true;
    this.shotObservationTarget = null;
    this.refreshShotCameraProjection();
    this.shotCamera.updateMatrixWorld(true);
  }

  rotateShotCamera(yawDelta, pitchDelta) {
    if (this.cameraAimRotationLocked) return;
    const roll = cameraOpticalRollDegrees(this.shotCamera.quaternion);
    const neutralQuaternion = setCameraOpticalRollDegrees(this.shotCamera.quaternion, 0);
    const rotation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion(
        neutralQuaternion.x,
        neutralQuaternion.y,
        neutralQuaternion.z,
        neutralQuaternion.w
      ),
      "YXZ"
    );
    rotation.y += yawDelta;
    rotation.x = THREE.MathUtils.clamp(
      rotation.x + pitchDelta,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01
    );
    this.shotCamera.quaternion.setFromEuler(rotation);
    const nextQuaternion = setCameraOpticalRollDegrees(this.shotCamera.quaternion, roll);
    this.shotCamera.quaternion.set(
      nextQuaternion.x,
      nextQuaternion.y,
      nextQuaternion.z,
      nextQuaternion.w
    );
  }

  centerSceneHitPoint(camera) {
    camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const roots = [
      ...this.actors.values(),
      this.blockoutRoot,
      this.environmentGroup,
      this.floor,
    ].filter((object) => object?.visible !== false);
    const hit = this.raycaster.intersectObjects(roots, true).find(({ object, point }) => (
      point.distanceToSquared(camera.position) > 0.0001
      && objectWorldVisible(object)
    ));
    return hit?.point?.clone?.() || null;
  }

  resolveShotObservationTarget() {
    if (finiteThreeVector(this.shotObservationTarget)) {
      return this.shotObservationTarget;
    }
    const centerHit = this.centerSceneHitPoint(this.shotCamera);
    if (centerHit) {
      this.shotObservationTarget = centerHit;
      return this.shotObservationTarget;
    }
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.shotCamera.quaternion).normalize();
    const { focus, radius } = this.sceneBounds();
    const focusOffset = focus.clone().sub(this.shotCamera.position);
    const projectedDistance = focusOffset.dot(forward);
    const fallbackDistance = THREE.MathUtils.clamp(
      projectedDistance > 0.5 ? projectedDistance : focusOffset.length(),
      1,
      Math.max(30, radius * 4)
    );
    this.shotObservationTarget = this.shotCamera.position.clone()
      .addScaledVector(forward, fallbackDistance);
    return this.shotObservationTarget;
  }

  orbitShotCamera(target, deltaX, deltaY) {
    if (this.cameraAimRotationLocked) return false;
    const offset = this.shotCamera.position.clone().sub(target);
    if (offset.lengthSq() < shotCameraOrbitMinDistance ** 2) {
      offset.set(0, 0, shotCameraOrbitMinDistance).applyQuaternion(this.shotCamera.quaternion);
    }
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const nextSpherical = sphericalOrbitAfterPointer(spherical, deltaX, deltaY);
    spherical.set(
      nextSpherical.radius,
      nextSpherical.phi,
      nextSpherical.theta
    );
    const roll = cameraOpticalRollDegrees(this.shotCamera.quaternion);
    this.shotCamera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.shotCamera.lookAt(target);
    const nextQuaternion = setCameraOpticalRollDegrees(this.shotCamera.quaternion, roll);
    this.shotCamera.quaternion.set(
      nextQuaternion.x,
      nextQuaternion.y,
      nextQuaternion.z,
      nextQuaternion.w
    );
    this.shotObservationTarget = target.clone();
    return true;
  }

  panShotCamera(target, deltaX, deltaY) {
    const distance = Math.max(
      shotCameraOrbitMinDistance,
      this.shotCamera.position.distanceTo(target)
    );
    const rect = this.viewport.getBoundingClientRect();
    const worldPerPixel = worldUnitsPerScreenPixel(
      distance,
      this.shotCamera.fov,
      rect.height
    );
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.shotCamera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.shotCamera.quaternion);
    const translation = right.multiplyScalar(-deltaX * worldPerPixel)
      .add(up.multiplyScalar(deltaY * worldPerPixel));
    this.shotCamera.position.add(translation);
    target.add(translation);
    this.shotObservationTarget = target.clone();
    return true;
  }

  // 机位视角下推拉的是机位相机；两套 orbit 各带各的 target 和距离范围，
  // 所以只需要挑一套，逻辑本身一个字不改。
  dollySceneCamera(wheelDelta) {
    const setupView = this.isSetupViewActive();
    const orbit = setupView ? this.setupOrbit : this.orbit;
    const camera = setupView ? this.setupCamera : this.camera;
    if (!this.isSceneEditView() || !orbit.enabled) return false;
    const offset = camera.position.clone().sub(orbit.target);
    const distance = Math.max(orbit.minDistance, offset.length());
    if (offset.lengthSq() < 0.000001) return false;
    const nextDistance = orbitDistanceAfterWheel(
      distance,
      wheelDelta,
      orbit.minDistance,
      orbit.maxDistance
    );
    if (Math.abs(nextDistance - distance) < 0.000001) return false;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    camera.position.addScaledVector(forward, distance - nextDistance);
    orbit.update();
    return true;
  }

  dollyShotCamera(wheelDelta) {
    const target = this.resolveShotObservationTarget();
    const distance = Math.max(
      shotCameraOrbitMinDistance,
      this.shotCamera.position.distanceTo(target)
    );
    const nextDistance = orbitDistanceAfterWheel(
      distance,
      wheelDelta,
      shotCameraOrbitMinDistance,
      shotCameraOrbitMaxDistance
    );
    if (Math.abs(nextDistance - distance) < 0.000001) return false;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.shotCamera.quaternion).normalize();
    this.shotCamera.position.addScaledVector(forward, distance - nextDistance);
    return true;
  }

  rollShotCamera(rollDelta) {
    const roll = cameraOpticalRollDegrees(this.shotCamera.quaternion);
    const nextQuaternion = setCameraOpticalRollDegrees(
      this.shotCamera.quaternion,
      roll + THREE.MathUtils.radToDeg(rollDelta)
    );
    this.shotCamera.quaternion.set(
      nextQuaternion.x,
      nextQuaternion.y,
      nextQuaternion.z,
      nextQuaternion.w
    );
  }

  notifyShotCameraPoseChange() {
    if (!this.cameraTrackPose) return;
    const pose = cameraPoseFromThreeCamera(
      this.shotCamera,
      this.shotCamera.userData.focalLength
    );
    this.cameraTrackPose = cloneCameraTrackPose(pose);
    this.renderer.domElement.dataset.cameraTrack = "staged";
    this.onShotCameraPoseChange(cloneCameraTrackPose(pose));
  }

  setShotComposition(options = {}) {
    this.shotAspectRatio = typeof options.aspectRatio === "string" ? options.aspectRatio : this.shotAspectRatio;
    this.shotFrameHeightFraction = THREE.MathUtils.clamp(
      Number(options.frameHeightFraction || this.shotFrameHeightFraction),
      0.05,
      1
    );
    this.renderer.domElement.dataset.shotAspectRatio = this.shotAspectRatio;
    this.refreshShotCameraProjection();
  }

  isSetupViewActive() {
    return this.setupViewActive && this.isSceneEditView() && this.viewportMode === "edit";
  }

  isSceneAuthoringModeActive() {
    return sceneAuthoringModeActive(
      this.isSceneEditView(),
      this.isSetupViewActive()
    );
  }

  refreshSceneAuthoringOverlayVisibility() {
    const visible = this.isSceneAuthoringModeActive();
    this.guides.visible = visible && this.authoringGuidesVisible;
    this.cameraGuides.visible = visible && Boolean(this.cameraGuideState?.visible);
    this.cameraAimTargetGuides.visible = visible
      && this.cameraAimTargetGuideState.length > 0;
    this.origin.visible = visible;
  }

  // 进机位视角：把姿势装进机位相机，自由相机一个字节不动。orbit 的目标点放在
  // 相机正前方一个观察距离处，这样拖动就是绕着你正看的东西转。
  enterSetupView(pose, options = {}) {
    if (!validCameraTrackPose(pose)) return false;
    clearSceneNavigationTransientState(this);
    this.setMovePlacement(false);
    this.setupViewActive = true;
    this.applySetupViewPose(pose);
    if (typeof options.aspectRatio === "string") this.setupFrameAspectRatio = options.aspectRatio;
    if (Number.isFinite(Number(options.frameHeightFraction))) {
      this.setupFrameHeightFraction = THREE.MathUtils.clamp(Number(options.frameHeightFraction), 0.05, 1);
    }
    this.orbit.enabled = false;
    this.setupOrbit.enabled = true;
    this.setupCameraDirty = false;
    this.refreshSetupCameraProjection();
    this.renderer.domElement.dataset.setupView = "true";
    this.refreshSceneAuthoringOverlayVisibility();
    this.updateActorHandles();
    return true;
  }

  leaveSetupView() {
    if (!this.setupViewActive) return false;
    clearSceneNavigationTransientState(this);
    this.setupViewActive = false;
    this.setupOrbit.enabled = false;
    this.orbit.enabled = this.isSceneEditView();
    delete this.renderer.domElement.dataset.setupView;
    this.refreshSceneAuthoringOverlayVisibility();
    this.updateActorHandles();
    return true;
  }

  applySetupViewPose(pose) {
    if (!validCameraTrackPose(pose)) return false;
    this.setupCamera.position.set(pose.position.x, pose.position.y, pose.position.z);
    // OrbitControls 每帧从「位置 + 目标点」重算朝向，地平线永远是平的，翻滚会被抹掉。
    // 所以翻滚不交给它：相机只拿零滚转的朝向，翻滚单独记着，每帧在 orbit.update()
    // 之后绕视轴补回去 —— 和 Shot 相机把翻滚当光学滚转处理是同一套。
    this.setupRollDegrees = cameraOpticalRollDegrees(pose.quaternion);
    const neutral = setCameraOpticalRollDegrees(pose.quaternion, 0);
    this.setupCamera.quaternion.set(neutral.x, neutral.y, neutral.z, neutral.w);
    this.setupCamera.userData.focalLength = pose.focalLength;
    this.setupCamera.userData.focusDistance = THREE.MathUtils.clamp(
      Number(pose.focusDistance || 5),
      0.1,
      1000
    );
    this.setupCamera.userData.aperture = THREE.MathUtils.clamp(
      Number(pose.aperture || 2.8),
      1.4,
      16
    );
    if (Object.hasOwn(pose, "depthOfFieldEnabled")) {
      this.setupCamera.userData.depthOfFieldEnabled = pose.depthOfFieldEnabled === true;
    }
    this.setupCamera.updateMatrixWorld(true);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.setupCamera.quaternion);
    this.setupOrbit.target.copy(this.setupCamera.position).addScaledVector(forward, 4);
    this.setupOrbit.update();
    this.applySetupRoll();
    this.refreshSetupCameraProjection();
    return true;
  }

  applySetupRoll() {
    if (!Number.isFinite(this.setupRollDegrees) || this.setupRollDegrees === 0) return;
    const rolled = setCameraOpticalRollDegrees(this.setupCamera.quaternion, this.setupRollDegrees);
    this.setupCamera.quaternion.set(rolled.x, rolled.y, rolled.z, rolled.w);
    this.setupCamera.updateMatrixWorld(true);
  }

  captureSetupViewPose() {
    this.setupCamera.updateMatrixWorld(true);
    return cameraPoseFromThreeCamera(this.setupCamera, this.setupCamera.userData.focalLength);
  }

  setSetupFrameComposition(options = {}) {
    if (typeof options.aspectRatio === "string") this.setupFrameAspectRatio = options.aspectRatio;
    if (Number.isFinite(Number(options.frameHeightFraction))) {
      this.setupFrameHeightFraction = THREE.MathUtils.clamp(Number(options.frameHeightFraction), 0.05, 1);
    }
    this.refreshSetupCameraProjection();
  }

  refreshSetupCameraProjection() {
    const focalLength = THREE.MathUtils.clamp(
      Number(this.setupCamera.userData.focalLength || 35),
      cameraFocalLengthMinimum,
      cameraFocalLengthMaximum
    );
    this.setupCamera.userData.focalLength = focalLength;
    const exactOutputFov = outputVerticalFov(focalLength, this.setupFrameAspectRatio);
    this.setupCamera.fov = overscanVerticalFov(exactOutputFov, this.setupFrameHeightFraction);
    this.setupCamera.updateProjectionMatrix();
  }

  setSceneFramePreview(options = {}) {
    this.sceneFramePreviewEnabled = options.enabled === true;
    this.sceneFrameAspectRatio = typeof options.aspectRatio === "string"
      ? options.aspectRatio
      : this.sceneFrameAspectRatio;
    this.sceneFrameHeightFraction = THREE.MathUtils.clamp(
      Number(options.frameHeightFraction || this.sceneFrameHeightFraction),
      0.05,
      1
    );
    this.renderer.domElement.dataset.sceneFramePreview = this.sceneFramePreviewEnabled ? "true" : "false";
    this.refreshSceneCameraProjection();
  }

  setEditViewMode(mode) {
    const nextMode = mode === "shot" ? "shot" : "scene";
    if (nextMode === "shot" && !this.cameraTrackPose) return false;
    const modeChanged = nextMode !== this.editViewMode;
    this.editViewMode = nextMode;
    if (modeChanged) {
      this.setFocusPicking(false);
      this.cameraKeys.clear();
      this.cameraPrecisionKeys.clear();
      this.cameraPlanarVelocity.set(0, 0);
      this.sceneCameraPlanarBasis = null;
      this.shotCameraPlanarBasis = null;
      this.cameraAuthoringTranslationContext = null;
      this.cameraFocusTransition = null;
    }
    if (nextMode === "shot") {
      this.releaseTopViewLock();
      this.setMovePlacement(false);
    }
    this.orbit.enabled = this.isSceneEditView();
    this.refreshSceneAuthoringOverlayVisibility();
    this.syncBlockoutVisibility();
    this.rebuildPickTargets();
    this.renderer.domElement.dataset.editViewMode = nextMode;
    if (this.viewportMode === "edit") {
      this.renderer.domElement.setAttribute(
        "aria-label",
        nextMode === "shot" ? "镜头构图编辑视图" : "三维场景编辑视图"
      );
    }
    this.refreshSceneCameraProjection();
    this.refreshShotCameraProjection();
    this.updateActorHandles();
    return true;
  }

  isSceneEditView() {
    return this.viewportMode === "edit" && this.editViewMode === "scene";
  }

  isShotEditView() {
    return this.viewportMode === "edit" && this.editViewMode === "shot";
  }

  refreshSceneCameraProjection() {
    const focalLength = THREE.MathUtils.clamp(
      Number(this.camera.userData.focalLength || 35),
      cameraFocalLengthMinimum,
      cameraFocalLengthMaximum
    );
    this.camera.userData.focalLength = focalLength;
    if (this.sceneFramePreviewEnabled && this.isSceneEditView()) {
      const exactOutputFov = outputVerticalFov(focalLength, this.sceneFrameAspectRatio);
      this.camera.fov = overscanVerticalFov(exactOutputFov, this.sceneFrameHeightFraction);
      this.renderer.domElement.dataset.sceneOutputFov = exactOutputFov.toFixed(3);
    } else {
      this.camera.setFocalLength(focalLength);
      delete this.renderer.domElement.dataset.sceneOutputFov;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.domElement.dataset.sceneFocalLength = focalLength.toFixed(1);
    this.renderer.domElement.dataset.sceneRenderFov = this.camera.fov.toFixed(3);
  }

  refreshShotCameraProjection() {
    const rect = this.viewport.getBoundingClientRect();
    const viewportAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1;
    const focalLength = THREE.MathUtils.clamp(
      Number(this.shotCamera.userData.focalLength || 35),
      cameraFocalLengthMinimum,
      cameraFocalLengthMaximum
    );
    const exactOutputFov = outputVerticalFov(focalLength, this.shotAspectRatio);
    this.shotCamera.aspect = viewportAspect;
    this.shotCamera.fov = this.viewportMode === "edit" && this.editViewMode === "shot"
      ? overscanVerticalFov(exactOutputFov, this.shotFrameHeightFraction)
      : exactOutputFov;
    this.shotCamera.updateProjectionMatrix();
    this.renderer.domElement.dataset.shotOutputFov = exactOutputFov.toFixed(3);
    this.renderer.domElement.dataset.shotRenderFov = this.shotCamera.fov.toFixed(3);
  }

  setViewportMode(mode) {
    const nextMode = mode === "camera" ? "camera" : "edit";
    if (nextMode === "camera" && !this.cameraTrackPose) return false;
    const modeChanged = nextMode !== this.viewportMode;
    this.viewportMode = nextMode;
    if (modeChanged) {
      this.setFocusPicking(false);
      this.cameraKeys.clear();
      this.cameraPrecisionKeys.clear();
      this.cameraPlanarVelocity.set(0, 0);
      this.sceneCameraPlanarBasis = null;
      this.shotCameraPlanarBasis = null;
      this.cameraAuthoringTranslationContext = null;
      this.cameraFocusTransition = null;
    }
    if (nextMode === "camera") {
      this.releaseTopViewLock();
      this.setMovePlacement(false);
    }
    this.orbit.enabled = this.isSceneEditView();
    this.refreshSceneAuthoringOverlayVisibility();
    this.grid.visible = this.project?.scene?.environment?.groundVisible !== false;
    this.syncBlockoutVisibility();
    this.rebuildPickTargets();
    this.renderer.domElement.dataset.viewportMode = nextMode;
    this.renderer.domElement.setAttribute(
      "aria-label",
      nextMode === "camera"
        ? "摄影机取景视图"
        : this.editViewMode === "shot" ? "镜头构图编辑视图" : "三维场景编辑视图"
    );
    this.refreshSceneCameraProjection();
    this.refreshShotCameraProjection();
    this.updateActorHandles();
    return true;
  }

  sceneBounds() {
    const actors = this.project?.scene?.actors || [];
    const bounds = new THREE.Box3();
    let hasBounds = false;
    const includePoint = (point, height = 0) => {
      if (![point?.x, point?.y || 0, point?.z].every(Number.isFinite)) return;
      const position = new THREE.Vector3(point.x, point.y || 0, point.z);
      bounds.expandByPoint(position);
      if (height > 0) bounds.expandByPoint(position.clone().add(new THREE.Vector3(0, height, 0)));
      hasBounds = true;
    };
    for (const actor of actors) {
      includePoint(actor.position, 1.8 * Math.max(0.1, Number(actor.scale || 1)));
      for (const action of actor.motionActions) includePoint(action.position, 1.8 * Math.max(0.1, Number(actor.scale || 1)));
    }
    if (this.environmentEntries.size && this.environmentGroup.visible) {
      this.environmentGroup.updateWorldMatrix(true, true);
      const environmentBounds = visibleContentBounds([this.environmentGroup]);
      if (!environmentBounds.isEmpty()) {
        bounds.union(environmentBounds);
        hasBounds = true;
      }
    }
    if (this.blockoutRoot.visible && this.blockoutRoot.children.length) {
      this.blockoutRoot.updateWorldMatrix(true, true);
      const blockoutBounds = visibleContentBounds([this.blockoutRoot]);
      if (!blockoutBounds.isEmpty()) {
        bounds.union(blockoutBounds);
        hasBounds = true;
      }
    }
    if (!hasBounds || bounds.isEmpty()) return { focus: new THREE.Vector3(0, 0.5, 0), radius: 3 };
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    return { focus: sphere.center, radius: Math.max(3, sphere.radius) };
  }

  // MCP view: "actor" 入口 —— 明确只聚焦演员，不跟随其他选中类型。
  focusSelectedActor() {
    if (!this.selectedActorID) return false;
    return this.focusSelection({ kind: "actor", id: this.selectedActorID, parentID: null });
  }

  // F 聚焦当前选中对象：演员、视觉环境、布景整体、布景组、布景对象。
  focusSelection(explicitSelection = null) {
    if (!this.isSceneEditView()) return false;
    const sphere = this.selectionFocusSphere(explicitSelection);
    if (!sphere) return false;
    return this.frameFocusSphere(sphere.center, sphere.radius);
  }

  selectionFocusNode(selection) {
    if (selection.kind === "actor") return this.actors.get(selection.id) || null;
    if (selection.kind === "environment") {
      const entry = this.environmentEntries.get(selection.id);
      return entry?.object && entry.group.visible ? entry.group : null;
    }
    if (selection.kind === "environmentGroup") {
      return this.environmentGroupEntries.get(selection.id) || null;
    }
    if (selection.kind === "blockoutLayer") {
      return this.blockoutRoot.children.length ? this.blockoutRoot : null;
    }
    if (selection.kind === "blockoutGroup") {
      return this.blockoutRoot.children.find((group) => (
        group.userData.blockoutGroupID === selection.id
      )) || null;
    }
    if (selection.kind === "blockoutObject") {
      const group = this.blockoutRoot.children.find((candidate) => (
        candidate.userData.blockoutGroupID === selection.parentID
      ));
      return group?.children.find((candidate) => (
        candidate.userData.blockoutObjectID === selection.id
      )) || null;
    }
    return null;
  }

  selectionFocusSphere(explicitSelection = null) {
    const selection = explicitSelection
      || this.selectedObject
      || (this.selectedActorID ? { kind: "actor", id: this.selectedActorID, parentID: null } : null);
    if (!selection) return null;
    
    const node = this.selectionFocusNode(selection);
    if (!node) return null;
    node.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(node);
    if (bounds.isEmpty()) {
      if (selection.kind !== "actor") return null;
      return {
        center: node.position.clone().add(new THREE.Vector3(0, 0.9, 0)),
        radius: 0.95,
      };
    }
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    return { center: sphere.center, radius: Math.max(0.95, sphere.radius) };
  }

  frameFocusSphere(center, radius) {
    const viewDirection = this.camera.position.clone().sub(this.orbit.target);
    if (viewDirection.lengthSq() < 1e-6) viewDirection.set(0.65, 0.52, 0.8);
    viewDirection.normalize();
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(this.camera.aspect, 0.01));
    const limitingFov = Math.max(THREE.MathUtils.degToRad(12), Math.min(verticalFov, horizontalFov));
    const distance = THREE.MathUtils.clamp((radius / Math.sin(limitingFov / 2)) * 1.16, 2.2, 90);
    const toPosition = center.clone().addScaledVector(viewDirection, distance);
    this.cameraPlanarVelocity.set(0, 0);
    this.sceneCameraPlanarBasis = null;
    this.configureEditorCameraRange(distance, radius);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.camera.position.copy(toPosition);
      this.orbit.target.copy(center);
      this.orbit.update();
      return true;
    }
    this.cameraFocusTransition = {
      startedAt: performance.now(),
      fromPosition: this.camera.position.clone(),
      toPosition,
      fromTarget: this.orbit.target.clone(),
      toTarget: center,
    };
    return true;
  }

  hasActivePlanarCameraKey() {
    return [...planarCameraKeyCodes].some((code) => this.cameraKeys.has(code));
  }

  hasActiveTranslationCameraKey() {
    return [...translationCameraKeyCodes].some((code) => this.cameraKeys.has(code));
  }

  captureCameraAuthoringTranslationContext() {
    let camera = null;
    let orderedTargets = [];
    if (this.isShotEditView()) {
      camera = this.shotCamera;
      const aim = this.cameraAimEvaluation;
      const explicitAimTarget = aim?.valid === true
        && (aim.mode === "look-at" || aim.transition != null)
        ? aim.targetPosition
        : null;
      const centerHit = explicitAimTarget ? null : this.centerSceneHitPoint(camera);
      const observationTarget = finiteThreeVector(this.shotObservationTarget)
        ? this.shotObservationTarget
        : centerHit
          ? null
          : this.resolveShotObservationTarget();
      orderedTargets = [
        explicitAimTarget,
        centerHit,
        observationTarget,
      ];
    } else if (this.isSetupViewActive()) {
      camera = this.setupCamera;
      orderedTargets = [
        this.centerSceneHitPoint(camera),
        this.setupOrbit.target,
      ];
    }
    if (!camera) {
      this.cameraAuthoringTranslationContext = null;
      return null;
    }
    this.cameraAuthoringTranslationContext = {
      distance: cameraNavigationReferenceDistance(camera.position, orderedTargets),
      verticalFovDegrees: camera.fov,
    };
    return this.cameraAuthoringTranslationContext;
  }

  activeCameraAuthoringTranslationSpeedScale() {
    const context = this.cameraAuthoringTranslationContext
      || this.captureCameraAuthoringTranslationContext();
    if (!context) return 1;
    return cameraAuthoringTranslationSpeedScale(
      context.distance,
      context.verticalFovDegrees
    );
  }

  activeCameraNavigationSpeedScale() {
    const authoring = this.isShotEditView() || this.isSetupViewActive();
    const multiplier = this.cameraNavigationSpeedMultipliers[authoring ? "camera" : "scene"];
    return multiplier * (this.cameraPrecisionKeys.size > 0 ? 0.2 : 1)
      * (authoring ? this.activeCameraAuthoringTranslationSpeedScale() : 1);
  }

  capturePlanarCameraBasis(camera, preferredForward = null) {
    const opticalForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const basis = planarNavigationBasis(preferredForward || opticalForward, localUp);
    return {
      forward: new THREE.Vector3(
        basis.forward.x,
        basis.forward.y,
        basis.forward.z
      ),
      right: new THREE.Vector3(
        basis.right.x,
        basis.right.y,
        basis.right.z
      ),
    };
  }

  // 机位视角和自由视角共用方向、阻尼与输入；机位视角额外按构图深度缩放平移速度。
  activeSceneNavigation() {
    return sceneNavigationForView(
      this.isSetupViewActive(),
      { camera: this.camera, orbit: this.orbit },
      { camera: this.setupCamera, orbit: this.setupOrbit }
    );
  }

  setActiveSceneOrbitEnabled(enabled) {
    this.activeSceneNavigation().orbit.enabled = enabled === true && this.isSceneEditView();
  }

  captureScenePlanarBasis() {
    const { camera, orbit } = this.activeSceneNavigation();
    const towardTarget = orbit.target.clone().sub(camera.position);
    return this.capturePlanarCameraBasis(camera, towardTarget);
  }

  updateKeyboardCamera(delta) {
    if (delta <= 0) return;
    const { camera, orbit } = this.activeSceneNavigation();
    if (!orbit.enabled) {
      this.cameraPlanarVelocity.set(0, 0);
      this.sceneCameraPlanarBasis = null;
      this.cameraAuthoringTranslationContext = null;
      return;
    }

    const forwardInput = Number(this.cameraKeys.has("KeyW")) - Number(this.cameraKeys.has("KeyS"));
    const rightInput = Number(this.cameraKeys.has("KeyD")) - Number(this.cameraKeys.has("KeyA"));
    const verticalInput = Number(this.cameraKeys.has("KeyQ")) - Number(this.cameraKeys.has("KeyE"));
    // 顶视锁定期间保留平移与升降，但摇摄/俯仰会破坏正交俯视，必须跳过。
    const rotationLocked = sceneCameraRotationLocked(
      this.topViewLocked,
      this.isSetupViewActive()
    );
    const pitchInput = rotationLocked
      ? 0
      : Number(this.cameraKeys.has("ArrowUp")) - Number(this.cameraKeys.has("ArrowDown"));
    const yawInput = rotationLocked
      ? 0
      : Number(this.cameraKeys.has("ArrowLeft")) - Number(this.cameraKeys.has("ArrowRight"));
    // 翻滚只在机位视角下有意义，而且它不走欧拉分解，直接改光学滚转角。
    const rollInput = this.isSetupViewActive()
      ? Number(this.cameraKeys.has("BracketLeft")) - Number(this.cameraKeys.has("BracketRight"))
      : 0;
    if (rollInput !== 0) {
      // shotCameraRollSpeed 是弧度/秒（Shot 相机直接拿去转四元数），这里存的是度，
      // 换算之后两边的手感才一样：48 度/秒。
      const step = rollInput * THREE.MathUtils.radToDeg(shotCameraRollSpeed) * delta;
      const next = (this.setupRollDegrees + step + 180) % 360;
      this.setupRollDegrees = (next < 0 ? next + 360 : next) - 180;
    }
    const targetPlanarVelocity = new THREE.Vector2(rightInput, forwardInput);
    if (targetPlanarVelocity.lengthSq() > 1) targetPlanarVelocity.normalize();
    const hasTranslationInput = targetPlanarVelocity.lengthSq() > 0 || verticalInput !== 0;
    const hasPlanarMotion = targetPlanarVelocity.lengthSq() > 0
      || this.cameraPlanarVelocity.lengthSq() > 0;
    const translationSpeedScale = hasTranslationInput || hasPlanarMotion
      ? this.activeCameraNavigationSpeedScale()
      : 1;
    targetPlanarVelocity.multiplyScalar(editorCameraPlanarMaxSpeed * translationSpeedScale);
    const velocityResponse = targetPlanarVelocity.lengthSq() > 0
      ? editorCameraAcceleration
      : editorCameraDeceleration;
    const velocityAlpha = 1 - Math.exp(-velocityResponse * delta);
    this.cameraPlanarVelocity.lerp(targetPlanarVelocity, velocityAlpha);
    if (targetPlanarVelocity.lengthSq() === 0 && this.cameraPlanarVelocity.lengthSq() < 0.0001) {
      this.cameraPlanarVelocity.set(0, 0);
      this.sceneCameraPlanarBasis = null;
      if (!this.hasActiveTranslationCameraKey()) {
        this.cameraAuthoringTranslationContext = null;
      }
    }
    if (
      this.cameraKeys.size === 0
      && this.cameraPlanarVelocity.lengthSq() === 0
    ) return;

    if (!this.sceneCameraPlanarBasis && this.cameraPlanarVelocity.lengthSq() > 0) {
      this.sceneCameraPlanarBasis = this.captureScenePlanarBasis();
    }
    const basis = this.sceneCameraPlanarBasis || this.captureScenePlanarBasis();
    const translation = basis.forward.clone().multiplyScalar(this.cameraPlanarVelocity.y * delta)
      .add(basis.right.clone().multiplyScalar(this.cameraPlanarVelocity.x * delta));
    translation.y += verticalInput * editorCameraVerticalSpeed * translationSpeedScale * delta;
    camera.position.add(translation);
    orbit.target.add(translation);

    if (pitchInput !== 0 || yawInput !== 0) {
      const focusDistance = Math.max(0.01, camera.position.distanceTo(orbit.target));
      const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      rotation.y += yawInput * shotCameraLookSpeed * delta;
      rotation.x = THREE.MathUtils.clamp(
        rotation.x + pitchInput * shotCameraLookSpeed * delta,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01
      );
      camera.quaternion.setFromEuler(rotation);
      const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      orbit.target.copy(camera.position).addScaledVector(lookDirection, focusDistance);
      orbit.update();
    }
  }

  updateShotKeyboardCamera(delta) {
    if (delta <= 0 || !this.isShotEditView()) return;
    if (!this.shotCameraEditable) {
      this.cameraPlanarVelocity.set(0, 0);
      this.shotCameraPlanarBasis = null;
      this.cameraAuthoringTranslationContext = null;
      return;
    }
    if (this.cameraKeys.size === 0 && this.cameraPlanarVelocity.lengthSq() === 0) return;
    const forwardInput = Number(this.cameraKeys.has("KeyW")) - Number(this.cameraKeys.has("KeyS"));
    const rightInput = Number(this.cameraKeys.has("KeyD")) - Number(this.cameraKeys.has("KeyA"));
    const verticalInput = Number(this.cameraKeys.has("KeyQ")) - Number(this.cameraKeys.has("KeyE"));
    const pitchInput = Number(this.cameraKeys.has("ArrowUp")) - Number(this.cameraKeys.has("ArrowDown"));
    const yawInput = Number(this.cameraKeys.has("ArrowLeft")) - Number(this.cameraKeys.has("ArrowRight"));
    const rollInput = Number(this.cameraKeys.has("BracketLeft")) - Number(this.cameraKeys.has("BracketRight"));
    let changed = false;
    const targetPlanarVelocity = new THREE.Vector2(rightInput, forwardInput);
    if (targetPlanarVelocity.lengthSq() > 1) targetPlanarVelocity.normalize();
    const hasTranslationInput = targetPlanarVelocity.lengthSq() > 0 || verticalInput !== 0;
    const hasPlanarMotion = targetPlanarVelocity.lengthSq() > 0
      || this.cameraPlanarVelocity.lengthSq() > 0;
    const translationSpeedScale = hasTranslationInput || hasPlanarMotion
      ? this.activeCameraNavigationSpeedScale()
      : 1;
    targetPlanarVelocity.multiplyScalar(editorCameraPlanarMaxSpeed * translationSpeedScale);
    const velocityResponse = targetPlanarVelocity.lengthSq() > 0
      ? editorCameraAcceleration
      : editorCameraDeceleration;
    const velocityAlpha = 1 - Math.exp(-velocityResponse * delta);
    this.cameraPlanarVelocity.lerp(targetPlanarVelocity, velocityAlpha);
    if (targetPlanarVelocity.lengthSq() === 0 && this.cameraPlanarVelocity.lengthSq() < 0.0001) {
      this.cameraPlanarVelocity.set(0, 0);
      this.shotCameraPlanarBasis = null;
      if (!this.hasActiveTranslationCameraKey()) {
        this.cameraAuthoringTranslationContext = null;
      }
    }
    if (hasPlanarMotion || verticalInput !== 0) {
      if (!this.shotCameraPlanarBasis && this.cameraPlanarVelocity.lengthSq() > 0) {
        this.shotCameraPlanarBasis = this.capturePlanarCameraBasis(this.shotCamera);
      }
      const basis = this.shotCameraPlanarBasis || this.capturePlanarCameraBasis(this.shotCamera);
      const translation = basis.forward.clone()
        .multiplyScalar(this.cameraPlanarVelocity.y * delta)
        .add(basis.right.clone().multiplyScalar(this.cameraPlanarVelocity.x * delta));
      translation.y += verticalInput * editorCameraVerticalSpeed * translationSpeedScale * delta;
      // Left-drag orbits around a snapshot of the observation target. Keep that live pivot in the
      // same translated rig as the camera and canonical observation target; otherwise the next
      // one-pixel pointer move would re-aim the camera at the stale pre-WASD pivot.
      translateCameraNavigationTargets(translation, [
        this.shotCamera.position,
        this.shotObservationTarget,
        this.shotCameraDragging?.target,
      ]);
      changed = true;
    }
    if (!this.cameraAimRotationLocked && (pitchInput !== 0 || yawInput !== 0)) {
      this.rotateShotCamera(
        yawInput * shotCameraLookSpeed * delta,
        pitchInput * shotCameraLookSpeed * delta
      );
      const targetDistance = Math.max(
        shotCameraOrbitMinDistance,
        this.shotCamera.position.distanceTo(this.resolveShotObservationTarget())
      );
      const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.shotCamera.quaternion);
      this.shotObservationTarget = this.shotCamera.position.clone()
        .addScaledVector(lookDirection, targetDistance);
      changed = true;
    }
    if (rollInput !== 0) {
      this.rollShotCamera(rollInput * shotCameraRollSpeed * delta);
      changed = true;
    }
    if (changed) this.notifyShotCameraPoseChange();
  }

  updateCameraFocusTransition(now) {
    const transition = this.cameraFocusTransition;
    if (!transition) return;
    const progress = THREE.MathUtils.clamp(
      (now - transition.startedAt) / (editorCameraFocusDuration * 1000),
      0,
      1
    );
    const eased = progress * progress * (3 - 2 * progress);
    this.camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
    this.orbit.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
    if (progress >= 1) this.cameraFocusTransition = null;
  }

  pickActor(event) {
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    return this.raycaster.intersectObjects(this.pickTargets, false)[0]?.object || null;
  }

  pickSceneObject(event) {
    if (!this.isSceneEditView() || !this.sceneObjectPickTargets.length) return null;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    return this.raycaster.intersectObjects(this.sceneObjectPickTargets, false)[0]?.object || null;
  }

  pickSceneEntity(event) {
    if (!this.isSceneEditView()) return null;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    return this.raycaster.intersectObjects(
      [...this.pickTargets, ...this.sceneObjectPickTargets],
      false
    )[0]?.object || null;
  }

  pickPathPoint(event) {
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    return this.raycaster.intersectObjects(this.pathPointTargets, false)[0]?.object || null;
  }

  pickCameraKeyframe(event) {
    if (!this.isSceneEditView() || !this.cameraGuideState?.visible || !this.cameraGuideState?.selectable || !this.cameraKeyframeTargets.length) return null;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    const interactiveTargets = this.cameraKeyframeTargets.filter((target) => (
      target.parent?.userData.proximityInteractive !== false
    ));
    return this.raycaster.intersectObjects(interactiveTargets, false)[0]?.object || null;
  }

  pickCameraAimTarget(event) {
    if (
      !this.isSceneEditView()
      || !this.cameraAimTargetTargets.length
    ) return null;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    return this.raycaster.intersectObjects(this.cameraAimTargetTargets, false)[0]?.object || null;
  }

  pickRotationHandle(event) {
    if (!this.actorTransformHandle.visible || !this.actorTransformHandle.userData.rotationHitTarget) return null;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    return this.raycaster.intersectObject(this.actorTransformHandle.userData.rotationHitTarget, false)[0] || null;
  }

  pickMoveHandle(event) {
    if (!this.actorTransformHandle.visible || !this.actorTransformHandle.userData.moveHitTarget) return null;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    return this.raycaster.intersectObject(this.actorTransformHandle.userData.moveHitTarget, false)[0] || null;
  }

  pickMoveTarget(event) {
    const actor = this.actors.get(this.selectedActorID);
    return this.pickHorizontalPlane(event, actor.userData.pathPosition.y);
  }

  pickHorizontalPlane(event, y) {
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Number(y || 0));
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  pickPlane(event, plane) {
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.activeSceneNavigation().camera);
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  resize() {
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.setupCamera.aspect = rect.width / rect.height;
    this.refreshSceneCameraProjection();
    this.refreshSetupCameraProjection();
    this.refreshShotCameraProjection();
  }

  animate() {
    this.animationFrame = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    if (this.diagnostics) {
      this.frameTimes.push(now); if (this.frameTimes.length > 121) this.frameTimes.shift();
      const elapsed = now - this.frameTimes[0];
      if (elapsed > 0) this.renderer.domElement.dataset.renderFps = ((this.frameTimes.length - 1) * 1000 / elapsed).toFixed(1);
      if (performance.memory) this.renderer.domElement.dataset.jsHeapBytes = String(performance.memory.usedJSHeapSize);
    }
    const delta = Math.min(Math.max((now - this.lastFrameAt) / 1000, 0), 0.1);
    this.lastFrameAt = now;
    const hasActiveFade = Array.from(this.actors.values()).some((group) => (
      group.userData.previousAction
      && group.userData.mixer?.time < group.userData.fadeEndsAt
    ));
    const hasPersistentCompletedLoop = this.playbackStatus === "completed"
      && Array.from(this.actors.values()).some((group) => group.userData.continuesAfterCompletion);
    
    for (const group of this.actors.values()) {
      if (!group.userData.previousAction || group.userData.mixer.time < group.userData.fadeEndsAt) continue;
      
    }
    if (this.isSceneEditView()) {
      // 机位视角走同一条路，只是 activeSceneNavigation() 换了相机和 orbit；
      // WASD / Q E 在机位视角按构图深度缩放，方向键与阻尼仍共用。F 只作用于自由相机。
      if (!this.isSetupViewActive()) this.updateCameraFocusTransition(now);
      this.updateKeyboardCamera(delta);
      this.activeSceneNavigation().orbit.update();
      if (this.isSetupViewActive()) {
        // 顺序不能反：orbit 刚把地平线抹平，先补回翻滚，再通知外面来读。
        // 反过来的话，外面读到的是没有翻滚的姿势，检查器里的翻滚就被写成 0。
        this.applySetupRoll();
        if (this.setupCameraDirty || this.cameraKeys.size > 0) {
          this.setupCameraDirty = false;
          this.onSceneCameraMoved();
        }
      }
    } else if (this.isShotEditView()) {
      this.updateShotKeyboardCamera(delta);
    }
    this.updateCameraRigGuideFade(delta);
    this.updateCameraKeyframeGuideFade(delta);
    this.updateActorTransformHandle();
    const activeCamera = this.viewportMode === "camera" || this.editViewMode === "shot"
      ? this.shotCamera
      : this.isSetupViewActive() ? this.setupCamera : this.camera;
    if (activeCamera === this.shotCamera) {
      this.renderShotScene(this.renderer, this.depthOfFieldRenderer);
    } else if (activeCamera === this.setupCamera) {
      this.renderCameraScene(
        this.renderer,
        this.depthOfFieldRenderer,
        this.setupCamera,
        this.setupFrameAspectRatio
      );
    } else {
      this.updateCameraClipping(activeCamera);
      this.renderer.render(this.scene, activeCamera);
    }
    this.renderFocusPlaneOverlay(activeCamera);
  }
}

function shouldIgnoreCameraKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('dialog, [role="dialog"], [role="menu"], [role="listbox"]')) return true;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable) return true;
  // 普通按钮保留方向键导航，但不阻断 WASD / Q / E 镜头平移。
  return target.tagName === "BUTTON" && !translationCameraKeyCodes.has(event.code);
}

function createCameraTrackPath(poses) {
  const group = new THREE.Group();
  group.name = "CameraTrackPath";
  const points = poses.map((pose) => new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: 0.58,
      depthTest: false,
      depthWrite: false,
    })
  );
  line.renderOrder = 24;
  group.add(line);

  const from = points.at(-2);
  const to = points.at(-1);
  const direction = to.clone().sub(from);
  if (direction.lengthSq() > 0.01) {
    direction.normalize();
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.11, 8),
      new THREE.MeshBasicMaterial({
        color: cameraGuideColor,
        transparent: true,
        opacity: 0.78,
        depthTest: false,
        depthWrite: false,
      })
    );
    arrow.position.lerpVectors(from, to, 0.72);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    arrow.renderOrder = 25;
    group.add(arrow);
  }
  return group;
}

function createCameraAimTargetGuide(keyframeID, editable) {
  const group = new THREE.Group();
  group.name = "CameraAimWorldTarget";
  const orbit = keyframeID === "camera-orbit-center";
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: orbit ? cameraGuideColor : cameraAimTargetColor,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  });
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), markerMaterial);
  marker.renderOrder = 29;
  group.add(marker);

  for (const rotation of [[Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.008, 6, 32),
      markerMaterial.clone()
    );
    ring.rotation.set(...rotation);
    ring.renderOrder = 28;
    group.add(ring);
  }

  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 10, 8),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })
  );
  hitTarget.name = "CameraAimWorldTargetHit";
  hitTarget.userData.cameraAimKeyframeID = keyframeID;
  hitTarget.visible = editable;
  group.add(hitTarget);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(20, 22, 26, 0.94)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = orbit ? "#d4a75f" : "#72d2cb";
  context.font = "600 36px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(orbit ? "环绕中心" : "锁定目标", 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  label.position.y = orbit ? -0.25 : 0.25;
  label.scale.set(0.5, 0.125, 1);
  label.renderOrder = 30;
  label.userData.cameraAimKeyframeID = keyframeID;
  group.add(label);
  group.userData.hitTargets = [hitTarget, label];
  return group;
}

function createCameraIntermediateGuide(pose, options = {}) {
  const group = new THREE.Group();
  group.name = "CameraIntermediateKeyframe";
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  const selected = options.selected === true;
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(selected ? 0.072 : 0.055, 0),
    new THREE.MeshBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: selected ? 1 : 0.72,
      depthTest: false,
      depthWrite: false,
    })
  );
  marker.renderOrder = 26;
  group.add(marker);
  if (selected) group.add(createCameraKeyframeSelectionRing());
  group.userData.hitTarget = createCameraKeyframeHitTarget(pose.id);
  group.add(group.userData.hitTarget);
  return group;
}

function createCameraEndpointGuide(label, pose, options = {}) {
  const group = new THREE.Group();
  group.name = `CameraEndpoint-${label}`;
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  const selected = options.selected === true;

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(selected ? 0.055 : 0.04, 12, 8),
    new THREE.MeshBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: selected ? 1 : 0.78,
      depthTest: false,
      depthWrite: false,
    })
  );
  marker.renderOrder = 26;
  group.add(marker);
  if (selected) group.add(createCameraKeyframeSelectionRing());
  if (options.keyframeID) {
    group.userData.hitTarget = createCameraKeyframeHitTarget(options.keyframeID);
    group.add(group.userData.hitTarget);
  }

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.beginPath();
  context.arc(64, 64, 38, 0, Math.PI * 2);
  context.fillStyle = "rgba(20, 22, 26, 0.94)";
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = "#d4a75f";
  context.stroke();
  context.fillStyle = "#f4e4c6";
  context.font = "700 48px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 64, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  sprite.position.y = 0.25;
  sprite.scale.set(0.18, 0.18, 1);
  sprite.renderOrder = 28;
  group.add(sprite);
  return group;
}

function createCameraKeyframeHitTarget(keyframeID) {
  const target = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })
  );
  target.name = "CameraKeyframeHitTarget";
  target.userData.cameraKeyframeID = keyframeID;
  target.renderOrder = 29;
  return target;
}

function createCameraKeyframeSelectionRing() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.012, 8, 28),
    new THREE.MeshBasicMaterial({
      color: 0xf4e4c6,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 27;
  return ring;
}

function createCameraRigGuide() {
  const group = new THREE.Group();
  group.name = "AuthoredCameraRig";

  const bodyGeometry = new THREE.BoxGeometry(0.19, 0.12, 0.17);
  const body = new THREE.Mesh(
    bodyGeometry,
    new THREE.MeshBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: 0.34,
      depthTest: false,
      depthWrite: false,
    })
  );
  body.position.z = 0.14;
  body.renderOrder = 25;
  group.add(body);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(bodyGeometry),
    new THREE.LineBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: 0.78,
      depthTest: false,
      depthWrite: false,
    })
  );
  outline.position.z = 0.14;
  outline.renderOrder = 26;
  group.add(outline);

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.064, 0.07, 12),
    new THREE.MeshBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: 0.62,
      depthTest: false,
      depthWrite: false,
    })
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.04;
  lens.renderOrder = 26;
  group.add(lens);

  const directionLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -0.015),
      new THREE.Vector3(0, 0, -0.46),
    ]),
    new THREE.LineBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: 0.48,
      depthTest: false,
      depthWrite: false,
    })
  );
  directionLine.renderOrder = 24;
  group.add(directionLine);
  const directionTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.03, 0.085, 8),
    new THREE.MeshBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
    })
  );
  directionTip.position.z = -0.5;
  directionTip.rotation.x = -Math.PI / 2;
  directionTip.renderOrder = 25;
  group.add(directionTip);

  const frustumGeometry = new THREE.BufferGeometry();
  frustumGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  const frustum = new THREE.LineSegments(
    frustumGeometry,
    new THREE.LineBasicMaterial({
      color: cameraGuideColor,
      transparent: true,
      opacity: 0.32,
      depthTest: false,
      depthWrite: false,
    })
  );
  frustum.name = "CameraOutputFrustum";
  frustum.renderOrder = 24;
  group.add(frustum);
  group.userData.frustum = frustum;
  group.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.userData.cameraGuideBaseOpacity = Number(material.opacity ?? 1);
    }
  });
  return group;
}

function setCameraRigGuideOpacity(group, fadeInput) {
  const fade = THREE.MathUtils.clamp(Number(fadeInput || 0), 0, 1);
  group.userData.proximityFade = fade;
  group.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const baseOpacity = Number(material.userData.cameraGuideBaseOpacity ?? material.opacity ?? 1);
      material.opacity = baseOpacity * fade;
    }
  });
}

function setCameraKeyframeGuideOpacity(group, fadeInput, interactive = true) {
  const fade = THREE.MathUtils.clamp(Number(fadeInput || 0), 0, 1);
  group.userData.proximityFade = fade;
  group.userData.proximityInteractive = interactive;
  group.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!Number.isFinite(material.userData.cameraGuideBaseOpacity)) {
        material.userData.cameraGuideBaseOpacity = Number(material.opacity ?? 1);
      }
      material.opacity = material.userData.cameraGuideBaseOpacity * fade;
    }
  });
}

function updateCameraRigGuidePose(group, pose, aspectRatio) {
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  group.quaternion.set(
    pose.quaternion.x,
    pose.quaternion.y,
    pose.quaternion.z,
    pose.quaternion.w
  ).normalize();
  updateCameraRigGuideFrustum(group, pose.focalLength, aspectRatio);
}

function updateCameraRigGuideFrustum(group, focalLengthInput, aspectRatio) {
  const frustum = group.userData.frustum;
  const attribute = frustum?.geometry?.getAttribute("position");
  if (!attribute) return;
  const focalLength = THREE.MathUtils.clamp(
    Number(focalLengthInput || 35),
    cameraFocalLengthMinimum,
    cameraFocalLengthMaximum
  );
  const gate = cameraSensorGate(aspectRatio);
  const depth = 0.72;
  const halfWidth = depth * gate.width / (2 * focalLength);
  const halfHeight = depth * gate.height / (2 * focalLength);
  const origin = [0, 0, 0];
  const corners = [
    [-halfWidth, halfHeight, -depth],
    [halfWidth, halfHeight, -depth],
    [halfWidth, -halfHeight, -depth],
    [-halfWidth, -halfHeight, -depth],
  ];
  const segments = [
    [origin, corners[0]], [origin, corners[1]], [origin, corners[2]], [origin, corners[3]],
    [corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]],
  ];
  let offset = 0;
  for (const [from, to] of segments) {
    for (const point of [from, to]) {
      attribute.array[offset++] = point[0];
      attribute.array[offset++] = point[1];
      attribute.array[offset++] = point[2];
    }
  }
  attribute.needsUpdate = true;
  frustum.geometry.computeBoundingSphere();
}

function visualEnvironmentAssetIdentity(asset){return asset?.ref || "";}

function captureVisualEnvironmentMaterialAppearance(material) {
  if (!material || material.userData.filmSpaceEnvironmentSourceAppearance) return;
  material.userData.filmSpaceEnvironmentSourceAppearance = {
    color: material.color?.clone?.() || null,
    map: material.map ?? null,
    emissive: material.emissive?.clone?.() || null,
    emissiveMap: material.emissiveMap ?? null,
    metalness: Number.isFinite(material.metalness) ? material.metalness : null,
    roughness: Number.isFinite(material.roughness) ? material.roughness : null,
    vertexColors: material.vertexColors,
    transparent: material.transparent === true,
    opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
    depthWrite: material.depthWrite !== false,
  };
}

function restoreVisualEnvironmentMaterialAppearance(material) {
  const source = material?.userData?.filmSpaceEnvironmentSourceAppearance;
  if (!material || !source) return;
  if (source.color && material.color) material.color.copy(source.color);
  if ("map" in material) material.map = source.map;
  if (source.emissive && material.emissive) material.emissive.copy(source.emissive);
  if ("emissiveMap" in material) material.emissiveMap = source.emissiveMap;
  if (source.metalness !== null) material.metalness = source.metalness;
  if (source.roughness !== null) material.roughness = source.roughness;
  if (source.vertexColors !== undefined) material.vertexColors = source.vertexColors;
  material.transparent = source.transparent;
  material.opacity = source.opacity;
  material.depthWrite = source.depthWrite;
  material.needsUpdate = true;
}

function applyVisualEnvironmentMaterialAppearance(material, appearance) {
  captureVisualEnvironmentMaterialAppearance(material);
  restoreVisualEnvironmentMaterialAppearance(material);
  const source = material.userData.filmSpaceEnvironmentSourceAppearance;
  if (appearance.bodyColor) {
    if (material.color) material.color.set(appearance.bodyColor);
    if ("map" in material) material.map = null;
    if (material.emissive) material.emissive.set(0x000000);
    if ("emissiveMap" in material) material.emissiveMap = null;
    if (source.metalness !== null) material.metalness = 0;
    if (source.roughness !== null) material.roughness = 0.55;
    if (source.vertexColors !== undefined) material.vertexColors = false;
  }
  if (appearance.bodyColor) {
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
  }
  if (appearance.opacity < 0.9999) {
    material.transparent = true;
    material.opacity = source.opacity * appearance.opacity;
    material.depthWrite = false;
  }
  material.needsUpdate = true;
}

function applyVisualEnvironmentGrayMaterial(object, opacity) {
  if (!Object.hasOwn(object.userData, "filmSpaceEnvironmentSourceMaterial")) {
    object.userData.filmSpaceEnvironmentSourceMaterial = object.material;
  }
  const sourceValue = object.userData.filmSpaceEnvironmentSourceMaterial;
  const sourceMaterials = Array.isArray(sourceValue) ? sourceValue : [sourceValue];
  sourceMaterials.filter(Boolean).forEach(captureVisualEnvironmentMaterialAppearance);
  let grayMaterials = object.userData.filmSpaceEnvironmentGrayMaterials;
  if (!Array.isArray(grayMaterials) || grayMaterials.length !== sourceMaterials.length) {
    grayMaterials?.forEach?.((material) => material?.dispose?.());
    grayMaterials = sourceMaterials.map((source) => new THREE.MeshStandardMaterial({
      name: `FilmSpaceEnvironmentGray:${source?.name || "Material"}`,
      color: 0x92979e,
      roughness: 0.78,
      metalness: 0.02,
      side: source?.side ?? THREE.FrontSide,
      depthTest: source?.depthTest !== false,
      normalMap: source?.normalMap ?? null,
      normalScale: source?.normalScale?.clone?.() || new THREE.Vector2(1, 1),
      bumpMap: source?.bumpMap ?? null,
      bumpScale: Number.isFinite(source?.bumpScale) ? source.bumpScale : 1,
    }));
    object.userData.filmSpaceEnvironmentGrayMaterials = grayMaterials;
  }
  for (let index = 0; index < grayMaterials.length; index += 1) {
    const source = sourceMaterials[index];
    const material = grayMaterials[index];
    const sourceOpacity = Number.isFinite(source?.opacity) ? source.opacity : 1;
    material.transparent = source?.transparent === true || opacity < 0.9999;
    material.opacity = sourceOpacity * opacity;
    material.depthWrite = source?.depthWrite !== false && opacity >= 0.9999;
    material.needsUpdate = true;
  }
  object.material = Array.isArray(sourceValue) ? grayMaterials : grayMaterials[0];
}

function restoreVisualEnvironmentMeshMaterial(object, disposeGray = false) {
  if (!Object.hasOwn(object.userData, "filmSpaceEnvironmentSourceMaterial")) return;
  object.material = object.userData.filmSpaceEnvironmentSourceMaterial;
  if (!disposeGray) return;
  object.userData.filmSpaceEnvironmentGrayMaterials?.forEach?.((material) => material?.dispose?.());
  delete object.userData.filmSpaceEnvironmentGrayMaterials;
  delete object.userData.filmSpaceEnvironmentSourceMaterial;
}

function restoreVisualEnvironmentMaterialAppearances(root) {
  const materials = new Set();
  root?.traverse?.((object) => {
    restoreVisualEnvironmentMeshMaterial(object, true);
    if (!object.material) return;
    const values = Array.isArray(object.material) ? object.material : [object.material];
    values.filter(Boolean).forEach((material) => materials.add(material));
  });
  materials.forEach(restoreVisualEnvironmentMaterialAppearance);
}

function disposeObjectChildren(root) {
  for (const child of [...root.children]) {
    root.remove(child);
    disposeObjectTree(child);
  }
}

function disposeObject(root) {
  root.traverse?.((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material?.map?.dispose?.();
      material?.dispose?.();
    }
  });
}

function disposeObjectTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((object) => {
    
    if (object.geometry) geometries.add(object.geometry);
    const values = Array.isArray(object.material) ? object.material : [object.material];
    values.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach(disposeMaterialTree);
}

function disposeMaterialTree(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose?.();
  }
  material.dispose?.();
}

function guideColorForActor(actor, backgroundMix = 0) {
  return new THREE.Color(actorColor(actor)).lerp(guideBackgroundColor, THREE.MathUtils.clamp(backgroundMix, 0, 1));
}

function finiteVector(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function createFocusGroundLine() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const line = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x8bddff,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    })
  );
  line.name = "CameraFocusGroundIntersection";
  line.frustumCulled = false;
  return line;
}

function updateFocusGroundLine(line, intersection, halfLength) {
  const direction = new THREE.Vector3(
    intersection.direction.x,
    0,
    intersection.direction.z
  );
  const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(0.014);
  const center = new THREE.Vector3(
    intersection.point.x,
    sceneGroundGridRenderOffset + 0.004,
    intersection.point.z
  );
  const start = center.clone().addScaledVector(direction, -halfLength);
  const end = center.clone().addScaledVector(direction, halfLength);
  const positions = line.geometry.attributes.position;
  const points = [
    start.clone().add(perpendicular),
    start.clone().sub(perpendicular),
    end.clone().sub(perpendicular),
    end.clone().add(perpendicular),
  ];
  points.forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z));
  positions.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

function ancestorNamed(object, prefix) {
  for (let current = object; current; current = current.parent) {
    if (String(current.name || "").startsWith(prefix)) return current;
  }
  return null;
}

function vectorFromThree(value) {
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function focusBodyPartLabel(actorHeight) {
  if (actorHeight >= 0.86) return "头部";
  if (actorHeight >= 0.58) return "胸部";
  if (actorHeight >= 0.32) return "腰部";
  return "下肢";
}

function finiteThreeVector(value) {
  return value?.isVector3 === true
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

function validCameraTrackPose(pose) {
  return Boolean(
    pose
    && finiteVector(pose.position)
    && pose.quaternion
    && Number.isFinite(pose.quaternion.x)
    && Number.isFinite(pose.quaternion.y)
    && Number.isFinite(pose.quaternion.z)
    && Number.isFinite(pose.quaternion.w)
    && Number.isFinite(pose.focalLength)
  );
}

function sameCameraPose(left, right) {
  if (!validCameraTrackPose(left) || !validCameraTrackPose(right)) return false;
  const quaternionDot = Math.abs(
    left.quaternion.x * right.quaternion.x
    + left.quaternion.y * right.quaternion.y
    + left.quaternion.z * right.quaternion.z
    + left.quaternion.w * right.quaternion.w
  );
  return Math.abs(left.position.x - right.position.x) < 0.000001
    && Math.abs(left.position.y - right.position.y) < 0.000001
    && Math.abs(left.position.z - right.position.z) < 0.000001
    && Math.abs(1 - quaternionDot) < 0.000001
    && Math.abs(left.focalLength - right.focalLength) < 0.000001
    && Math.abs((left.focusDistance || 5) - (right.focusDistance || 5)) < 0.000001
    && Math.abs((left.aperture || 2.8) - (right.aperture || 2.8)) < 0.000001;
}

function cameraPoseFromThreeCamera(camera, focalLengthInput) {
  camera.updateMatrixWorld(true);
  return {
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    quaternion: {
      x: camera.quaternion.x,
      y: camera.quaternion.y,
      z: camera.quaternion.z,
      w: camera.quaternion.w,
    },
    focalLength: THREE.MathUtils.clamp(
      Number(focalLengthInput || 35),
      cameraFocalLengthMinimum,
      cameraFocalLengthMaximum
    ),
    focusDistance: THREE.MathUtils.clamp(
      Number(camera.userData.focusDistance || 5),
      0.1,
      1000
    ),
    aperture: THREE.MathUtils.clamp(
      Number(camera.userData.aperture || 2.8),
      1.4,
      16
    ),
  };
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function objectWorldVisible(object) {
  for (let current = object; current; current = current.parent) {
    if (current.visible === false) return false;
  }
  return true;
}

function cloneCameraTrackPose(pose) {
  return {
    position: { ...pose.position },
    quaternion: { ...pose.quaternion },
    focalLength: Number(pose.focalLength),
    focusDistance: THREE.MathUtils.clamp(Number(pose.focusDistance || 5), 0.1, 1000),
    aperture: THREE.MathUtils.clamp(Number(pose.aperture || 2.8), 1.4, 16),
    ...(Object.hasOwn(pose, "depthOfFieldEnabled")
      ? { depthOfFieldEnabled: pose.depthOfFieldEnabled === true }
      : {}),
    ...(pose.focusTrackingEvaluation
      ? { focusTrackingEvaluation: structuredClone(pose.focusTrackingEvaluation) }
      : {}),
  };
}

function normalizeAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}
