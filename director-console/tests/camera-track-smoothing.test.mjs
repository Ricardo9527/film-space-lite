import test from "node:test";
import assert from "node:assert/strict";
import { createCameraTrack, sampleCameraTrack, sampleCameraTrackPath } from "../app/camera-track.js";

const axes = ["x", "y", "z"];
const distance = (a, b) => Math.hypot(...axes.map((axis) => a[axis] - b[axis]));
const positions = [
  [8.333333333333334, 1.0601976704637546, 0.9459636655545618, -6.914952943726931],
  [10.566666666666666, 0.6410597475171842, 0.7195374986760845, -7.829298838319942],
  [11.866666666666667, 0.6241326957584267, 0.7195374986760845, -7.84136261476481],
  [14.933333333333334, 1.049832286836904, 0.7195374986760845, -15.904008902763087],
  [17.366666666666667, 2.179633248423896, 0.19955864329896092, -30.6500377512024],
];

function trackFor(points) {
  return createCameraTrack({ interpolation: "smooth", keyframes: points.map(([time, x, y, z], index) => ({
    id: `key-${index}`, time, position: { x, y, z },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }, focalLength: 35 + index * 10,
    aim: index === 0 ? { mode: "free" } : null,
  })) });
}

function boundaryVelocities(track, time) {
  const dt = 0.00001;
  const before = sampleCameraTrack(track, time - dt).position;
  const at = sampleCameraTrack(track, time).position;
  const after = sampleCameraTrack(track, time + dt).position;
  const incoming = Object.fromEntries(axes.map((axis) => [axis, (at[axis] - before[axis]) / dt]));
  const outgoing = Object.fromEntries(axes.map((axis) => [axis, (after[axis] - at[axis]) / dt]));
  return { incoming, outgoing };
}

test("a centimeter-scale camera leg stays compact between much longer moves", () => {
  const track = trackFor(positions);
  const saved = JSON.stringify(track);
  const a = track.keyframes[1], b = track.keyframes[2];
  const chord = distance(a.position, b.position);
  let length = 0, previous = a.position;
  for (let frame = 0; frame <= 300; frame += 1) {
    const p = sampleCameraTrack(track, a.time + (b.time - a.time) * frame / 300).position;
    length += distance(previous, p);
    assert.ok(distance(a.position, p) <= chord + 0.00001, "short move must not take a large detour");
    previous = p;
  }
  assert.ok(length < chord * 1.1, `short leg length ${length}, chord ${chord}`);
  for (const key of track.keyframes) assert.deepEqual(sampleCameraTrack(track, key.time).position, key.position);
  for (const key of [a, b]) {
    const { incoming, outgoing } = boundaryVelocities(track, key.time);
    assert.ok(distance(incoming, outgoing) < 0.0001, "velocity must join across the limited key");
    assert.ok(Math.hypot(...Object.values(outgoing)) > 0.005, "limiting must not stop this moving key");
  }
  for (const point of sampleCameraTrackPath(track, 12)) {
    assert.deepEqual(point.position, sampleCameraTrack(track, point.time).position, "guide and playback must use the same path");
  }
  assert.equal(JSON.stringify(track), saved);
});

test("coincident position keys hold still while lens animation continues", () => {
  const track = trackFor([[0, -3, 1, 0], [1, 0, 1, 0], [3, 0, 1, 0], [4, 2, 1, -8]]);
  for (let frame = 0; frame <= 60; frame += 1) {
    const pose = sampleCameraTrack(track, 1 + frame / 30);
    assert.deepEqual(pose.position, { x: 0, y: 1, z: 0 });
  }
  assert.ok(sampleCameraTrack(track, 2).focalLength > sampleCameraTrack(track, 1).focalLength);
});

test("an ordinary corner keeps its shared moving tangent", () => {
  const track = trackFor([[0, 0, 0, 0], [1, 1, 0, 0], [2, 1, 0, 1]]);
  const { incoming, outgoing } = boundaryVelocities(track, 1);
  assert.ok(distance(incoming, outgoing) < 0.0001);
  assert.ok(Math.hypot(...Object.values(incoming)) > 0.6, "a corner must not become two stop-start legs");
});

test("the limited 3D curve is independent of scene orientation and scale", () => {
  const track = trackFor(positions);
  const transform = ({ x, y, z }) => ({
    x: 7 * (x * Math.cos(0.7) - z * Math.sin(0.7)) + 9,
    y: 7 * y - 3,
    z: 7 * (x * Math.sin(0.7) + z * Math.cos(0.7)) + 5,
  });
  const rotated = structuredClone(track);
  for (const key of rotated.keyframes) key.position = transform(key.position);
  for (let step = 0; step <= 100; step += 1) {
    const time = positions[0][0] + (positions.at(-1)[0] - positions[0][0]) * step / 100;
    assert.ok(distance(sampleCameraTrack(rotated, time).position, transform(sampleCameraTrack(track, time).position)) < 1e-10);
  }
});
