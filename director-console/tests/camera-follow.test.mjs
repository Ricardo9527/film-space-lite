import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCameraFollow,
  effectiveCameraFollowState,
  normalizeCameraFollow,
} from "../app/camera-follow.js";
import { updateShotCameraFollowPreservingPosition } from "../app/camera-authoring.js";
import { sampleShotCamera } from "../app/camera-aim.js";
import { createCameraTrack } from "../app/camera-track.js";
import { sampleProject } from "../app/playback-engine.js";
import {
  addActor,
  addMoveAction,
  addShot,
  createDesktopProject,
  findShot,
  moveShotCameraKeyframe,
  recordShotCameraKeyframe,
  updateMotionAction,
  updateShotCameraKeyframeFollow,
} from "../app/project-model.js";

const basePose = {
  position: { x: 0, y: 2, z: -4 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  focalLength: 35,
};

function fixture(follow = {}) {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 1, y: 0, z: 2 },
    rotationY: 0,
  });
  project = addShot(project, { cameraPose: basePose, follow });
  return { project, shot: findShot(project) };
}

test("Follow adds target world translation and ignores target rotation", () => {
  const { project, shot } = fixture({
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 0,
  });
  const turnedInPlace = applyCameraFollow(
    project,
    shot,
    basePose,
    2,
    new Map([["actor-1", {
      position: { x: 1, y: 0, z: 2 },
      rotationY: Math.PI,
    }]])
  );
  assert.deepEqual(turnedInPlace.position, basePose.position);

  const translated = applyCameraFollow(
    project,
    shot,
    basePose,
    2,
    new Map([["actor-1", {
      position: { x: 4, y: 1, z: -1 },
      rotationY: -Math.PI / 2,
    }]])
  );
  assert.deepEqual(translated.position, { x: 3, y: 3, z: -7 });
  assert.deepEqual(translated.quaternion, basePose.quaternion);
  assert.equal(translated.focalLength, basePose.focalLength);
  assert.deepEqual(translated.followEvaluation.translation, { x: 3, y: 1, z: -3 });
});

test("Follow reference time preserves the current camera position without a jump", () => {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 6, y: 0, z: 0 }, { speed: 1 });
  project = addShot(project, { cameraPose: basePose, follow: {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 2,
  } });

  assert.deepEqual(sampleShotCamera(project, findShot(project), 2).position, basePose.position);
  assert.deepEqual(sampleShotCamera(project, findShot(project), 4).position, {
    ...basePose.position,
    x: 2,
  });
});

test("authored camera motion remains additive while Follow is active", () => {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 6, y: 0, z: 0 }, { speed: 1 });
  project = addShot(project, { cameraPose: basePose });
  const shot = findShot(project);
  shot.camera.track = createCameraTrack({
    interpolation: "linear",
    keyframes: [
      {
        id: "key-1",
        time: 0,
        ...basePose,
        follow: {
          enabled: true,
          targetActorID: "actor-1",
          referenceTime: 0,
        },
      },
      {
        id: "key-2",
        time: 4,
        ...basePose,
        position: { x: 0, y: 4, z: -8 },
      },
    ],
  });
  const sampled = sampleShotCamera(project, findShot(project), 4);
  const actorAtFour = sampleProject(project, 4).get("actor-1").position;
  assert.deepEqual(sampled.position, { x: actorAtFour.x, y: 4, z: -8 });
});

test("disabling Follow at a keyframe keeps the current world position", () => {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 6, y: 0, z: 0 }, { speed: 1 });
  project = addShot(project, { cameraPose: basePose, follow: {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 0,
  } });
  const shotID = findShot(project).id;
  project = recordShotCameraKeyframe(project, shotID, basePose, 4, 30);
  const keyframe = findShot(project).camera.track.keyframes.at(-1);
  const authoredPosition = structuredClone(keyframe.position);
  const incomingBefore = sampleShotCamera(project, findShot(project), 3.5);
  const before = sampleShotCamera(project, findShot(project), 4);

  const changed = updateShotCameraFollowPreservingPosition(
    project,
    shotID,
    keyframe.id,
    { enabled: false }
  );
  project = changed.project;
  const after = sampleShotCamera(project, findShot(project), 4);

  assert.deepEqual(after.position, before.position);
  assert.equal(after.followEvaluation.enabled, false);
  assert.deepEqual(after.followEvaluation.continuityOffset, {
    x: sampleProject(project, 4).get("actor-1").position.x,
    y: 0,
    z: 0,
  });
  assert.deepEqual(findShot(project).camera.track.keyframes.at(-1).position, authoredPosition);
  assert.deepEqual(sampleShotCamera(project, findShot(project), 3.5).position, incomingBefore.position);

  project = moveShotCameraKeyframe(project, shotID, keyframe.id, 2, 30);
  const movedBoundary = sampleShotCamera(project, findShot(project), 2);
  assert.deepEqual(movedBoundary.followEvaluation.continuityOffset, {
    x: sampleProject(project, 2).get("actor-1").position.x,
    y: 0,
    z: 0,
  });

  const moveID = project.scene.actors[0].motionActions.find((action) => action.kind === "move").id;
  project = updateMotionAction(project, "actor-1", moveID, { speed: 2 });
  const changedActorBoundary = sampleShotCamera(project, findShot(project), 2);
  assert.deepEqual(changedActorBoundary.followEvaluation.continuityOffset, {
    x: sampleProject(project, 2).get("actor-1").position.x,
    y: 0,
    z: 0,
  });
});

test("changing legacy first-key Follow preserves its visible start pose", () => {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 6, y: 0, z: 0 }, { speed: 1 });
  project = addShot(project, { cameraPose: basePose, follow: {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 2,
  } });
  const shot = findShot(project);
  const keyframe = shot.camera.track.keyframes[0];
  const before = sampleShotCamera(project, shot, 0);

  const changed = updateShotCameraFollowPreservingPosition(
    project,
    shot.id,
    keyframe.id,
    { enabled: false }
  );

  assert.equal(changed.preservedPosition, true);
  assert.deepEqual(changed.sampledPose.position, before.position);
});

test("Follow can begin at a later keyframe and is inherited by later pose keys", () => {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 6, y: 0, z: 0 }, { speed: 1 });
  project = addShot(project, { cameraPose: basePose });
  const shotID = findShot(project).id;
  project = recordShotCameraKeyframe(project, shotID, basePose, 2, 30);
  project = recordShotCameraKeyframe(project, shotID, basePose, 4, 30);
  const activation = findShot(project).camera.track.keyframes[1];
  project = updateShotCameraKeyframeFollow(project, shotID, activation.id, {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: activation.time,
  });
  const track = findShot(project).camera.track;

  assert.equal(effectiveCameraFollowState(track, 1).follow.enabled, false);
  assert.equal(effectiveCameraFollowState(track, 3).keyframe.id, activation.id);
  assert.equal(track.keyframes[2].follow, null);
  assert.deepEqual(sampleShotCamera(project, findShot(project), 2).position, basePose.position);
  assert.deepEqual(sampleShotCamera(project, findShot(project), 4).position, {
    ...basePose.position,
    x: 2,
  });
});

test("restoring inherited Follow keeps the switch keyframe world position", () => {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 6, y: 0, z: 0 }, { speed: 1 });
  project = addShot(project, { cameraPose: basePose, follow: {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 0,
  } });
  const shotID = findShot(project).id;
  project = recordShotCameraKeyframe(project, shotID, basePose, 4, 30);
  const keyframe = findShot(project).camera.track.keyframes.at(-1);
  const originalPosition = structuredClone(keyframe.position);
  project = updateShotCameraFollowPreservingPosition(
    project,
    shotID,
    keyframe.id,
    { enabled: false }
  ).project;
  const beforeInherit = sampleShotCamera(project, findShot(project), 4);

  const inherited = updateShotCameraFollowPreservingPosition(
    project,
    shotID,
    keyframe.id,
    null
  );

  assert.deepEqual(inherited.sampledPose.position, beforeInherit.position);
  assert.equal(effectiveCameraFollowState(findShot(inherited.project).camera.track, 4).follow.enabled, true);
  assert.equal(inherited.keyframe.follow, null);
  assert.deepEqual(inherited.keyframe.position, originalPosition);
});

test("retargeting Follow at a keyframe preserves position and follows the new actor afterward", () => {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addActor(project, {
    id: "actor-2",
    position: { x: 10, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 6, y: 0, z: 0 }, { speed: 1 });
  project = addMoveAction(project, "actor-2", { x: 10, y: 0, z: 6 }, { speed: 1 });
  project = addShot(project, { cameraPose: basePose, follow: {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 0,
  } });
  const shotID = findShot(project).id;
  project = recordShotCameraKeyframe(project, shotID, basePose, 4, 30);
  const keyframe = findShot(project).camera.track.keyframes.at(-1);
  const before = sampleShotCamera(project, findShot(project), 4);

  const retargeted = updateShotCameraFollowPreservingPosition(
    project,
    shotID,
    keyframe.id,
    {
      enabled: true,
      targetActorID: "actor-2",
      referenceTime: 4,
    }
  );

  assert.deepEqual(retargeted.sampledPose.position, before.position);
  assert.equal(retargeted.keyframe.follow.targetActorID, "actor-2");
  const actorTwoAtFour = sampleProject(retargeted.project, 4).get("actor-2").position;
  const actorTwoAtSix = sampleProject(retargeted.project, 6).get("actor-2").position;
  assert.deepEqual(sampleShotCamera(retargeted.project, findShot(retargeted.project), 6).position, {
    x: before.position.x + actorTwoAtSix.x - actorTwoAtFour.x,
    y: before.position.y + actorTwoAtSix.y - actorTwoAtFour.y,
    z: before.position.z + actorTwoAtSix.z - actorTwoAtFour.z,
  });
});

test("a missing Follow target falls back to the authored camera track with a warning", () => {
  const { project, shot } = fixture({
    enabled: true,
    targetActorID: "missing",
    referenceTime: 3,
  });
  const sampled = applyCameraFollow(project, shot, basePose, 5, new Map());
  assert.deepEqual(sampled.position, basePose.position);
  assert.equal(sampled.followEvaluation.valid, false);
  assert.match(sampled.followEvaluation.warning, /目标不可用/);
});

test("minimal Follow normalization drops advanced rig fields safely", () => {
  assert.deepEqual(normalizeCameraFollow({
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: Number.POSITIVE_INFINITY,
    placement: "front",
    distance: 12,
    height: 4,
    smoothness: 0.45,
    keepCurrentAzimuth: 1.5,
  }), {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 0,
  });
});

test("Follow position is applied before Look At orientation on the shared Shot sampler", () => {
  const { project, shot } = fixture({
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 0,
  });
  shot.camera.track = createCameraTrack({
    keyframes: [{
      id: "key-1",
      time: 0,
      ...basePose,
      follow: {
        enabled: true,
        targetActorID: "actor-1",
        referenceTime: 0,
      },
      aim: {
        mode: "look-at",
        targetActorID: "actor-1",
        anchor: "chest",
        composition: "center",
        blendDuration: 0,
        trackingResponse: 0,
      },
    }],
  });
  const samples = new Map([["actor-1", {
    position: { x: 3, y: 0, z: 2 },
    rotationY: Math.PI,
  }]]);
  const sampled = sampleShotCamera(project, shot, 0, samples);
  assert.deepEqual(sampled.position, { x: 2, y: 2, z: -4 });
  assert.equal(sampled.followEvaluation.valid, true);
  assert.equal(sampled.aimEvaluation.valid, true);
  assert.notDeepEqual(sampled.quaternion, basePose.quaternion);
});
