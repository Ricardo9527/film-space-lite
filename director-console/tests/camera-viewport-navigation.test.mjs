import assert from "node:assert/strict";
import test from "node:test";

import {
  actorTransformHandleScale,
  cameraAuthoringTranslationSpeedScale,
  cameraNavigationReferenceDistance,
  clearSceneNavigationTransientState,
  dollyWheelDeltaForPinch,
  focalLengthAfterWheel,
  focalLengthFromSliderProgress,
  focalLengthToSliderProgress,
  normalizedWheelDelta,
  orbitDistanceAfterWheel,
  planarNavigationBasis,
  sceneAuthoringModeActive,
  sceneCameraRotationLocked,
  sceneNavigationForView,
  sphericalOrbitAfterPointer,
  translateCameraNavigationTargets,
  worldUnitsPerScreenPixel,
} from "../app/camera-viewport-navigation.js";

test("wheel deltas normalize pixels, lines, and pages", () => {
  assert.equal(normalizedWheelDelta(10, 0, 900), 10);
  assert.equal(normalizedWheelDelta(2, 1, 900), 32);
  assert.equal(normalizedWheelDelta(1, 2, 900), 900);
});

test("ordinary wheel changes focal length without escaping the supported lens range", () => {
  assert.ok(focalLengthAfterWheel(35, -100) > 35);
  assert.ok(focalLengthAfterWheel(35, 100) < 35);
  assert.equal(focalLengthAfterWheel(200, -1000), 200);
  assert.equal(focalLengthAfterWheel(12, 1000), 12);
});

test("the focal slider uses logarithmic spacing across 12 to 200 millimeters", () => {
  assert.equal(focalLengthToSliderProgress(12), 0);
  assert.equal(focalLengthToSliderProgress(200), 1);
  for (const focalLength of [12, 18, 24, 35, 50, 85, 135, 200]) {
    assert.ok(Math.abs(
      focalLengthFromSliderProgress(focalLengthToSliderProgress(focalLength))
        - focalLength
    ) < 0.000001);
  }
  assert.ok(focalLengthToSliderProgress(50) > 0.5);
});

test("pinch amplifies physical dolly while preserving the distance limits", () => {
  assert.equal(dollyWheelDeltaForPinch(-12), -120);
  assert.ok(orbitDistanceAfterWheel(5, dollyWheelDeltaForPinch(-12)) < 5);
  assert.ok(orbitDistanceAfterWheel(5, dollyWheelDeltaForPinch(12)) > 5);
  assert.equal(orbitDistanceAfterWheel(0.12, -1000), 0.12);
  assert.equal(orbitDistanceAfterWheel(250, 1000), 250);
});

test("WASD uses one normalized world-horizontal basis for a complete key chord", () => {
  const basis = planarNavigationBasis({ x: 3, y: -8, z: -4 });
  assert.deepEqual(basis.forward, { x: 0.6, y: 0, z: -0.8 });
  assert.deepEqual(basis.right, { x: 0.8, y: 0, z: 0.6 });
  assert.ok(Math.abs(
    basis.forward.x * basis.right.x
      + basis.forward.z * basis.right.z
  ) < 0.000001);

  const verticalFallback = planarNavigationBasis(
    { x: 0, y: -1, z: 0 },
    { x: -2, y: 0, z: 0 }
  );
  assert.deepEqual(verticalFallback.forward, { x: -1, y: 0, z: 0 });
  assert.deepEqual(verticalFallback.right, { x: 0, y: 0, z: -1 });
});

test("setup view selects its own camera and ignores the free camera top-view lock", () => {
  const freeNavigation = { camera: { id: "free" }, orbit: { id: "free" } };
  const setupNavigation = { camera: { id: "setup" }, orbit: { id: "setup" } };

  assert.equal(
    sceneNavigationForView(false, freeNavigation, setupNavigation),
    freeNavigation
  );
  assert.equal(
    sceneNavigationForView(true, freeNavigation, setupNavigation),
    setupNavigation
  );
  assert.equal(sceneCameraRotationLocked(true, false), true);
  assert.equal(sceneCameraRotationLocked(true, true), false);
});

test("setup view reserves the viewport for camera adjustment", () => {
  assert.equal(sceneAuthoringModeActive(true, false), true);
  assert.equal(sceneAuthoringModeActive(true, true), false);
  assert.equal(sceneAuthoringModeActive(false, false), false);
});

test("switching scene cameras clears shared navigation momentum and pending input", () => {
  const state = {
    cameraKeys: new Set(["KeyW", "ArrowLeft"]),
    cameraPrecisionKeys: new Set(["ShiftLeft"]),
    cameraPlanarVelocity: {
      x: 3,
      y: -2,
      set(x, y) {
        this.x = x;
        this.y = y;
      },
    },
    sceneCameraPlanarBasis: { forward: { x: 1, y: 0, z: 0 } },
    shotCameraPlanarBasis: { forward: { x: 0, y: 0, z: -1 } },
    cameraAuthoringTranslationContext: { distance: 1, verticalFovDegrees: 44 },
    cameraFocusTransition: { startedAt: 100 },
    setupCameraDirty: true,
  };

  clearSceneNavigationTransientState(state);

  assert.equal(state.cameraKeys.size, 0);
  assert.equal(state.cameraPrecisionKeys.size, 0);
  assert.deepEqual(
    { x: state.cameraPlanarVelocity.x, y: state.cameraPlanarVelocity.y },
    { x: 0, y: 0 }
  );
  assert.equal(state.sceneCameraPlanarBasis, null);
  assert.equal(state.shotCameraPlanarBasis, null);
  assert.equal(state.cameraAuthoringTranslationContext, null);
  assert.equal(state.cameraFocusTransition, null);
  assert.equal(state.setupCameraDirty, false);
});

test("camera authoring reference depth prefers explicit composition targets", () => {
  const camera = { x: 0, y: 1, z: 0 };
  const lookAt = { x: 0, y: 1, z: -0.5 };
  const centerHit = { x: 0, y: 1, z: -2 };
  const observationCenter = { x: 0, y: 1, z: -4 };

  assert.equal(
    cameraNavigationReferenceDistance(camera, [lookAt, centerHit, observationCenter]),
    0.5
  );
  assert.equal(
    cameraNavigationReferenceDistance(camera, [null, centerHit, observationCenter]),
    2
  );
  assert.equal(cameraNavigationReferenceDistance(camera, []), 5);
});

test("camera authoring translation becomes finer for close and telephoto framing", () => {
  assert.ok(Math.abs(cameraAuthoringTranslationSpeedScale(5, 44) - 1) < 0.000001);
  assert.ok(Math.abs(cameraAuthoringTranslationSpeedScale(1, 44) - 0.2) < 0.000001);
  assert.ok(Math.abs(cameraAuthoringTranslationSpeedScale(0.25, 44) - 0.05) < 0.000001);
  assert.ok(
    cameraAuthoringTranslationSpeedScale(1, 22)
      < cameraAuthoringTranslationSpeedScale(1, 44)
  );
  assert.equal(cameraAuthoringTranslationSpeedScale(100, 90), 1);
});

test("Shift precision is a temporary multiplier after automatic scaling", () => {
  const automatic = cameraAuthoringTranslationSpeedScale(0.5, 44);
  assert.ok(Math.abs(
    cameraAuthoringTranslationSpeedScale(0.5, 44, true) - automatic * 0.2
  ) < 0.000001);
  assert.ok(Math.abs(cameraAuthoringTranslationSpeedScale(0, 44) - 0.02) < 0.000001);
});

test("WASD translates an active left-drag pivot with the camera observation rig", () => {
  const camera = { x: 1, y: 2, z: 3 };
  const observation = { x: 1, y: 2, z: -2 };
  const activeDragPivot = { x: 1, y: 2, z: -2 };
  const beforeCameraOffset = {
    x: camera.x - activeDragPivot.x,
    y: camera.y - activeDragPivot.y,
    z: camera.z - activeDragPivot.z,
  };

  assert.equal(translateCameraNavigationTargets(
    { x: 0.4, y: -0.1, z: 0.2 },
    [camera, observation, activeDragPivot, activeDragPivot, null]
  ), 3);
  assert.deepEqual(camera, { x: 1.4, y: 1.9, z: 3.2 });
  assert.deepEqual(observation, { x: 1.4, y: 1.9, z: -1.8 });
  assert.deepEqual(activeDragPivot, { x: 1.4, y: 1.9, z: -1.8 });
  assert.deepEqual({
    x: camera.x - activeDragPivot.x,
    y: camera.y - activeDragPivot.y,
    z: camera.z - activeDragPivot.z,
  }, beforeCameraOffset);
});

test("screen-space pan scale grows with distance and field of view", () => {
  const base = worldUnitsPerScreenPixel(5, 35, 800);
  assert.ok(worldUnitsPerScreenPixel(10, 35, 800) > base);
  assert.ok(worldUnitsPerScreenPixel(5, 70, 800) > base);
  assert.ok(worldUnitsPerScreenPixel(5, 35, 1600) < base);
});

test("left drag changes orbit angles while preserving pivot radius", () => {
  const start = { radius: 5, theta: 0.3, phi: 1.2 };
  const horizontal = sphericalOrbitAfterPointer(start, 100, 0);
  const vertical = sphericalOrbitAfterPointer(start, 0, 100);
  assert.equal(horizontal.radius, start.radius);
  assert.notEqual(horizontal.theta, start.theta);
  assert.equal(horizontal.phi, start.phi);
  assert.equal(vertical.radius, start.radius);
  assert.equal(vertical.theta, start.theta);
  assert.notEqual(vertical.phi, start.phi);
  assert.equal(sphericalOrbitAfterPointer(start, 0, 10000).phi, 0.025);
});

test("actor transform handle accounts for FOV while keeping a bounded world scale", () => {
  assert.equal(actorTransformHandleScale(5, 44), 1);
  assert.equal(actorTransformHandleScale(20, 44), 2.2);
  assert.equal(actorTransformHandleScale(20, 7), 1);
  assert.equal(actorTransformHandleScale(45, 90), 3);

  const distance = 18;
  const projectedSizes = [30, 44, 60].map((verticalFovDegrees) => (
    actorTransformHandleScale(distance, verticalFovDegrees)
      / Math.tan(verticalFovDegrees * Math.PI / 360)
  ));
  assert.ok(Math.abs(projectedSizes[0] - projectedSizes[1]) < 0.000001);
  assert.ok(Math.abs(projectedSizes[1] - projectedSizes[2]) < 0.000001);
});
