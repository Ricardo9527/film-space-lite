import { isBlockingActor, blockingTargetPosition } from "./blocking-actor.js";
import { cameraSensorGate } from "./camera-composition.js";
import {
  cameraAimActorHeightPresets,
  cameraFocalLengthMaximum,
  cameraFocalLengthMinimum,
  cameraTrackDuration,
  createCameraTrack,
  normalizeCameraAim,
  sampleCameraTrack,
} from "./camera-track.js";
import { sampleProject } from "./playback-engine.js";
import { applyCameraFollow } from "./camera-follow.js";
import { applyCameraHandheld } from "./camera-handheld.js";
import { applyCameraFocusTracking, cameraFocusTargetPosition } from "./camera-focus-tracking.js";

const actorHeadHeightMeters = 1.62;

const compositionNDCX = Object.freeze({
  "left-third": -1 / 3,
  center: 0,
  "right-third": 1 / 3,
});

// Continuous tracking may lag for a natural camera-operator feel, but the
// authored target must stay inside a predictable screen-space safety region.
// NDC spans -1...1 across the full output gate, so a half extent of 0.5 keeps
// the target inside the middle half of the frame around its requested
// composition point. This is evaluator policy rather than authored data.
const trackingHardLimitHalfWidth = 0.5;
const trackingHardLimitHalfHeight = 0.5;
const trackingHardLimitIterations = 18;

export function sampleShotCamera(project, shotInput, elapsedInput = 0, actorSamplesInput = null) {
  const shot = typeof shotInput === "string"
    ? project?.scene?.shots?.find((candidate) => candidate.id === shotInput)
    : shotInput;
  if (!shot?.camera?.track) return null;
  const pose = sampleCameraTrack(shot.camera.track, elapsedInput);
  if (!pose) return null;
  const actorSamples = actorSamplesInput instanceof Map
    ? actorSamplesInput
    : sampleProject(project, elapsedInput);
  const constrainedPose = applyShotCameraConstraints(project, shot, pose, elapsedInput, actorSamples);
  const handheldPose = applyCameraHandheld(shot, constrainedPose, elapsedInput);
  return {
    ...applyCameraFocusTracking(project, shot, handheldPose, elapsedInput, actorSamples),
    depthOfFieldEnabled: shot.camera.depthOfField?.enabled === true,
  };
}

export function applyShotCameraConstraints(
  project,
  shot,
  pose,
  elapsedInput = 0,
  actorSamplesInput = null
) {
  if (!pose) return pose;
  const actorSamples = actorSamplesInput instanceof Map
    ? actorSamplesInput
    : sampleProject(project, elapsedInput);
  const followedPose = applyCameraFollow(project, shot, pose, elapsedInput, actorSamples);
  return applyCameraAim(project, shot, followedPose, elapsedInput, actorSamples);
}

export function applyCameraAim(
  project,
  shot,
  pose,
  elapsedInput = 0,
  actorSamplesInput = null
) {
  if (!pose || !shot?.camera?.track) return pose;
  const track = createCameraTrack(shot.camera.track);
  const duration = Math.max(
    cameraTrackDuration(track),
    Number(project?.scene?.duration?.seconds || 0)
  );
  const elapsed = clamp(Number(elapsedInput || 0), 0, duration);
  const actorSamples = actorSamplesInput instanceof Map
    ? actorSamplesInput
    : sampleProject(project, elapsed);
  const bracket = analyzeAimBracket(track.keyframes, elapsed);
  const exact = evaluateAimPath(project, shot, track, pose, elapsed, actorSamples, bracket);
  const aim = exact.aim;
  let quaternion = exact.quaternion;
  if (
    !exact.transition
    && aim.mode === "look-at"
    && aim.trackingResponse > 0
    && exact.valid
  ) {
    quaternion = dampedTrackingQuaternion(project, shot, track, elapsed, exact);
  } else if (exact.transition?.kind === "tracking-catchup" && exact.valid) {
    // A smooth→exact response key is also a reached state. Preserve the lag
    // visible at A, then remove it across A→B so the exact B frame does not pop.
    const lagged = dampedTrackingQuaternion(project, shot, track, elapsed, exact);
    quaternion = setCameraOpticalRollDegrees(
      slerpQuaternion(lagged, exact.quaternion, exact.blendProgress),
      cameraOpticalRollDegrees(exact.quaternion)
    );
  }

  return {
    ...pose,
    quaternion,
    aimEvaluation: {
      mode: aim.mode,
      targetKind: aim.targetKind,
      targetActorID: aim.targetActorID,
      anchor: aim.anchor,
      actorHeight: aim.actorHeight,
      worldPosition: aim.worldPosition,
      ...(aim.targetKind === "environment" ? { environmentID: aim.environmentID, localPosition: aim.localPosition } : {}),
      composition: aim.composition,
      trackingResponse: aim.trackingResponse,
      valid: exact.valid,
      targetPosition: exact.targetPosition,
      blendProgress: exact.blendProgress,
      activeKeyframeID: exact.activeKeyframeID,
      warning: exact.warning,
      transition: exact.transition,
    },
  };
}

// Explicit aim keyframes describe the orientation state that must be reached AT
// their own time. A change between two explicit states A and B therefore plays
// inside the keyframe interval: progress = smoothStep((t - A.time) / (B.time -
// A.time)), and B is forced exact. Keyframes with aim == null inherit and never
// create or interrupt a transition. Free-to-free pairs stay on the ordinary
// camera-track quaternion interpolation; this machine only engages when at
// least one side is an explicit Lock state.
function analyzeAimBracket(keyframes, elapsed) {
  const activeIndex = Math.max(0, findActiveKeyframeIndex(keyframes, elapsed));
  const aIndex = Math.max(0, findAimKeyframeIndex(keyframes, activeIndex));
  let bIndex = -1;
  for (let index = aIndex + 1; index < keyframes.length; index += 1) {
    if (keyframes[index]?.aim != null) {
      bIndex = index;
      break;
    }
  }
  const stateA = normalizeCameraAim(keyframes[aIndex]?.aim);
  const stateB = bIndex >= 0 ? normalizeCameraAim(keyframes[bIndex].aim) : null;
  const startTime = keyframes[aIndex]?.time || 0;
  const endTime = bIndex >= 0 ? keyframes[bIndex].time : startTime;
  const turnStateChanged = Boolean(stateB) && !sameAimTurnState(stateA, stateB);
  const responseCatchup = Boolean(stateB)
    && !turnStateChanged
    && stateA.mode === "look-at"
    && stateB.mode === "look-at"
    && stateA.trackingResponse > 0
    && stateB.trackingResponse <= 0;
  const turning = (turnStateChanged || responseCatchup)
    && elapsed < endTime - 0.000001;
  const progress = turning
    ? smoothStep(clamp((elapsed - startTime) / Math.max(endTime - startTime, 0.000001), 0, 1))
    : 1;
  return { aIndex, bIndex, stateA, stateB, turning, progress, responseCatchup };
}

export function describeCameraAimTransition(trackInput, elapsedInput = 0) {
  const track = createCameraTrack(trackInput);
  if (!track.keyframes.length) return null;
  const elapsed = clamp(Number(elapsedInput || 0), 0, 3600);
  const bracket = analyzeAimBracket(track.keyframes, elapsed);
  if (!bracket.turning) return null;
  return {
    fromAim: bracket.stateA,
    toAim: bracket.stateB,
    fromKeyframeID: track.keyframes[bracket.aIndex]?.id || null,
    toKeyframeID: track.keyframes[bracket.bIndex]?.id || null,
    progress: bracket.progress,
    kind: bracket.responseCatchup ? "tracking-catchup" : "state",
  };
}

function evaluateAimPath(project, shot, track, pose, elapsed, actorSamplesInput = null, bracketInput = null, matchVelocity = true) {
  const inputPose = pose;
  const actorSamples = actorSamplesInput instanceof Map
    ? actorSamplesInput
    : sampleProject(project, elapsed);
  const bracket = bracketInput || analyzeAimBracket(track.keyframes, elapsed);
  // Smooth direction and optical Roll use separate curves on both sides of
  // an aim boundary; a hidden locked orientation must not change Roll speed.
  if (bracket.turning || bracket.stateA.mode === "look-at" || cameraSegmentIsSmooth(track, elapsed)) {
    pose = poseWithAuthoredRoll(track, pose, elapsed);
  }
  if (!bracket.turning) {
    const current = resolveAim(project, shot, pose, bracket.stateA, actorSamples);
    return {
      aim: bracket.stateA,
      quaternion: current.valid ? current.quaternion : inputPose.quaternion,
      valid: current.valid,
      targetPosition: current.targetPosition,
      cameraPosition: pose.position,
      focalLength: pose.focalLength,
      aspectRatio: shot.aspectRatio,
      blendProgress: 1,
      activeKeyframeID: track.keyframes[bracket.aIndex]?.id || null,
      warning: current.warning,
      transition: null,
    };
  }

  const s = bracket.progress;
  const keyA = track.keyframes[bracket.aIndex];
  const keyB = track.keyframes[bracket.bIndex];
  const path = transitionPathAim(project, shot, pose, actorSamples, bracket.stateA, bracket.stateB, s, keyB);
  // Absorb any continuous-tracking lag already visible at A without snapping:
  // the offset between the actually evaluated orientation at A and the ideal
  // path start decays to zero across the transition, while B stays exact.
  const source = boundarySourceQuaternion(project, shot, track, keyA.time, bracket.stateA);
  const idealStart = transitionIdealQuaternion(project, shot, track, bracket, 0, keyA.time);
  const correction = source && idealStart
    ? quaternionMultiply(source, quaternionInverse(idealStart))
    : null;
  const decayed = correction
    ? slerpQuaternion({ x: 0, y: 0, z: 0, w: 1 }, correction, 1 - s)
    : null;
  const correctedQuaternion = decayed
    ? quaternionMultiply(decayed, path.quaternion)
    : path.quaternion;
  // Boundary-lag correction may adjust the aimed direction, but it must never
  // turn authored Roll into part of the tracking history. The ordinary base
  // track owns image tilt at every transition sample, including the exact A/B
  // boundary frames.
  let quaternion = setCameraOpticalRollDegrees(
    correctedQuaternion,
    cameraOpticalRollDegrees(pose.quaternion)
  );
  if (matchVelocity && !bracket.responseCatchup
    && track.segments.slice(bracket.aIndex, bracket.bIndex).every((segment) => segment.interpolation === "smooth")) {
    quaternion = matchTransitionVelocity(project, shot, track, bracket, elapsed, quaternion);
  }
  return {
    aim: bracket.stateB,
    quaternion,
    valid: path.valid,
    targetPosition: path.targetPosition,
    cameraPosition: pose.position,
    focalLength: pose.focalLength,
    aspectRatio: shot.aspectRatio,
    blendProgress: s,
    activeKeyframeID: keyA?.id || null,
    warning: path.warning,
    transition: {
      fromKeyframeID: keyA?.id || null,
      toKeyframeID: keyB?.id || null,
      fromAim: bracket.stateA,
      toAim: bracket.stateB,
      progress: s,
      kind: bracket.responseCatchup ? "tracking-catchup" : "state",
    },
  };
}

function cameraSegmentIsSmooth(track, elapsed) {
  const end = track.keyframes.findIndex((keyframe) => keyframe.time >= elapsed);
  const index = end < 0 ? track.segments.length - 1 : Math.max(0, end - 1);
  return track.segments[index]?.interpolation === "smooth";
}

// A cubic Hermite residual joins the incoming and outgoing direction velocities.
// Its endpoint values are zero: reached target states and authored Roll
// stay authoritative. Cache the boundary velocities rather than resampling
// the surrounding playback history on every rendered frame.
const transitionVelocityCaches = new WeakMap();
function matchTransitionVelocity(project, shot, track, bracket, elapsed, quaternion) {
  let caches = transitionVelocityCaches.get(project);
  if (!caches) transitionVelocityCaches.set(project, caches = new Map());
  let cache = caches.get(shot.id || shot);
  if (cache?.track !== shot.camera.track || cache.actors !== project.scene?.actors) {
    cache = { track: shot.camera.track, actors: project.scene?.actors, boundaries: new Map() };
    caches.set(shot.id || shot, cache);
  }
  const a = track.keyframes[bracket.aIndex].time;
  const b = track.keyframes[bracket.bIndex].time;
  const duration = b - a;
  let velocities = cache.boundaries.get(a);
  if (!velocities) {
    const step = Math.min(0.0001, duration / 1000);
    const forward = (q) => rotateVectorByQuaternion(q, { x: 0, y: 0, z: -1 });
    const raw = (time) => {
      const samples = sampleProject(project, time);
      const pose = applyCameraFollow(project, shot, sampleCameraTrack(track, time), time, samples);
      const localBracket = { ...bracket, progress: smoothStep((time - a) / duration) };
      return forward(evaluateAimPath(project, shot, track, pose, time, samples, localBracket, false).quaternion);
    };
    const actual = (time) => forward(applyShotCameraConstraints(
      project, shot, sampleCameraTrack(track, time), time
    ).quaternion);
    const steady = (time, aim) => {
      const samples = sampleProject(project, time);
      const pose = applyCameraFollow(project, shot, sampleCameraTrack(track, time), time, samples);
      return forward(resolveAim(project, shot, pose, aim, samples).quaternion);
    };
    const rate = (from, to) => scaleVector(subtractVector(to, from), 1 / step);
    const incoming = a > track.keyframes[0].time
      ? rate(actual(a - 2 * step), actual(a - step))
      : rate(raw(a), raw(a + step));
    // A newly arrived damped Lock starts with zero direction error, so its
    // chase initially has zero velocity. Free/exact Lock continues its own path.
    let outgoing = bracket.stateB.mode === "look-at" && bracket.stateB.trackingResponse > 0
      ? { x: 0, y: 0, z: 0 }
      : rate(steady(b, bracket.stateB), steady(b + step, bracket.stateB));
    const next = analyzeAimBracket(track.keyframes, b);
    if (bracket.stateB.mode === "look-at" && next.turning && !next.responseCatchup
      && track.segments.slice(next.aIndex, next.bIndex).every((segment) => segment.interpolation === "smooth")) {
      // Between two smooth turns, pass through the reached Lock state with
      // one shared tangent instead of easing to a stop at every target key.
      const c = track.keyframes[next.bIndex].time;
      outgoing = scaleVector(subtractVector(steady(c, next.stateB), raw(a)), 1 / (c - a));
    }
    velocities = {
      start: subtractVector(incoming, rate(raw(a), raw(a + step))),
      end: subtractVector(outgoing, rate(raw(b - step), raw(b))),
    };
    cache.boundaries.set(a, velocities);
  }
  const u = clamp((elapsed - a) / duration, 0, 1);
  const hStart = u * (1 - u) * (1 - u) * duration;
  const hEnd = u * u * (u - 1) * duration;
  const forward = rotateVectorByQuaternion(quaternion, { x: 0, y: 0, z: -1 });
  for (const axis of ["x", "y", "z"]) {
    forward[axis] += hStart * velocities.start[axis] + hEnd * velocities.end[axis];
  }
  return quaternionFromForwardUp(forward, opticalUpForForward(forward, cameraOpticalRollDegrees(quaternion)));
}

// The deterministic A→B path. Lock target points and the gate-space composition
// are interpolated between the two states at the current time, so the locked
// point genuinely slides (e.g. chest to head, or one actor to another) instead
// of blending two fixed camera angles. Mode-changing transitions converge on
// the live exact orientation of the arriving state (or on the authored free
// quaternion stored at B).
function transitionPathAim(project, shot, pose, actorSamples, stateA, stateB, s, keyB) {
  const aspect = shot?.aspectRatio;
  const targetA = stateA.mode === "look-at"
    ? cameraAimTargetPosition(project, actorSamples, stateA)
    : null;
  const targetB = stateB.mode === "look-at"
    ? cameraAimTargetPosition(project, actorSamples, stateB)
    : null;
  const validA = stateA.mode !== "look-at" || Boolean(targetA);
  const validB = stateB.mode !== "look-at" || Boolean(targetB);
  const targetPosition = targetA && targetB
    ? lerpVector(targetA, targetB, s)
    : targetB || targetA || null;
  const rollDegrees = cameraOpticalRollDegrees(pose.quaternion);

  let quaternion = null;
  if (stateA.mode === "look-at" && stateB.mode === "look-at" && targetA && targetB) {
    const ndcA = compositionNDCX[stateA.composition] ?? 0;
    const ndcB = compositionNDCX[stateB.composition] ?? 0;
    quaternion = lookAtQuaternionNDC(
      pose.position,
      targetPosition,
      pose.focalLength,
      aspect,
      ndcA + (ndcB - ndcA) * s,
      rollDegrees
    );
  } else if (stateB.mode === "look-at" && targetB) {
    quaternion = lookAtQuaternion(
      pose.position,
      targetB,
      pose.focalLength,
      aspect,
      stateB.composition,
      rollDegrees
    );
  } else if (stateA.mode === "look-at" && targetA && stateB.mode !== "look-at") {
    const liveA = lookAtQuaternion(
      pose.position,
      targetA,
      pose.focalLength,
      aspect,
      stateA.composition,
      rollDegrees
    );
    quaternion = liveA
      ? slerpQuaternion(liveA, normalizeQuaternion(keyB?.quaternion || pose.quaternion), s)
      : null;
  }
  if (!quaternion) {
    const fallbackA = resolveAim(project, shot, pose, stateA, actorSamples).quaternion;
    const fallbackB = stateB.mode === "look-at"
      ? resolveAim(project, shot, pose, stateB, actorSamples).quaternion
      : normalizeQuaternion(keyB?.quaternion || pose.quaternion);
    quaternion = slerpQuaternion(fallbackA, fallbackB, s);
  }
  return {
    quaternion,
    valid: validA && validB,
    targetPosition,
    warning: validA && validB
      ? null
      : resolveAim(project, shot, pose, validB ? stateA : stateB, actorSamples).warning,
  };
}

function transitionIdealQuaternion(project, shot, track, bracket, s, time) {
  const base = sampleCameraTrack(track, time);
  if (!base) return null;
  const samples = sampleProject(project, time);
  const followed = poseWithAuthoredRoll(
    track,
    applyCameraFollow(project, shot, base, time, samples),
    time
  );
  const keyB = bracket.bIndex >= 0 ? track.keyframes[bracket.bIndex] : null;
  return transitionPathAim(project, shot, followed, samples, bracket.stateA, bracket.stateB, s, keyB).quaternion;
}

function poseWithAuthoredRoll(track, pose, elapsed) {
  // A locked key can retain a base direction very different from the visible
  // direction saved on release. Interpolating those full quaternions invents
  // image tilt, even when both keys have the same Roll. Sample their optical
  // Roll on a common axis, using the existing segment easing and spline rules.
  const rollTrack = {
    ...track,
    keyframes: track.keyframes.map((keyframe) => {
      const halfRoll = cameraOpticalRollDegrees(keyframe.quaternion) * Math.PI / 360;
      return {
        ...keyframe,
        quaternion: { x: 0, y: 0, z: Math.sin(halfRoll), w: Math.cos(halfRoll) },
      };
    }),
  };
  const rollPose = sampleCameraTrack(rollTrack, elapsed);
  return {
    ...pose,
    quaternion: setCameraOpticalRollDegrees(pose.quaternion, cameraOpticalRollDegrees(rollPose.quaternion)),
  };
}

// Deterministic continuous tracking response: a fixed-substep exponential chase
// of the exact aim path. Sparse checkpoints amortize sequential playback/export
// and bound ordinary seeks to at most one checkpoint interval. Cache entries
// are scoped to an immutable project snapshot and Shot track.
// Damping only runs inside a constant Lock state after its arrival keyframe:
// keyframed A→B transitions are exact paths, and every explicit turn arrival B
// resets the chase so earlier lag never crosses B. Same-state keyframes (holds)
// and trackingResponse-only edits intentionally do not reset this history.
const trackingSubstepDuration = 1 / 120;
const trackingStepsPerCheckpoint = 30;
const trackingCheckpointDuration = trackingSubstepDuration * trackingStepsPerCheckpoint;
const trackingCachesByProject = new WeakMap();
const transitionSourceCachesByProject = new WeakMap();
const transitionBoundaryEpsilon = 0.00001;

function latestAimResetTime(keyframes, elapsed) {
  let resetTime = keyframes[0]?.time || 0;
  let previousIndex = findAimKeyframeIndex(keyframes, 0);
  if (previousIndex < 0) return resetTime;
  for (let index = previousIndex + 1; index < keyframes.length; index += 1) {
    const keyframe = keyframes[index];
    if (!keyframe || keyframe.time > elapsed + 0.000001) break;
    if (keyframe.aim == null) continue;
    if (!sameAimTurnState(keyframes[previousIndex].aim, keyframe.aim)) resetTime = keyframe.time;
    previousIndex = index;
  }
  return resetTime;
}

// The orientation actually evaluated at a transition boundary A, including any
// continuous-tracking lag. Sampling happens an epsilon BEFORE A so the source
// never re-enters the transition that starts at A; at the track start it falls
// back to the steady-state orientation of A's own aim state. Results are cached
// per project snapshot and Shot track and invalidated on track/actor identity
// change, so editing or moving a keyframe rebuilds the affected boundaries.
function boundarySourceQuaternion(project, shot, track, boundaryTime, boundaryAim) {
  const startTime = Number(track.keyframes[0]?.time || 0);
  const create = () => {
    if (boundaryTime <= startTime + transitionBoundaryEpsilon) {
      const base = sampleCameraTrack(track, startTime);
      if (!base) return null;
      const samples = sampleProject(project, startTime);
      const followed = applyCameraFollow(project, shot, base, startTime, samples);
      return resolveAim(project, shot, followed, boundaryAim, samples).quaternion;
    }
    const before = (offset) => {
      const time = boundaryTime - offset * transitionBoundaryEpsilon;
      return applyShotCameraConstraints(project, shot, sampleCameraTrack(track, time), time).quaternion;
    };
    const near = before(1);
    const far = before(2);
    const sign = quaternionDot(near, far) < 0 ? -1 : 1;
    // Recover A itself, rather than freezing the epsilon-before orientation
    // and introducing a tiny orientation discontinuity at every reached state.
    return normalizeQuaternion(Object.fromEntries(["x", "y", "z", "w"].map(
      (axis) => [axis, 2 * near[axis] - sign * far[axis]]
    )));
  };
  if (!project || typeof project !== "object") return create();

  let shotCaches = transitionSourceCachesByProject.get(project);
  if (!shotCaches) {
    shotCaches = new Map();
    transitionSourceCachesByProject.set(project, shotCaches);
  }
  const key = shot.id || shot;
  let cache = shotCaches.get(key);
  if (
    cache?.sourceTrack !== shot.camera.track
    || cache.actorSource !== project.scene?.actors
  ) {
    cache = {
      sourceTrack: shot.camera.track,
      actorSource: project.scene?.actors,
      quaternions: new Map(),
    };
    shotCaches.set(key, cache);
  }
  if (!cache.quaternions.has(boundaryTime)) cache.quaternions.set(boundaryTime, create());
  return cache.quaternions.get(boundaryTime);
}

function dampedTrackingQuaternion(project, shot, track, elapsed, exact) {
  const startTime = clamp(latestAimResetTime(track.keyframes, elapsed), 0, elapsed);
  if (elapsed <= startTime + 0.000001) return exact.quaternion;
  const cache = trackingCache(project, shot, track, startTime);
  if (!cache) return exact.quaternion;
  const relativeStep = Math.max(
    0,
    Math.ceil((elapsed - startTime) / trackingSubstepDuration - 0.000000001) - 1
  );
  const checkpointIndex = Math.floor(relativeStep / trackingStepsPerCheckpoint);
  ensureTrackingCheckpoint(cache, checkpointIndex);
  let quaternion = cache.checkpoints[checkpointIndex];
  let time = startTime + checkpointIndex * trackingCheckpointDuration;
  while (time < elapsed - 0.000001) {
    const nextTime = Math.min(time + trackingSubstepDuration, elapsed);
    const step = nextTime - time;
    const endpoint = nextTime >= elapsed - 0.000001
      ? exact
      : exactAimAtTime(cache, nextTime);
    if (!endpoint) break;
    quaternion = advanceTrackingQuaternion(
      quaternion,
      endpoint,
      effectiveAimAtTime(track, time + step * 0.5),
      step
    );
    time = nextTime;
  }
  return quaternion;
}

function trackingCache(project, shot, track, startTime) {
  const baseStartPose = sampleCameraTrack(track, startTime);
  if (!baseStartPose) return null;
  const create = () => {
    const startPose = applyCameraFollow(
      project,
      shot,
      baseStartPose,
      startTime,
      sampleProject(project, startTime)
    );
    const start = evaluateAimPath(project, shot, track, startPose, startTime);
    return {
      project,
      shot,
      sourceTrack: shot.camera.track,
      actorSource: project?.scene?.actors,
      track,
      startTime,
      checkpoints: [start.quaternion],
    };
  };
  if (!project || typeof project !== "object") return create();
  let shotCaches = trackingCachesByProject.get(project);
  if (!shotCaches) {
    shotCaches = new Map();
    trackingCachesByProject.set(project, shotCaches);
  }
  const key = shot.id || shot;
  const cached = shotCaches.get(key);
  if (
    cached?.sourceTrack === shot.camera.track
    && cached.actorSource === project.scene?.actors
    && Math.abs(cached.startTime - startTime) < 0.000001
  ) {
    return cached;
  }
  const next = create();
  shotCaches.set(key, next);
  return next;
}

function ensureTrackingCheckpoint(cache, checkpointIndex) {
  while (cache.checkpoints.length <= checkpointIndex) {
    const startIndex = cache.checkpoints.length - 1;
    let quaternion = cache.checkpoints[startIndex];
    let time = cache.startTime + startIndex * trackingCheckpointDuration;
    for (let stepIndex = 0; stepIndex < trackingStepsPerCheckpoint; stepIndex += 1) {
      const nextTime = time + trackingSubstepDuration;
      const endpoint = exactAimAtTime(cache, nextTime);
      if (!endpoint) break;
      quaternion = advanceTrackingQuaternion(
        quaternion,
        endpoint,
        effectiveAimAtTime(cache.track, time + trackingSubstepDuration * 0.5),
        trackingSubstepDuration
      );
      time = nextTime;
    }
    cache.checkpoints.push(quaternion);
  }
}

function exactAimAtTime(cache, time) {
  const basePose = sampleCameraTrack(cache.track, time);
  const pose = basePose
    ? applyCameraFollow(cache.project, cache.shot, basePose, time, sampleProject(cache.project, time))
    : null;
  return pose
    ? evaluateAimPath(cache.project, cache.shot, cache.track, pose, time)
    : null;
}

function effectiveAimAtTime(track, elapsed) {
  const activeIndex = Math.max(0, findActiveKeyframeIndex(track.keyframes, elapsed));
  const aimIndex = findAimKeyframeIndex(track.keyframes, activeIndex);
  return normalizeCameraAim(track.keyframes[aimIndex]?.aim);
}

function advanceTrackingQuaternion(quaternion, endpoint, stepAim, stepDuration) {
  const response = stepAim.mode === "look-at" && endpoint.valid
    ? clamp(Number(stepAim.trackingResponse) || 0, 0, 2)
    : 0;
  if (response <= 0) return endpoint.quaternion;
  const damped = setCameraOpticalRollDegrees(
    slerpQuaternion(
      quaternion,
      endpoint.quaternion,
      1 - Math.exp(-stepDuration / response)
    ),
    cameraOpticalRollDegrees(endpoint.quaternion)
  );
  return clampTrackingToHardLimit(damped, endpoint, stepAim);
}

// Keep the existing exponential response while adding a Cinemachine-style
// hard framing pass. If the damped orientation lets the real target leave its
// screen-space safety rectangle, move only as far toward the exact Look At as
// necessary to place the target back on the boundary. Bisection keeps the
// correction deterministic and preserves the authored optical Roll at every
// probe; it also handles large jumps where the lagged target is behind camera.
function clampTrackingToHardLimit(dampedQuaternion, endpoint, stepAim) {
  if (
    !endpoint?.targetPosition
    || !endpoint?.cameraPosition
    || !Number.isFinite(endpoint?.focalLength)
  ) {
    return dampedQuaternion;
  }
  const bounds = trackingHardLimitBounds(stepAim.composition);
  const inside = (quaternion) => targetInsideTrackingBounds(
    quaternion,
    endpoint.cameraPosition,
    endpoint.targetPosition,
    endpoint.focalLength,
    endpoint.aspectRatio,
    bounds
  );
  if (inside(dampedQuaternion)) return dampedQuaternion;

  const rollDegrees = cameraOpticalRollDegrees(endpoint.quaternion);
  let outsideAmount = 0;
  let insideAmount = 1;
  let insideQuaternion = endpoint.quaternion;
  if (!inside(insideQuaternion)) return endpoint.quaternion;
  for (let iteration = 0; iteration < trackingHardLimitIterations; iteration += 1) {
    const amount = (outsideAmount + insideAmount) * 0.5;
    const candidate = setCameraOpticalRollDegrees(
      slerpQuaternion(dampedQuaternion, endpoint.quaternion, amount),
      rollDegrees
    );
    if (inside(candidate)) {
      insideAmount = amount;
      insideQuaternion = candidate;
    } else {
      outsideAmount = amount;
    }
  }
  return insideQuaternion;
}

function trackingHardLimitBounds(composition) {
  const centerX = compositionNDCX[composition] ?? 0;
  return {
    minimumX: centerX - trackingHardLimitHalfWidth,
    maximumX: centerX + trackingHardLimitHalfWidth,
    minimumY: -trackingHardLimitHalfHeight,
    maximumY: trackingHardLimitHalfHeight,
  };
}

function targetInsideTrackingBounds(
  quaternion,
  cameraPosition,
  targetPosition,
  focalLengthInput,
  aspectRatio,
  bounds
) {
  const ndc = targetGateNDC(
    quaternion,
    cameraPosition,
    targetPosition,
    focalLengthInput,
    aspectRatio
  );
  if (!ndc) return false;
  const epsilon = 0.000001;
  return ndc.x >= bounds.minimumX - epsilon
    && ndc.x <= bounds.maximumX + epsilon
    && ndc.y >= bounds.minimumY - epsilon
    && ndc.y <= bounds.maximumY + epsilon;
}

function targetGateNDC(
  quaternionInput,
  cameraPosition,
  targetPosition,
  focalLengthInput,
  aspectRatio
) {
  const direction = subtractVector(targetPosition, cameraPosition);
  const quaternion = normalizeQuaternion(quaternionInput);
  const local = rotateVectorByQuaternion(quaternionInverse(quaternion), direction);
  if (!local || local.z >= -0.000001) return null;
  const gate = cameraSensorGate(aspectRatio);
  const focalLength = clamp(
    Number(focalLengthInput || 35),
    cameraFocalLengthMinimum,
    cameraFocalLengthMaximum
  );
  const horizontalTangent = gate.width / (2 * focalLength);
  const verticalTangent = gate.height / (2 * focalLength);
  return {
    x: (local.x / -local.z) / horizontalTangent,
    y: (local.y / -local.z) / verticalTangent,
  };
}

export function cameraAimTargetPosition(project, actorSamples, aimInput) {
  const aim = normalizeCameraAim(aimInput);
  if (aim.mode !== "look-at") return null;
  if (aim.targetKind === "world") return { ...aim.worldPosition };
  if (aim.targetKind === "environment") return cameraFocusTargetPosition(project, actorSamples, aim).position;
  if (!aim.targetActorID) return null;
  const actor = project?.scene?.actors?.find((candidate) => candidate.id === aim.targetActorID);
  const sample = actorSamples instanceof Map ? actorSamples.get(aim.targetActorID) : null;
  if (!actor || !sample?.position) return null;
  if (isBlockingActor(actor)) return blockingTargetPosition(actor, sample, clamp(Number(aim.actorHeight), 0, 1));
  const height = actorHeadHeightMeters * clamp(
    Number(aim.actorHeight),
    cameraAimActorHeightPresets.ground,
    cameraAimActorHeightPresets.head
  );
  const scale = clamp(Number(actor.scale || 1), 0.5, 2);
  return {
    x: Number(sample.position.x || 0),
    y: Number(sample.position.y || 0) + height * scale,
    z: Number(sample.position.z || 0),
  };
}

export function lookAtQuaternion(
  position,
  target,
  focalLengthInput,
  aspectRatio,
  composition = "center",
  rollDegrees = 0
) {
  return lookAtQuaternionNDC(
    position,
    target,
    focalLengthInput,
    aspectRatio,
    compositionNDCX[composition] ?? 0,
    rollDegrees
  );
}

// Continuous-composition variant: ndcX is the gate-space horizontal target
// position and may take any interpolated value between the discrete presets.
// Roll is solved around the final optical axis, so a tilted frame still places
// the target on the requested horizontal composition line instead of rotating
// that point away from the line.
function lookAtQuaternionNDC(
  position,
  target,
  focalLengthInput,
  aspectRatio,
  ndcXInput = 0,
  rollDegreesInput = 0
) {
  const direction = normalizeVector(subtractVector(target, position));
  if (!direction) return null;
  const gate = cameraSensorGate(aspectRatio);
  const focalLength = clamp(
    Number(focalLengthInput || 35),
    cameraFocalLengthMinimum,
    cameraFocalLengthMaximum
  );
  const horizontalHalfFov = Math.atan(gate.width / (2 * focalLength));
  const ndcX = clamp(Number(ndcXInput) || 0, -1, 1);
  const offsetAngle = Math.atan(ndcX * Math.tan(horizontalHalfFov));
  const rollDegrees = normalizedDegrees(rollDegreesInput);
  let forward = direction;
  let up = opticalUpForForward(forward, rollDegrees);
  // Third-line composition with Roll is a small fixed-point problem: the
  // horizontal gate axis depends on the rolled up-axis, which in turn depends
  // on the final forward direction. A bounded deterministic iteration converges
  // well inside sub-pixel precision for the supported focal lengths.
  for (let iteration = 0; iteration < 12; iteration += 1) {
    up = opticalUpForForward(forward, rollDegrees);
    forward = rotateAroundAxis(direction, up, offsetAngle);
  }
  up = opticalUpForForward(forward, rollDegrees);
  return quaternionFromForwardUp(forward, up);
}

// Roll is authored as image tilt around the current optical axis. Keeping this
// operation independent from Euler pitch/yaw avoids gimbal coupling and lets
// Look At own direction while the user still owns composition tilt.
export function cameraOpticalRollDegrees(quaternionInput) {
  const quaternion = normalizeQuaternion(quaternionInput);
  const forward = normalizeVector(rotateVectorByQuaternion(quaternion, { x: 0, y: 0, z: -1 }));
  const actualUp = normalizeVector(rotateVectorByQuaternion(quaternion, { x: 0, y: 1, z: 0 }));
  if (!forward || !actualUp) return 0;
  const horizonUp = horizonUpForForward(forward);
  const backward = scaleVector(forward, -1);
  const sine = dotVector(backward, crossVector(horizonUp, actualUp));
  const cosine = clamp(dotVector(horizonUp, actualUp), -1, 1);
  return normalizedDegrees(Math.atan2(sine, cosine) * 180 / Math.PI);
}

export function setCameraOpticalRollDegrees(quaternionInput, rollDegreesInput = 0) {
  const quaternion = normalizeQuaternion(quaternionInput);
  const forward = normalizeVector(rotateVectorByQuaternion(quaternion, { x: 0, y: 0, z: -1 }));
  if (!forward) return quaternion;
  return quaternionFromForwardUp(
    forward,
    opticalUpForForward(forward, normalizedDegrees(rollDegreesInput))
  ) || quaternion;
}

// 机位存的是一个姿势，不是正在飞的相机 —— Shot 的俯仰/水平/翻滚读的是渲染器里
// 那台活相机的实时角度（director-app.js 里 rotation 在 Scene View 下直接是 null），
// 机位没有对应的东西。这两个函数把存下来的四元数拆成三个角、再拼回去，
// 拆法与渲染器给 Shot 相机用的一致：翻滚单独走光学滚转，俯仰/水平从零滚转的
// 前向量取，两者因此不会互相耦合。
export function cameraRotationDegrees(quaternionInput) {
  const roll = cameraOpticalRollDegrees(quaternionInput);
  const neutral = setCameraOpticalRollDegrees(quaternionInput, 0);
  const forward = normalizeVector(
    rotateVectorByQuaternion(neutral, { x: 0, y: 0, z: -1 })
  ) || { x: 0, y: 0, z: -1 };
  return {
    pitch: normalizedDegrees(Math.asin(clamp(forward.y, -1, 1)) * 180 / Math.PI),
    yaw: normalizedDegrees(Math.atan2(-forward.x, -forward.z) * 180 / Math.PI),
    roll,
  };
}

export function cameraQuaternionFromRotationDegrees(rotationInput) {
  // 俯仰卡在 ±89.43°（π/2 − 0.01），和渲染器同一个界：正上或正下时水平角无从分解。
  const limit = Math.PI / 2 - 0.01;
  const pitch = clamp(Number(rotationInput?.pitch) || 0, -limit * 180 / Math.PI, limit * 180 / Math.PI)
    * Math.PI / 180;
  const yaw = (Number(rotationInput?.yaw) || 0) * Math.PI / 180;
  const forward = {
    x: -Math.cos(pitch) * Math.sin(yaw),
    y: Math.sin(pitch),
    z: -Math.cos(pitch) * Math.cos(yaw),
  };
  const roll = normalizedDegrees(Number(rotationInput?.roll) || 0);
  return quaternionFromForwardUp(forward, opticalUpForForward(forward, roll))
    || { x: 0, y: 0, z: 0, w: 1 };
}

function resolveAim(project, shot, pose, aim, actorSamples) {
  if (aim.mode !== "look-at") {
    return { quaternion: pose.quaternion, valid: true, targetPosition: null, warning: null };
  }
  const targetPosition = cameraAimTargetPosition(project, actorSamples, aim);
  if (!targetPosition) {
    return {
      quaternion: pose.quaternion,
      valid: false,
      targetPosition: null,
      warning: "锁定目标不可用；当前使用已保存的自由朝向。",
    };
  }
  const quaternion = lookAtQuaternion(
    pose.position,
    targetPosition,
    pose.focalLength,
    shot.aspectRatio,
    aim.composition,
    cameraOpticalRollDegrees(pose.quaternion)
  );
  if (!quaternion) {
    return {
      quaternion: pose.quaternion,
      valid: false,
      targetPosition,
      warning: "摄影机与目标位置重合；当前使用已保存的自由朝向。",
    };
  }
  return { quaternion, valid: true, targetPosition, warning: null };
}

function findActiveKeyframeIndex(keyframes, elapsed) {
  const index = keyframes.findLastIndex((keyframe) => keyframe.time <= elapsed + 0.000001);
  return index >= 0 ? index : 0;
}

function findAimKeyframeIndex(keyframes, startIndex) {
  if (startIndex < 0) return -1;
  for (let index = Math.min(startIndex, keyframes.length - 1); index >= 0; index -= 1) {
    if (keyframes[index]?.aim != null) return index;
  }
  return -1;
}

// Turn-relevant state comparison only: mode / target / height / composition.
// trackingResponse is deliberately excluded (it governs post-arrival tracking,
// never the keyframed turn), and a Free state ignores any stored target fields
// so two Free keyframes can never manufacture a spurious transition.
function canonicalAimTurnState(aimInput) {
  const aim = normalizeCameraAim(aimInput);
  if (aim.mode !== "look-at") {
    return {
      mode: "free",
      targetKind: "actor",
      targetActorID: null,
      actorHeight: cameraAimActorHeightPresets.chest,
      worldPosition: null,
      composition: "center",
    };
  }
  return {
    mode: aim.mode,
    targetKind: aim.targetKind,
    targetActorID: aim.targetKind === "actor" ? aim.targetActorID : null,
    actorHeight: aim.targetKind === "actor" ? aim.actorHeight : null,
    worldPosition: aim.targetKind === "world" ? aim.worldPosition : null,
    environmentID: aim.targetKind === "environment" ? aim.environmentID : null,
    localPosition: aim.targetKind === "environment" ? aim.localPosition : null,
    composition: aim.composition,
  };
}

function sameAimTurnState(leftInput, rightInput) {
  const left = canonicalAimTurnState(leftInput);
  const right = canonicalAimTurnState(rightInput);
  return left.mode === right.mode
    && left.targetKind === right.targetKind
    && left.targetActorID === right.targetActorID
    && left.actorHeight === right.actorHeight
    && sameVector(left.worldPosition, right.worldPosition)
    && left.environmentID === right.environmentID
    && sameVector(left.localPosition, right.localPosition)
    && left.composition === right.composition;
}

function sameVector(left, right) {
  if (left == null || right == null) return left === right;
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function quaternionFromForwardUp(forwardInput, upInput) {
  const forward = normalizeVector(forwardInput);
  if (!forward) return null;
  let right = normalizeVector(crossVector(forward, upInput));
  if (!right) right = normalizeVector(crossVector(forward, { x: 0, y: 0, z: 1 })) || { x: 1, y: 0, z: 0 };
  const up = normalizeVector(crossVector(right, forward)) || { x: 0, y: 1, z: 0 };
  const m11 = right.x;
  const m12 = up.x;
  const m13 = -forward.x;
  const m21 = right.y;
  const m22 = up.y;
  const m23 = -forward.y;
  const m31 = right.z;
  const m32 = up.z;
  const m33 = -forward.z;
  const trace = m11 + m22 + m33;
  let quaternion;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    quaternion = {
      w: 0.25 / s,
      x: (m32 - m23) * s,
      y: (m13 - m31) * s,
      z: (m21 - m12) * s,
    };
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    quaternion = {
      w: (m32 - m23) / s,
      x: 0.25 * s,
      y: (m12 + m21) / s,
      z: (m13 + m31) / s,
    };
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    quaternion = {
      w: (m13 - m31) / s,
      x: (m12 + m21) / s,
      y: 0.25 * s,
      z: (m23 + m32) / s,
    };
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    quaternion = {
      w: (m21 - m12) / s,
      x: (m13 + m31) / s,
      y: (m23 + m32) / s,
      z: 0.25 * s,
    };
  }
  return normalizeQuaternion(quaternion);
}

function horizonUpForForward(forwardInput) {
  const forward = normalizeVector(forwardInput) || { x: 0, y: 0, z: -1 };
  let right = normalizeVector(crossVector(forward, { x: 0, y: 1, z: 0 }));
  if (!right) {
    right = normalizeVector(crossVector(forward, { x: 0, y: 0, z: 1 }))
      || { x: 1, y: 0, z: 0 };
  }
  return normalizeVector(crossVector(right, forward)) || { x: 0, y: 1, z: 0 };
}

function opticalUpForForward(forwardInput, rollDegreesInput = 0) {
  const forward = normalizeVector(forwardInput) || { x: 0, y: 0, z: -1 };
  return rotateAroundAxis(
    horizonUpForForward(forward),
    scaleVector(forward, -1),
    normalizedDegrees(rollDegreesInput) * Math.PI / 180
  );
}

function rotateVectorByQuaternion(quaternionInput, vector) {
  const quaternion = normalizeQuaternion(quaternionInput);
  const qVector = { x: quaternion.x, y: quaternion.y, z: quaternion.z };
  const uv = crossVector(qVector, vector);
  const uuv = crossVector(qVector, uv);
  return {
    x: vector.x + 2 * (quaternion.w * uv.x + uuv.x),
    y: vector.y + 2 * (quaternion.w * uv.y + uuv.y),
    z: vector.z + 2 * (quaternion.w * uv.z + uuv.z),
  };
}

function rotateAroundAxis(vector, axisInput, angle) {
  const axis = normalizeVector(axisInput) || { x: 0, y: 1, z: 0 };
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dot = dotVector(axis, vector);
  const cross = crossVector(axis, vector);
  return normalizeVector({
    x: vector.x * cosine + cross.x * sine + axis.x * dot * (1 - cosine),
    y: vector.y * cosine + cross.y * sine + axis.y * dot * (1 - cosine),
    z: vector.z * cosine + cross.z * sine + axis.z * dot * (1 - cosine),
  }) || vector;
}

function quaternionMultiply(leftInput, rightInput) {
  const left = normalizeQuaternion(leftInput);
  const right = normalizeQuaternion(rightInput);
  return normalizeQuaternion({
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
  });
}

function quaternionInverse(quaternion) {
  const normalized = normalizeQuaternion(quaternion);
  return { x: -normalized.x, y: -normalized.y, z: -normalized.z, w: normalized.w };
}

function slerpQuaternion(fromInput, toInput, alphaInput) {
  const from = normalizeQuaternion(fromInput);
  let to = normalizeQuaternion(toInput);
  const alpha = clamp(alphaInput, 0, 1);
  let dot = quaternionDot(from, to);
  if (dot < 0) {
    dot = -dot;
    to = { x: -to.x, y: -to.y, z: -to.z, w: -to.w };
  }
  if (dot > 0.9995) {
    return normalizeQuaternion({
      x: from.x + (to.x - from.x) * alpha,
      y: from.y + (to.y - from.y) * alpha,
      z: from.z + (to.z - from.z) * alpha,
      w: from.w + (to.w - from.w) * alpha,
    });
  }
  const theta = Math.acos(clamp(dot, -1, 1));
  const sine = Math.sin(theta);
  const leftWeight = Math.sin((1 - alpha) * theta) / sine;
  const rightWeight = Math.sin(alpha * theta) / sine;
  return normalizeQuaternion({
    x: from.x * leftWeight + to.x * rightWeight,
    y: from.y * leftWeight + to.y * rightWeight,
    z: from.z * leftWeight + to.z * rightWeight,
    w: from.w * leftWeight + to.w * rightWeight,
  });
}

function normalizeQuaternion(value) {
  const length = Math.hypot(value?.x || 0, value?.y || 0, value?.z || 0, value?.w || 0) || 1;
  return {
    x: Number(value?.x || 0) / length,
    y: Number(value?.y || 0) / length,
    z: Number(value?.z || 0) / length,
    w: Number(value?.w || 0) / length,
  };
}

function normalizeVector(value) {
  const length = Math.hypot(value?.x || 0, value?.y || 0, value?.z || 0);
  if (length < 0.000001) return null;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function subtractVector(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function lerpVector(left, right, alpha) {
  return {
    x: lerp(left.x, right.x, alpha),
    y: lerp(left.y, right.y, alpha),
    z: lerp(left.z, right.z, alpha),
  };
}

function scaleVector(vector, scalar) {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
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

function quaternionDot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
}

function smoothStep(value) {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function normalizedDegrees(valueInput) {
  const value = Number(valueInput) || 0;
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value)));
}

// Direction is machine-owned while Lock is active and throughout every
// keyframed aim transition (including Lock → Free). Shot View therefore blocks
// pitch/yaw in both cases, while optical-axis Roll remains user-authored.
export function aimOrientationLocked(pose) {
  const evaluation = pose?.aimEvaluation;
  return evaluation?.mode === "look-at" || evaluation?.transition != null;
}
