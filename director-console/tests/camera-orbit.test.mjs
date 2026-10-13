import test from "node:test";
import assert from "node:assert/strict";

import {
  cameraOpticalRollDegrees,
  sampleShotCamera,
  setCameraOpticalRollDegrees,
} from "../app/camera-aim.js";
import {
  buildCameraOrbitTrack,
  cameraOrbitEndpointSummary,
  defaultCameraOrbitOptions,
  nextCameraOrbitKeyframe,
} from "../app/camera-orbit.js";
import { createCameraTrack, sampleCameraTrack } from "../app/camera-track.js";
import { sampleProject } from "../app/playback-engine.js";
import {
  addActor,
  addMoveAction,
  addShot,
  createDesktopProject,
  findShot,
} from "../app/project-model.js";

const pose = (x, y, z, focalLength = 35) => ({
  position: { x, y, z },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  focalLength,
});

function trackWith(interpolation = "linear") {
  return createCameraTrack({
    interpolation,
    keyframes: [
      { id: "before", time: 0, ...pose(-2, 2, 0), aim: { mode: "free" }, follow: { enabled: false } },
      { id: "start", time: 1, ...pose(2, 2, 0, 40), aim: { mode: "look-at", targetKind: "world", worldPosition: { x: 0, y: 1, z: 0 } }, follow: null },
      { id: "end", time: 3, ...pose(0, 3, 4, 60), aim: null, follow: { enabled: true, targetActorID: "actor-1", referenceTime: 3 } },
      { id: "after", time: 5, ...pose(-4, 2, 0), aim: null, follow: null },
    ],
    segments: [
      { startKeyframeID: "before", endKeyframeID: "start", interpolation: "smooth" },
      { startKeyframeID: "start", endKeyframeID: "end", interpolation },
      { startKeyframeID: "end", endKeyframeID: "after", interpolation: "ease-in-out" },
    ],
    outTime: 5,
  });
}

test("orbit defaults use the current playhead without requiring a second keyframe", () => {
  const defaults = defaultCameraOrbitOptions(trackWith(), 1.5, { x: 0, y: 1, z: 0 }, 30);
  const start = sampleCameraTrack(trackWith(), 1.5);
  assert.equal(defaults.endpointMode, "new");
  assert.equal(defaults.sweepDegrees, 180);
  assert.ok(defaults.duration > 0 && defaults.duration < 1.5);
  assert.ok(Math.abs(defaults.startRadius - Math.hypot(start.position.x, start.position.z)) < 1e-9);
  assert.equal(nextCameraOrbitKeyframe(trackWith(), 1.5, 30).id, "end");
});

test("new endpoint inserts an exact start and creates a linear circular path", () => {
  const original = trackWith("ease-in-out");
  const result = buildCameraOrbitTrack(original, 1.5, { x: 0, y: 1, z: 0 }, {
    endpointMode: "new",
    direction: "clockwise",
    sweepDegrees: 90,
    duration: 1,
    endRadius: 2,
    endRelativeHeight: 1,
  }, 30);
  const startBefore = sampleCameraTrack(original, 1.5);
  const startAfter = sampleCameraTrack(result.track, 1.5);
  assert.deepEqual(startAfter.position, startBefore.position);
  assert.ok(result.createdKeyframeIDs.length > 2);
  assert.ok(result.track.segments
    .filter((segment) => {
      const start = result.track.keyframes.find((keyframe) => keyframe.id === segment.startKeyframeID);
      const end = result.track.keyframes.find((keyframe) => keyframe.id === segment.endKeyframeID);
      return start.time >= 1.5 && end.time <= 2.5;
    })
    .every((segment) => segment.interpolation === "linear"));

  const quarter = sampleCameraTrack(result.track, 1.75).position;
  const startAngle = Math.atan2(startBefore.position.z, startBefore.position.x);
  const expectedAngle = startAngle + Math.PI / 8;
  const expectedRadius = defaultsRadius(startBefore.position) * 0.75 + 2 * 0.25;
  assert.ok(Math.abs(quarter.x - expectedRadius * Math.cos(expectedAngle)) < 0.02);
  assert.ok(Math.abs(quarter.z - expectedRadius * Math.sin(expectedAngle)) < 0.02);
});

test("old ease-in-out timing is not baked into Orbit point spacing", () => {
  const result = buildCameraOrbitTrack(trackWith("ease-in-out"), 1, { x: 0, y: 1, z: 0 }, {
    endpointMode: "new",
    sweepDegrees: 180,
    duration: 1,
    endRadius: 2,
    endRelativeHeight: 1,
  }, 30);
  const atQuarter = sampleCameraTrack(result.track, 1.25).position;
  assert.ok(Math.abs(atQuarter.x - 2 * Math.cos(Math.PI / 4)) < 0.02);
  assert.ok(Math.abs(atQuarter.z - 2 * Math.sin(Math.PI / 4)) < 0.02);
});

test("Shot-03-like frame spacing keeps Linear Orbit speed uniform at both ends", () => {
  const source = createCameraTrack({
    keyframes: [
      { id: "start", time: 0, ...pose(2, 1, 0) },
      { id: "later", time: 10, ...pose(2, 1, 0) },
    ],
    segments: [{ startKeyframeID: "start", endKeyframeID: "later", interpolation: "ease-in-out" }],
    outTime: 10,
  });
  const duration = 77 / 30;
  const result = buildCameraOrbitTrack(source, 0, { x: 0, y: 0, z: 0 }, {
    endpointMode: "new",
    sweepDegrees: 180,
    duration,
    endRadius: 2,
    endRelativeHeight: 1,
  }, 30);
  const keys = result.track.keyframes.filter((keyframe) => keyframe.time <= duration + 0.000001);
  const speeds = keys.slice(1).map((keyframe, index) => {
    const previous = keys[index];
    return Math.hypot(
      keyframe.position.x - previous.position.x,
      keyframe.position.y - previous.position.y,
      keyframe.position.z - previous.position.z
    ) / (keyframe.time - previous.time);
  });
  assert.ok(Math.max(...speeds) / Math.min(...speeds) < 1.002);
  assert.ok(Math.abs(speeds[0] - speeds.at(-1)) < 0.000001);
});

// 高差的零点是起始机位，不是环绕中心（环绕轴竖直，中心高度不参与）。
// 起始机位 y=3、升降填 4 → 终点 7、中点 5。中心给的 y:1 不再影响结果。
test("new endpoint linearly changes center distance and rise from the start pose", () => {
  const result = buildCameraOrbitTrack(trackWith(), 3, { x: 0, y: 1, z: 0 }, {
    endpointMode: "new",
    direction: "counter-clockwise",
    sweepDegrees: 180,
    duration: 1,
    endRadius: 2,
    endRelativeHeight: 4,
  }, 30);
  const halfway = sampleCameraTrack(result.track, 3.5).position;
  assert.ok(Math.abs(Math.hypot(halfway.x, halfway.z) - 3) < 1e-9);
  assert.ok(Math.abs(halfway.y - 5) < 1e-9);
  assert.ok(halfway.x > 0);
});

test("Orbit samples and preserves the ordinary keyframed Roll channel", () => {
  const source = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "start", time: 0, ...pose(2, 1, 0), quaternion: setCameraOpticalRollDegrees(pose(0, 0, 0).quaternion, -20) },
      { id: "later", time: 4, ...pose(2, 1, 0), quaternion: setCameraOpticalRollDegrees(pose(0, 0, 0).quaternion, 60) },
    ],
    outTime: 4,
  });
  const result = buildCameraOrbitTrack(source, 0, { x: 0, y: 0, z: 0 }, {
    endpointMode: "new",
    sweepDegrees: 180,
    duration: 2,
    endRadius: 2,
    endRelativeHeight: 1,
  }, 30);
  for (const keyframeID of result.createdKeyframeIDs) {
    const generated = result.track.keyframes.find((keyframe) => keyframe.id === keyframeID);
    const expected = sampleCameraTrack(source, generated.time);
    assert.ok(
      Math.abs(cameraOpticalRollDegrees(generated.quaternion) - cameraOpticalRollDegrees(expected.quaternion)) < 0.000001
    );
  }
});

test("next-keyframe mode preserves arbitrary C and adds turns without touching outside keys", () => {
  const original = trackWith();
  const result = buildCameraOrbitTrack(original, 1, { x: 0, y: 1, z: 0 }, {
    endpointMode: "next-keyframe",
    direction: "clockwise",
    extraTurns: 1,
  }, 30);
  const next = result.track;
  const endpoint = next.keyframes.find((keyframe) => keyframe.id === "end");
  assert.deepEqual(endpoint, original.keyframes.find((keyframe) => keyframe.id === "end"));
  assert.deepEqual(next.keyframes[0], original.keyframes[0]);
  assert.deepEqual(next.keyframes.at(-1), original.keyframes.at(-1));
  assert.deepEqual(next.segments.at(-1), original.segments.at(-1));
  assert.ok(result.totalSweepDegrees > 360 && result.totalSweepDegrees < 540);
  const summary = cameraOrbitEndpointSummary(original, 1, { x: 0, y: 1, z: 0 }, {
    endpointMode: "next-keyframe",
    direction: "clockwise",
    extraTurns: 1,
  }, 30);
  assert.equal(summary.endKeyframeID, "end");
  assert.equal(summary.endRadius, 4);
  // 起始机位 y=2、下一关键帧 y=3 —— 摘要报的是「比起点高 1 米」
  assert.equal(summary.endRelativeHeight, 1);
});

test("a coincident next endpoint means one full orbit by default", () => {
  const track = createCameraTrack({
    keyframes: [
      { id: "a", time: 0, ...pose(2, 1, 0) },
      { id: "b", time: 2, ...pose(2, 1, 0) },
    ],
    outTime: 2,
  });
  const summary = cameraOrbitEndpointSummary(track, 0, { x: 0, y: 0, z: 0 }, {
    endpointMode: "next-keyframe",
  }, 30);
  assert.ok(Math.abs(summary.totalSweepDegrees - 360) < 1e-9);
});

test("new endpoint rejects hidden keyframe collisions and invalid geometry", () => {
  assert.throws(() => buildCameraOrbitTrack(trackWith(), 1, { x: 0, y: 1, z: 0 }, {
    endpointMode: "new",
    duration: 3,
  }, 30), /已有关键帧/);
  assert.throws(() => buildCameraOrbitTrack(trackWith(), 1, { x: 2, y: 2, z: 0 }, {
    endpointMode: "new",
    duration: 1,
  }, 30), /至少相距/);
  assert.throws(() => buildCameraOrbitTrack(trackWith(), 5, { x: 0, y: 0, z: 0 }, {
    endpointMode: "next-keyframe",
  }, 30), /没有摄影机关键帧/);
  assert.throws(() => buildCameraOrbitTrack(trackWith(), 1, { x: 0, y: 0, z: 0 }, {
    endpointMode: "next-keyframe",
    extraTurns: 0.5,
  }, 30), /0 到 3/);
});

test("Follow on the same actor translates the generated Orbit and keeps its relative endpoint", () => {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 4, y: 0, z: 0 }, { speed: 1 });
  project = addShot(project, {
    cameraPose: pose(2, 1, 0),
    follow: { enabled: true, targetActorID: "actor-1", referenceTime: 0 },
  });
  const shot = findShot(project);
  const result = buildCameraOrbitTrack(shot.camera.track, 0, { x: 0, y: 0, z: 0 }, {
    endpointMode: "new",
    sweepDegrees: 180,
    duration: 4,
    endRadius: 2,
    endRelativeHeight: 0,
  }, 30);
  shot.camera.track = result.track;
  const endpoint = sampleShotCamera(project, shot, 4).position;
  const actorEndpoint = sampleProject(project, 4).get("actor-1").position;
  assert.ok(Math.abs(endpoint.x - (-2 + actorEndpoint.x)) < 1e-9);
  // 升降填 0 即与起始机位等高；Follow 只贡献水平平移
  assert.ok(Math.abs(endpoint.y - 1) < 1e-9);
  assert.ok(Math.abs(endpoint.z) < 1e-9);
});

function defaultsRadius(position) {
  return Math.hypot(position.x, position.z);
}

// 环绕轴是竖直的：半径只算水平距离，中心的 Y 从来不影响圆的形状。此前它却是
// 高差的零点，于是同样填「3」，中心放在脚底得 3.00、放在头顶得 4.62 —— 那个
// 滑块在悄悄改数字的含义。改为以起始机位为零点后，中心 Y 应当完全不参与。
test("rise is measured from the start pose, so the center height cannot affect it", () => {
  const source = createCameraTrack({
    keyframes: [{ id: "k0", time: 0, ...pose(3, 1, 0) }],
    outTime: 0,
  });
  const endYFor = (centerY, rise) => {
    const result = buildCameraOrbitTrack(source, 0, { x: 0, y: centerY, z: 0 }, {
      endpointMode: "new",
      sweepDegrees: 180,
      duration: 2,
      endRadius: 3,
      endRelativeHeight: rise,
    }, 30);
    return result.track.keyframes.find((keyframe) => keyframe.id === result.endKeyframeID).position.y;
  };
  for (const centerY of [0, 1.18, 1.62, 99, -40]) {
    assert.ok(Math.abs(endYFor(centerY, 3) - 4) < 1e-9, `中心 Y=${centerY} 时升 3 应到 4`);
    assert.ok(Math.abs(endYFor(centerY, 0) - 1) < 1e-9, `中心 Y=${centerY} 时升 0 应保持 1`);
    assert.ok(Math.abs(endYFor(centerY, -0.5) - 0.5) < 1e-9, `中心 Y=${centerY} 时降 0.5 应到 0.5`);
  }
  // 半径本来就只看水平距离，一并钉住
  const result = buildCameraOrbitTrack(source, 0, { x: 0, y: 55, z: 0 }, {
    endpointMode: "new", sweepDegrees: 180, duration: 2, endRadius: 3, endRelativeHeight: 0,
  }, 30);
  for (const keyframe of result.track.keyframes) {
    assert.ok(Math.abs(Math.hypot(keyframe.position.x, keyframe.position.z) - 3) < 1e-9);
  }
});
