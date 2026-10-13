import test from "node:test";
import assert from "node:assert/strict";
import { createCameraTrack, sampleCameraTrack } from "../app/camera-track.js";
import { cameraOpticalRollDegrees, cameraQuaternionFromRotationDegrees, sampleShotCamera } from "../app/camera-aim.js";
import { Quaternion } from "../vendor/three/three.core.js";

const quaternion = (q) => new Quaternion(q.x, q.y, q.z, q.w);
const angle = (a, b) => {
  const delta = quaternion(b).multiply(quaternion(a).invert());
  return 2 * Math.atan2(Math.hypot(delta.x, delta.y, delta.z), Math.abs(delta.w)) * 180 / Math.PI;
};
const sample = (track, time) => sampleCameraTrack(track, time).quaternion;

function trackFor(points) {
  return createCameraTrack({ interpolation: "smooth", keyframes: points.map(([time, yaw, pitch = 0, roll = 0], i) => ({
    id: `rotation-key-${i}`, time, position: { x: i, y: 1.6, z: 5 },
    quaternion: cameraQuaternionFromRotationDegrees({ yaw, pitch, roll }),
    focalLength: 35 + i * 5, aim: i === 0 ? { mode: "free" } : null,
  })) });
}

function velocity(a, b, dt) {
  const delta = quaternion(b).multiply(quaternion(a).invert());
  const n = Math.hypot(delta.x, delta.y, delta.z);
  const scale = n < 1e-14 ? 0 : 2 * Math.atan2(n, Math.abs(delta.w)) / n / dt;
  return [delta.x, delta.y, delta.z].map((v) => v * scale * (delta.w < 0 ? -1 : 1));
}

function assertSmooth(track, time, moving) {
  const dt = 1e-6;
  const before = velocity(sample(track, time - dt), sample(track, time), dt);
  const after = velocity(sample(track, time), sample(track, time + dt), dt);
  assert.ok(Math.hypot(...before.map((v, i) => v - after[i])) < 0.0001, "angular velocity must join in all axes");
  if (moving) assert.ok(Math.hypot(...after) > 0.001, "continuous turns must not stop at each key");
  else assert.ok(Math.hypot(...before, ...after) < 0.0001, "a hold must enter and leave at rest");
}

test("equal orientations hold still before large turns, including the hall shot timing", () => {
  const track = trackFor([[0, 78.265632, 1.847793], [41 / 24, 78.265632, 1.847793],
    [56 / 24, 42.073632, 1.847793], [4, 42.073632, 1.847793], [111 / 24, -28.438368, 1.847793]]);
  const saved = JSON.stringify(track);
  const shot = { id: "shot", camera: { track }, aspectRatio: "21:9" };
  const project = { scene: { actors: [], shots: [shot] } };
  for (const [start, end] of [[0, 1], [2, 3]]) {
    const a = track.keyframes[start], b = track.keyframes[end];
    for (let step = 0; step <= 80; step++) {
      const time = a.time + (b.time - a.time) * step / 80;
      assert.ok(angle(sample(track, time), a.quaternion) < 1e-8, "the base track must preserve the held orientation");
      assert.ok(angle(sampleShotCamera(project, shot, time).quaternion, a.quaternion) < 1e-8,
        "final free-camera sampling must also preserve the hold");
    }
  }
  for (const key of track.keyframes.slice(1, -1)) assertSmooth(track, key.time, false);
  assert.ok(sampleCameraTrack(track, 3).focalLength > sampleCameraTrack(track, 56 / 24).focalLength,
    "holding orientation must not freeze the lens");
  assert.equal(JSON.stringify(track), saved);
});

test("a small rotation stays local between large turns without stopping at its keys", () => {
  const track = trackFor([[0, -60, -15, -10], [1, 10, 5, 7], [3, 10.4, 5.2, 7.1], [3.5, 120, -35, 30]]);
  const a = track.keyframes[1], b = track.keyframes[2];
  const span = angle(a.quaternion, b.quaternion);
  for (let step = 0; step <= 160; step++) {
    const q = sample(track, a.time + (b.time - a.time) * step / 160);
    assert.ok(angle(a.quaternion, q) <= span * 1.1, "neighboring large turns must not pull the small turn far away");
    assert.ok(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-10);
  }
  for (const key of [a, b]) assertSmooth(track, key.time, true);
  for (const key of track.keyframes) assert.ok(angle(sample(track, key.time), key.quaternion) < 1e-8);
});

test("held optical roll stays fixed while pitch and yaw turn, with smooth entry and exit", () => {
  const track = trackFor([[0, -40, -20, -20], [1, 0, 0, 7], [3, 50, 20, 7], [4, 90, 30, 65]]);
  const shot = { id: "shot", camera: { track }, aspectRatio: "16:9" };
  const project = { scene: { actors: [], shots: [shot] } };
  // The final camera samples optical Roll on its own common-axis quaternion track.
  const rollTrack = trackFor([[0, 0, 0, -20], [1, 0, 0, 7], [3, 0, 0, 7], [4, 0, 0, 65]]);
  for (let step = 0; step <= 80; step++) {
    const time = 1 + step / 40;
    const expected = sample(rollTrack, 1);
    assert.ok(angle(sample(rollTrack, time), expected) < 1e-8);
    const pose = sampleShotCamera(project, shot, time);
    assert.ok(Math.abs(cameraOpticalRollDegrees(pose.quaternion) - 7) < 1e-8);
  }
  assertSmooth(rollTrack, 1, false);
  assertSmooth(rollTrack, 3, false);
});

test("limited turns are invariant under quaternion sign and world rotation across the yaw seam", () => {
  const track = trackFor([[0, 130, -10, 4], [0.8, 179, 10, 12], [2.5, -179, 11, 13], [4, -80, 35, 30]]);
  const transformed = structuredClone(track);
  const world = quaternion(cameraQuaternionFromRotationDegrees({ yaw: 53, pitch: 27, roll: -19 }));
  transformed.keyframes.forEach((key, i) => {
    const q = world.clone().multiply(quaternion(key.quaternion));
    const sign = i % 2 ? -1 : 1;
    key.quaternion = { x: q.x * sign, y: q.y * sign, z: q.z * sign, w: q.w * sign };
  });
  for (let frame = 0; frame <= 120; frame++) {
    const time = frame / 30;
    assert.ok(angle(sample(transformed, time), world.clone().multiply(quaternion(sample(track, time)))) < 1e-8);
  }
  assertSmooth(track, 0.8, true);
  assertSmooth(track, 2.5, true);
});
