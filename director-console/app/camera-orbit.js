import {
  cameraKeyframeAtTime,
  cameraTrackSegmentAtTime,
  createCameraTrack,
  sampleCameraTrack,
} from "./camera-track.js";

export const cameraOrbitDirections = Object.freeze(["clockwise", "counter-clockwise"]);
export const cameraOrbitEndpointModes = Object.freeze(["new", "next-keyframe"]);

export function defaultCameraOrbitOptions(
  trackInput,
  startTimeInput,
  centerInput,
  frameRateInput = 30
) {
  const track = createCameraTrack(trackInput);
  const frameRate = normalizeFrameRate(frameRateInput);
  const startTime = snapTime(startTimeInput, frameRate);
  const start = sampleCameraTrack(track, startTime);
  const center = normalizeVector(centerInput);
  if (!start || !center) return null;
  const radius = horizontalDistance(start.position, center);
  const nextKeyframe = nextCameraOrbitKeyframe(track, startTime, frameRate);
  const availableDuration = nextKeyframe ? nextKeyframe.time - startTime : Number.POSITIVE_INFINITY;
  const duration = Number.isFinite(availableDuration) && availableDuration > 1 / frameRate
    ? Math.min(4, availableDuration - 1 / frameRate)
    : 4;
  return {
    endpointMode: "new",
    direction: "clockwise",
    sweepDegrees: 180,
    extraTurns: 0,
    duration,
    startRadius: radius > 0.01 ? radius : 2,
    startRelativeHeight: 0,
    endRadius: radius > 0.01 ? radius : 2,
    endRelativeHeight: 0,
  };
}

export function nextCameraOrbitKeyframe(trackInput, startTimeInput, frameRateInput = 30) {
  const track = createCameraTrack(trackInput);
  const frameRate = normalizeFrameRate(frameRateInput);
  const startTime = snapTime(startTimeInput, frameRate);
  const tolerance = 0.5 / frameRate;
  return track.keyframes.find((keyframe) => keyframe.time > startTime + tolerance) || null;
}

export function cameraOrbitEndpointSummary(
  trackInput,
  startTimeInput,
  centerInput,
  optionsInput = {},
  frameRateInput = 30
) {
  const setup = analyzeOrbit(trackInput, startTimeInput, centerInput, optionsInput, frameRateInput);
  return {
    startTime: setup.startTime,
    endTime: setup.endTime,
    duration: setup.endTime - setup.startTime,
    startRadius: setup.startRadius,
    endRadius: setup.endRadius,
    startRelativeHeight: setup.startRelativeHeight,
    endRelativeHeight: setup.endRelativeHeight,
    totalSweepDegrees: radiansToDegrees(Math.abs(setup.signedSweep)),
    endpointMode: setup.endpointMode,
    endKeyframeID: setup.endExisting?.id || null,
  };
}

// Orbit writes ordinary keyframes into the base camera track. Angle, distance
// from center, and relative height all advance linearly across the authored
// interval; old segment easing is deliberately not baked into point spacing.
// The normal shared evaluator applies Follow and Look At afterward.
export function buildCameraOrbitTrack(
  trackInput,
  startTimeInput,
  centerInput,
  optionsInput = {},
  frameRateInput = 30
) {
  const track = createCameraTrack(trackInput);
  const setup = analyzeOrbit(track, startTimeInput, centerInput, optionsInput, frameRateInput);
  const {
    frameRate,
    startTime,
    endTime,
    startFrame,
    endFrame,
    center,
    startPose,
    startExisting,
    endExisting,
    startRadius,
    endRadius,
    startRelativeHeight,
    endRelativeHeight,
    startAngle,
    signedSweep,
    endpointMode,
  } = setup;
  const availableFrameIntervals = endFrame - startFrame;
  const totalSweepDegrees = radiansToDegrees(Math.abs(signedSweep));
  const desiredIntervals = clamp(Math.round(totalSweepDegrees / 15), 4, 96);
  const intervalCount = Math.min(desiredIntervals, availableFrameIntervals);
  const frames = evenlySpacedFrames(startFrame, endFrame, intervalCount);
  const positionAtFrame = (frame) => {
    const progress = (frame - startFrame) / availableFrameIntervals;
    const radius = lerp(startRadius, endRadius, progress);
    const relativeHeight = lerp(startRelativeHeight, endRelativeHeight, progress);
    const angle = startAngle + signedSweep * progress;
    return {
      x: center.x + radius * Math.cos(angle),
      y: startPose.position.y + relativeHeight,
      z: center.z + radius * Math.sin(angle),
    };
  };
  const orbitKeyframes = frames.map((frame, index) => {
    const time = frame / frameRate;
    if (index === 0 && startExisting) return { ...startExisting };
    if (index === frames.length - 1 && endExisting) return { ...endExisting };
    const sampled = sampleCameraTrack(track, time) || startPose;
    return {
      id: uniqueGeneratedID(track, startFrame, frame, index === 0 ? "start" : index === frames.length - 1 ? "end" : "path"),
      time,
      position: positionAtFrame(frame),
      quaternion: { ...sampled.quaternion },
      focalLength: sampled.focalLength,
      aim: null,
      follow: null,
    };
  });
  // Keep endpoint positions bit-for-bit exact. The generated equation already
  // reaches them, but retaining authored values avoids floating-point drift.
  orbitKeyframes[0] = {
    ...orbitKeyframes[0],
    position: { ...startPose.position },
  };
  if (endExisting) {
    orbitKeyframes[orbitKeyframes.length - 1] = {
      ...orbitKeyframes.at(-1),
      position: { ...endExisting.position },
    };
  }

  const tolerance = 0.5 / frameRate;
  const before = track.keyframes.filter((keyframe) => keyframe.time < startTime - tolerance);
  const after = track.keyframes.filter((keyframe) => keyframe.time > endTime + tolerance);
  const keyframes = [...before, ...orbitKeyframes, ...after];
  const segments = keyframes.slice(0, -1).map((keyframe, index) => {
    const next = keyframes[index + 1];
    const insideOrbit = keyframe.time >= startTime - tolerance && next.time <= endTime + tolerance;
    const source = cameraTrackSegmentAtTime(track, (keyframe.time + next.time) / 2);
    return {
      startKeyframeID: keyframe.id,
      endKeyframeID: next.id,
      interpolation: insideOrbit ? "linear" : source?.interpolation || track.interpolation,
    };
  });
  const nextTrack = createCameraTrack({
    ...track,
    keyframes,
    segments,
    outTime: Math.max(track.outTime, endTime),
  });
  const startKeyframe = nextTrack.keyframes.find((keyframe) => Math.abs(keyframe.time - startTime) <= tolerance);
  const endKeyframe = nextTrack.keyframes.find((keyframe) => Math.abs(keyframe.time - endTime) <= tolerance);
  const originalIDs = new Set(track.keyframes.map((keyframe) => keyframe.id));
  const createdKeyframeIDs = orbitKeyframes
    .filter((keyframe) => !originalIDs.has(keyframe.id))
    .map((keyframe) => keyframe.id);

  return {
    track: nextTrack,
    center,
    endpointMode,
    direction: setup.direction,
    totalSweepDegrees,
    startTime,
    endTime,
    startKeyframeID: startKeyframe?.id || null,
    endKeyframeID: endKeyframe?.id || null,
    createdKeyframeIDs,
    generatedPathKeyframeIDs: orbitKeyframes.slice(1, -1).map((keyframe) => keyframe.id),
  };
}

function analyzeOrbit(trackInput, startTimeInput, centerInput, optionsInput, frameRateInput) {
  const track = createCameraTrack(trackInput);
  const frameRate = normalizeFrameRate(frameRateInput);
  const startTime = snapTime(startTimeInput, frameRate);
  const startFrame = Math.round(startTime * frameRate);
  const startPose = sampleCameraTrack(track, startTime);
  if (!startPose) throw new RangeError("请先记录摄影机起点");
  const center = normalizeVector(centerInput);
  if (!center) throw new TypeError("环绕中心不是有效坐标");
  const startRadius = horizontalDistance(startPose.position, center);
  if (startRadius < 0.05) throw new RangeError("摄影机与环绕中心至少相距 0.05 m");
  // 高差以起始机位为零点：填「升高 3 米」就是终点比起点高 3 米。
  // 不再以 center.y 为基准 —— 环绕轴是竖直的，只要 x/z 就能定义，
  // 中心的高度从来不影响圆的形状（半径只算水平距离），却在悄悄改这个数字的含义。
  const startRelativeHeight = 0;
  const startAngle = Math.atan2(startPose.position.z - center.z, startPose.position.x - center.x);
  const startExisting = cameraKeyframeAtTime(track, startTime, frameRate);
  const endpointMode = cameraOrbitEndpointModes.includes(optionsInput.endpointMode)
    ? optionsInput.endpointMode
    : "new";
  const direction = cameraOrbitDirections.includes(optionsInput.direction)
    ? optionsInput.direction
    : "clockwise";
  let endExisting = null;
  let endTime;
  let endRadius;
  let endRelativeHeight;
  let signedSweep;

  if (endpointMode === "next-keyframe") {
    endExisting = nextCameraOrbitKeyframe(track, startTime, frameRate);
    if (!endExisting) throw new RangeError("当前播放头之后没有摄影机关键帧");
    endTime = endExisting.time;
    endRadius = horizontalDistance(endExisting.position, center);
    if (endRadius < 0.05) throw new RangeError("下一关键帧与环绕中心至少相距 0.05 m");
    endRelativeHeight = endExisting.position.y - startPose.position.y;
    const endAngle = Math.atan2(endExisting.position.z - center.z, endExisting.position.x - center.x);
    const directionalSweep = directedAngleDistance(startAngle, endAngle, direction);
    const extraTurns = finiteIntegerInRange(optionsInput.extraTurns, 0, 3, 0);
    signedSweep = (direction === "clockwise" ? 1 : -1)
      * (directionalSweep + extraTurns * Math.PI * 2);
  } else {
    const maximumDuration = 3600 - startTime;
    if (maximumDuration < 1 / frameRate) throw new RangeError("当前播放头之后没有可用时间");
    const duration = finiteInRange(optionsInput.duration, 1 / frameRate, maximumDuration, Math.min(4, maximumDuration));
    const endFrame = startFrame + Math.max(1, Math.round(duration * frameRate));
    endTime = endFrame / frameRate;
    const tolerance = 0.5 / frameRate;
    const collision = track.keyframes.find((keyframe) => (
      keyframe.time > startTime + tolerance && keyframe.time <= endTime + tolerance
    ));
    if (collision) throw new RangeError("新建终点范围内已有关键帧；请缩短时长或改用下一关键帧");
    endRadius = finiteInRange(optionsInput.endRadius, 0.05, 1000, startRadius);
    endRelativeHeight = finiteInRange(
      optionsInput.endRelativeHeight,
      -1000,
      1000,
      startRelativeHeight
    );
    const sweepDegrees = finiteInRange(optionsInput.sweepDegrees, 1, 1440, 180);
    signedSweep = degreesToRadians(sweepDegrees) * (direction === "clockwise" ? 1 : -1);
  }
  const endFrame = Math.round(endTime * frameRate);
  if (endFrame - startFrame < 1) throw new RangeError("环绕时长至少为一个项目帧");

  return {
    track,
    frameRate,
    startTime,
    endTime,
    startFrame,
    endFrame,
    center,
    startPose,
    startExisting,
    endExisting,
    startRadius,
    endRadius,
    startRelativeHeight,
    endRelativeHeight,
    startAngle,
    signedSweep,
    endpointMode,
    direction,
  };
}

function evenlySpacedFrames(startFrame, endFrame, intervalCount) {
  const frames = new Set([startFrame, endFrame]);
  for (let index = 1; index < intervalCount; index += 1) {
    frames.add(Math.round(startFrame + (endFrame - startFrame) * index / intervalCount));
  }
  return [...frames].sort((left, right) => left - right);
}

function directedAngleDistance(startAngle, endAngle, direction) {
  const fullTurn = Math.PI * 2;
  const raw = direction === "clockwise" ? endAngle - startAngle : startAngle - endAngle;
  const normalized = ((raw % fullTurn) + fullTurn) % fullTurn;
  return normalized < 0.000001 ? fullTurn : normalized;
}

function uniqueGeneratedID(track, startFrame, frame, kind) {
  const prefix = `camera-orbit-${startFrame}-${frame}-${kind}`;
  const ids = new Set(track.keyframes.map((keyframe) => keyframe.id));
  if (!ids.has(prefix)) return prefix;
  let suffix = 2;
  while (ids.has(`${prefix}-${suffix}`)) suffix += 1;
  return `${prefix}-${suffix}`;
}

function normalizeVector(value) {
  if (![value?.x, value?.y, value?.z].every((component) => Number.isFinite(Number(component)))) return null;
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function horizontalDistance(left, right) {
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.z) - Number(right.z));
}

function finiteInRange(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number < minimum || number > maximum) {
    throw new RangeError(`数值必须在 ${minimum} 到 ${maximum} 之间`);
  }
  return number;
}

function finiteIntegerInRange(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`数值必须在 ${minimum} 到 ${maximum} 之间`);
  }
  return number;
}

function normalizeFrameRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(number, 240) : 30;
}

function snapTime(value, frameRate) {
  const time = clamp(Number(value) || 0, 0, 3600);
  return Math.round(time * frameRate) / frameRate;
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function degreesToRadians(value) {
  return value * Math.PI / 180;
}

function radiansToDegrees(value) {
  return value * 180 / Math.PI;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
