export function normalizeDepthOfFieldOptics(input = {}) {
  return {
    focusDistance: clampFinite(input.focusDistance, 0.1, 1000, 5),
    aperture: clampFinite(input.aperture, 1.4, 16, 2.8),
    focalLength: clampFinite(input.focalLength, 1, 1000, 35),
    sensorWidth: clampFinite(input.sensorWidth, 1, 1000, 36),
  };
}

export function circleOfConfusionRadiusPixels(input = {}) {
  return Math.abs(signedCircleOfConfusionRadiusPixels(input));
}

export function signedCircleOfConfusionRadiusPixels(input = {}) {
  const optics = normalizeDepthOfFieldOptics(input);
  const objectDistance = clampFinite(input.objectDistance, 0.001, 100000, optics.focusDistance);
  const imageWidth = clampFinite(input.imageWidth, 1, 100000, 1920);
  const focalLengthMeters = optics.focalLength / 1000;
  const sensorWidthMeters = optics.sensorWidth / 1000;
  const focusDistance = Math.max(optics.focusDistance, focalLengthMeters + 0.001);
  const circleDiameterMeters = (
    focalLengthMeters * focalLengthMeters * (objectDistance - focusDistance)
  ) / (
    optics.aperture
    * objectDistance
    * Math.max(focusDistance - focalLengthMeters, 0.001)
  );
  return circleDiameterMeters / sensorWidthMeters * imageWidth * 0.5;
}

export function vogelDiskKernel(sampleCount = 64) {
  const count = Math.min(Math.max(Math.trunc(Number(sampleCount)) || 1, 1), 128);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const radius = Math.sqrt((index + 0.5) / count);
    const angle = index * goldenAngle;
    return Object.freeze({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });
}

export function maximumBokehRadiusPixels(imageWidthInput) {
  const imageWidth = clampFinite(imageWidthInput, 1, 100000, 1920);
  return Math.min(Math.max(imageWidth * 0.05, 12), 96);
}

function clampFinite(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(Math.max(number, minimum), maximum)
    : fallback;
}
