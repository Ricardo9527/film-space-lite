export function outputFrameCount(durationInput, frameRateInput) {
  const duration = Math.max(Number(durationInput) || 0, 0);
  const frameRate = Math.max(Number(frameRateInput) || 0, 1);
  return Math.max(1, Math.ceil(duration * frameRate - 1e-9));
}

export function outputSampleTime(frameIndexInput, frameRateInput, durationInput) {
  const frameIndex = Math.max(Math.floor(Number(frameIndexInput) || 0), 0);
  const frameRate = Math.max(Number(frameRateInput) || 0, 1);
  const duration = Math.max(Number(durationInput) || 0, 0);
  return Math.min(frameIndex / frameRate, duration);
}

export function validH264Resolution(resolution) {
  const width = Number(resolution?.width);
  const height = Number(resolution?.height);
  return Number.isInteger(width)
    && Number.isInteger(height)
    && width >= 16
    && height >= 16
    && width <= 16384
    && height <= 16384
    && width % 2 === 0
    && height % 2 === 0;
}
