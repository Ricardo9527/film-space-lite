import {
  cameraTrackDuration,
  createCameraTrack,
  normalizeCameraFollow,
} from "./camera-track.js";
import { sampleProject } from "./playback-engine.js";

export { normalizeCameraFollow } from "./camera-track.js";

export function effectiveCameraFollowState(trackInput, elapsedInput = 0) {
  const track = createCameraTrack(trackInput);
  const elapsed = clamp(finiteNumber(elapsedInput, 0), 0, cameraTrackDuration(track));
  const activeIndex = Math.max(0, track.keyframes.findLastIndex((keyframe) => (
    keyframe.time <= elapsed + 0.000001
  )));
  for (let index = activeIndex; index >= 0; index -= 1) {
    if (track.keyframes[index]?.follow == null) continue;
    return {
      follow: normalizeCameraFollow(track.keyframes[index].follow),
      keyframe: track.keyframes[index],
      index,
    };
  }
  return { follow: normalizeCameraFollow(), keyframe: null, index: -1 };
}

export function applyCameraFollow(project, shot, pose, elapsedInput = 0, actorSamplesInput = null) {
  if (!pose) return pose;
  const track = createCameraTrack(shot?.camera?.track);
  const followState = effectiveCameraFollowState(track, elapsedInput);
  const follow = followState.follow;
  const continuityOffset = derivedContinuityOffset(project, track, followState.index);
  if (!follow.enabled) {
    if (zeroVector(continuityOffset)) return pose;
    return translatedPose(pose, continuityOffset, {
      enabled: false,
      targetActorID: follow.targetActorID,
      referenceTime: follow.referenceTime,
      activeKeyframeID: followState.keyframe?.id || null,
      valid: true,
      targetPosition: null,
      referencePosition: null,
      actorTranslation: { x: 0, y: 0, z: 0 },
      continuityOffset,
      translation: continuityOffset,
      warning: null,
    });
  }

  const duration = Math.max(
    Number(project?.scene?.duration?.seconds || 0),
    cameraTrackDuration(track)
  );
  const elapsed = clamp(finiteNumber(elapsedInput, 0), 0, Math.max(duration, 0));
  const referenceTime = clamp(follow.referenceTime, 0, Math.max(duration, 0));
  const actorSamples = actorSamplesInput instanceof Map
    ? actorSamplesInput
    : sampleProject(project, elapsed);
  const actorEvaluation = actorTranslation(project, follow, elapsed, actorSamples);
  const current = actorEvaluation.current;
  const reference = actorEvaluation.reference;

  if (!actorEvaluation.valid) {
    return translatedPose(pose, continuityOffset, {
      enabled: true,
      targetActorID: follow.targetActorID,
      referenceTime,
      activeKeyframeID: followState.keyframe?.id || null,
      valid: false,
      targetPosition: finiteVector(current?.position) ? { ...current.position } : null,
      referencePosition: finiteVector(reference?.position) ? { ...reference.position } : null,
      actorTranslation: { x: 0, y: 0, z: 0 },
      continuityOffset,
      translation: continuityOffset,
      warning: "跟随目标不可用；当前使用已保存的摄影机轨道。",
    });
  }

  // Follow is deliberately world-space and position-only. Actor orientation is
  // ignored; the normal camera track remains free to add any authored movement.
  const translation = addVector(actorEvaluation.translation, continuityOffset);
  return translatedPose(pose, translation, {
    enabled: true,
    targetActorID: follow.targetActorID,
    referenceTime,
    activeKeyframeID: followState.keyframe?.id || null,
    valid: true,
    targetPosition: { ...current.position },
    referencePosition: { ...reference.position },
    actorTranslation: actorEvaluation.translation,
    continuityOffset,
    translation,
    warning: null,
  });
}

// Every explicit Follow event after the first starts from the translation that
// the previous event produced at this boundary. The correction is derived from
// durable event data and actor motion, so retiming a keyframe or editing actor
// motion cannot leave a stale serialized compensation behind.
function derivedContinuityOffset(project, track, stateIndex) {
  const previousIndex = findPreviousFollowIndex(track.keyframes, stateIndex - 1);
  if (stateIndex < 0 || previousIndex < 0) return { x: 0, y: 0, z: 0 };
  const keyframe = track.keyframes[stateIndex];
  const follow = normalizeCameraFollow(keyframe.follow);
  const previousTranslation = followTranslationForState(
    project,
    track,
    previousIndex,
    keyframe.time
  );
  const currentActorTranslation = actorTranslation(project, follow, keyframe.time).translation;
  return subtractVector(previousTranslation, currentActorTranslation);
}

function followTranslationForState(project, track, stateIndex, elapsed) {
  if (stateIndex < 0) return { x: 0, y: 0, z: 0 };
  const follow = normalizeCameraFollow(track.keyframes[stateIndex]?.follow);
  const continuityOffset = derivedContinuityOffset(project, track, stateIndex);
  const actorOffset = actorTranslation(project, follow, elapsed).translation;
  return addVector(continuityOffset, actorOffset);
}

function actorTranslation(project, follow, elapsed, actorSamplesInput = null) {
  if (!follow.enabled) {
    return {
      valid: true,
      current: null,
      reference: null,
      translation: { x: 0, y: 0, z: 0 },
    };
  }
  const actor = project?.scene?.actors?.find((candidate) => candidate.id === follow.targetActorID);
  const currentSamples = actorSamplesInput instanceof Map
    ? actorSamplesInput
    : sampleProject(project, elapsed);
  const current = currentSamples.get(follow.targetActorID);
  const reference = actor
    ? sampleProject(project, follow.referenceTime).get(follow.targetActorID)
    : null;
  const valid = Boolean(actor && finiteVector(current?.position) && finiteVector(reference?.position));
  return {
    valid,
    current,
    reference,
    translation: valid
      ? subtractVector(current.position, reference.position)
      : { x: 0, y: 0, z: 0 },
  };
}

function findPreviousFollowIndex(keyframes, startIndex) {
  for (let index = startIndex; index >= 0; index -= 1) {
    if (keyframes[index]?.follow != null) return index;
  }
  return -1;
}

function translatedPose(pose, translation, followEvaluation) {
  return {
    ...pose,
    position: addVector(pose.position, translation),
    followEvaluation,
  };
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

function zeroVector(value) {
  return Math.abs(Number(value?.x || 0)) < 0.000001
    && Math.abs(Number(value?.y || 0)) < 0.000001
    && Math.abs(Number(value?.z || 0)) < 0.000001;
}

function finiteVector(value) {
  return Number.isFinite(Number(value?.x))
    && Number.isFinite(Number(value?.y))
    && Number.isFinite(Number(value?.z));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value)));
}
