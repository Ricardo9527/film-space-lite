import test from "node:test";
import assert from "node:assert/strict";

import { stageShotCameraKeyframe } from "../app/camera-authoring.js";
import {
  cameraOpticalRollDegrees,
  lookAtQuaternion,
  sampleShotCamera,
  setCameraOpticalRollDegrees,
} from "../app/camera-aim.js";
import { sampleCameraTrack } from "../app/camera-track.js";
import { ProjectStateStore } from "../app/project-state-store.js";
import { sampleProject } from "../app/playback-engine.js";
import {
  addActor,
  addShot,
  createDesktopProject,
  findShot,
  recordShotCameraKeyframe,
  setShotCameraInterpolation,
  updateShotCameraKeyframeAim,
} from "../app/project-model.js";

const startPose = {
  position: { x: 0, y: 1.18, z: 6 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  focalLength: 35,
};

function quaternionAngleBetween(left, right) {
  const dot = Math.abs(
    left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w
  );
  return 2 * Math.acos(Math.min(dot, 1));
}

test("staged camera movement uses the final smooth Lock sampler before Record", () => {
  let project = addActor(createDesktopProject());
  const actorID = project.scene.actors[0].id;
  project = addShot(project, { cameraPose: startPose });
  const shotID = findShot(project).id;
  const startKeyframeID = findShot(project).camera.track.keyframes[0].id;
  project = updateShotCameraKeyframeAim(project, shotID, startKeyframeID, {
    mode: "look-at",
    targetActorID: actorID,
    anchor: "chest",
    composition: "center",
    blendDuration: 0,
    trackingResponse: 0.6,
  });
  project = recordShotCameraKeyframe(project, shotID, {
    ...startPose,
    position: { ...startPose.position, x: 4 },
  }, 4, 30);
  project = setShotCameraInterpolation(project, shotID, "linear");

  const elapsed = 2;
  const shot = findShot(project, shotID);
  const samples = sampleProject(project, elapsed);
  const beforeInput = sampleShotCamera(project, shot, elapsed, samples);
  const authoredAtPlayhead = sampleCameraTrack(shot.camera.track, elapsed);
  const staged = stageShotCameraKeyframe(project, shotID, {
    ...authoredAtPlayhead,
    position: { ...authoredAtPlayhead.position, x: authoredAtPlayhead.position.x + 0.01 },
  }, elapsed, 30, samples);

  assert.ok(staged);
  assert.ok(
    quaternionAngleBetween(beforeInput.quaternion, staged.sampledPose.quaternion) < 0.01,
    "the first movement step must not replace smooth Lock with an exact Look At snap"
  );
  const exactQuaternion = lookAtQuaternion(
    staged.sampledPose.position,
    { x: 0, y: 1.18, z: 0 },
    staged.sampledPose.focalLength,
    "16:9",
    "center"
  );
  assert.ok(
    quaternionAngleBetween(staged.sampledPose.quaternion, exactQuaternion) > 0.05,
    "the staged preview must retain the authored temporal tracking response"
  );

  const committedProject = new ProjectStateStore(project).commit(staged.project);
  const committedShot = findShot(committedProject, shotID);
  const committedPose = sampleShotCamera(
    committedProject,
    committedShot,
    elapsed,
    sampleProject(committedProject, elapsed)
  );
  assert.deepEqual(committedPose, staged.sampledPose);
});

test("staged Roll remains authored while Look At owns pitch and yaw", () => {
  let project = addActor(createDesktopProject());
  const actorID = project.scene.actors[0].id;
  project = addShot(project, { cameraPose: startPose });
  const shotID = findShot(project).id;
  const keyframeID = findShot(project).camera.track.keyframes[0].id;
  project = updateShotCameraKeyframeAim(project, shotID, keyframeID, {
    mode: "look-at",
    targetActorID: actorID,
    anchor: "chest",
    composition: "left-third",
    trackingResponse: 0.35,
  });
  const authored = sampleCameraTrack(findShot(project).camera.track, 0);
  const staged = stageShotCameraKeyframe(project, shotID, {
    ...authored,
    quaternion: setCameraOpticalRollDegrees(authored.quaternion, 28),
  }, 0, 30, sampleProject(project, 0));

  assert.ok(staged);
  assert.ok(Math.abs(cameraOpticalRollDegrees(staged.keyframe.quaternion) - 28) < 0.000001);
  assert.ok(Math.abs(cameraOpticalRollDegrees(staged.sampledPose.quaternion) - 28) < 0.000001);
  const committed = new ProjectStateStore(project).commit(staged.project);
  const outputPose = sampleShotCamera(
    committed,
    findShot(committed, shotID),
    0,
    sampleProject(committed, 0)
  );
  assert.deepEqual(outputPose, staged.sampledPose);
});
