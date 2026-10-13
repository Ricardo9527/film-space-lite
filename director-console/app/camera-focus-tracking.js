import { isBlockingActor, blockingTargetPosition } from "./blocking-actor.js";
import {
  cameraFocusDistanceMaximum,
  cameraFocusDistanceMinimum,
  cameraTrackDuration,
  createCameraTrack,
  normalizeCameraFocusTracking,
} from "./camera-track.js";
import { sampleProject } from "./playback-engine.js";
import { visualEnvironmentWorldTransform } from "./project-model.js";

const actorHeadHeightMeters = 1.62;

export function effectiveCameraFocusTrackingState(trackInput, elapsedInput = 0) {
  const track = createCameraTrack(trackInput);
  const elapsed = clamp(finiteNumber(elapsedInput, 0), 0, cameraTrackDuration(track));
  const activeIndex = Math.max(0, track.keyframes.findLastIndex((keyframe) => (
    keyframe.time <= elapsed + 0.000001
  )));
  for (let index = activeIndex; index >= 0; index -= 1) {
    if (track.keyframes[index]?.focusTracking == null) continue;
    return {
      focusTracking: normalizeCameraFocusTracking(track.keyframes[index].focusTracking),
      keyframe: track.keyframes[index],
      index,
    };
  }
  return {
    focusTracking: normalizeCameraFocusTracking(),
    keyframe: null,
    index: -1,
  };
}

export function applyCameraFocusTracking(
  project,
  shot,
  pose,
  elapsedInput = 0,
  actorSamplesInput = null
) {
  if (!pose) return pose;
  const state = effectiveCameraFocusTrackingState(shot?.camera?.track, elapsedInput);
  const focusTracking = state.focusTracking;
  const fallbackDistance = clamp(
    finiteNumber(pose.focusDistance, 5),
    cameraFocusDistanceMinimum,
    cameraFocusDistanceMaximum
  );
  if (!focusTracking.enabled) {
    return pose;
  }

  const elapsed = Math.max(0, finiteNumber(elapsedInput, 0));
  const actorSamples = actorSamplesInput instanceof Map
    ? actorSamplesInput
    : sampleProject(project, elapsed);
  const resolved = cameraFocusTargetPosition(project, actorSamples, focusTracking);
  if (!resolved.position) {
    return focusFallbackPose(pose, fallbackDistance, focusTracking, state, resolved.warning);
  }

  const forward = rotateVectorByQuaternion({ x: 0, y: 0, z: -1 }, pose.quaternion);
  const opticalDepth = dotVector(subtractVector(resolved.position, pose.position), forward);
  if (!Number.isFinite(opticalDepth) || opticalDepth < cameraFocusDistanceMinimum) {
    return focusFallbackPose(
      pose,
      fallbackDistance,
      focusTracking,
      state,
      "跟焦目标位于摄影机后方；当前保持最后写入的对焦距离。",
      resolved.position
    );
  }

  return {
    ...pose,
    focusDistance: clamp(
      opticalDepth,
      cameraFocusDistanceMinimum,
      cameraFocusDistanceMaximum
    ),
    focusTrackingEvaluation: {
      enabled: true,
      valid: true,
      targetKind: focusTracking.targetKind,
      targetPosition: resolved.position,
      activeKeyframeID: state.keyframe?.id || null,
      warning: null,
    },
  };
}

export function cameraFocusTargetPosition(project, actorSamples, focusTrackingInput) {
  const target = normalizeCameraFocusTracking(focusTrackingInput);
  if (target.targetKind === "world") {
    return { position: { ...target.worldPosition }, warning: null };
  }
  if (target.targetKind === "actor") {
    const actor = project?.scene?.actors?.find((candidate) => candidate.id === target.targetActorID);
    const sample = actorSamples instanceof Map ? actorSamples.get(target.targetActorID) : null;
    if (!actor || actor.visible === false || !finiteVector(sample?.position)) {
      return {
        position: null,
        warning: "跟焦演员不可用；当前保持最后写入的对焦距离。",
      };
    }
    return {
      position: isBlockingActor(actor) ? blockingTargetPosition(actor, sample, clamp(target.actorHeight, 0, 1)) : {
        x: Number(sample.position.x),
        y: Number(sample.position.y)
          + actorHeadHeightMeters * clamp(target.actorHeight, 0, 1)
            * clamp(finiteNumber(actor.scale, 1), 0.5, 2),
        z: Number(sample.position.z),
      },
      warning: null,
    };
  }
  if (target.targetKind === "environment") {
    const visuals = project?.scene?.environment?.visuals || [];
    const visual = visuals.find((candidate) => candidate.id === target.environmentID)
      || (!target.environmentID ? visuals[0] : null);
    const group = project?.scene?.environment?.groups?.find(
      (candidate) => candidate.id === visual?.groupID
    );
    if (!visual || visual.visible === false || group?.visible === false) {
      return {
        position: null,
        warning: "跟焦环境不可用；当前保持最后写入的对焦距离。",
      };
    }
    return {
      position: transformEnvironmentPoint(
        target.localPosition,
        visualEnvironmentWorldTransform(project, visual)
      ),
      warning: null,
    };
  }

  const group = project?.scene?.blockout?.groups?.find(
    (candidate) => candidate.id === target.blockoutGroupID
  );
  const object = group?.objects?.find((candidate) => candidate.id === target.blockoutObjectID);
  if (
    !group
    || !object
    || project?.scene?.blockout?.visible === false
    || group.visible === false
    || object.visible === false
  ) {
    return {
      position: null,
      warning: "跟焦布景不可用；当前保持最后写入的对焦距离。",
    };
  }
  return {
    position: transformBlockoutPoint(target.localPosition, group, object),
    warning: null,
  };
}

export function cameraOpticalAxisDepth(pose, worldPosition) {
  if (!pose || !finiteVector(pose.position) || !finiteVector(worldPosition)) return null;
  const forward = rotateVectorByQuaternion({ x: 0, y: 0, z: -1 }, pose.quaternion);
  const depth = dotVector(subtractVector(worldPosition, pose.position), forward);
  return Number.isFinite(depth) ? depth : null;
}

function focusFallbackPose(pose, distance, focusTracking, state, warning, targetPosition = null) {
  return {
    ...pose,
    focusDistance: distance,
    focusTrackingEvaluation: {
      enabled: true,
      valid: false,
      targetKind: focusTracking.targetKind,
      targetPosition,
      activeKeyframeID: state.keyframe?.id || null,
      warning,
    },
  };
}

function transformBlockoutPoint(localPosition, group, object) {
  const objectScale = Math.max(0.01, finiteNumber(object?.scale, 1));
  const groupScale = Math.max(0.01, finiteNumber(group?.scale, 1));
  const inGroup = addVector(
    rotateY(scaleVector(localPosition, objectScale), finiteNumber(object?.rotationY, 0)),
    numericVector(object?.position)
  );
  return addVector(
    rotateY(scaleVector(inGroup, groupScale), finiteNumber(group?.rotationY, 0)),
    numericVector(group?.position)
  );
}

function transformEnvironmentPoint(localPosition, transform) {
  const scaled = scaleVector(localPosition, Math.max(0.0001, finiteNumber(transform?.uniformScale, 1)));
  return addVector(
    rotateVectorByQuaternion(scaled, transform?.quaternion),
    numericVector(transform?.position)
  );
}

function rotateY(vector, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: vector.x * cosine + vector.z * sine,
    y: vector.y,
    z: -vector.x * sine + vector.z * cosine,
  };
}

function rotateVectorByQuaternion(vector, quaternionInput) {
  const quaternion = normalizeQuaternion(quaternionInput);
  const qVector = { x: quaternion.x, y: quaternion.y, z: quaternion.z };
  const uv = crossVector(qVector, vector);
  const uuv = crossVector(qVector, uv);
  return addVector(
    vector,
    addVector(scaleVector(uv, 2 * quaternion.w), scaleVector(uuv, 2))
  );
}

function normalizeQuaternion(input) {
  const length = Math.hypot(
    finiteNumber(input?.x, 0),
    finiteNumber(input?.y, 0),
    finiteNumber(input?.z, 0),
    finiteNumber(input?.w, 1)
  ) || 1;
  return {
    x: finiteNumber(input?.x, 0) / length,
    y: finiteNumber(input?.y, 0) / length,
    z: finiteNumber(input?.z, 0) / length,
    w: finiteNumber(input?.w, 1) / length,
  };
}

function numericVector(value) {
  return {
    x: finiteNumber(value?.x, 0),
    y: finiteNumber(value?.y, 0),
    z: finiteNumber(value?.z, 0),
  };
}

function finiteVector(value) {
  return Number.isFinite(Number(value?.x))
    && Number.isFinite(Number(value?.y))
    && Number.isFinite(Number(value?.z));
}

function addVector(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtractVector(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scaleVector(vector, scalar) {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function crossVector(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function dotVector(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value)));
}
