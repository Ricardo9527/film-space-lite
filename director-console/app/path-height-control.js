export const pathHeightStep = 0.05;
export const pathHeightMetersPerPixel = 0.01;

export function pathHeightTargetPoint(pointsInput, selectedPointID = null) {
  const points = Array.isArray(pointsInput) ? pointsInput : [];
  return (
    points.find((point) => selectedPointID && point.id === selectedPointID)
    || points.find((point) => point.isStart)
    || points[0]
    || null
  );
}

export function previousPathHeight(pointsInput, pointID) {
  const points = Array.isArray(pointsInput) ? pointsInput : [];
  const index = points.findIndex((point) => point.id === pointID);
  if (index <= 0) return null;
  const height = Number(points[index - 1]?.position?.y);
  return Number.isFinite(height) ? height : null;
}

export function motionEntryPhaseAtFrame(
  phasesInput,
  elapsedInput,
  frameRateInput
) {
  const phases = Array.isArray(phasesInput) ? phasesInput : [];
  const frameRate = Math.max(Number(frameRateInput) || 0, 1);
  const frame = Math.round(Math.max(Number(elapsedInput) || 0, 0) * frameRate);
  // Scene frame 0 belongs to the actor start point. This avoids presenting two
  // different durable height owners for the same visible frame.
  if (frame === 0) return null;
  return phases.find((phase) => (
    (phase?.kind === "hold" || phase?.kind === "move")
    && Number(phase.duration || 0) > 0
    && Number(phase.actionIndex) > 0
    && phase.action
    && Math.round(Math.max(Number(phase.startTime) || 0, 0) * frameRate) === frame
  )) || null;
}

export function motionPhaseEntryHeight(phase) {
  const height = phase?.kind === "move"
    ? Number(phase.startPosition?.y)
    : phase?.kind === "hold"
      ? Number(phase.position?.y)
      : NaN;
  return Number.isFinite(height) ? height : null;
}

export function pathHeightFromDrag(
  startHeightInput,
  upwardPixelsInput,
  fine = false
) {
  const startHeight = Number(startHeightInput);
  const upwardPixels = Number(upwardPixelsInput);
  if (!Number.isFinite(startHeight) || !Number.isFinite(upwardPixels)) {
    return Number.isFinite(startHeight) ? startHeight : 0;
  }
  const sensitivity = pathHeightMetersPerPixel * (fine ? 0.1 : 1);
  return roundHeight(startHeight + upwardPixels * sensitivity);
}

export function pathHeightFromKey(
  currentHeightInput,
  key,
  coarse = false
) {
  const currentHeight = Number(currentHeightInput);
  if (!Number.isFinite(currentHeight)) return null;
  const multiplier = coarse ? 10 : 1;
  if (key === "ArrowUp") {
    return roundHeight(currentHeight + pathHeightStep * multiplier);
  }
  if (key === "ArrowDown") {
    return roundHeight(currentHeight - pathHeightStep * multiplier);
  }
  if (key === "PageUp") {
    return roundHeight(currentHeight + pathHeightStep * 10);
  }
  if (key === "PageDown") {
    return roundHeight(currentHeight - pathHeightStep * 10);
  }
  return null;
}

function roundHeight(value) {
  return Math.round(Number(value) * 10000) / 10000;
}
