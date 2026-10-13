import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as THREE from "../vendor/three/three.core.js";
import {
  cameraAuthoringTranslationSpeedScale,
  sceneCameraRotationLocked,
  translateCameraNavigationTargets,
} from "../app/camera-viewport-navigation.js";

const source = readFileSync(new URL("../app/director-renderer.js", import.meta.url), "utf8");
function method(name, next) {
  const start = source.indexOf(`  ${name}(`);
  return source.slice(start, source.indexOf(`\n  ${next}(`, start));
}
const Navigation = new Function("THREE", "cameraAuthoringTranslationSpeedScale", "sceneCameraRotationLocked", "translateCameraNavigationTargets", `
  ${source.slice(source.indexOf("const editorCameraPlanarMaxSpeed"), source.indexOf("const editorCameraFocusDuration"))}
  return class {
    ${method("activeCameraAuthoringTranslationSpeedScale", "activeCameraNavigationSpeedScale")}
    ${method("activeCameraNavigationSpeedScale", "capturePlanarCameraBasis")}
    ${method("updateKeyboardCamera", "updateShotKeyboardCamera")}
    ${method("updateShotKeyboardCamera", "updateCameraFocusTransition")}
  };
`)(THREE, cameraAuthoringTranslationSpeedScale, sceneCameraRotationLocked, translateCameraNavigationTargets);

function move({ mode = "scene", multiplier = 1, precision = false, distance = 5, fps = 60 } = {}) {
  const camera = new THREE.PerspectiveCamera();
  const orbit = { enabled: true, target: new THREE.Vector3(0, 0, -5) };
  const basis = () => ({ forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) });
  const r = Object.assign(new Navigation(), {
    cameraKeys: new Set(["KeyW", "KeyQ"]),
    cameraPrecisionKeys: new Set(precision ? ["ShiftLeft"] : []),
    cameraNavigationSpeedMultipliers: { scene: mode === "scene" ? multiplier : 1, camera: mode === "scene" ? 1 : multiplier },
    cameraPlanarVelocity: new THREE.Vector2(),
    cameraAuthoringTranslationContext: { distance, verticalFovDegrees: 44 },
    shotCamera: camera,
    shotObservationTarget: orbit.target,
    shotCameraEditable: true,
    activeSceneNavigation: () => ({ camera, orbit }),
    isSetupViewActive: () => mode === "still",
    isShotEditView: () => mode === "shot",
    captureScenePlanarBasis: basis,
    capturePlanarCameraBasis: basis,
    notifyShotCameraPoseChange() {},
  });
  for (let i = 0; i < fps; i++) {
    if (mode === "shot") r.updateShotKeyboardCamera(1 / fps);
    else r.updateKeyboardCamera(1 / fps);
  }
  return { position: camera.position, target: orbit.target };
}

test("large-scene navigation scales horizontal and vertical travel in all Edit views", () => {
  for (const mode of ["scene", "still", "shot"]) {
    const normal = move({ mode }).position;
    const fast = move({ mode, multiplier: 20 }).position;
    assert.ok(Math.abs(fast.z / normal.z - 20) < 1e-9);
    assert.ok(Math.abs(fast.y / normal.y - 20) < 1e-9);
    assert.ok(Math.abs(fast.y - 48) < 1e-9);
  }
});

test("Shift precision reduces both axes after user speed and close-framing scaling", () => {
  for (const mode of ["scene", "still", "shot"]) {
    const options = { mode, multiplier: 20, distance: 0.5 };
    const normal = move(options).position;
    const fine = move({ ...options, precision: true }).position;
    assert.ok(Math.abs(fine.z / normal.z - 0.2) < 1e-9);
    assert.ok(Math.abs(fine.y / normal.y - 0.2) < 1e-9);
    assert.ok(Math.abs(normal.y - (mode === "scene" ? 48 : 4.8)) < 1e-9);
  }
});

test("speed keeps time-based travel and camera observation offsets", () => {
  const a = move({ mode: "shot", multiplier: 20, fps: 30 });
  const b = move({ mode: "shot", multiplier: 20, fps: 60 });
  assert.ok(Math.abs(a.position.z / b.position.z - 1) < 0.02);
  assert.ok(Math.abs(a.position.y - b.position.y) < 1e-9);
  assert.ok(a.target.clone().sub(a.position).distanceTo(new THREE.Vector3(0, 0, -5)) < 1e-9);
});
