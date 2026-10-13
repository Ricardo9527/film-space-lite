import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCameraTrack, sampleCameraTrack } from "../app/camera-track.js";
import { sampleShotCamera } from "../app/camera-aim.js";

const axes = ["x", "y", "z"];
const length = (v) => Math.hypot(...axes.map((axis) => v[axis]));
const subtract = (a, b) => Object.fromEntries(axes.map((axis) => [axis, a[axis] - b[axis]]));
const fixtures = JSON.parse(readFileSync(new URL("../../docs/evidence/fixtures/2026-10-02-camera-auto-handle-cases.json", import.meta.url)));
const reference = JSON.parse(readFileSync(new URL("../../docs/evidence/fixtures/2026-10-02-blender-continuous-reference.json", import.meta.url)));
function trackFor(keys, interpolation = "smooth") {
  return createCameraTrack({ interpolation, keyframes: keys.map((key, index) => ({
    ...key, id: `key-${index}`,
    quaternion: { x: 0, y: 0, z: 0, w: 1 }, focalLength: 35 + index,
    focusDistance: 20 + index, aperture: 2.8,
    aim: index === 0 ? { mode: "free" } : null,
  })) });
}
function trackNamed(name) { return trackFor(fixtures.find((f) => f.name === name).keyframes); }
function acceleration(sample, time, h) {
  const p = sample(time), p1 = sample(time + h), p2 = sample(time + 2 * h);
  return Object.fromEntries(axes.map((axis) => [axis, (p2[axis] - 2 * p1[axis] + p[axis]) / (h * h)]));
}
function accelerationGap(sample, time) {
  const h = 0.0001;
  const endpointAcceleration = (step) => {
    const full = acceleration(sample, time, step), half = acceleration(sample, time, step / 2);
    return Object.fromEntries(axes.map((axis) => [axis, 2 * half[axis] - full[axis]]));
  };
  return length(subtract(endpointAcceleration(-h), endpointAcceleration(h)));
}
function speed(sample, time, h = 0.00001) {
  return length(subtract(sample(time + h), sample(time - h))) / (2 * h);
}

test("unbounded shared position tangents match real Blender Continuous Acceleration", () => {
  for (const fixture of reference.fixtures) {
    const track = trackFor(fixture.keyframes);
    for (const { time, position } of fixture.samples) {
      // Blender stores float32 coordinates and handles; the app uses float64.
      assert.ok(length(subtract(sampleCameraTrack(track, time).position, position)) < 0.0003,
        `${fixture.name} differs from real Blender at ${time}`);
    }
  }
});

test("the plaza long-to-short move joins acceleration in final camera sampling and decelerates to the end", () => {
  const track = trackNamed("plaza");
  const saved = JSON.stringify(track);
  const shot = { camera: { track, modifiers: { handheld: { intensity: "off" } } } };
  const project = { scene: { actors: [], shots: [shot] } };
  const sample = (time) => sampleShotCamera(project, shot, time).position;
  const time = track.keyframes[1].time;
  assert.ok(accelerationGap(sample, time) < 0.002);
  assert.ok(speed(sample, time) > 48 && speed(sample, time) < 49, "carry Blender's moving velocity through the key");
  let previous = speed(sample, time);
  for (let i = 1; i < 100; i += 1) {
    const current = speed(sample, time + (track.outTime - time) * i / 100);
    assert.ok(current < previous, "plaza tail must not slow down then accelerate again");
    previous = current;
  }
  for (const key of track.keyframes) assert.deepEqual(sample(key.time), key.position);
  assert.equal(JSON.stringify(track), saved, "sampling must preserve authored data");
});

test("joint acceleration is continuous across moving runs with multiple keys", () => {
  for (const name of ["declining", "equal-averages", "corner", "many-keys"]) {
    const track = trackNamed(name), sample = (time) => sampleCameraTrack(track, time).position;
    for (const key of track.keyframes.slice(1, -1)) {
      assert.ok(accelerationGap(sample, key.time) < 0.002, `${name} acceleration join at ${key.time}`);
      assert.ok(speed(sample, key.time) > 0.5, `${name} must not add a stop`);
    }
  }
});

test("all representative combinations preserve key poses and deterministic seeks", () => {
  for (const fixture of fixtures) {
    const track = trackFor(fixture.keyframes), saved = JSON.stringify(track);
    const sample = (time) => sampleCameraTrack(track, time);
    for (const key of track.keyframes) {
      const pose = sample(key.time);
      for (const property of ["position", "quaternion", "focalLength", "focusDistance", "aperture"]) {
        assert.deepEqual(pose[property], key[property], `${fixture.name}: ${property} at ${key.time}`);
      }
    }
    const snapshots = Array.from({ length: 31 }, (_, i) => {
      const time = track.keyframes[0].time + (track.outTime - track.keyframes[0].time) * i / 30;
      return { time, pose: sample(time) };
    });
    for (const { time, pose } of snapshots.reverse()) {
      assert.deepEqual(sample(time), pose, `${fixture.name}: direct seek`);
      assert.ok(Object.values(pose.position).every(Number.isFinite));
    }
    for (let frame = 0; frame <= Math.floor(track.outTime * 30); frame += 15) {
      assert.deepEqual(sample(frame / 30), sample((frame * 2) / 60), `${fixture.name}: frame rate independent`);
    }
    assert.equal(JSON.stringify(track), saved);
  }
});

test("stops and reversals approach zero velocity without moving stationary legs", () => {
  for (const name of ["hold", "reverse"]) {
    const track = trackNamed(name), sample = (time) => sampleCameraTrack(track, time).position;
    const stops = name === "hold" ? track.keyframes : [track.keyframes[0], track.keyframes[1], track.keyframes.at(-1)];
    for (const key of stops) assert.ok(speed(sample, key.time) < 0.001, `${name} stop at ${key.time}`);
    if (name === "hold") for (let i = 0; i <= 60; i += 1) assert.deepEqual(sample(1 + i / 30), track.keyframes[1].position);
  }
});

test("an edit to a later key updates earlier joint tangents without stale playback", () => {
  const track = trackNamed("declining");
  const before = sampleCameraTrack(track, 0.5).position;
  track.keyframes.at(-1).position.x -= 2;
  assert.ok(length(subtract(before, sampleCameraTrack(track, 0.5).position)) > 0.005);
});

test("non-smooth boundaries split joint solving and keep their position timing", () => {
  const track = trackNamed("declining");
  track.segments[2].interpolation = "linear";
  const before = sampleCameraTrack(track, 0.5);
  track.keyframes.at(-1).position.x -= 2;
  assert.deepEqual(sampleCameraTrack(track, 0.5), before);
  assert.equal(sampleCameraTrack(track, 2.5).position.x, 160);
  for (const interpolation of ["linear", "ease-in-out"]) {
    const two = trackFor([{ time: 0, position: { x: 0, y: 0, z: 0 } }, { time: 2, position: { x: 8, y: 4, z: -2 } }], interpolation);
    const p = 0.25, weight = interpolation === "linear" ? p : p * p * (3 - 2 * p);
    assert.deepEqual(sampleCameraTrack(two, 0.5).position, { x: 8 * weight, y: 4 * weight, z: -2 * weight });
  }
});

test("3D guards remain invariant for unequal sharp turns and every combined fixture", () => {
  const transform = ({ x, y, z }) => ({
    x: 7 * (x * Math.cos(0.7) - z * Math.sin(0.7)) + 9,
    y: 7 * y - 3,
    z: 7 * (x * Math.sin(0.7) + z * Math.cos(0.7)) + 5,
  });
  const sharpTurn = { keyframes: [
    { time: 0, position: { x: 0, y: 0, z: 0 } },
    { time: 1, position: { x: 100, y: 0, z: 0 } },
    { time: 2, position: { x: 99, y: 0, z: 1 } },
    { time: 3, position: { x: 98, y: 0, z: 2 } },
  ] };
  for (const fixture of [...fixtures, sharpTurn]) {
    const track = trackFor(fixture.keyframes), moved = structuredClone(track);
    for (const key of moved.keyframes) key.position = transform(key.position);
    for (let i = 0; i <= 30; i += 1) {
      const time = track.keyframes[0].time + (track.outTime - track.keyframes[0].time) * i / 30;
      assert.ok(length(subtract(sampleCameraTrack(moved, time).position, transform(sampleCameraTrack(track, time).position))) < 1e-9);
    }
  }
  const track = trackFor(sharpTurn.keyframes);
  assert.ok(speed((time) => sampleCameraTrack(track, time).position, 1) > 0.1, "sharp unequal turn must still move");
});

test("a zero-duration legacy leg is a boundary rather than a singular joint system", () => {
  const track = trackFor([
    { time: 0, position: { x: 0, y: 0, z: 0 } },
    { time: 1, position: { x: 1, y: 0, z: 0 } },
    { time: 1, position: { x: 2, y: 0, z: 0 } },
    { time: 2, position: { x: 3, y: 0, z: 0 } },
  ]);
  for (const time of [0.5, 1, 1.5]) assert.ok(Object.values(sampleCameraTrack(track, time).position).every(Number.isFinite));
});
