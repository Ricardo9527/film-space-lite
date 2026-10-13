import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCameraFocusTracking,
  cameraFocusTargetPosition,
  effectiveCameraFocusTrackingState,
} from "../app/camera-focus-tracking.js";
import { createCameraTrack } from "../app/camera-track.js";

const pose = {
  position: { x: 0, y: 1, z: 6 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  focalLength: 35,
  focusDistance: 4,
  aperture: 2.8,
};

function projectWithFocus(focusTracking, extras = {}) {
  const track = createCameraTrack({
    keyframes: [
      { id: "key-1", time: 0, ...pose, focusTracking },
      { id: "key-2", time: 2, ...pose, focusTracking: null },
    ],
    outTime: 2,
  });
  const shot = { id: "shot-1", camera: { track } };
  return {
    shot,
    project: {
      scene: {
        actors: extras.actors || [],
        blockout: extras.blockout || { visible: true, groups: [] },
        environment: extras.environment || { visual: null },
        shots: [shot],
      },
    },
  };
}

test("focus tracking is a reached state inherited until another explicit keyframe", () => {
  const { shot } = projectWithFocus({
    enabled: true,
    targetKind: "world",
    worldPosition: { x: 0, y: 1, z: 0 },
  });
  const state = effectiveCameraFocusTrackingState(shot.camera.track, 1.5);
  assert.equal(state.focusTracking.enabled, true);
  assert.equal(state.keyframe.id, "key-1");
});

test("actor focus uses stable normalized body height and follows actor motion", () => {
  const actor = {
    id: "actor-1",
    visible: true,
    scale: 1,
  };
  const { project, shot } = projectWithFocus({
    enabled: true,
    targetKind: "actor",
    targetActorID: actor.id,
    actorHeight: 1,
  }, { actors: [actor] });
  const actorSamples = new Map([[actor.id, { position: { x: 0, y: 0, z: -2 } }]]);
  const result = applyCameraFocusTracking(project, shot, pose, 1, actorSamples);
  assert.equal(result.focusTrackingEvaluation.valid, true);
  assert.equal(result.focusDistance, 8);
  assert.deepEqual(result.focusTrackingEvaluation.targetPosition, { x: 0, y: 1.62, z: -2 });
});

test("focus distance is optical-axis depth rather than ray length", () => {
  const { project, shot } = projectWithFocus({
    enabled: true,
    targetKind: "world",
    worldPosition: { x: 4, y: 1, z: 0 },
  });
  const result = applyCameraFocusTracking(project, shot, pose, 1);
  assert.equal(result.focusDistance, 6);
});

test("blockout local points follow nested object and group transforms", () => {
  const group = {
    id: "group-1",
    visible: true,
    position: { x: 10, y: 0, z: 0 },
    rotationY: Math.PI / 2,
    scale: 2,
    objects: [{
      id: "object-1",
      visible: true,
      position: { x: 1, y: 0, z: 0 },
      rotationY: 0,
      scale: 3,
    }],
  };
  const target = cameraFocusTargetPosition({
    scene: { blockout: { visible: true, groups: [group] } },
  }, null, {
    enabled: true,
    targetKind: "blockout",
    blockoutGroupID: group.id,
    blockoutObjectID: group.objects[0].id,
    localPosition: { x: 1, y: 0, z: 0 },
  });
  assert.ok(Math.abs(target.position.x - 10) < 1e-9);
  assert.ok(Math.abs(target.position.z + 8) < 1e-9);
});

test("environment local points follow durable transform", () => {
  const target = cameraFocusTargetPosition({
    scene: {
      environment: {
        visuals: [{
          id: "environment-focus-01",
          visible: true,
          transform: {
            position: { x: 1, y: 2, z: 3 },
            quaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
            uniformScale: 2,
          },
        }],
      },
    },
  }, null, {
    enabled: true,
    targetKind: "environment",
    environmentID: "environment-focus-01",
    localPosition: { x: 0, y: 0, z: -1 },
  });
  assert.ok(Math.abs(target.position.x + 1) < 1e-9);
  assert.equal(target.position.y, 2);
  assert.ok(Math.abs(target.position.z - 3) < 1e-9);
});

test("grouped environment focus follows the effective world transform and group visibility", () => {
  const project = {
    scene: {
      environment: {
        groups: [{
          id: "environment-group-01",
          visible: true,
          transform: {
            position: { x: 5, y: 0, z: 0 },
            quaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
            uniformScale: 2,
          },
        }],
        visuals: [{
          id: "environment-focus-01",
          groupID: "environment-group-01",
          visible: true,
          transform: {
            position: { x: 1, y: 0, z: 0 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            uniformScale: 1,
          },
        }],
      },
    },
  };
  const focusTracking = {
    enabled: true,
    targetKind: "environment",
    environmentID: "environment-focus-01",
    localPosition: { x: 0, y: 0, z: -1 },
  };
  const target = cameraFocusTargetPosition(project, null, focusTracking);
  assert.ok(Math.abs(target.position.x - 3) < 1e-9);
  assert.equal(target.position.y, 0);
  assert.ok(Math.abs(target.position.z + 2) < 1e-9);

  project.scene.environment.groups[0].visible = false;
  const hidden = cameraFocusTargetPosition(project, null, focusTracking);
  assert.equal(hidden.position, null);
  assert.match(hidden.warning, /不可用/);
});

test("missing targets keep the authored distance and expose a warning", () => {
  const { project, shot } = projectWithFocus({
    enabled: true,
    targetKind: "actor",
    targetActorID: "deleted-actor",
    actorHeight: 0.7,
  });
  const result = applyCameraFocusTracking(project, shot, pose, 1, new Map());
  assert.equal(result.focusDistance, pose.focusDistance);
  assert.equal(result.focusTrackingEvaluation.valid, false);
  assert.match(result.focusTrackingEvaluation.warning, /保持最后写入/);
});
