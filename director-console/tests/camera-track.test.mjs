import test from "node:test";
import assert from "node:assert/strict";

import {
  cameraKeyframeAtTime,
  cameraTrackDuration,
  cameraTrackEndpoints,
  cameraTrackReady,
  cameraTrackSegmentAtTime,
  cameraTrackSegments,
  cameraTrackSourceDuration,
  createCameraTrack,
  deleteCameraKeyframe,
  moveCameraKeyframe,
  normalizeCameraPose,
  recordCameraKeyframe,
  sampleCameraTrack,
  sampleCameraTrackPath,
  setCameraSegmentInterpolation,
  setCameraTrackDuration,
  setCameraTrackEndpoint,
  setCameraTrackInterpolation,
  trimCameraTrack,
  updateCameraKeyframe,
  updateCameraKeyframeAim,
  updateCameraKeyframeFollow,
} from "../app/camera-track.js";

const poseA = {
  position: { x: 0, y: 2, z: 6 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  focalLength: 35,
  focusDistance: 5,
  aperture: 2.8,
};
const poseB = {
  position: { x: 4, y: 2, z: 6 },
  quaternion: { x: 0, y: 1, z: 0, w: 0 },
  focalLength: 50,
  focusDistance: 9,
  aperture: 5.6,
};
const poseMiddle = {
  position: { x: 1, y: 3, z: 6 },
  quaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
  focalLength: 50,
  focusDistance: 7,
  aperture: 4,
};
const poseC = {
  position: { x: 2, y: 2, z: 6 },
  quaternion: { x: 0, y: 1, z: 0, w: 0 },
  focalLength: 65,
  focusDistance: 11,
  aperture: 8,
};

test("durable unit quaternions are byte-stable across repeated normalization", () => {
  const quaternion = {
    x: -0.2074355695435915,
    y: 0.313719286271066,
    z: 0.06701774075209452,
    w: 0.9241532969882129,
  };
  assert.ok(Math.abs(Math.hypot(...Object.values(quaternion)) - 1) <= 1e-12);
  const once = normalizeCameraPose({
    position: { x: 1, y: 2, z: 3 },
    quaternion,
    focalLength: 35,
  });
  const twice = normalizeCameraPose(once);
  assert.deepEqual(once.quaternion, quaternion);
  assert.deepEqual(twice, once);

  assert.deepEqual(normalizeCameraPose({
    position: { x: 1, y: 2, z: 3 },
    quaternion: { x: 0, y: 0, z: 0, w: 2 },
    focalLength: 35,
  }).quaternion, { x: 0, y: 0, z: 0, w: 1 });
});

test("camera poses preserve the supported 12 to 200 millimeter lens range", () => {
  assert.equal(normalizeCameraPose({ ...poseA, focalLength: 12 }).focalLength, 12);
  assert.equal(normalizeCameraPose({ ...poseA, focalLength: 200 }).focalLength, 200);
  assert.equal(normalizeCameraPose({ ...poseA, focalLength: 8 }).focalLength, 12);
  assert.equal(normalizeCameraPose({ ...poseA, focalLength: 300 }).focalLength, 200);
});

test("camera optics normalize safely and interpolate on the ordinary keyframe track", () => {
  const legacy = normalizeCameraPose({
    position: poseA.position,
    quaternion: poseA.quaternion,
    focalLength: poseA.focalLength,
  });
  assert.equal(legacy.focusDistance, 5);
  assert.equal(legacy.aperture, 2.8);
  assert.equal(normalizeCameraPose({ ...poseA, focusDistance: 0 }).focusDistance, 0.1);
  assert.equal(normalizeCameraPose({ ...poseA, aperture: 99 }).aperture, 16);

  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "optics-a", time: 0, ...poseA },
      { id: "optics-b", time: 2, ...poseB },
    ],
    outTime: 2,
  });
  const middle = sampleCameraTrack(track, 1);
  assert.equal(middle.focusDistance, 7);
  assert.ok(Math.abs(middle.aperture - 4.2) < 1e-12);
});

test("legacy pose-only updates preserve existing keyframed focus and aperture", () => {
  let track = recordCameraKeyframe(createCameraTrack(), poseB, 0, 30);
  track = updateCameraKeyframe(track, track.keyframes[0].id, {
    position: { x: 3, y: 2, z: 6 },
    quaternion: poseB.quaternion,
    focalLength: 85,
  });
  assert.equal(track.keyframes[0].focusDistance, poseB.focusDistance);
  assert.equal(track.keyframes[0].aperture, poseB.aperture);
});

test("a single camera keyframe is a valid static Shot", () => {
  const track = setCameraTrackEndpoint(createCameraTrack(), "start", poseA, 4);
  assert.equal(cameraTrackReady(track), true);
  assert.equal(cameraTrackDuration(track), 0);
  assert.deepEqual(sampleCameraTrack(track, 10).position, poseA.position);
});

test("A and B are persisted as extensible ordered keyframes", () => {
  let track = setCameraTrackEndpoint(createCameraTrack(), "start", poseA, 4);
  track = setCameraTrackEndpoint(track, "end", poseB, 4);
  assert.equal(track.keyframes.length, 2);
  assert.notEqual(track.keyframes[0].id, track.keyframes[1].id);
  assert.equal(cameraTrackDuration(track), 4);
  assert.deepEqual(cameraTrackEndpoints(track), { start: poseA, end: poseB });
  assert.equal(sampleCameraTrack(track, 2).position.x, 2);

  track = setCameraTrackDuration(track, 8);
  assert.equal(cameraTrackDuration(track), 8);
  assert.equal(sampleCameraTrack(track, 4).position.x, 2);
});

test("trimming preserves the original motion and retiming is an explicit separate operation", () => {
  let track = setCameraTrackEndpoint(createCameraTrack({ interpolation: "ease-in-out" }), "start", poseA, 4);
  track = setCameraTrackEndpoint(track, "end", poseB, 4);
  const originalAtTwo = sampleCameraTrack(track, 2);

  const trimmed = trimCameraTrack(track, 2);
  assert.equal(cameraTrackDuration(trimmed), 2);
  assert.equal(cameraTrackSourceDuration(trimmed), 4);
  assert.deepEqual(sampleCameraTrack(trimmed, 2).position, originalAtTwo.position);
  assert.deepEqual(sampleCameraTrack(trimmed, 4).position, originalAtTwo.position);
  assert.deepEqual(cameraTrackEndpoints(trimmed).end.position, originalAtTwo.position);

  const retimed = setCameraTrackDuration(track, 2);
  assert.equal(cameraTrackDuration(retimed), 2);
  assert.equal(cameraTrackSourceDuration(retimed), 2);
  assert.deepEqual(sampleCameraTrack(retimed, 2).position, poseB.position);
});

test("basic keyframe editing records, updates, moves, and deletes on the project frame grid", () => {
  let track = recordCameraKeyframe(createCameraTrack(), poseA, 0, 30);
  track = recordCameraKeyframe(track, poseB, 2.017, 30);
  const end = cameraKeyframeAtTime(track, 2.017, 30);
  assert.ok(end);
  assert.equal(end.time, 2.033333333333333);

  track = updateCameraKeyframe(track, end.id, { ...poseB, focalLength: 85 });
  assert.equal(cameraKeyframeAtTime(track, 2.033, 30).focalLength, 85);

  track = moveCameraKeyframe(track, end.id, 1.011, 30);
  const moved = track.keyframes.find((keyframe) => keyframe.id === end.id);
  assert.equal(moved.time, 1);
  assert.equal(cameraTrackDuration(track), 1);

  track = deleteCameraKeyframe(track, end.id);
  assert.equal(track.keyframes.length, 1);
  assert.equal(cameraTrackDuration(track), 0);
  assert.equal(deleteCameraKeyframe(track, track.keyframes[0].id).keyframes.length, 1);
});

test("continuous smoothing passes through intermediate keyframes without stopping", () => {
  const keyframes = [
    { id: "start", time: 0, ...poseA },
    { id: "middle", time: 1, ...poseMiddle },
    { id: "end", time: 2, ...poseC },
  ];
  const smooth = createCameraTrack({ interpolation: "smooth", keyframes, outTime: 2 });
  const eased = createCameraTrack({ interpolation: "ease-in-out", keyframes, outTime: 2 });
  const delta = 0.001;
  const before = sampleCameraTrack(smooth, 1 - delta);
  const atKeyframe = sampleCameraTrack(smooth, 1);
  const after = sampleCameraTrack(smooth, 1 + delta);
  const incomingSpeed = (atKeyframe.position.x - before.position.x) / delta;
  const outgoingSpeed = (after.position.x - atKeyframe.position.x) / delta;
  const easedIncomingSpeed = (sampleCameraTrack(eased, 1).position.x - sampleCameraTrack(eased, 1 - delta).position.x) / delta;

  assert.deepEqual(atKeyframe.position, poseMiddle.position);
  assert.equal(atKeyframe.focalLength, poseMiddle.focalLength);
  assert.ok(incomingSpeed > 0.9);
  assert.ok(Math.abs(incomingSpeed - outgoingSpeed) < 0.01);
  assert.ok(easedIncomingSpeed < 0.01);
  assert.ok(Math.abs(Math.hypot(
    atKeyframe.quaternion.x,
    atKeyframe.quaternion.y,
    atKeyframe.quaternion.z,
    atKeyframe.quaternion.w
  ) - 1) < 1e-12);

  const path = sampleCameraTrackPath(smooth, 8);
  assert.equal(path.length, 17);
  assert.deepEqual(path.at(-1).position, poseC.position);
});

test("segment interpolation overrides the track default and survives keyframe insertion", () => {
  let track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "start", time: 0, ...poseA },
      { id: "end", time: 2, ...poseC },
    ],
    outTime: 2,
  });
  track = setCameraSegmentInterpolation(track, "start", "ease-in-out");
  assert.equal(cameraTrackSegments(track)[0].interpolation, "ease-in-out");
  assert.ok(sampleCameraTrack(track, 0.5).position.x < 0.5);

  track = recordCameraKeyframe(track, poseMiddle, 1, 30);
  assert.deepEqual(
    cameraTrackSegments(track).map((segment) => segment.interpolation),
    ["ease-in-out", "ease-in-out"]
  );
  assert.deepEqual(cameraTrackSegmentAtTime(track, 1), {
    startKeyframeID: track.keyframes[1].id,
    endKeyframeID: "end",
    interpolation: "ease-in-out",
    index: 1,
    startTime: 1,
    endTime: 2,
    duration: 1,
  });

  track = setCameraTrackInterpolation(track, "smooth");
  assert.equal(track.interpolation, "smooth");
  assert.deepEqual(cameraTrackSegments(track).map((segment) => segment.interpolation), ["smooth", "smooth"]);
});

test("camera aim defaults safely and survives pose edits", () => {
  let track = recordCameraKeyframe(createCameraTrack(), poseA, 0, 30);
  assert.deepEqual(track.keyframes[0].aim, {
    mode: "free",
    targetKind: "actor",
    targetActorID: null,
    anchor: "chest",
    actorHeight: 1.18 / 1.62,
    worldPosition: { x: 0, y: 1.18, z: 0 },
    composition: "center",
    trackingResponse: 0,
  });
  track = recordCameraKeyframe(track, poseB, 1, 30);
  assert.equal(track.keyframes[1].aim.mode, "free");
  track = updateCameraKeyframeAim(track, track.keyframes[0].id, {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "head",
    composition: "left-third",
    blendDuration: 0.8,
  });
  track = updateCameraKeyframe(track, track.keyframes[0].id, { ...poseA, focalLength: 50 });
  assert.equal(track.keyframes[0].aim.mode, "look-at");
  assert.equal(track.keyframes[0].aim.targetActorID, "actor-1");
  assert.equal(track.keyframes[0].aim.actorHeight, 1);
  assert.equal(track.keyframes[0].focalLength, 50);
});

test("camera aim normalizes continuous actor heights and fixed world targets", () => {
  let track = recordCameraKeyframe(createCameraTrack(), poseA, 0, 30);
  track = updateCameraKeyframeAim(track, track.keyframes[0].id, {
    mode: "look-at",
    targetKind: "actor",
    targetActorID: "actor-1",
    anchor: "custom",
    actorHeight: 0.42,
  });
  assert.equal(track.keyframes[0].aim.actorHeight, 0.42);
  assert.equal(track.keyframes[0].aim.targetKind, "actor");

  track = updateCameraKeyframeAim(track, track.keyframes[0].id, {
    ...track.keyframes[0].aim,
    targetKind: "world",
    worldPosition: { x: 2, y: 3, z: -4 },
  });
  assert.deepEqual(track.keyframes[0].aim.worldPosition, { x: 2, y: 3, z: -4 });
  assert.equal(track.keyframes[0].aim.targetKind, "world");
});

test("camera Follow defaults safely, inherits, and moves its activation reference with the keyframe", () => {
  let track = recordCameraKeyframe(createCameraTrack(), poseA, 0, 30);
  assert.deepEqual(track.keyframes[0].follow, {
    enabled: false,
    targetActorID: null,
    referenceTime: 0,
  });
  track = recordCameraKeyframe(track, poseB, 1, 30);
  assert.equal(track.keyframes[1].follow, null);
  track = updateCameraKeyframeFollow(track, track.keyframes[1].id, {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 1,
  });
  track = updateCameraKeyframe(track, track.keyframes[1].id, { ...poseB, focalLength: 85 });
  assert.deepEqual(track.keyframes[1].follow, {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 1,
  });

  track = moveCameraKeyframe(track, track.keyframes[1].id, 2, 30);
  assert.equal(track.keyframes[1].time, 2);
  assert.equal(track.keyframes[1].follow.referenceTime, 2);
});


test("recording pins the current direction while rerecording preserves manual inheritance", () => {
  let track = recordCameraKeyframe(createCameraTrack(), poseA, 0);
  track = updateCameraKeyframeAim(track, track.keyframes[0].id, {
    mode: "look-at", targetKind: "world", worldPosition: { x: 2, y: 3, z: 4 },
    composition: "left-third", trackingResponse: 0.5,
  });
  track = recordCameraKeyframe(track, poseB, 3);
  assert.deepEqual(track.keyframes[1].aim, track.keyframes[0].aim);
  track = updateCameraKeyframeAim(track, track.keyframes[1].id, null);
  track = recordCameraKeyframe(track, poseMiddle, 3);
  assert.equal(track.keyframes[1].aim, null);
  track = recordCameraKeyframe(track, poseB, 5);
  assert.deepEqual(track.keyframes[2].aim, track.keyframes[0].aim);
  track = recordCameraKeyframe(track, { ...poseB, aim: { mode: "free" } }, 4);
  assert.equal(track.keyframes[2].aim.mode, "free");
  track = recordCameraKeyframe(track, { ...poseB, aim: null }, 6);
  assert.equal(track.keyframes.at(-1).aim, null);
});
