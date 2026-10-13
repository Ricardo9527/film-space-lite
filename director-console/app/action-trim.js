import { desktopActions } from "./action-catalog.js";

export const minimumActionSourceSpan = 0.001;

export function actionNaturalDuration(actionOrID) {
  const actionID = typeof actionOrID === "string"
    ? actionOrID
    : actionOrID?.actionID;
  return Math.max(
    Number(desktopActions[actionID]?.naturalDuration || 1),
    minimumActionSourceSpan
  );
}

export function actionSourceRange(action) {
  const naturalDuration = actionNaturalDuration(action);
  const sourceIn = clamp(
    action?.sourceInSeconds != null && Number.isFinite(Number(action.sourceInSeconds))
      ? Number(action.sourceInSeconds)
      : 0,
    0,
    Math.max(naturalDuration - minimumActionSourceSpan, 0)
  );
  const sourceOut = clamp(
    action?.sourceOutSeconds != null && Number.isFinite(Number(action.sourceOutSeconds))
      ? Number(action.sourceOutSeconds)
      : naturalDuration,
    sourceIn + minimumActionSourceSpan,
    naturalDuration
  );
  return {
    sourceIn,
    sourceOut,
    duration: Math.max(sourceOut - sourceIn, minimumActionSourceSpan),
    naturalDuration,
  };
}

export function actionPlaybackRate(action) {
  const sourceRange = actionSourceRange(action);
  const authoredDuration = Math.max(
    Number(action?.duration || 0),
    minimumActionSourceSpan
  );
  return sourceRange.duration / authoredDuration;
}

export function actionSourceIsTrimmed(action) {
  const range = actionSourceRange(action);
  return range.sourceIn > 0.000001
    || range.sourceOut < range.naturalDuration - 0.000001;
}

export function actionTrimPatch(action, sourceInInput, sourceOutInput, options = {}) {
  const currentRange = actionSourceRange(action);
  const playbackRate = actionPlaybackRate(action);
  const requestedSourceOut = clamp(
    Number(sourceOutInput),
    minimumActionSourceSpan,
    currentRange.naturalDuration
  );
  const sourceInMaximum = options.edge === "in"
    ? Math.max(requestedSourceOut - minimumActionSourceSpan, 0)
    : currentRange.naturalDuration - minimumActionSourceSpan;
  const sourceIn = clamp(
    Number(sourceInInput),
    0,
    sourceInMaximum
  );
  const sourceOut = clamp(
    requestedSourceOut,
    sourceIn + minimumActionSourceSpan,
    currentRange.naturalDuration
  );
  const minimumAuthoredDuration = Math.max(
    Number(options.minimumAuthoredDuration || 0),
    minimumActionSourceSpan
  );
  return {
    sourceInSeconds: roundMilliseconds(sourceIn),
    sourceOutSeconds: roundMilliseconds(sourceOut),
    duration: roundMilliseconds(Math.max(
      (sourceOut - sourceIn) / Math.max(playbackRate, minimumActionSourceSpan),
      minimumAuthoredDuration
    )),
  };
}

export function normalizedActionTrimFields(input, actionID) {
  const hasSourceIn = input?.sourceInSeconds != null
    && Number.isFinite(Number(input.sourceInSeconds));
  const hasSourceOut = input?.sourceOutSeconds != null
    && Number.isFinite(Number(input.sourceOutSeconds));
  if (!hasSourceIn && !hasSourceOut) return {};
  const range = actionSourceRange({
    actionID,
    sourceInSeconds: hasSourceIn ? Number(input.sourceInSeconds) : undefined,
    sourceOutSeconds: hasSourceOut ? Number(input.sourceOutSeconds) : undefined,
  });
  return {
    ...(range.sourceIn > 0 ? { sourceInSeconds: range.sourceIn } : {}),
    ...(range.sourceOut < range.naturalDuration
      ? { sourceOutSeconds: range.sourceOut }
      : {}),
  };
}

function roundMilliseconds(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(Number(value || 0), minimum), maximum);
}
