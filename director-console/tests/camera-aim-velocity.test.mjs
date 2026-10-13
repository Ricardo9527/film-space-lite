import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraOpticalRollDegrees, cameraQuaternionFromRotationDegrees, lookAtQuaternion,
  sampleShotCamera,
} from "../app/camera-aim.js";
import { createCameraTrack, sampleCameraTrack } from "../app/camera-track.js";

const free = { mode: "free" };
const lock = { mode: "look-at", targetKind: "world", worldPosition: { x: -2, y: 1.6, z: 0 }, trackingResponse: 0 };

function fixture(from, to) {
  const track = createCameraTrack({ interpolation: "smooth", keyframes: [0, 1, 2, 3, 4].map((time) => ({
    id: `key-${time}`, time,
    position: { x: time * 0.7, y: 1.1 + time * 0.2, z: 6 - time * 0.4 },
    quaternion: cameraQuaternionFromRotationDegrees({ pitch: 8 + time * 4, yaw: 10 + time * 12, roll: 7 }),
    focalLength: 35 + time * 2,
    aim: time === 0 || time === 1 ? from : time === 3 ? to : null,
  })) });
  const shot = { id: "shot", aspectRatio: "16:9", camera: { track } };
  const project = { scene: { shots: [shot], actors: [{
    id: "actor", position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1,
    motionActions: [{ id: "move", kind: "move", position: { x: 9, y: 0, z: 0 }, speed: 1.5, actionID: "walk" }],
  }] } };
  return { project, shot };
}

// Quaternion delta measures the full angular velocity, including direction
// and optical Roll. Checking only angle values would miss the reported hitch.
function angularVelocity(a, b, dt) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sign = dot < 0 ? -1 : 1;
  const xyz = [
    b.x * a.w - b.w * a.x - b.y * a.z + b.z * a.y,
    b.y * a.w - b.w * a.y - b.z * a.x + b.x * a.z,
    b.z * a.w - b.w * a.z - b.x * a.y + b.y * a.x,
  ].map((value) => value * sign);
  const n = Math.hypot(...xyz);
  const factor = n < 1e-12 ? 0 : 2 * Math.atan2(n, Math.abs(dot)) / n / dt * 180 / Math.PI;
  return xyz.map((value) => value * factor);
}

function velocityGap(project, shot, time, dt = 0.0001) {
  const q = (t) => sampleShotCamera(project, shot, t).quaternion;
  const before = angularVelocity(q(time - dt), q(time), dt);
  const after = angularVelocity(q(time), q(time + dt), dt);
  return Math.hypot(...before.map((value, index) => value - after[index]));
}

for (const [name, from, to] of [
  ["free to exact Lock", free, lock],
  ["exact Lock to free", lock, free],
  ["target and composition change", lock, { ...lock, worldPosition: { x: 3, y: 2, z: -1 }, composition: "left-third" }],
  ["free to damped moving Lock", free, { mode: "look-at", targetActorID: "actor", trackingResponse: 0.35 }],
  ["damped moving Lock to free", { mode: "look-at", targetActorID: "actor", trackingResponse: 0.35 }, free],
]) {
  test(`smooth aim joins angular velocity at both ends: ${name}`, () => {
    const { project, shot } = fixture(from, to);
    const saved = JSON.stringify(project);
    for (const time of [1, 3]) {
      const gap = velocityGap(project, shot, time);
      assert.ok(gap < 0.08, `${time}s angular velocity gap: ${gap} deg/s`);
    }
    for (let frame = 0; frame <= 120; frame += 1) {
      const time = frame / 30;
      const pose = sampleShotCamera(project, shot, time);
      const base = sampleCameraTrack(shot.camera.track, time);
      assert.deepEqual(pose.position, base.position);
      assert.equal(pose.focalLength, base.focalLength);
      assert.ok(Math.abs(cameraOpticalRollDegrees(pose.quaternion) - 7) < 1e-7);
    }
    const arrived = sampleShotCamera(project, shot, 3);
    const base = sampleCameraTrack(shot.camera.track, 3);
    const expected = to.mode === "free" ? base.quaternion : lookAtQuaternion(
      base.position, arrived.aimEvaluation.targetPosition, base.focalLength, shot.aspectRatio, to.composition, 7
    );
    assert.ok(Math.hypot(...angularVelocity(expected, arrived.quaternion, 1)) < 1e-5);
    assert.equal(JSON.stringify(project), saved);
  });
}

test("same-state pins do not interrupt smooth tracking, and seeks are deterministic", () => {
  const { project, shot } = fixture(lock, lock);
  assert.ok(velocityGap(project, shot, 1) < 0.01);
  assert.ok(velocityGap(project, shot, 3) < 0.01);
  const withoutPin = structuredClone(project);
  withoutPin.scene.shots[0].camera.track.keyframes[3].aim = null;
  for (const time of [0.5, 1, 2.5, 3, 3.5]) {
    assert.deepEqual(sampleShotCamera(project, shot, time).quaternion, sampleShotCamera(withoutPin, withoutPin.scene.shots[0], time).quaternion,
      "same-state pins must preserve evaluated motion");
  }
  const turning = fixture(lock, free);
  const direct = structuredClone(turning.project);
  for (let frame = 0; frame <= 120; frame += 1) sampleShotCamera(turning.project, turning.shot, frame / 30);
  for (const time of [3.1, 2.9, 1.01, 0.9, 2.7]) {
    assert.deepEqual(sampleShotCamera(turning.project, turning.shot, time), sampleShotCamera(direct, direct.scene.shots[0], time));
  }
});

test("chained smooth target turns pass through their shared key without stopping", () => {
  const { project, shot } = fixture(lock, lock);
  const keys = shot.camera.track.keyframes;
  for (const key of keys) {
    key.position = { x: 0, y: 1.6, z: 6 };
    key.aim = key.time % 2 === 0
      ? { ...lock, worldPosition: { x: (key.time - 2) * 2, y: 1.6, z: 0 } }
      : null;
  }
  const gap = velocityGap(project, shot, 2);
  assert.ok(gap < 0.08, `shared target angular velocity gap: ${gap} deg/s`);
  const q = (t) => sampleShotCamera(project, shot, t).quaternion;
  assert.ok(Math.hypot(...angularVelocity(q(2), q(2.0001), 0.0001)) > 5,
    "continuous smooth must carry angular speed through a shared target key");
});
