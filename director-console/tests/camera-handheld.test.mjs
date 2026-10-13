import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCameraHandheld,
  cameraHandheldOffset,
  normalizeCameraHandheld,
  removeCameraHandheld,
} from "../app/camera-handheld.js";
import { applyShotCameraConstraints, sampleShotCamera } from "../app/camera-aim.js";
import {
  addShot,
  createDesktopProject,
  findShot,
  setShotCameraEndpoint,
  setShotCameraHandheld,
} from "../app/project-model.js";
import { sampleCameraTrack } from "../app/camera-track.js";

const pose = Object.freeze({
  position: Object.freeze({ x: 2, y: 1.5, z: -4 }),
  quaternion: Object.freeze({ x: 0, y: Math.sin(Math.PI / 8), z: 0, w: Math.cos(Math.PI / 8) }),
  focalLength: 50,
  aimEvaluation: Object.freeze({ mode: "look-at" }),
  followEvaluation: Object.freeze({ enabled: true }),
});

function shot(intensity = "standard") {
  return { camera: { modifiers: { handheld: { intensity } } } };
}

function assertNear(actual, expected, epsilon = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);
}

function assertPoseNear(actual, expected, epsilon = 1e-10) {
  for (const axis of ["x", "y", "z"]) assertNear(actual.position[axis], expected.position[axis], epsilon);
  for (const axis of ["x", "y", "z", "w"]) assertNear(actual.quaternion[axis], expected.quaternion[axis], epsilon);
  assert.equal(actual.focalLength, expected.focalLength);
}

function rotationMagnitude(offset) {
  return Math.hypot(
    offset.rotationDegrees.pitch,
    offset.rotationDegrees.yaw,
    offset.rotationDegrees.roll
  );
}

test("handheld normalizes to four stages and migrates the earlier switch shape", () => {
  assert.deepEqual(normalizeCameraHandheld(), { intensity: "off" });
  assert.deepEqual(normalizeCameraHandheld(false), { intensity: "off" });
  assert.deepEqual(normalizeCameraHandheld(true), { intensity: "standard" });
  assert.deepEqual(normalizeCameraHandheld("subtle"), { intensity: "subtle" });
  assert.deepEqual(normalizeCameraHandheld({ enabled: false, intensity: "strong" }), {
    intensity: "off",
  });
  assert.deepEqual(normalizeCameraHandheld({ enabled: true, intensity: "strong" }), {
    intensity: "strong",
  });
  assert.deepEqual(normalizeCameraHandheld({ enabled: true, intensity: "unknown" }), {
    intensity: "standard",
  });
  assert.deepEqual(normalizeCameraHandheld({ intensity: "unknown" }), { intensity: "off" });
});

test("the off stage returns the untouched camera pose", () => {
  assert.equal(applyCameraHandheld(shot("off"), pose, 2.4), pose);
  assert.equal(removeCameraHandheld(shot("off"), pose, 2.4), pose);
  assert.deepEqual(cameraHandheldOffset(2.4, "off"), {
    position: { x: 0, y: 0, z: 0 },
    rotationDegrees: { pitch: 0, yaw: 0, roll: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  });
});

test("handheld eases in quietly from the exact authored frame and preserves non-orientation data", () => {
  const sampled = applyCameraHandheld(shot(), pose, 0);
  assertPoseNear(sampled, pose);
  assert.equal(sampled.aimEvaluation, pose.aimEvaluation);
  assert.equal(sampled.followEvaluation, pose.followEvaluation);
  const earlyStrong = cameraHandheldOffset(0.3, "strong", 35);
  assert.ok(
    rotationMagnitude(earlyStrong) < 0.7,
    `unexpected opening displacement ${rotationMagnitude(earlyStrong)}`
  );
  const active = applyCameraHandheld(shot(), pose, 0.8);
  assert.notDeepEqual(active.quaternion, pose.quaternion);
  assert.deepEqual(active.position, pose.position);
  assert.equal(active.focalLength, pose.focalLength);
});

test("multi-band Perlin motion is deterministic and continuous across nearby samples", () => {
  const first = cameraHandheldOffset(1.234, "standard", 50);
  const repeated = cameraHandheldOffset(1.234, "standard", 50);
  const nearby = cameraHandheldOffset(1.234 + 1 / 120, "standard", 50);
  assert.deepEqual(first, repeated);
  assert.ok(rotationMagnitude(first) > 0.05);
  const angularStep = Math.hypot(
    nearby.rotationDegrees.pitch - first.rotationDegrees.pitch,
    nearby.rotationDegrees.yaw - first.rotationDegrees.yaw,
    nearby.rotationDegrees.roll - first.rotationDegrees.roll
  );
  assert.ok(angularStep > 0 && angularStep < 0.1, `unexpected angular step ${angularStep}`);
});

test("the three active stages use distinct official handheld signatures", () => {
  const samples = ["subtle", "standard", "strong"].map((intensity) => (
    Array.from({ length: 240 }, (_, index) => (
      rotationMagnitude(cameraHandheldOffset(0.8 + index / 30, intensity, 35))
    ))
  ));
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const [subtleMean, standardMean, strongMean] = samples.map(mean);
  assert.ok(subtleMean < standardMean, `${subtleMean} should be below ${standardMean}`);
  assert.ok(standardMean < strongMean, `${standardMean} should be below ${strongMean}`);
  const standardHigherFrames = samples[1].filter((value, index) => value > samples[2][index]).length;
  assert.ok(
    standardHigherFrames / samples[1].length < 0.15,
    `standard exceeded strong in ${standardHigherFrames} of ${samples[1].length} samples`
  );
  for (const intensity of ["subtle", "standard", "strong"]) {
    assert.equal(cameraHandheldOffset(2.4, intensity, 35).rotationDegrees.roll, 0);
  }
});

test("focal length adapts the visible handheld angle", () => {
  const wide = cameraHandheldOffset(1.234, "standard", 18);
  const normal = cameraHandheldOffset(1.234, "standard", 35);
  const telephoto = cameraHandheldOffset(1.234, "standard", 85);
  assertNear(rotationMagnitude(wide), rotationMagnitude(normal) * 1.35);
  assertNear(rotationMagnitude(telephoto), rotationMagnitude(normal) * 0.55);
});

test("camera authoring can remove handheld without baking it into track data", () => {
  for (const intensity of ["subtle", "standard", "strong"]) {
    const sampled = applyCameraHandheld(shot(intensity), pose, 3.7);
    const restored = removeCameraHandheld(shot(intensity), sampled, 3.7);
    assertPoseNear(restored, pose, 1e-9);
  }
});

test("the shared Shot sampler applies handheld after ordinary track constraints", () => {
  let project = addShot(createDesktopProject(), { cameraPose: pose });
  let projectShot = findShot(project);
  project = setShotCameraEndpoint(project, projectShot.id, "end", pose, 4);
  project = setShotCameraHandheld(project, projectShot.id, { intensity: "standard" });
  projectShot = findShot(project);
  const elapsed = 1.234;
  const trackPose = sampleCameraTrack(projectShot.camera.track, elapsed);
  const constrained = applyShotCameraConstraints(project, projectShot, trackPose, elapsed, new Map());
  const finalPose = sampleShotCamera(project, projectShot, elapsed, new Map());
  assert.deepEqual(finalPose.position, constrained.position);
  assert.notDeepEqual(finalPose.quaternion, constrained.quaternion);
  assert.equal(finalPose.focalLength, constrained.focalLength);
  const restored = removeCameraHandheld(projectShot, finalPose, elapsed);
  assertPoseNear(restored, constrained, 1e-9);
  assert.deepEqual(restored.aimEvaluation, constrained.aimEvaluation);
});
