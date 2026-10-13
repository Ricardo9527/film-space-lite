import { sampleShotCamera } from "./camera-aim.js";
import { cameraKeyframeAtTime } from "./camera-track.js";
import {
  findShot,
  recordShotCameraKeyframe,
  updateShotCameraKeyframe,
  updateShotCameraKeyframeFollow,
} from "./project-model.js";

// Build the exact project snapshot that Record Keyframe would persist, then
// preview it through the same sampler used by playback and output.
export function stageShotCameraKeyframe(
  project,
  shotID,
  pose,
  elapsedInput,
  frameRateInput = project?.output?.frameRate,
  actorSamples = null
) {
  const shot = findShot(project, shotID);
  if (!shot?.camera?.track || !pose) return null;
  const elapsed = Math.max(0, Number(elapsedInput || 0));
  const existing = cameraKeyframeAtTime(shot.camera.track, elapsed, frameRateInput);
  const stagedProject = existing
    ? updateShotCameraKeyframe(project, shot.id, existing.id, pose)
    : recordShotCameraKeyframe(project, shot.id, pose, elapsed, frameRateInput);
  const stagedShot = findShot(stagedProject, shot.id);
  const keyframe = cameraKeyframeAtTime(stagedShot.camera.track, elapsed, frameRateInput);
  return {
    project: stagedProject,
    keyframe,
    sampledPose: sampleShotCamera(stagedProject, stagedShot, elapsed, actorSamples),
  };
}

export function updateShotCameraFollowPreservingPosition(
  project,
  shotID,
  keyframeID,
  follow,
  actorSamples = null
) {
  const shot = findShot(project, shotID);
  const keyframe = shot?.camera?.track?.keyframes?.find((candidate) => candidate.id === keyframeID);
  if (!shot || !keyframe) return null;
  const before = sampleShotCamera(project, shot, keyframe.time, actorSamples);
  let nextProject = updateShotCameraKeyframeFollow(project, shot.id, keyframe.id, follow);
  let nextShot = findShot(nextProject, shot.id);
  let sampledPose = sampleShotCamera(nextProject, nextShot, keyframe.time, actorSamples);
  if (
    finiteVector(before?.position)
    && finiteVector(sampledPose?.position)
    && !sameVector(before.position, sampledPose.position)
  ) {
    // There is no previous Follow state before the first keyframe, so changing
    // a legacy first-key reference may still require one base-position offset.
    const nextKeyframe = nextShot.camera.track.keyframes.find((candidate) => candidate.id === keyframe.id);
    nextProject = updateShotCameraKeyframe(nextProject, shot.id, keyframe.id, {
      ...nextKeyframe,
      position: addVector(nextKeyframe.position, subtractVector(before.position, sampledPose.position)),
    });
    nextShot = findShot(nextProject, shot.id);
    sampledPose = sampleShotCamera(nextProject, nextShot, keyframe.time, actorSamples);
  }
  return {
    project: nextProject,
    keyframe: nextShot.camera.track.keyframes.find((candidate) => candidate.id === keyframe.id),
    sampledPose,
    preservedPosition: finiteVector(before?.position) && finiteVector(sampledPose?.position)
      ? sameVector(before.position, sampledPose.position)
      : false,
  };
}

function finiteVector(value) {
  return Number.isFinite(Number(value?.x))
    && Number.isFinite(Number(value?.y))
    && Number.isFinite(Number(value?.z));
}

function sameVector(left, right) {
  return Math.abs(Number(left.x) - Number(right.x)) < 0.000001
    && Math.abs(Number(left.y) - Number(right.y)) < 0.000001
    && Math.abs(Number(left.z) - Number(right.z)) < 0.000001;
}

function addVector(left, right) {
  return {
    x: Number(left?.x || 0) + Number(right?.x || 0),
    y: Number(left?.y || 0) + Number(right?.y || 0),
    z: Number(left?.z || 0) + Number(right?.z || 0),
  };
}

function subtractVector(left, right) {
  return {
    x: Number(left?.x || 0) - Number(right?.x || 0),
    y: Number(left?.y || 0) - Number(right?.y || 0),
    z: Number(left?.z || 0) - Number(right?.z || 0),
  };
}
