import { applyCameraFollow } from "./camera-follow.js";
import {
  cameraTrackEndpoints,
  cameraTrackSourceDuration,
  createCameraTrack,
  sampleCameraTrack,
  sampleCameraTrackPath,
} from "./camera-track.js";
import { sampleProject } from "./playback-engine.js";

const maximumGuideSteps = 240;
const guideSamplesPerSecond = 12;
const guideSamplesPerSegment = 16;

export function evaluatedCameraGuideTrack(project, shot) {
  const track = createCameraTrack(shot?.camera?.track);
  const hasFollow = track.keyframes.some((keyframe) => keyframe.follow?.enabled === true);
  if (!hasFollow) {
    return {
      ...cameraTrackEndpoints(track),
      keyframes: track.keyframes,
      pathPoses: sampleCameraTrackPath(track),
    };
  }

  const sourceDuration = cameraTrackSourceDuration(track);
  const sceneDuration = Math.max(Number(project?.scene?.duration?.seconds || 0), 0);
  const guideDuration = Math.max(sourceDuration, sceneDuration);
  const sourceTrack = createCameraTrack({ ...track, outTime: sourceDuration });
  const times = cameraGuideSampleTimes(sourceTrack, guideDuration);
  const pathPoses = compactGuidePath(times.map((time) => {
    const basePose = sampleCameraTrack(sourceTrack, Math.min(time, sourceDuration));
    return basePose
      ? { time, ...applyCameraFollow(project, shot, basePose, time, sampleProject(project, time)) }
      : null;
  }).filter(Boolean));
  const keyframes = track.keyframes.map((keyframe) => ({
    id: keyframe.id,
    time: keyframe.time,
    ...applyCameraFollow(project, shot, keyframe, keyframe.time, sampleProject(project, keyframe.time)),
  }));
  const start = pathPoses[0] || keyframes.find((keyframe) => keyframe.time === 0) || null;
  const last = pathPoses.at(-1) || keyframes.at(-1) || null;
  const end = guideDuration > 0 || pathHasMovement(pathPoses) ? last : null;
  return { start, end, keyframes, pathPoses };
}

export function authoredCameraPositionFromGuide(project, shot, keyframe, visiblePosition) {
  if (!keyframe || !visiblePosition) return visiblePosition;
  const followed = applyCameraFollow(
    project,
    shot,
    keyframe,
    keyframe.time,
    sampleProject(project, keyframe.time)
  );
  const translation = followed?.followEvaluation?.translation;
  if (!translation) return { ...visiblePosition };
  return {
    x: Number(visiblePosition.x) - translation.x,
    y: Number(visiblePosition.y) - translation.y,
    z: Number(visiblePosition.z) - translation.z,
  };
}

function cameraGuideSampleTimes(track, duration) {
  if (duration <= 0) return [0];
  const segmentCount = Math.max(track.keyframes.length - 1, 1);
  const steps = Math.min(
    maximumGuideSteps,
    Math.max(
      segmentCount * guideSamplesPerSegment,
      Math.ceil(duration * guideSamplesPerSecond),
      1
    )
  );
  const times = new Set([0, duration, ...track.keyframes.map((keyframe) => keyframe.time)]);
  for (let index = 1; index < steps; index += 1) {
    times.add(duration * index / steps);
  }
  return [...times].filter((time) => time >= 0 && time <= duration).sort((left, right) => left - right);
}

function compactGuidePath(poses) {
  return poses.filter((pose, index) => index === 0 || !samePosition(pose.position, poses[index - 1].position));
}

function pathHasMovement(poses) {
  return poses.some((pose, index) => index > 0 && !samePosition(pose.position, poses[index - 1].position));
}

function samePosition(left, right) {
  return Math.abs(Number(left?.x || 0) - Number(right?.x || 0)) < 0.000001
    && Math.abs(Number(left?.y || 0) - Number(right?.y || 0)) < 0.000001
    && Math.abs(Number(left?.z || 0) - Number(right?.z || 0)) < 0.000001;
}
