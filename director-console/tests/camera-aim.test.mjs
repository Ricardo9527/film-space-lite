import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCameraAim,
  cameraAimTargetPosition,
  cameraOpticalRollDegrees,
  cameraQuaternionFromRotationDegrees,
  cameraRotationDegrees,
  describeCameraAimTransition,
  lookAtQuaternion,
  sampleShotCamera,
  setCameraOpticalRollDegrees,
} from "../app/camera-aim.js";
import {
  createCameraTrack,
  normalizeCameraAim,
  recordCameraKeyframe,
  updateCameraKeyframeAim,
  sampleCameraTrack,
} from "../app/camera-track.js";
import { cameraSensorGate } from "../app/camera-composition.js";
import { sampleProject } from "../app/playback-engine.js";

const basePose = {
  position: { x: 0, y: 1.18, z: 6 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  focalLength: 35,
};

function makeProject(track, actorPosition = { x: 0, y: 0, z: 0 }) {
  const actor = {
    id: "actor-1",
    position: actorPosition,
    rotationY: 0,
    scale: 1,
    motionActions: [],
  };
  const shot = {
    id: "shot-1",
    aspectRatio: "16:9",
    camera: { track },
  };
  return {
    project: { scene: { actors: [actor], shots: [shot] } },
    actor,
    shot,
  };
}

function inverseRotateVector(quaternion, vector) {
  return rotateVector({
    x: -quaternion.x,
    y: -quaternion.y,
    z: -quaternion.z,
    w: quaternion.w,
  }, vector);
}

function rotateVector(quaternion, vector) {
  const qVector = { x: quaternion.x, y: quaternion.y, z: quaternion.z };
  const uv = cross(qVector, vector);
  const uuv = cross(qVector, uv);
  return {
    x: vector.x + 2 * (quaternion.w * uv.x + uuv.x),
    y: vector.y + 2 * (quaternion.w * uv.y + uuv.y),
    z: vector.z + 2 * (quaternion.w * uv.z + uuv.z),
  };
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function projectedTargetNDC(pose, target, aspectRatio = "16:9") {
  const gate = cameraSensorGate(aspectRatio);
  const direction = {
    x: target.x - pose.position.x,
    y: target.y - pose.position.y,
    z: target.z - pose.position.z,
  };
  const local = inverseRotateVector(pose.quaternion, direction);
  if (local.z >= 0) return null;
  return {
    x: (local.x / -local.z) / (gate.width / (2 * pose.focalLength)),
    y: (local.y / -local.z) / (gate.height / (2 * pose.focalLength)),
  };
}

test("Look At changes orientation only and follows the sampled actor anchor", () => {
  const track = createCameraTrack({
    keyframes: [{
      id: "key-1",
      time: 0,
      ...basePose,
      aim: {
        mode: "look-at",
        targetActorID: "actor-1",
        anchor: "chest",
        composition: "center",
        blendDuration: 0.4,
      },
    }],
  });
  const { project, shot } = makeProject(track);
  const centeredSamples = new Map([["actor-1", { position: { x: 0, y: 0, z: 0 } }]]);
  const movedSamples = new Map([["actor-1", { position: { x: 2, y: 0, z: 0 } }]]);
  const centered = sampleShotCamera(project, shot, 0, centeredSamples);
  const moved = sampleShotCamera(project, shot, 0, movedSamples);

  assert.deepEqual(centered.position, basePose.position);
  assert.equal(centered.focalLength, basePose.focalLength);
  assert.deepEqual(centered.quaternion, basePose.quaternion);
  assert.notDeepEqual(moved.quaternion, centered.quaternion);
  assert.equal(moved.aimEvaluation.valid, true);
  assert.deepEqual(moved.aimEvaluation.targetPosition, { x: 2, y: 1.18, z: 0 });
});

test("actor Look At supports a continuous ground-to-head target height", () => {
  const { project } = makeProject(createCameraTrack());
  const samples = new Map([["actor-1", { position: { x: 2, y: 0.25, z: -1 } }]]);
  const target = cameraAimTargetPosition(project, samples, {
    mode: "look-at",
    targetKind: "actor",
    targetActorID: "actor-1",
    anchor: "custom",
    actorHeight: 0.5,
  });
  assert.deepEqual(target, { x: 2, y: 1.06, z: -1 });
});

test("a world Look At point stays fixed independently of actor samples", () => {
  const worldPosition = { x: 2, y: 3, z: -1 };
  const track = createCameraTrack({
    keyframes: [{
      id: "world",
      time: 0,
      ...basePose,
      aim: {
        mode: "look-at",
        targetKind: "world",
        worldPosition,
        composition: "center",
      },
    }],
  });
  const { project, shot } = makeProject(track);
  const sampled = sampleShotCamera(
    project,
    shot,
    0,
    new Map([["actor-1", { position: { x: 99, y: 0, z: 99 } }]])
  );
  assert.deepEqual(sampled.aimEvaluation.targetPosition, worldPosition);
  assert.deepEqual(sampled.quaternion, lookAtQuaternion(
    basePose.position,
    worldPosition,
    basePose.focalLength,
    "16:9",
    "center"
  ));
});

test("actor and world targets interpolate as reached keyframe states", () => {
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      {
        id: "actor",
        time: 0,
        ...basePose,
        aim: {
          mode: "look-at",
          targetKind: "actor",
          targetActorID: "actor-1",
          anchor: "chest",
          composition: "center",
        },
      },
      {
        id: "world",
        time: 2,
        ...basePose,
        aim: {
          mode: "look-at",
          targetKind: "world",
          worldPosition: { x: 4, y: 2, z: 0 },
          composition: "center",
        },
      },
    ],
    outTime: 2,
  });
  const { project, shot } = makeProject(track);
  const halfway = sampleShotCamera(project, shot, 1);
  const arrived = sampleShotCamera(project, shot, 2);
  assert.deepEqual(halfway.aimEvaluation.targetPosition, { x: 2, y: 1.5899999999999999, z: 0 });
  assert.equal(halfway.aimEvaluation.blendProgress, 0.5);
  assert.deepEqual(arrived.aimEvaluation.targetPosition, { x: 4, y: 2, z: 0 });
  assert.equal(arrived.aimEvaluation.targetKind, "world");
});

test("composition positions the target on the requested horizontal third", () => {
  const target = { x: 0, y: 1.18, z: 0 };
  const targetDirection = { x: 0, y: 0, z: -1 };
  const gateWidth = 36;
  const horizontalTangent = gateWidth / (2 * basePose.focalLength);

  for (const [composition, expected] of [["left-third", -1 / 3], ["center", 0], ["right-third", 1 / 3]]) {
    const quaternion = lookAtQuaternion(
      basePose.position,
      target,
      basePose.focalLength,
      "16:9",
      composition
    );
    const local = inverseRotateVector(quaternion, targetDirection);
    const projectedX = (local.x / -local.z) / horizontalTangent;
    assert.ok(Math.abs(projectedX - expected) < 0.000001, `${composition}: ${projectedX}`);
  }
});

test("optical-axis Roll preserves camera direction and round-trips without Euler coupling", () => {
  const aimed = lookAtQuaternion(
    { x: 2, y: 3, z: 5 },
    { x: -1, y: 1, z: -2 },
    35,
    "16:9",
    "center"
  );
  const forwardBefore = rotateVector(aimed, { x: 0, y: 0, z: -1 });
  for (const roll of [-75, -20, 0, 32.5, 110]) {
    const rolled = setCameraOpticalRollDegrees(aimed, roll);
    const forwardAfter = rotateVector(rolled, { x: 0, y: 0, z: -1 });
    assert.ok(Math.abs(cameraOpticalRollDegrees(rolled) - roll) < 0.000001);
    assert.ok(Math.hypot(
      forwardAfter.x - forwardBefore.x,
      forwardAfter.y - forwardBefore.y,
      forwardAfter.z - forwardBefore.z
    ) < 0.000001);
  }
});

test("rolled Look At keeps center and third-line targets on the requested gate position", () => {
  const target = { x: 0, y: 1.18, z: 0 };
  const targetDirection = { x: 0, y: 0, z: -1 };
  const horizontalTangent = 36 / (2 * basePose.focalLength);
  const verticalTangent = (36 / (16 / 9)) / (2 * basePose.focalLength);

  for (const roll of [-42, 27]) {
    for (const [composition, expectedX] of [["left-third", -1 / 3], ["center", 0], ["right-third", 1 / 3]]) {
      const quaternion = lookAtQuaternion(
        basePose.position,
        target,
        basePose.focalLength,
        "16:9",
        composition,
        roll
      );
      const local = inverseRotateVector(quaternion, targetDirection);
      const projectedX = (local.x / -local.z) / horizontalTangent;
      const projectedY = (local.y / -local.z) / verticalTangent;
      assert.ok(Math.abs(projectedX - expectedX) < 0.000001, `${composition} x at ${roll}°: ${projectedX}`);
      assert.ok(Math.abs(projectedY) < 0.000001, `${composition} y at ${roll}°: ${projectedY}`);
      assert.ok(Math.abs(cameraOpticalRollDegrees(quaternion) - roll) < 0.000001);
    }
  }
});

test("Lock transitions retain the ordinary keyframed Roll channel", () => {
  const rolled = (degrees) => setCameraOpticalRollDegrees(basePose.quaternion, degrees);
  const lock = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "center",
  };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "free-a", time: 0, ...basePose, quaternion: rolled(-20), aim: { mode: "free" } },
      { id: "lock", time: 2, ...basePose, quaternion: rolled(30), aim: lock },
      { id: "free-b", time: 4, ...basePose, quaternion: rolled(-10), aim: { mode: "free" } },
    ],
    outTime: 4,
  });
  const { project, shot } = makeProject(track);
  for (const elapsed of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]) {
    const expectedRoll = cameraOpticalRollDegrees(sampleCameraTrack(track, elapsed).quaternion);
    const evaluatedRoll = cameraOpticalRollDegrees(sampleShotCamera(project, shot, elapsed).quaternion);
    assert.ok(
      Math.abs(evaluatedRoll - expectedRoll) < 0.0001,
      `Roll at ${elapsed}s: expected ${expectedRoll}, got ${evaluatedRoll}`
    );
  }
});

for (const interpolation of ["linear", "ease-in-out", "smooth"]) {
  test(`leaving Lock preserves equal endpoint Roll across a large hidden turn (${interpolation})`, () => {
    const roll = 6.2170985916761765;
    const position = { x: 0.9358242934, y: 0.4756250517, z: -8.9347031109 };
    const locked = cameraQuaternionFromRotationDegrees({ pitch: 31.0945, yaw: 3.1003, roll });
    const released = cameraQuaternionFromRotationDegrees({ pitch: 7.2134, yaw: 172.2147, roll });
    const aim = {
      mode: "look-at", targetKind: "world",
      worldPosition: { x: 0, y: 1.35, z: -2.09 }, trackingResponse: 0,
    };
    const track = createCameraTrack({
      interpolation,
      keyframes: [
        { id: "lock", time: 0, ...basePose, position, quaternion: locked, aim },
        { id: "hold", time: 1, ...basePose, position, quaternion: locked, aim: null },
        { id: "release", time: 2, ...basePose, position, quaternion: released, aim: { mode: "free" } },
        { id: "end", time: 3, ...basePose, position, quaternion: released, aim: null },
      ],
    });
    const { project, shot } = makeProject(track);
    const snapshot = JSON.stringify(track);
    for (let frame = 0; frame <= 48; frame += 1) {
      const time = frame / 24;
      const pose = sampleShotCamera(project, shot, time);
      assert.ok(Math.abs(cameraOpticalRollDegrees(pose.quaternion) - roll) < 1e-6, `Roll at ${time}s`);
    }
    for (const time of [1, 2]) {
      const before = sampleShotCamera(project, shot, time - 1e-6);
      const after = sampleShotCamera(project, shot, time + 1e-6);
      assert.ok(quaternionAngleBetween(before.quaternion, after.quaternion) < 0.001);
    }
    assert.equal(JSON.stringify(track), snapshot);
  });
}

test("Lock Roll takes the short path across the signed angle boundary", () => {
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "lock", time: 0, ...basePose,
        quaternion: cameraQuaternionFromRotationDegrees({ pitch: 31, yaw: 3, roll: 170 }),
        aim: { mode: "look-at", targetKind: "world", worldPosition: { x: 0, y: 2, z: 0 } } },
      { id: "release", time: 2, ...basePose,
        quaternion: cameraQuaternionFromRotationDegrees({ pitch: 7, yaw: 172, roll: -170 }),
        aim: { mode: "free" } },
    ],
  });
  const { project, shot } = makeProject(track);
  for (const time of [0, 0.5, 1, 1.5, 2]) {
    const roll = cameraOpticalRollDegrees(sampleShotCamera(project, shot, time).quaternion);
    const error = ((roll - (170 + 10 * time) + 540) % 360) - 180;
    assert.ok(Math.abs(error) < 1e-6, `Roll at ${time}s: ${roll}`);
  }
});

test("continuous Lock tracking damps target motion but not authored Roll", () => {
  const lock = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "right-third",
    trackingResponse: 0.6,
  };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "start", time: 0, ...basePose, quaternion: setCameraOpticalRollDegrees(basePose.quaternion, -15), aim: lock },
      { id: "end", time: 10, ...basePose, quaternion: setCameraOpticalRollDegrees(basePose.quaternion, 65), aim: lock },
    ],
    outTime: 10,
  });
  const { project, shot } = makeMovingProject(track);
  const elapsed = 2.25;
  const sampled = sampleShotCamera(project, shot, elapsed);
  const base = sampleCameraTrack(track, elapsed);
  assert.ok(
    Math.abs(cameraOpticalRollDegrees(sampled.quaternion) - cameraOpticalRollDegrees(base.quaternion)) < 0.0001
  );
  const exact = lookAtQuaternion(
    sampled.position,
    sampled.aimEvaluation.targetPosition,
    sampled.focalLength,
    "16:9",
    "right-third",
    cameraOpticalRollDegrees(base.quaternion)
  );
  assert.ok(quaternionAngleBetween(sampled.quaternion, exact) > 0.001, "target tracking should still lag");
});

test("a target change plays between the surrounding explicit states and arrives exactly at its keyframe", () => {
  const lookAtAim = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "center",
  };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "free", time: 0, ...basePose },
      { id: "look", time: 1, ...basePose, aim: lookAtAim },
      { id: "end", time: 2, ...basePose, aim: lookAtAim },
    ],
    outTime: 2,
  });
  const { project, shot } = makeProject(track, { x: 3, y: 0, z: 0 });
  const samples = new Map([["actor-1", { position: { x: 3, y: 0, z: 0 } }]]);
  const atStart = sampleShotCamera(project, shot, 0, samples);
  const halfway = sampleShotCamera(project, shot, 0.5, samples);
  const justBefore = sampleShotCamera(project, shot, 0.999, samples);
  const arrived = sampleShotCamera(project, shot, 1, samples);
  const after = sampleShotCamera(project, shot, 1.5, samples);

  assert.ok(
    quaternionAngleBetween(atStart.quaternion, basePose.quaternion) < 0.000000001,
    "a free A state starts the transition from the authored free orientation"
  );
  assert.equal(atStart.aimEvaluation.blendProgress, 0);
  assert.ok(halfway.quaternion.y < 0);
  assert.equal(halfway.aimEvaluation.blendProgress, 0.5);
  assert.equal(halfway.aimEvaluation.transition.fromKeyframeID, "free");
  assert.equal(halfway.aimEvaluation.transition.toKeyframeID, "look");
  const expected = lookAtQuaternion(
    basePose.position,
    { x: 3, y: 1.18, z: 0 },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.deepEqual(arrived.quaternion, expected);
  assert.equal(arrived.aimEvaluation.blendProgress, 1);
  assert.equal(arrived.aimEvaluation.transition, null);
  assert.ok(
    quaternionAngleBetween(justBefore.quaternion, arrived.quaternion) < 0.001,
    "the arrival frame must not jump"
  );
  assert.deepEqual(after.quaternion, expected);
});

test("an invalid target preserves the authored orientation and reports a warning", () => {
  const track = createCameraTrack({
    keyframes: [{
      id: "missing",
      time: 0,
      ...basePose,
      aim: { mode: "look-at", targetActorID: "missing-actor" },
    }],
  });
  const { project, shot } = makeProject(track);
  const sampled = applyCameraAim(project, shot, basePose, 0, new Map());
  assert.deepEqual(sampled.quaternion, basePose.quaternion);
  assert.equal(sampled.aimEvaluation.valid, false);
  assert.match(sampled.aimEvaluation.warning, /目标不可用/);
});

function makeMovingProject(track) {
  const actor = {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    scale: 1,
    motionActions: [{
      id: "move-1",
      kind: "move",
      position: { x: 6, y: 0, z: 0 },
      speed: 1.5,
      actionID: "walk",
    }],
  };
  const shot = {
    id: "shot-1",
    aspectRatio: "16:9",
    camera: { track },
  };
  return {
    project: { scene: { actors: [actor], shots: [shot] } },
    actor,
    shot,
  };
}

function makeTrackingTrack(trackingResponse) {
  const aim = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "center",
    blendDuration: 0.4,
    trackingResponse,
  };
  return createCameraTrack({
    keyframes: [
      { id: "start", time: 0, ...basePose, aim },
      { id: "end", time: 10, ...basePose, aim },
    ],
    outTime: 10,
  });
}

function quaternionAngleBetween(left, right) {
  const dot = Math.abs(
    left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w
  );
  return 2 * Math.acos(Math.min(dot, 1));
}

test("a missing tracking response preserves the exact v1 lock", () => {
  const legacyAim = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "center",
    blendDuration: 0.4,
  };
  const track = createCameraTrack({
    keyframes: [
      { id: "start", time: 0, ...basePose, aim: legacyAim },
      { id: "end", time: 10, ...basePose, aim: legacyAim },
    ],
    outTime: 10,
  });
  const { project, shot } = makeMovingProject(track);
  const elapsed = 1;
  const sampled = sampleShotCamera(project, shot, elapsed);
  const actorPosition = sampleProject(project, elapsed).get("actor-1").position;
  const expected = lookAtQuaternion(
    basePose.position,
    { x: actorPosition.x, y: actorPosition.y + 1.18, z: actorPosition.z },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.deepEqual(sampled.quaternion, expected);
  assert.equal(sampled.aimEvaluation.trackingResponse, 0);

  const explicitZero = sampleShotCamera(project, shot, elapsed, sampleProject(project, elapsed));
  assert.deepEqual(explicitZero.quaternion, expected);

  const zeroTrack = makeTrackingTrack(0);
  const zeroProject = makeMovingProject(zeroTrack);
  const zeroSampled = sampleShotCamera(zeroProject.project, zeroProject.shot, elapsed);
  assert.deepEqual(zeroSampled.quaternion, expected);
});

test("normalizeCameraAim clamps tracking response and defaults it to zero", () => {
  assert.equal(normalizeCameraAim().trackingResponse, 0);
  assert.equal(normalizeCameraAim({ mode: "look-at" }).trackingResponse, 0);
  assert.equal(normalizeCameraAim({ trackingResponse: 0.75 }).trackingResponse, 0.75);
  assert.equal(normalizeCameraAim({ trackingResponse: 2 }).trackingResponse, 2);
  assert.equal(normalizeCameraAim({ trackingResponse: 5 }).trackingResponse, 2);
  assert.equal(normalizeCameraAim({ trackingResponse: -1 }).trackingResponse, 0);
  assert.equal(normalizeCameraAim({ trackingResponse: "fast" }).trackingResponse, 0);
});

test("normalizeCameraAim keeps legacy blendDuration readable but never writes it back", () => {
  assert.ok(!("blendDuration" in normalizeCameraAim({ blendDuration: 0.9 })));
  assert.ok(!("blendDuration" in normalizeCameraAim()));
});

test("a positive tracking response lags moving targets and converges after they stop", () => {
  const dampedTrack = makeTrackingTrack(0.6);
  const exactTrack = makeTrackingTrack(0);
  const damped = makeMovingProject(dampedTrack);
  const exact = makeMovingProject(exactTrack);

  const movingDamped = sampleShotCamera(damped.project, damped.shot, 1);
  const movingExact = sampleShotCamera(exact.project, exact.shot, 1);
  const movingGap = quaternionAngleBetween(movingDamped.quaternion, movingExact.quaternion);
  assert.ok(movingGap > 0.005, `expected a measurable lag while the target moves, got ${movingGap}`);
  assert.deepEqual(movingDamped.position, basePose.position);
  assert.equal(movingDamped.focalLength, basePose.focalLength);
  assert.equal(movingDamped.aimEvaluation.trackingResponse, 0.6);

  // The actor arrives at x = 6 after 4 s; 10 s of settle time is ~16.7 time constants.
  const settledDamped = sampleShotCamera(damped.project, damped.shot, 10);
  const settledExact = sampleShotCamera(exact.project, exact.shot, 10);
  const settledGap = quaternionAngleBetween(settledDamped.quaternion, settledExact.quaternion);
  assert.ok(settledGap < 0.001, `expected convergence after the target stops, got ${settledGap}`);
});

test("continuous tracking keeps a rapidly moving target inside its hard framing limit", () => {
  const track = makeTrackingTrack(0.6);
  const { project, shot } = makeMovingProject(track);
  project.scene.actors[0].motionActions[0] = {
    id: "fast-move",
    kind: "move",
    position: { x: 30, y: 0, z: 0 },
    speed: 30,
    actionID: "run",
  };
  // Keep this fixture about tracking safety rather than the start-turn planner.
  project.scene.actors[0].rotationY = Math.PI / 2;

  const elapsed = 0.5;
  const sampled = sampleShotCamera(project, shot, elapsed);
  const target = sampled.aimEvaluation.targetPosition;
  const ndc = projectedTargetNDC(sampled, target);
  const exact = lookAtQuaternion(
    sampled.position,
    target,
    sampled.focalLength,
    shot.aspectRatio,
    "center"
  );

  assert.ok(ndc, "the hard-limit correction must keep the target in front of camera");
  assert.ok(Math.abs(ndc.x) <= 0.50001, `target escaped horizontal hard limit: ${ndc.x}`);
  assert.ok(Math.abs(ndc.y) <= 0.50001, `target escaped vertical hard limit: ${ndc.y}`);
  assert.ok(
    quaternionAngleBetween(sampled.quaternion, exact) > 0.001,
    "the safety correction should preserve some natural tracking lag"
  );
  assert.ok(
    Math.abs(ndc.x) > 0.45,
    `expected the minimum correction to leave the target near the safety edge, got ${ndc.x}`
  );
});

test("hard framing follows thirds, aspect, focal length, and authored Roll", () => {
  for (const [aspectRatio, focalLength] of [["16:9", 35], ["9:16", 85]]) {
    const rolledPose = {
      ...basePose,
      focalLength,
      quaternion: setCameraOpticalRollDegrees(basePose.quaternion, 28),
    };
    const aim = {
      mode: "look-at",
      targetActorID: "actor-1",
      anchor: "chest",
      composition: "left-third",
      trackingResponse: 0.6,
    };
    const track = createCameraTrack({
      keyframes: [
        { id: "start", time: 0, ...rolledPose, aim },
        { id: "end", time: 4, ...rolledPose, aim },
      ],
      outTime: 4,
    });
    const { project, shot } = makeMovingProject(track);
    shot.aspectRatio = aspectRatio;
    project.scene.actors[0].motionActions[0] = {
      id: "fast-diagonal",
      kind: "move",
      position: { x: 30, y: 8, z: 0 },
      speed: 30,
      actionID: "run",
    };

    const sampled = sampleShotCamera(project, shot, 0.5);
    const ndc = projectedTargetNDC(sampled, sampled.aimEvaluation.targetPosition, aspectRatio);
    assert.ok(ndc, `${aspectRatio}: target must remain in front of camera`);
    assert.ok(ndc.x >= -1 / 3 - 0.50001, `${aspectRatio}: ${ndc.x}`);
    assert.ok(ndc.x <= -1 / 3 + 0.50001, `${aspectRatio}: ${ndc.x}`);
    assert.ok(Math.abs(ndc.y) <= 0.50001, `${aspectRatio}: ${ndc.y}`);
    assert.ok(
      Math.abs(cameraOpticalRollDegrees(sampled.quaternion) - 28) < 0.0001,
      `${aspectRatio}: hard framing must preserve authored Roll`
    );
  }
});

test("tracking response evaluation is deterministic for identical inputs", () => {
  const track = makeTrackingTrack(0.6);
  const { project, shot } = makeMovingProject(track);
  const first = sampleShotCamera(project, shot, 1.234);
  const second = sampleShotCamera(project, shot, 1.234);
  assert.deepEqual(first, second);
  const withSamples = sampleShotCamera(project, shot, 2.5, sampleProject(project, 2.5));
  const repeated = sampleShotCamera(project, shot, 2.5, sampleProject(project, 2.5));
  assert.deepEqual(withSamples, repeated);
});

test("the damped result is shared by sampleShotCamera and applyCameraAim", () => {
  const track = makeTrackingTrack(0.6);
  const { project, shot } = makeMovingProject(track);
  const elapsed = 1.5;
  const samples = sampleProject(project, elapsed);
  const viaShot = sampleShotCamera(project, shot, elapsed, samples);
  const pose = sampleCameraTrack(shot.camera.track, elapsed);
  const viaApply = applyCameraAim(project, shot, pose, elapsed, samples);
  assert.deepEqual(viaShot, { ...viaApply, depthOfFieldEnabled: false });
  assert.equal(viaShot.aimEvaluation.trackingResponse, 0.6);

  const exactQuaternion = lookAtQuaternion(
    pose.position,
    viaShot.aimEvaluation.targetPosition,
    pose.focalLength,
    "16:9",
    "center"
  );
  assert.ok(
    quaternionAngleBetween(viaShot.quaternion, exactQuaternion) > 0.005,
    "expected the shared path to damp continuous motion"
  );
});

test("changing tracking response at a keyframe does not rewrite the preceding response history", () => {
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      {
        id: "exact",
        time: 0,
        ...basePose,
        aim: {
          mode: "look-at",
          targetActorID: "actor-1",
          anchor: "chest",
          composition: "center",
          blendDuration: 0.4,
          trackingResponse: 0,
        },
      },
      {
        id: "smooth",
        time: 2,
        ...basePose,
        aim: {
          mode: "look-at",
          targetActorID: "actor-1",
          anchor: "chest",
          composition: "center",
          blendDuration: 0.4,
          trackingResponse: 0.6,
        },
      },
      { id: "end", time: 4, ...basePose, aim: null },
    ],
    outTime: 4,
  });
  const { project, shot } = makeMovingProject(track);
  const before = sampleShotCamera(project, shot, 1.999);
  const atChange = sampleShotCamera(project, shot, 2);

  assert.ok(
    quaternionAngleBetween(before.quaternion, atChange.quaternion) < 0.001,
    "response changes must start from the orientation already visible at the keyframe"
  );
});

test("leaving Lock arrives at the authored free orientation stored at the keyframe", () => {
  const lookAtAim = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "center",
    trackingResponse: 0.35,
  };
  const freePose = {
    ...basePose,
    quaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
  };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "locked", time: 0, ...basePose, aim: lookAtAim },
      {
        id: "free",
        time: 2,
        ...freePose,
        aim: { ...lookAtAim, mode: "free" },
      },
      { id: "end", time: 4, ...freePose, aim: null },
    ],
    outTime: 4,
  });
  const { project, shot } = makeMovingProject(track);
  const midway = sampleShotCamera(project, shot, 1);
  const before = sampleShotCamera(project, shot, 1.999);
  const atChange = sampleShotCamera(project, shot, 2);
  const after = sampleShotCamera(project, shot, 2.001);

  assert.equal(midway.aimEvaluation.mode, "free");
  assert.equal(midway.aimEvaluation.blendProgress, 0.5);
  assert.ok(midway.aimEvaluation.transition);
  assert.ok(
    quaternionAngleBetween(before.quaternion, atChange.quaternion) < 0.001,
    "arrival at the free keyframe must be continuous"
  );
  assert.ok(
    quaternionAngleBetween(atChange.quaternion, after.quaternion) < 0.001,
    "the ordinary track must continue the free orientation without a snap"
  );
  assert.equal(atChange.aimEvaluation.mode, "free");
  assert.equal(atChange.aimEvaluation.transition, null);
  assert.equal(atChange.aimEvaluation.blendProgress, 1);
  assert.ok(
    quaternionAngleBetween(atChange.quaternion, freePose.quaternion) < 0.000001,
    "the free keyframe stores the exact arrival orientation"
  );
});

test("direct seeks and sequential playback agree after leaving smooth Look At", () => {
  const createFixture = () => {
    const lookAtAim = {
      mode: "look-at",
      targetActorID: "actor-1",
      anchor: "chest",
      composition: "center",
      blendDuration: 0.4,
      trackingResponse: 0.35,
    };
    return makeMovingProject(createCameraTrack({
      interpolation: "linear",
      keyframes: [
        { id: "locked", time: 0, ...basePose, aim: lookAtAim },
        {
          id: "free",
          time: 2,
          ...basePose,
          quaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
          aim: { ...lookAtAim, mode: "free" },
        },
        { id: "end", time: 4, ...basePose, aim: null },
      ],
      outTime: 4,
    }));
  };
  const direct = createFixture();
  const sequential = createFixture();
  const directResult = sampleShotCamera(direct.project, direct.shot, 2.25);
  for (let time = 0; time <= 2.25; time += 1 / 30) {
    sampleShotCamera(sequential.project, sequential.shot, time);
  }
  const sequentialResult = sampleShotCamera(sequential.project, sequential.shot, 2.25);

  assert.deepEqual(sequentialResult, directResult);
});

test("tracking response never damps the authored fallback when its target is invalid", () => {
  const rotatedPose = {
    ...basePose,
    quaternion: { x: 0, y: 1, z: 0, w: 0 },
  };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      {
        id: "start",
        time: 0,
        ...basePose,
        aim: {
          mode: "look-at",
          targetActorID: "deleted-actor",
          anchor: "chest",
          composition: "center",
          blendDuration: 0.4,
          trackingResponse: 0.6,
        },
      },
      { id: "end", time: 2, ...rotatedPose, aim: null },
    ],
    outTime: 2,
  });
  const { project, shot } = makeProject(track);
  project.scene.actors = [];
  const authored = sampleCameraTrack(track, 1);
  const sampled = sampleShotCamera(project, shot, 1);

  assert.deepEqual(sampled.quaternion, authored.quaternion);
  assert.equal(sampled.aimEvaluation.valid, false);
});

test("tracking checkpoints keep direct seeks and sequential playback identical", () => {
  const direct = makeMovingProject(makeTrackingTrack(0.6));
  const sequential = makeMovingProject(makeTrackingTrack(0.6));
  const directResult = sampleShotCamera(direct.project, direct.shot, 6);
  for (let time = 0; time <= 6; time += 1 / 30) {
    sampleShotCamera(sequential.project, sequential.shot, time);
  }
  const sequentialResult = sampleShotCamera(sequential.project, sequential.shot, 6);

  assert.deepEqual(sequentialResult, directResult);
});

// --- Schema v13: aim keyframes are reached states ----------------------------

test("anchor changes slide the locked point along the actor and arrive exactly", () => {
  const chestAim = { mode: "look-at", targetActorID: "actor-1", anchor: "chest", composition: "center" };
  const headAim = { ...chestAim, anchor: "head" };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "chest", time: 0, ...basePose, aim: chestAim },
      { id: "head", time: 2, ...basePose, aim: headAim },
    ],
    outTime: 2,
  });
  const { project, shot } = makeProject(track);
  const samples = new Map([["actor-1", { position: { x: 0, y: 0, z: 0 } }]]);
  const midway = sampleShotCamera(project, shot, 1, samples);
  const justBefore = sampleShotCamera(project, shot, 1.999, samples);
  const arrived = sampleShotCamera(project, shot, 2, samples);

  assert.ok(Math.abs(midway.aimEvaluation.targetPosition.y - 1.4) < 0.000001);
  assert.equal(midway.aimEvaluation.transition.fromKeyframeID, "chest");
  assert.equal(midway.aimEvaluation.transition.toKeyframeID, "head");
  const expectedMid = lookAtQuaternion(
    basePose.position,
    { x: 0, y: 1.4, z: 0 },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.ok(quaternionAngleBetween(midway.quaternion, expectedMid) < 0.000001);
  const expectedHead = lookAtQuaternion(
    basePose.position,
    { x: 0, y: 1.62, z: 0 },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.deepEqual(arrived.quaternion, expectedHead);
  assert.equal(arrived.aimEvaluation.transition, null);
  assert.ok(quaternionAngleBetween(justBefore.quaternion, arrived.quaternion) < 0.001);
});

test("actor switches pan between the two live target points", () => {
  const aimA = { mode: "look-at", targetActorID: "actor-1", anchor: "chest", composition: "center" };
  const aimB = { mode: "look-at", targetActorID: "actor-2", anchor: "chest", composition: "center" };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "a", time: 0, ...basePose, aim: aimA },
      { id: "b", time: 2, ...basePose, aim: aimB },
    ],
    outTime: 2,
  });
  const { project, shot } = makeProject(track);
  project.scene.actors.push({
    id: "actor-2",
    position: { x: 4, y: 0, z: 0 },
    rotationY: 0,
    scale: 1,
    motionActions: [],
  });
  const samples = new Map([
    ["actor-1", { position: { x: 0, y: 0, z: 0 } }],
    ["actor-2", { position: { x: 4, y: 0, z: 0 } }],
  ]);
  const midway = sampleShotCamera(project, shot, 1, samples);
  assert.ok(Math.abs(midway.aimEvaluation.targetPosition.x - 2) < 0.000001);
  assert.ok(Math.abs(midway.aimEvaluation.targetPosition.y - 1.18) < 0.000001);
  const arrived = sampleShotCamera(project, shot, 2, samples);
  const expected = lookAtQuaternion(
    basePose.position,
    { x: 4, y: 1.18, z: 0 },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.deepEqual(arrived.quaternion, expected);
});

test("composition changes slide in gate space and land exactly on the third", () => {
  const center = { mode: "look-at", targetActorID: "actor-1", anchor: "chest", composition: "center" };
  const left = { ...center, composition: "left-third" };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "center", time: 0, ...basePose, aim: center },
      { id: "left", time: 2, ...basePose, aim: left },
    ],
    outTime: 2,
  });
  const { project, shot } = makeProject(track);
  const samples = new Map([["actor-1", { position: { x: 0, y: 0, z: 0 } }]]);
  const horizontalTangent = 36 / (2 * basePose.focalLength);
  const projectedX = (quaternion) => {
    const local = inverseRotateVector(quaternion, { x: 0, y: 0, z: -1 });
    return (local.x / -local.z) / horizontalTangent;
  };
  const midway = sampleShotCamera(project, shot, 1, samples);
  const arrived = sampleShotCamera(project, shot, 2, samples);
  assert.ok(Math.abs(projectedX(midway.quaternion) - (-1 / 6)) < 0.0001);
  assert.ok(Math.abs(projectedX(arrived.quaternion) - (-1 / 3)) < 0.000001);
});

test("an explicit same-state keyframe holds without turning and without resetting tracking", () => {
  const chestSmooth = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "center",
    trackingResponse: 0.35,
  };
  const headSmooth = { ...chestSmooth, anchor: "head" };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "start", time: 0, ...basePose, aim: chestSmooth },
      { id: "hold", time: 2, ...basePose, aim: chestSmooth },
      { id: "head", time: 4, ...basePose, aim: headSmooth },
    ],
    outTime: 4,
  });
  const { project, shot } = makeMovingProject(track);
  const during = sampleShotCamera(project, shot, 1);
  const beforeC = sampleShotCamera(project, shot, 1.999);
  const atC = sampleShotCamera(project, shot, 2);
  const duringTurn = sampleShotCamera(project, shot, 3);
  const arrived = sampleShotCamera(project, shot, 4);

  assert.equal(during.aimEvaluation.transition, null);
  assert.equal(describeCameraAimTransition(track, 1), null);
  assert.ok(
    quaternionAngleBetween(beforeC.quaternion, atC.quaternion) < 0.001,
    "a same-state keyframe must not snap the damped orientation to exact"
  );
  assert.equal(duringTurn.aimEvaluation.transition.fromKeyframeID, "hold");
  assert.equal(duringTurn.aimEvaluation.blendProgress, 0.5);
  const actorAt4 = sampleProject(project, 4).get("actor-1").position;
  const expectedHead = lookAtQuaternion(
    basePose.position,
    { x: actorAt4.x, y: actorAt4.y + 1.62, z: actorAt4.z },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.ok(quaternionAngleBetween(arrived.quaternion, expectedHead) < 0.000001);
  const described = describeCameraAimTransition(track, 3);
  assert.equal(described.fromAim.anchor, "chest");
  assert.equal(described.toAim.anchor, "head");
  assert.equal(described.progress, 0.5);
});

test("a smooth hold feeds its lag into the transition without snapping, and B is exact", () => {
  const chestSmooth = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "center",
    trackingResponse: 0.35,
  };
  const headSmooth = { ...chestSmooth, anchor: "head" };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "start", time: 0, ...basePose, aim: chestSmooth },
      { id: "hold", time: 2, ...basePose, aim: chestSmooth },
      { id: "head", time: 3, ...basePose, aim: headSmooth },
      { id: "end", time: 5, ...basePose, aim: null },
    ],
    outTime: 5,
  });
  const { project, shot } = makeMovingProject(track);
  const actorAt1999 = sampleProject(project, 1.999).get("actor-1").position;
  const exactBeforeTurn = lookAtQuaternion(
    basePose.position,
    { x: actorAt1999.x, y: actorAt1999.y + 1.18, z: actorAt1999.z },
    basePose.focalLength,
    "16:9",
    "center"
  );
  const holdEnd = sampleShotCamera(project, shot, 1.999);
  assert.ok(
    quaternionAngleBetween(holdEnd.quaternion, exactBeforeTurn) > 0.001,
    "the smooth hold must still lag while the actor moves"
  );
  const atTurnStart = sampleShotCamera(project, shot, 2);
  assert.ok(
    quaternionAngleBetween(holdEnd.quaternion, atTurnStart.quaternion) < 0.001,
    "the transition must absorb the visible lag without snapping"
  );
  const arrived = sampleShotCamera(project, shot, 3);
  const actorAt3 = sampleProject(project, 3).get("actor-1").position;
  const expectedHead = lookAtQuaternion(
    basePose.position,
    { x: actorAt3.x, y: actorAt3.y + 1.62, z: actorAt3.z },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.ok(
    quaternionAngleBetween(arrived.quaternion, expectedHead) < 0.000001,
    "B must be exactly locked even with continuous-smooth tracking"
  );
  const later = sampleShotCamera(project, shot, 3.5);
  const actorAt35 = sampleProject(project, 3.5).get("actor-1").position;
  const exactLater = lookAtQuaternion(
    basePose.position,
    { x: actorAt35.x, y: actorAt35.y + 1.62, z: actorAt35.z },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.ok(
    quaternionAngleBetween(later.quaternion, exactLater) > 0.0001,
    "continuous tracking lag resumes only after B"
  );
});

test("inheriting keyframes never interrupt a transition", () => {
  const headAim = { mode: "look-at", targetActorID: "actor-1", anchor: "head", composition: "center" };
  const buildTrack = (withMiddle) => createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "free", time: 0, ...basePose },
      ...(withMiddle ? [{ id: "mid", time: 2, ...basePose, aim: null }] : []),
      { id: "head", time: 4, ...basePose, aim: headAim },
    ],
    outTime: 4,
  });
  const plain = makeProject(buildTrack(false));
  const inherited = makeProject(buildTrack(true));
  const plainMid = sampleShotCamera(plain.project, plain.shot, 2);
  const inheritedMid = sampleShotCamera(inherited.project, inherited.shot, 2);
  assert.deepEqual(inheritedMid.quaternion, plainMid.quaternion);
  assert.equal(inheritedMid.aimEvaluation.blendProgress, 0.5);
  assert.equal(inheritedMid.aimEvaluation.transition.fromKeyframeID, "free");
  assert.equal(inheritedMid.aimEvaluation.transition.toKeyframeID, "head");
});

test("free-to-free keyframes stay on ordinary track interpolation even with a later Lock", () => {
  const rotated = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  const headAim = { mode: "look-at", targetActorID: "actor-1", anchor: "head", composition: "center" };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "a", time: 0, ...basePose },
      { id: "b", time: 2, ...basePose, quaternion: rotated, aim: { mode: "free" } },
      { id: "lock", time: 4, ...basePose, aim: headAim },
    ],
    outTime: 4,
  });
  const { project, shot } = makeProject(track);
  const atOne = sampleShotCamera(project, shot, 1);
  const baseAtOne = sampleCameraTrack(track, 1);
  assert.deepEqual(atOne.quaternion, baseAtOne.quaternion);
  assert.equal(atOne.aimEvaluation.transition, null);
  const duringTurn = sampleShotCamera(project, shot, 3);
  assert.ok(duringTurn.aimEvaluation.transition);
  assert.notDeepEqual(duringTurn.quaternion, sampleCameraTrack(track, 3).quaternion);
});

test("a response-only smooth-to-exact change catches up before B without a pop", () => {
  const smoothAim = {
    mode: "look-at",
    targetActorID: "actor-1",
    anchor: "chest",
    composition: "center",
    trackingResponse: 0.35,
  };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "smooth", time: 0, ...basePose, aim: smoothAim },
      { id: "exact", time: 2, ...basePose, aim: { ...smoothAim, trackingResponse: 0 } },
      { id: "end", time: 4, ...basePose, aim: null },
    ],
    outTime: 4,
  });
  const { project, shot } = makeMovingProject(track);
  const actorAt2 = sampleProject(project, 2).get("actor-1").position;
  const expectedExact = lookAtQuaternion(
    basePose.position,
    { x: actorAt2.x, y: actorAt2.y + 1.18, z: actorAt2.z },
    basePose.focalLength,
    "16:9",
    "center"
  );
  const midway = sampleShotCamera(project, shot, 1);
  const actorAt1 = sampleProject(project, 1).get("actor-1").position;
  const expectedMidExact = lookAtQuaternion(
    basePose.position,
    { x: actorAt1.x, y: actorAt1.y + 1.18, z: actorAt1.z },
    basePose.focalLength,
    "16:9",
    "center"
  );
  const before = sampleShotCamera(project, shot, 1.999);
  const atChange = sampleShotCamera(project, shot, 2);
  assert.ok(
    quaternionAngleBetween(midway.quaternion, expectedMidExact) > 0.0001,
    "the A response must still contribute lag before the catch-up completes"
  );
  assert.equal(midway.aimEvaluation.transition.kind, "tracking-catchup");
  assert.ok(
    quaternionAngleBetween(before.quaternion, atChange.quaternion) < 0.001,
    "smooth-to-exact must converge before B instead of popping on the B frame"
  );
  assert.deepEqual(atChange.quaternion, expectedExact);
  assert.equal(atChange.aimEvaluation.transition, null);
  const after = sampleShotCamera(project, shot, 2.2);
  const actorAfter = sampleProject(project, 2.2).get("actor-1").position;
  const expectedAfter = lookAtQuaternion(
    basePose.position,
    { x: actorAfter.x, y: actorAfter.y + 1.18, z: actorAfter.z },
    basePose.focalLength,
    "16:9",
    "center"
  );
  assert.deepEqual(after.quaternion, expectedAfter);

  const directFixture = makeMovingProject(track);
  const sequentialFixture = makeMovingProject(track);
  const directCatchup = sampleShotCamera(directFixture.project, directFixture.shot, 1.75);
  for (let time = 0; time <= 1.75; time += 1 / 30) {
    sampleShotCamera(sequentialFixture.project, sequentialFixture.shot, time);
  }
  const sequentialCatchup = sampleShotCamera(sequentialFixture.project, sequentialFixture.shot, 1.75);
  assert.deepEqual(sequentialCatchup, directCatchup);

  const smootherTrack = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "smooth", time: 0, ...basePose, aim: smoothAim },
      { id: "smoother", time: 2, ...basePose, aim: { ...smoothAim, trackingResponse: 0.6 } },
      { id: "end", time: 4, ...basePose, aim: null },
    ],
    outTime: 4,
  });
  const smoother = makeMovingProject(smootherTrack);
  const gapBefore = sampleShotCamera(smoother.project, smoother.shot, 1.999);
  const gapAt = sampleShotCamera(smoother.project, smoother.shot, 2);
  assert.ok(
    quaternionAngleBetween(gapBefore.quaternion, gapAt.quaternion) < 0.001,
    "changing between two positive responses must stay continuous"
  );
});

test("legacy blendDuration data is readable but inert", () => {
  const buildTrack = (blendDuration) => createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "free", time: 0, ...basePose },
      {
        id: "look",
        time: 2,
        ...basePose,
        aim: {
          mode: "look-at",
          targetActorID: "actor-1",
          anchor: "chest",
          composition: "center",
          blendDuration,
        },
      },
    ],
    outTime: 2,
  });
  const first = makeProject(buildTrack(0));
  const second = makeProject(buildTrack(5));
  for (const time of [0.5, 1, 1.5, 2]) {
    assert.deepEqual(
      sampleShotCamera(second.project, second.shot, time).quaternion,
      sampleShotCamera(first.project, first.shot, time).quaternion
    );
  }
});

test("chained transitions hand off exactly at their shared keyframe", () => {
  const chestAim = { mode: "look-at", targetActorID: "actor-1", anchor: "chest", composition: "center" };
  const headAim = { ...chestAim, anchor: "head" };
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "free", time: 0, ...basePose },
      { id: "chest", time: 2, ...basePose, aim: chestAim },
      { id: "head", time: 4, ...basePose, aim: headAim },
    ],
    outTime: 4,
  });
  const { project, shot } = makeProject(track);
  const samples = new Map([["actor-1", { position: { x: 0, y: 0, z: 0 } }]]);
  const expectedChest = lookAtQuaternion(
    basePose.position,
    { x: 0, y: 1.18, z: 0 },
    basePose.focalLength,
    "16:9",
    "center"
  );
  const expectedHead = lookAtQuaternion(
    basePose.position,
    { x: 0, y: 1.62, z: 0 },
    basePose.focalLength,
    "16:9",
    "center"
  );
  const beforeChest = sampleShotCamera(project, shot, 1.999, samples);
  const atChest = sampleShotCamera(project, shot, 2, samples);
  const beforeHead = sampleShotCamera(project, shot, 3.999, samples);
  const atHead = sampleShotCamera(project, shot, 4, samples);

  assert.ok(
    quaternionAngleBetween(beforeChest.quaternion, atChest.quaternion) < 0.001,
    "the shared keyframe must be continuous from both transitions"
  );
  assert.ok(
    quaternionAngleBetween(atChest.quaternion, expectedChest) < 0.000001,
    "the shared keyframe arrives exactly at the chest state"
  );
  assert.equal(atChest.aimEvaluation.blendProgress, 0);
  assert.equal(atChest.aimEvaluation.transition.fromKeyframeID, "chest");
  assert.ok(quaternionAngleBetween(atHead.quaternion, expectedHead) < 0.000001);
  assert.ok(quaternionAngleBetween(beforeHead.quaternion, atHead.quaternion) < 0.001);
});

test("sampleShotCamera and applyCameraAim agree mid-transition", () => {
  const track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "free", time: 0, ...basePose },
      {
        id: "head",
        time: 4,
        ...basePose,
        aim: { mode: "look-at", targetActorID: "actor-1", anchor: "head", composition: "left-third" },
      },
    ],
    outTime: 4,
  });
  const { project, shot } = makeMovingProject(track);
  const elapsed = 2.3;
  const samples = sampleProject(project, elapsed);
  const viaShot = sampleShotCamera(project, shot, elapsed, samples);
  const pose = sampleCameraTrack(shot.camera.track, elapsed);
  const viaApply = applyCameraAim(project, shot, pose, elapsed, samples);
  assert.deepEqual(viaShot.quaternion, viaApply.quaternion);
  assert.deepEqual(viaShot.aimEvaluation.transition, viaApply.aimEvaluation.transition);
});

test("direct seeks and sequential playback agree across a keyframed turn", () => {
  const buildFixture = () => makeMovingProject(createCameraTrack({
    interpolation: "linear",
    keyframes: [
      { id: "free", time: 0, ...basePose },
      {
        id: "head",
        time: 3,
        ...basePose,
        aim: {
          mode: "look-at",
          targetActorID: "actor-1",
          anchor: "head",
          composition: "center",
          trackingResponse: 0.35,
        },
      },
      { id: "end", time: 5, ...basePose, aim: null },
    ],
    outTime: 5,
  }));
  const direct = buildFixture();
  const sequential = buildFixture();
  for (const elapsed of [1.5, 2.99, 3, 3.5]) {
    const directResult = sampleShotCamera(direct.project, direct.shot, elapsed);
    for (let time = 0; time <= elapsed; time += 1 / 30) {
      sampleShotCamera(sequential.project, sequential.shot, time);
    }
    const sequentialResult = sampleShotCamera(sequential.project, sequential.shot, elapsed);
    assert.deepEqual(sequentialResult, directResult);
  }
});

const angleGap = (left, right) => Math.abs(((left - right + 540) % 360) - 180);

test("a stored camera pose survives the trip to three angles and back", () => {
  const cases = [
    { pitch: 0, yaw: 0, roll: 0 },
    { pitch: -20.3, yaw: -34, roll: 5 },
    { pitch: 45, yaw: 120, roll: -30 },
    { pitch: -60, yaw: -170, roll: 0 },
    { pitch: 12.5, yaw: 179.5, roll: 90 },
  ];
  for (const authored of cases) {
    const restored = cameraRotationDegrees(cameraQuaternionFromRotationDegrees(authored));
    for (const axis of ["pitch", "yaw", "roll"]) {
      assert.ok(
        angleGap(restored[axis], authored[axis]) < 0.001,
        `${axis} drifted: ${restored[axis]} vs ${authored[axis]}`
      );
    }
  }
});

test("the identity quaternion reads as three zeroes", () => {
  assert.deepEqual(
    cameraRotationDegrees({ x: 0, y: 0, z: 0, w: 1 }),
    { pitch: 0, yaw: 0, roll: 0 }
  );
});

test("roll stays independent of pitch and yaw", () => {
  // 这是拆法的整个理由：改翻滚不能把俯仰/水平带跑。
  const base = { pitch: -25, yaw: 40, roll: 0 };
  for (const roll of [-90, -12, 0, 33, 90]) {
    const rotation = cameraRotationDegrees(
      cameraQuaternionFromRotationDegrees({ ...base, roll })
    );
    assert.ok(angleGap(rotation.pitch, base.pitch) < 0.001);
    assert.ok(angleGap(rotation.yaw, base.yaw) < 0.001);
    assert.ok(angleGap(rotation.roll, roll) < 0.001);
  }
});

test("pitch is held short of straight up, where yaw cannot be decomposed", () => {
  for (const pitch of [90, 120, -90, -180]) {
    const rotation = cameraRotationDegrees(
      cameraQuaternionFromRotationDegrees({ pitch, yaw: 30, roll: 0 })
    );
    assert.ok(Math.abs(rotation.pitch) < 90, `pitch ${rotation.pitch} reached the pole`);
    assert.ok(angleGap(rotation.yaw, 30) < 0.001, `yaw was lost at pitch ${pitch}`);
  }
});

test("the optical roll helper agrees with the three-angle reading", () => {
  const quaternion = cameraQuaternionFromRotationDegrees({ pitch: 15, yaw: -75, roll: 22 });
  assert.ok(
    angleGap(cameraOpticalRollDegrees(quaternion), cameraRotationDegrees(quaternion).roll) < 1e-9
  );
});


test("recorded free key bounds the next lock transition until explicitly inherited", () => {
  let track = recordCameraKeyframe(createCameraTrack(), basePose, 0);
  const middlePose = { ...basePose, quaternion: cameraQuaternionFromRotationDegrees({ yaw: 35, pitch: 0, roll: 0 }) };
  track = recordCameraKeyframe(track, middlePose, 3);
  track = recordCameraKeyframe(track, basePose, 5);
  track = updateCameraKeyframeAim(track, track.keyframes[2].id, {
    mode: "look-at", targetKind: "world", worldPosition: { x: 3, y: 2, z: 0 },
  });
  assert.equal(describeCameraAimTransition(track, 2), null);
  assert.equal(describeCameraAimTransition(track, 4).fromKeyframeID, track.keyframes[1].id);
  const { project, shot } = makeProject(track);
  assert.deepEqual(sampleShotCamera(project, shot, 2).quaternion, sampleCameraTrack(track, 2).quaternion);
  track = updateCameraKeyframeAim(track, track.keyframes[1].id, null);
  assert.equal(describeCameraAimTransition(track, 2).fromKeyframeID, track.keyframes[0].id);
  assert.equal(describeCameraAimTransition(track, 4).toKeyframeID, track.keyframes[2].id);
});
