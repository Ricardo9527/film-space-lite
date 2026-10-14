export const cameraTrackEasings = ["linear", "ease-in-out", "smooth"];
export const cameraAimModes = ["free", "look-at"];
export const cameraAimTargetKinds = ["actor", "environment", "world"];
export const cameraFocusTargetKinds = ["actor", "blockout", "environment", "world"];
export const cameraAimAnchors = ["head", "chest", "pelvis", "ground", "custom"];
export const cameraAimActorHeightPresets = Object.freeze({
  ground: 0,
  pelvis: 0.86 / 1.62,
  chest: 1.18 / 1.62,
  head: 1,
});
export const cameraAimCompositions = ["center", "left-third", "right-third"];
export const defaultCameraAimTrackingResponse = 0;
export const recommendedCameraAimTrackingResponse = 0.35;
export const defaultCameraTrackDuration = 4;
export const defaultCameraFocalLength = 35;
export const cameraFocalLengthMinimum = 12;
export const cameraFocalLengthMaximum = 200;
export const cameraFocalLengthStops = Object.freeze([12, 18, 24, 35, 50, 85, 135, 200]);
export const defaultCameraFocusDistance = 5;
export const cameraFocusDistanceMinimum = 0.1;
export const cameraFocusDistanceMaximum = 1000;
export const defaultCameraAperture = 2.8;
export const cameraApertureMinimum = 1.4;
export const cameraApertureMaximum = 16;

export function normalizeCameraFocusTracking(input = {}) {
  const targetKind = cameraFocusTargetKinds.includes(input?.targetKind)
    ? input.targetKind
    : "world";
  return {
    enabled: input?.enabled === true,
    targetKind,
    targetActorID: cleanEntityID(input?.targetActorID),
    actorHeight: clampFinite(input?.actorHeight, 0, 1, cameraAimActorHeightPresets.chest),
    environmentID: cleanEntityID(input?.environmentID),
    blockoutGroupID: cleanEntityID(input?.blockoutGroupID),
    blockoutObjectID: cleanEntityID(input?.blockoutObjectID),
    localPosition: finiteVector(input?.localPosition)
      ? numericVector(input.localPosition)
      : { x: 0, y: 0, z: 0 },
    worldPosition: finiteVector(input?.worldPosition)
      ? numericVector(input.worldPosition)
      : { x: 0, y: 0, z: 0 },
  };
}

export function normalizeCameraFollow(input = {}) {
  return {
    enabled: input?.enabled === true,
    targetActorID: typeof input?.targetActorID === "string"
      && input.targetActorID.trim()
      && input.targetActorID.length <= 200
      ? input.targetActorID
      : null,
    referenceTime: clampFinite(input?.referenceTime, 0, 3600, 0),
  };
}

export function createCameraTrack(options = {}) {
  const keyframes = Array.isArray(options.keyframes)
    ? options.keyframes.map((keyframe, index) => normalizeCameraKeyframe(keyframe, index)).filter(Boolean)
    : [];
  keyframes.sort((left, right) => left.time - right.time);
  if (keyframes.length && keyframes[0]?.aim == null) {
    keyframes[0] = { ...keyframes[0], aim: normalizeCameraAim() };
  }
  if (keyframes.length && keyframes[0]?.follow == null) {
    keyframes[0] = { ...keyframes[0], follow: normalizeCameraFollow() };
  }
  if (keyframes.length && keyframes[0]?.focusTracking == null) {
    keyframes[0] = { ...keyframes[0], focusTracking: normalizeCameraFocusTracking() };
  }
  const sourceDuration = keyframes.at(-1)?.time || 0;
  const interpolation = cameraTrackEasings.includes(options.interpolation)
    ? options.interpolation
    : cameraTrackEasings.includes(options.easing)
      ? options.easing
      : "ease-in-out";
  return {
    interpolation,
    keyframes,
    segments: normalizeCameraSegments(options.segments, keyframes, interpolation),
    outTime: clampFinite(options.outTime, 0, sourceDuration, sourceDuration),
  };
}

export function cameraTrackReady(track) {
  return createCameraTrack(track).keyframes.some((keyframe) => keyframe.time === 0);
}

export function cameraTrackDuration(track) {
  return createCameraTrack(track).outTime;
}

export function cameraTrackSourceDuration(track) {
  return createCameraTrack(track).keyframes.at(-1)?.time || 0;
}

export function cameraTrackSegments(track) {
  return createCameraTrack(track).segments.map((segment) => ({ ...segment }));
}

export function cameraTrackSegmentAtTime(track, timeInput = 0) {
  const normalized = createCameraTrack(track);
  if (!normalized.segments.length) return null;
  const time = clampFinite(timeInput, 0, 3600, 0);
  let index = normalized.keyframes.findIndex((keyframe, keyframeIndex) => (
    keyframeIndex > 0 && time < keyframe.time - 0.000001
  )) - 1;
  if (index < 0) index = normalized.segments.length - 1;
  index = Math.max(0, Math.min(index, normalized.segments.length - 1));
  const segment = normalized.segments[index];
  const start = normalized.keyframes[index];
  const end = normalized.keyframes[index + 1];
  return {
    ...segment,
    index,
    startTime: start.time,
    endTime: end.time,
    duration: Math.max(end.time - start.time, 0),
  };
}

export function cameraTrackEndpoints(track) {
  const keyframes = createCameraTrack(track).keyframes;
  const startKeyframe = keyframes.find((keyframe) => keyframe.time === 0) || null;
  const outTime = normalizedTrackOutTime(track);
  const endPose = outTime > 0 ? sampleCameraTrack(track, outTime) : null;
  return {
    start: startKeyframe ? cameraPoseFromKeyframe(startKeyframe) : null,
    end: endPose ? cameraPoseFromKeyframe(endPose) : null,
  };
}

export function sampleCameraTrack(track, elapsedInput = 0) {
  const normalized = createCameraTrack(track);
  const keyframes = normalized.keyframes;
  if (!keyframes.length) return null;
  if (keyframes.length === 1) {
    return {
      ...cameraPoseFromKeyframe(keyframes[0]),
      progress: 1,
      easedProgress: 1,
      completed: true,
    };
  }

  const duration = cameraTrackDuration(normalized);
  const elapsedInputNumber = Math.max(Number(elapsedInput || 0), 0);
  const elapsed = clamp(elapsedInputNumber, 0, duration);
  const completed = elapsedInputNumber >= duration;
  if (elapsed <= keyframes[0].time) {
    return cameraPoseSample(keyframes[0], 0, 0, completed);
  }
  if (elapsed >= keyframes.at(-1).time) {
    return cameraPoseSample(keyframes.at(-1), duration > 0 ? elapsed / duration : 1, 1, completed);
  }
  let endIndex = keyframes.findIndex((keyframe) => keyframe.time >= elapsed);
  if (endIndex < 1) endIndex = 1;
  const start = keyframes[endIndex - 1];
  const end = keyframes[endIndex] || keyframes.at(-1);
  const segmentDuration = Math.max(end.time - start.time, 0.000001);
  const progress = clamp((elapsed - start.time) / segmentDuration, 0, 1);
  const segmentInterpolation = normalized.segments[endIndex - 1]?.interpolation || normalized.interpolation;
  if (segmentInterpolation === "smooth") {
    const easedProgress = keyframes.length === 2 ? smoothStep(progress) : progress;
    return {
      position: smoothVector(normalized, endIndex - 1, progress),
      quaternion: keyframes.length === 2
        ? slerpQuaternion(start.quaternion, end.quaternion, easedProgress)
        : smoothQuaternion(keyframes, endIndex - 1, progress),
      focalLength: keyframes.length === 2
        ? lerp(start.focalLength, end.focalLength, easedProgress)
        : clamp(
            smoothScalar(keyframes, endIndex - 1, progress, "focalLength"),
            cameraFocalLengthMinimum,
            cameraFocalLengthMaximum
          ),
      focusDistance: keyframes.length === 2
        ? lerp(start.focusDistance, end.focusDistance, easedProgress)
        : clamp(
            smoothScalar(keyframes, endIndex - 1, progress, "focusDistance"),
            cameraFocusDistanceMinimum,
            cameraFocusDistanceMaximum
          ),
      aperture: keyframes.length === 2
        ? lerp(start.aperture, end.aperture, easedProgress)
        : clamp(
            smoothScalar(keyframes, endIndex - 1, progress, "aperture"),
            cameraApertureMinimum,
            cameraApertureMaximum
          ),
      progress: duration > 0 ? elapsed / duration : 1,
      easedProgress,
      completed,
    };
  }
  const easedProgress = segmentInterpolation === "linear" ? progress : smoothStep(progress);
  return {
    position: lerpVector(start.position, end.position, easedProgress),
    quaternion: slerpQuaternion(start.quaternion, end.quaternion, easedProgress),
    focalLength: lerp(start.focalLength, end.focalLength, easedProgress),
    focusDistance: lerp(start.focusDistance, end.focusDistance, easedProgress),
    aperture: lerp(start.aperture, end.aperture, easedProgress),
    progress: duration > 0 ? elapsed / duration : 1,
    easedProgress,
    completed,
  };
}

export function sampleCameraTrackPath(track, samplesPerSegmentInput = 16) {
  const normalized = createCameraTrack(track);
  const keyframes = normalized.keyframes;
  if (!normalized.segments.some((segment) => segment.interpolation === "smooth") || keyframes.length < 3) {
    return keyframes.map((keyframe) => ({ time: keyframe.time, ...cameraPoseFromKeyframe(keyframe) }));
  }
  const samplesPerSegment = Math.round(clampFinite(samplesPerSegmentInput, 4, 48, 16));
  const sourceTrack = createCameraTrack({
    ...normalized,
    outTime: keyframes.at(-1).time,
  });
  const samples = [];
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const start = keyframes[index];
    const end = keyframes[index + 1];
    const smooth = normalized.segments[index]?.interpolation === "smooth";
    const steps = smooth ? samplesPerSegment : 1;
    for (let step = 0; step < steps; step += 1) {
      const time = lerp(start.time, end.time, step / steps);
      samples.push({ time, ...sampleCameraTrack(sourceTrack, time) });
    }
  }
  const last = keyframes.at(-1);
  samples.push({ time: last.time, ...cameraPoseFromKeyframe(last) });
  return samples;
}

export function setCameraTrackEndpoint(track, endpoint, pose, durationInput = defaultCameraTrackDuration) {
  const normalized = createCameraTrack(track);
  let normalizedPose = normalizeCameraPose(pose);
  if (!normalizedPose) return normalized;
  const duration = clampFinite(durationInput, 0.5, 3600, defaultCameraTrackDuration);
  const existing = endpoint === "end"
    ? normalized.keyframes.findLast((keyframe) => keyframe.time > 0) || null
    : normalized.keyframes.find((keyframe) => keyframe.time === 0) || null;
  normalizedPose = preserveMissingCameraOptics(pose, normalizedPose, existing);
  const keyframe = {
    id: endpoint === "end" ? existingKeyframeID(existing, "camera-end") : existingKeyframeID(existing, "camera-start"),
    time: endpoint === "end" ? duration : 0,
    ...normalizedPose,
    aim: existing?.aim == null
      ? endpoint === "end" ? null : normalizeCameraAim()
      : normalizeCameraAim(existing.aim),
    follow: existing?.follow == null
      ? endpoint === "end" ? null : normalizeCameraFollow()
      : normalizeCameraFollow(existing.follow),
    focusTracking: existing?.focusTracking == null
      ? endpoint === "end" ? null : normalizeCameraFocusTracking()
      : normalizeCameraFocusTracking(existing.focusTracking),
  };
  let keyframes;
  if (endpoint === "end") {
    const endIndex = normalized.keyframes.findLastIndex((candidate) => candidate.time > 0);
    keyframes = endIndex >= 0
      ? normalized.keyframes.map((candidate, index) => index === endIndex ? keyframe : candidate)
      : [...normalized.keyframes, keyframe];
  } else {
    const startIndex = normalized.keyframes.findIndex((candidate) => candidate.time === 0);
    keyframes = startIndex >= 0
      ? normalized.keyframes.map((candidate, index) => index === startIndex ? keyframe : candidate)
      : [keyframe, ...normalized.keyframes];
  }
  return createCameraTrack({
    ...normalized,
    keyframes,
    outTime: endpoint === "end" ? duration : normalized.outTime,
  });
}

export function setCameraTrackDuration(track, durationInput) {
  const normalized = createCameraTrack(track);
  if (normalized.keyframes.length < 2) return normalized;
  const previousDuration = cameraTrackSourceDuration(normalized) || defaultCameraTrackDuration;
  const duration = clampFinite(durationInput, 0.5, 3600, previousDuration);
  const scale = duration / previousDuration;
  return createCameraTrack({
    ...normalized,
    outTime: duration,
    keyframes: normalized.keyframes.map((keyframe) => {
      const time = keyframe.time === 0 ? 0 : keyframe.time * scale;
      return {
        ...keyframe,
        time,
        follow: followAtMovedKeyframe(keyframe.follow, keyframe.time, time),
      };
    }),
  });
}

export function setCameraTrackInterpolation(track, interpolationInput) {
  const normalized = createCameraTrack(track);
  const interpolation = cameraTrackEasings.includes(interpolationInput)
    ? interpolationInput
    : normalized.interpolation;
  return createCameraTrack({
    ...normalized,
    interpolation,
    segments: normalized.segments.map((segment) => ({ ...segment, interpolation })),
  });
}

export function setCameraSegmentInterpolation(track, startKeyframeID, interpolationInput) {
  const normalized = createCameraTrack(track);
  if (!cameraTrackEasings.includes(interpolationInput)) return normalized;
  if (!normalized.segments.some((segment) => segment.startKeyframeID === startKeyframeID)) return normalized;
  return createCameraTrack({
    ...normalized,
    segments: normalized.segments.map((segment) => segment.startKeyframeID === startKeyframeID
      ? { ...segment, interpolation: interpolationInput }
      : segment),
  });
}

export function cameraKeyframeAtTime(track, timeInput, frameRateInput = 30) {
  const normalized = createCameraTrack(track);
  const time = snapCameraTime(timeInput, frameRateInput);
  const tolerance = 0.5 / normalizeFrameRate(frameRateInput);
  return normalized.keyframes.find((keyframe) => Math.abs(keyframe.time - time) <= tolerance) || null;
}

export function recordCameraKeyframe(track, pose, timeInput, frameRateInput = 30) {
  const normalized = createCameraTrack(track);
  let normalizedPose = normalizeCameraPose(pose);
  if (!normalizedPose) return normalized;
  const time = snapCameraTime(timeInput, frameRateInput);
  const existing = cameraKeyframeAtTime(normalized, time, frameRateInput);
  normalizedPose = preserveMissingCameraOptics(
    pose,
    normalizedPose,
    existing || sampleCameraTrack(normalized, time)
  );
  const keyframe = {
    id: existing?.id || createCameraKeyframeID(),
    time: existing?.time ?? time,
    ...normalizedPose,
    aim: existing
      ? existing.aim == null ? null : normalizeCameraAim(existing.aim)
      : Object.hasOwn(pose || {}, "aim")
        ? pose.aim == null ? null : normalizeCameraAim(pose.aim)
        : normalizeCameraAim(normalized.keyframes.findLast((candidate) => candidate.time <= time && candidate.aim != null)?.aim),
    follow: existing
      ? existing.follow == null ? null : normalizeCameraFollow(existing.follow)
      : Object.hasOwn(pose || {}, "follow")
        ? pose.follow == null ? null : normalizeCameraFollow(pose.follow)
        : normalized.keyframes.length === 0 ? normalizeCameraFollow() : null,
    focusTracking: existing
      ? existing.focusTracking == null ? null : normalizeCameraFocusTracking(existing.focusTracking)
      : Object.hasOwn(pose || {}, "focusTracking")
        ? pose.focusTracking == null ? null : normalizeCameraFocusTracking(pose.focusTracking)
        : normalized.keyframes.length === 0 ? normalizeCameraFocusTracking() : null,
  };
  const keyframes = existing
    ? normalized.keyframes.map((candidate) => candidate.id === existing.id ? keyframe : candidate)
    : [...normalized.keyframes, keyframe];
  return createCameraTrack({
    ...normalized,
    keyframes,
    outTime: Math.max(normalized.outTime, keyframe.time),
  });
}

export function updateCameraKeyframe(track, keyframeID, pose) {
  const normalized = createCameraTrack(track);
  const existing = normalized.keyframes.find((keyframe) => keyframe.id === keyframeID);
  let normalizedPose = normalizeCameraPose(pose);
  if (!normalizedPose || !existing) return normalized;
  normalizedPose = preserveMissingCameraOptics(pose, normalizedPose, existing);
  return createCameraTrack({
    ...normalized,
    keyframes: normalized.keyframes.map((keyframe) => keyframe.id === keyframeID
      ? { ...keyframe, ...normalizedPose }
      : keyframe),
  });
}

export function updateCameraKeyframeAim(track, keyframeID, aimInput) {
  const normalized = createCameraTrack(track);
  if (!normalized.keyframes.some((keyframe) => keyframe.id === keyframeID)) return normalized;
  return createCameraTrack({
    ...normalized,
    keyframes: normalized.keyframes.map((keyframe) => keyframe.id === keyframeID
      ? { ...keyframe, aim: aimInput == null ? null : normalizeCameraAim(aimInput) }
      : keyframe),
  });
}

export function updateCameraKeyframeFollow(track, keyframeID, followInput) {
  const normalized = createCameraTrack(track);
  if (!normalized.keyframes.some((keyframe) => keyframe.id === keyframeID)) return normalized;
  return createCameraTrack({
    ...normalized,
    keyframes: normalized.keyframes.map((keyframe) => keyframe.id === keyframeID
      ? { ...keyframe, follow: followInput == null ? null : normalizeCameraFollow(followInput) }
      : keyframe),
  });
}

export function updateCameraKeyframeFocusTracking(track, keyframeID, focusTrackingInput) {
  const normalized = createCameraTrack(track);
  if (!normalized.keyframes.some((keyframe) => keyframe.id === keyframeID)) return normalized;
  return createCameraTrack({
    ...normalized,
    keyframes: normalized.keyframes.map((keyframe) => keyframe.id === keyframeID
      ? {
          ...keyframe,
          focusTracking: focusTrackingInput == null
            ? null
            : normalizeCameraFocusTracking(focusTrackingInput),
        }
      : keyframe),
  });
}

export function moveCameraKeyframe(track, keyframeID, timeInput, frameRateInput = 30) {
  const normalized = createCameraTrack(track);
  const index = normalized.keyframes.findIndex((keyframe) => keyframe.id === keyframeID);
  if (index < 0 || normalized.keyframes[index].time === 0) return normalized;
  const frameRate = normalizeFrameRate(frameRateInput);
  const frameDuration = 1 / frameRate;
  const minimum = normalized.keyframes[index - 1].time + frameDuration;
  const maximum = normalized.keyframes[index + 1]
    ? normalized.keyframes[index + 1].time - frameDuration
    : 3600;
  if (maximum < minimum) return normalized;
  const time = Math.max(minimum, Math.min(maximum, snapCameraTime(timeInput, frameRate)));
  return createCameraTrack({
    ...normalized,
    keyframes: normalized.keyframes.map((keyframe) => keyframe.id === keyframeID
      ? {
          ...keyframe,
          time,
          follow: followAtMovedKeyframe(keyframe.follow, keyframe.time, time),
        }
      : keyframe),
    outTime: Math.max(normalized.outTime, time),
  });
}

// Apply one offset to the selection so recorded subframe intervals stay intact.
export function moveCameraKeyframes(track, keyframeIDs, deltaTime, frameRateInput = 30) {
  const normalized = createCameraTrack(track);
  const selected = new Set(keyframeIDs);
  const movable = (key) => key.time > 0 && selected.has(key.id);
  const frameRate = normalizeFrameRate(frameRateInput);
  const frame = 1 / frameRate;
  let minimum = -3600;
  let maximum = 3600;
  for (const [index, key] of normalized.keyframes.entries()) {
    if (!movable(key)) continue;
    const previous = normalized.keyframes[index - 1];
    const next = normalized.keyframes[index + 1];
    minimum = Math.max(minimum, -key.time + Math.min(frame, key.time));
    maximum = Math.min(maximum, 3600 - key.time);
    if (previous && !movable(previous)) {
      minimum = Math.max(minimum, previous.time + Math.min(frame, key.time - previous.time) - key.time);
    }
    if (next && !movable(next)) {
      maximum = Math.min(maximum, next.time - Math.min(frame, next.time - key.time) - key.time);
    }
  }
  const deltaFrames = Math.max(Math.ceil(minimum * frameRate - 1e-8), Math.min(
    Math.floor(maximum * frameRate + 1e-8), Math.round(deltaTime * frameRate)
  ));
  if (deltaFrames === 0) return normalized;
  const delta = deltaFrames / frameRate;
  const keyframes = normalized.keyframes.map((key) => movable(key) ? {
    ...key,
    time: key.time + delta,
    follow: followAtMovedKeyframe(key.follow, key.time, key.time + delta),
  } : key);
  return createCameraTrack({
    ...normalized,
    keyframes,
    outTime: keyframes.reduce((end, key) => movable(key) ? Math.max(end, key.time) : end, normalized.outTime),
  });
}

export function deleteCameraKeyframes(track, keyframeIDs) {
  const normalized = createCameraTrack(track);
  const selected = new Set(keyframeIDs);
  return createCameraTrack({
    ...normalized,
    keyframes: normalized.keyframes.filter((key) => key.time === 0 || !selected.has(key.id)),
  });
}

export function deleteCameraKeyframe(track, keyframeID) {
  const normalized = createCameraTrack(track);
  const keyframe = normalized.keyframes.find((candidate) => candidate.id === keyframeID);
  if (!keyframe || keyframe.time === 0 || normalized.keyframes.length <= 1) return normalized;
  return createCameraTrack({
    ...normalized,
    keyframes: normalized.keyframes.filter((candidate) => candidate.id !== keyframeID),
  });
}

export function trimCameraTrack(track, outTimeInput) {
  const normalized = createCameraTrack(track);
  return createCameraTrack({
    ...normalized,
    outTime: clampFinite(outTimeInput, 0, cameraTrackSourceDuration(normalized), normalized.outTime),
  });
}

export function normalizeCameraPose(input) {
  if (!finiteVector(input?.position) || !finiteQuaternion(input?.quaternion)) return null;
  const quaternion = normalizeQuaternion(input.quaternion);
  return {
    position: {
      x: Number(input.position.x),
      y: Number(input.position.y),
      z: Number(input.position.z),
    },
    quaternion,
    focalLength: clampFinite(
      input.focalLength,
      cameraFocalLengthMinimum,
      cameraFocalLengthMaximum,
      defaultCameraFocalLength
    ),
    focusDistance: clampFinite(
      input.focusDistance,
      cameraFocusDistanceMinimum,
      cameraFocusDistanceMaximum,
      defaultCameraFocusDistance
    ),
    aperture: clampFinite(
      input.aperture,
      cameraApertureMinimum,
      cameraApertureMaximum,
      defaultCameraAperture
    ),
  };
}

function preserveMissingCameraOptics(input, normalizedPose, fallbackPose) {
  return {
    ...normalizedPose,
    focusDistance: Object.hasOwn(input || {}, "focusDistance")
      ? normalizedPose.focusDistance
      : clampFinite(
          fallbackPose?.focusDistance,
          cameraFocusDistanceMinimum,
          cameraFocusDistanceMaximum,
          defaultCameraFocusDistance
        ),
    aperture: Object.hasOwn(input || {}, "aperture")
      ? normalizedPose.aperture
      : clampFinite(
          fallbackPose?.aperture,
          cameraApertureMinimum,
          cameraApertureMaximum,
          defaultCameraAperture
        ),
  };
}

// Schema v18/19: a Shot baked from a VCam Live take keeps only a provenance
// summary in the project — a sidecar file reference plus checksum — so
// history clones and saves stay small no matter how long the take ran. The
// original timestamped samples live in the referenced sidecar, written by the
// server, and are never renormalized or smoothed.
export function normalizeLiveSource(input) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.ref !== "string" || !input.ref || input.ref.length > 300) return null;
  const sampleCount = Number.isInteger(input.sampleCount) && input.sampleCount > 0 ? input.sampleCount : 0;
  if (!sampleCount) return null;
  return {
    ref: input.ref,
    checksum: typeof input.checksum === "string" && /^[a-f0-9]{64}$/.test(input.checksum)
      ? input.checksum
      : null,
    sampleCount,
    partial: input.partial === true,
    duration: clampFinite(input.duration, 0, 3600, 0),
    recordingStartedAt: clampFinite(input.recordingStartedAt, 0, 1e12, 0),
    clockOffset: Number.isFinite(input.clockOffset) ? Number(input.clockOffset) : 0,
    cameraSetupID: typeof input.cameraSetupID === "string" && input.cameraSetupID.length <= 128
      ? input.cameraSetupID
      : null,
    cameraSetupName: typeof input.cameraSetupName === "string" && input.cameraSetupName.length <= 80
      ? input.cameraSetupName
      : null,
    takeNumber: Number.isInteger(input.takeNumber) && input.takeNumber > 0 && input.takeNumber <= 999999
      ? input.takeNumber
      : null,
  };
}

// Schema v14: aim keyframes may target a continuous actor height or a fixed
// world-space point. v13 anchor presets migrate to the identical height, while
// legacy blendDuration input stays readable but inert and is never written back.
export function normalizeCameraAim(input) {
  const mode = cameraAimModes.includes(input?.mode) ? input.mode : "free";
  const anchor = cameraAimAnchors.includes(input?.anchor) ? input.anchor : "chest";
  const legacyHeight = cameraAimActorHeightPresets[anchor]
    ?? cameraAimActorHeightPresets.chest;
  const worldPosition = finiteVector(input?.worldPosition)
    ? {
        x: Number(input.worldPosition.x),
        y: Number(input.worldPosition.y),
        z: Number(input.worldPosition.z),
      }
    : { x: 0, y: 1.18, z: 0 };
  return {
    mode,
    targetKind: cameraAimTargetKinds.includes(input?.targetKind) ? input.targetKind : "actor",
    targetActorID: typeof input?.targetActorID === "string" && input.targetActorID
      ? input.targetActorID
      : null,
    anchor,
    actorHeight: clampFinite(input?.actorHeight, 0, 1, legacyHeight),
    worldPosition,
    ...(input?.targetKind === "environment" ? {
      environmentID: cleanEntityID(input.environmentID),
      localPosition: finiteVector(input.localPosition) ? numericVector(input.localPosition) : { x: 0, y: 0, z: 0 },
    } : {}),
    composition: cameraAimCompositions.includes(input?.composition) ? input.composition : "center",
    trackingResponse: clampFinite(input?.trackingResponse, 0, 2, defaultCameraAimTrackingResponse),
  };
}

function normalizeCameraKeyframe(input, index) {
  const pose = normalizeCameraPose(input);
  if (!pose) return null;
  return {
    id: typeof input?.id === "string" && input.id ? input.id : `camera-key-${index}`,
    time: clampFinite(input?.time, 0, 3600, index === 0 ? 0 : defaultCameraTrackDuration),
    ...pose,
    aim: Object.hasOwn(input || {}, "aim")
      ? input.aim == null ? null : normalizeCameraAim(input.aim)
      : index === 0 ? normalizeCameraAim() : null,
    follow: Object.hasOwn(input || {}, "follow")
      ? input.follow == null ? null : normalizeCameraFollow(input.follow)
      : index === 0 ? normalizeCameraFollow() : null,
    focusTracking: Object.hasOwn(input || {}, "focusTracking")
      ? input.focusTracking == null ? null : normalizeCameraFocusTracking(input.focusTracking)
      : index === 0 ? normalizeCameraFocusTracking() : null,
  };
}

function cleanEntityID(value) {
  return typeof value === "string" && value.trim() && value.length <= 200
    ? value
    : null;
}

function numericVector(value) {
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function followAtMovedKeyframe(followInput, previousTime, nextTime) {
  if (followInput == null) return null;
  const follow = normalizeCameraFollow(followInput);
  return follow.enabled && Math.abs(follow.referenceTime - previousTime) < 0.000001
    ? { ...follow, referenceTime: nextTime }
    : follow;
}

function normalizeCameraSegments(input, keyframes, fallbackInterpolation) {
  const candidates = Array.isArray(input)
    ? input.filter((segment) => segment && typeof segment === "object")
    : [];
  return keyframes.slice(0, -1).map((start, index) => {
    const end = keyframes[index + 1];
    const exact = candidates.find((segment) => (
      segment.startKeyframeID === start.id && segment.endKeyframeID === end.id
    ));
    const inherited = exact
      || candidates.find((segment) => segment.startKeyframeID === start.id)
      || candidates.find((segment) => segment.endKeyframeID === end.id);
    return {
      startKeyframeID: start.id,
      endKeyframeID: end.id,
      interpolation: cameraTrackEasings.includes(inherited?.interpolation)
        ? inherited.interpolation
        : fallbackInterpolation,
    };
  });
}

function cameraPoseFromKeyframe(keyframe) {
  return {
    position: { ...keyframe.position },
    quaternion: { ...keyframe.quaternion },
    focalLength: keyframe.focalLength,
    focusDistance: keyframe.focusDistance,
    aperture: keyframe.aperture,
  };
}

function cameraPoseSample(keyframe, progress, easedProgress, completed) {
  return {
    ...cameraPoseFromKeyframe(keyframe),
    progress,
    easedProgress,
    completed,
  };
}

function smoothVector(track, startIndex, progress) {
  const keyframes = track.keyframes;
  const endIndex = startIndex + 1;
  const start = keyframes[startIndex].position;
  const end = keyframes[endIndex].position;
  if (progress === 0) return { ...start };
  if (progress === 1) return { ...end };
  const tangents = positionSplineTangents(track);
  const duration = keyframes[endIndex].time - keyframes[startIndex].time;
  return Object.fromEntries(["x", "y", "z"].map((axis) => [axis,
    start[axis] + cubicHermite(0, end[axis] - start[axis], tangents[startIndex][axis], tangents[endIndex][axis], duration, progress),
  ]));
}

function smoothScalar(keyframes, startIndex, progress, property) {
  const endIndex = startIndex + 1;
  const duration = keyframes[endIndex].time - keyframes[startIndex].time;
  return cubicHermite(
    keyframes[startIndex][property],
    keyframes[endIndex][property],
    scalarSplineTangent(keyframes, startIndex, property),
    scalarSplineTangent(keyframes, endIndex, property),
    duration,
    progress
  );
}

function smoothQuaternion(keyframes, startIndex, progress) {
  const quaternions = alignedQuaternionSequence(keyframes);
  const endIndex = startIndex + 1;
  const start = quaternions[startIndex];
  const end = quaternions[endIndex];
  const startTangent = quaternionSplineTangent(keyframes, quaternions, startIndex);
  const endTangent = quaternionSplineTangent(keyframes, quaternions, endIndex);
  const duration = keyframes[endIndex].time - keyframes[startIndex].time;
  return normalizeQuaternion({
    x: cubicHermite(start.x, end.x, startTangent.x, endTangent.x, duration, progress),
    y: cubicHermite(start.y, end.y, startTangent.y, endTangent.y, duration, progress),
    z: cubicHermite(start.z, end.z, startTangent.z, endTangent.z, duration, progress),
    w: cubicHermite(start.w, end.w, startTangent.w, endTangent.w, duration, progress),
  });
}

function positionSplineTangents({ keyframes, segments }) {
  const axes = ["x", "y", "z"];
  const zero = () => ({ x: 0, y: 0, z: 0 });
  const legs = keyframes.slice(1).map((key, index) => {
    const duration = key.time - keyframes[index].time;
    const delta = Object.fromEntries(axes.map((axis) => [axis, key.position[axis] - keyframes[index].position[axis]]));
    return { duration, delta, distance: Math.hypot(delta.x, delta.y, delta.z) };
  });
  const fixed = keyframes.map((key, index) => {
    if (index === 0 || index === keyframes.length - 1) return zero();
    if ([index - 1, index].some((leg) => legs[leg].distance === 0 || legs[leg].duration === 0 || segments[leg].interpolation !== "smooth")) return zero();
    return null;
  });
  let tangents;
  // Blender Continuous Acceleration: solve the cubic's shared velocities jointly.
  // For durations a,b and leg velocities d0,d1, C2 continuity gives:
  // b*v[i-1] + 2*(a+b)*v[i] + a*v[i+1] = 3*(b*d0 + a*d1).
  // Fixed stop/bounded tangents split the same tridiagonal system into moving runs.
  for (;;) {
    const upper = [], rhs = [];
    for (let i = 0; i < keyframes.length; i += 1) {
      if (fixed[i]) {
        upper[i] = 0;
        rhs[i] = { ...fixed[i] };
        continue;
      }
      const before = legs[i - 1], after = legs[i];
      const divisor = 2 * (before.duration + after.duration) - after.duration * upper[i - 1];
      upper[i] = before.duration / divisor;
      rhs[i] = Object.fromEntries(axes.map((axis) => [axis,
        (3 * (after.duration * before.delta[axis] / before.duration
          + before.duration * after.delta[axis] / after.duration)
          - after.duration * rhs[i - 1][axis]) / divisor,
      ]));
    }
    tangents = rhs;
    for (let i = tangents.length - 2; i >= 0; i -= 1) {
      for (const axis of axes) tangents[i][axis] -= upper[i] * tangents[i + 1][axis];
    }
    let constrained = false;
    for (let i = 1; i < keyframes.length - 1; i += 1) {
      if (fixed[i]) continue;
      const before = legs[i - 1], after = legs[i];
      const tangent = tangents[i];
      const speed = Math.hypot(tangent.x, tangent.y, tangent.z);
      const dot = (leg) => axes.reduce((sum, axis) => sum + tangent[axis] * leg.delta[axis], 0);
      // A cubic handle must not extend beyond an adjacent leg's chord or point
      // backwards. Bound the shared 3D vector, not individual world-space axes.
      if (speed <= 3 * Math.min(before.distance / before.duration, after.distance / after.duration)
          && dot(before) > 0 && dot(after) > 0) continue;
      let direction = Object.fromEntries(axes.map((axis) => [axis, before.delta[axis] + after.delta[axis]]));
      const centeredSpeed = Math.hypot(direction.x, direction.y, direction.z) / (before.duration + after.duration);
      if ([before, after].some((leg) => axes.reduce((sum, axis) => sum + direction[axis] * leg.delta[axis], 0) <= 0)) {
        direction = Object.fromEntries(axes.map((axis) => [axis,
          (before.delta[axis] / before.distance + after.delta[axis] / after.distance) * Math.min(before.distance, after.distance),
        ]));
      }
      const directionLength = Math.hypot(direction.x, direction.y, direction.z);
      const maximumSpeed = Math.min(before.distance / before.duration, after.distance / after.duration);
      const scale = directionLength > 1e-12 * (before.distance + after.distance)
        ? Math.min(centeredSpeed, maximumSpeed) / directionLength
        : 0;
      fixed[i] = Object.fromEntries(axes.map((axis) => [axis, direction[axis] * scale]));
      constrained = true;
    }
    if (!constrained) return tangents;
  }
}

function scalarSplineTangent(keyframes, index, property) {
  if (index <= 0 || index >= keyframes.length - 1) return 0;
  const previous = keyframes[index - 1];
  const next = keyframes[index + 1];
  return (next[property] - previous[property]) / Math.max(next.time - previous.time, 0.000001);
}

function quaternionSplineTangent(keyframes, quaternions, index) {
  if (index <= 0 || index >= keyframes.length - 1) return { x: 0, y: 0, z: 0, w: 0 };
  const previous = quaternions[index - 1];
  const current = quaternions[index];
  const next = quaternions[index + 1];
  const duration = Math.max(keyframes[index + 1].time - keyframes[index - 1].time, 0.000001);
  const tangent = {
    x: (next.x - previous.x) / duration,
    y: (next.y - previous.y) / duration,
    z: (next.z - previous.z) / duration,
    w: (next.w - previous.w) / duration,
  };
  // Limit the shared tangent in aligned quaternion space, just as for position.
  // A small turn stays local; equal orientations hold still. Both segments use
  // the same derivative, so normalization preserves continuous angular velocity.
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z, b.w - a.w);
  const maximumSpeed = Math.min(
    distance(previous, current) / (keyframes[index].time - keyframes[index - 1].time),
    distance(current, next) / (keyframes[index + 1].time - keyframes[index].time)
  );
  const speed = Math.hypot(tangent.x, tangent.y, tangent.z, tangent.w);
  if (speed > maximumSpeed) {
    const scale = maximumSpeed / speed;
    tangent.x *= scale;
    tangent.y *= scale;
    tangent.z *= scale;
    tangent.w *= scale;
  }
  return tangent;
}

function alignedQuaternionSequence(keyframes) {
  const sequence = [];
  for (const keyframe of keyframes) {
    let quaternion = normalizeQuaternion(keyframe.quaternion);
    const previous = sequence.at(-1);
    if (previous && quaternionDot(previous, quaternion) < 0) quaternion = negateQuaternion(quaternion);
    sequence.push(quaternion);
  }
  return sequence;
}

function cubicHermite(start, end, startTangent, endTangent, duration, progressInput) {
  const progress = clamp(progressInput, 0, 1);
  const squared = progress * progress;
  const cubed = squared * progress;
  const startWeight = 2 * cubed - 3 * squared + 1;
  const startTangentWeight = cubed - 2 * squared + progress;
  const endWeight = -2 * cubed + 3 * squared;
  const endTangentWeight = cubed - squared;
  return startWeight * start
    + startTangentWeight * duration * startTangent
    + endWeight * end
    + endTangentWeight * duration * endTangent;
}

function quaternionDot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
}

function negateQuaternion(quaternion) {
  return { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: -quaternion.w };
}

function normalizedTrackOutTime(track) {
  return createCameraTrack(track).outTime;
}

function existingKeyframeID(keyframe, fallback) {
  return typeof keyframe?.id === "string" && keyframe.id ? keyframe.id : fallback;
}

export function snapCameraTime(value, frameRateInput) {
  const frameRate = normalizeFrameRate(frameRateInput);
  const time = clampFinite(value, 0, 3600, 0);
  return Math.round(time * frameRate) / frameRate;
}

function normalizeFrameRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(number, 240) : 30;
}

function createCameraKeyframeID() {
  return globalThis.crypto?.randomUUID?.()
    ?? `camera-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function slerpQuaternion(from, to, alpha) {
  let target = { ...to };
  let dot = from.x * target.x + from.y * target.y + from.z * target.z + from.w * target.w;
  if (dot < 0) {
    dot = -dot;
    target = { x: -target.x, y: -target.y, z: -target.z, w: -target.w };
  }
  if (dot > 0.9995) {
    return normalizeQuaternion({
      x: lerp(from.x, target.x, alpha),
      y: lerp(from.y, target.y, alpha),
      z: lerp(from.z, target.z, alpha),
      w: lerp(from.w, target.w, alpha),
    });
  }
  const theta = Math.acos(clamp(dot, -1, 1));
  const sinTheta = Math.sin(theta);
  const fromWeight = Math.sin((1 - alpha) * theta) / sinTheta;
  const toWeight = Math.sin(alpha * theta) / sinTheta;
  return normalizeQuaternion({
    x: from.x * fromWeight + target.x * toWeight,
    y: from.y * fromWeight + target.y * toWeight,
    z: from.z * fromWeight + target.z * toWeight,
    w: from.w * fromWeight + target.w * toWeight,
  });
}

function normalizeQuaternion(value) {
  const parts = [value.x, value.y, value.z, value.w].map(Number);
  const length = Math.hypot(...parts) || 1;
  // Already-unit durable values must survive normalization byte-for-byte. V8 and
  // JavaScriptCore can differ in Math.hypot's last bit, which otherwise makes an
  // unchanged project drift when it is saved once in each desktop shell.
  if (Math.abs(length - 1) <= 1e-12) {
    return { x: parts[0], y: parts[1], z: parts[2], w: parts[3] };
  }
  const normalized = parts.map((part) => canonicalQuaternionComponent(part / length));
  return { x: normalized[0], y: normalized[1], z: normalized[2], w: normalized[3] };
}

function canonicalQuaternionComponent(value) {
  const rounded = Number(value.toPrecision(15));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function finiteVector(value) {
  return value && [value.x, value.y, value.z].every((entry) => Number.isFinite(Number(entry)));
}

function finiteQuaternion(value) {
  return value && [value.x, value.y, value.z, value.w].every((entry) => Number.isFinite(Number(entry)));
}

function lerpVector(from, to, alpha) {
  return { x: lerp(from.x, to.x, alpha), y: lerp(from.y, to.y, alpha), z: lerp(from.z, to.z, alpha) };
}

function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
}

function smoothStep(value) {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function clampFinite(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, minimum, maximum) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
