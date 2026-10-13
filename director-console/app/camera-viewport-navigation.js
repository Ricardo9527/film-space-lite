import {
  cameraFocalLengthMaximum,
  cameraFocalLengthMinimum,
  defaultCameraFocalLength,
} from "./camera-track.js";

const focalWheelSensitivity = 0.0015;
const dollyWheelSensitivity = 0.0015;
const pinchDollyMultiplier = 10;
const pointerOrbitSensitivity = 0.0032;
const actorHandleReferenceVerticalFov = 44;
const actorHandleDistanceCoefficient = 0.11;
const authoringTranslationReferenceDistance = 5;
const authoringTranslationReferenceVerticalFov = 44;
const authoringTranslationMinimumScale = 0.02;
const authoringTranslationPrecisionMultiplier = 0.2;

export function normalizedWheelDelta(deltaY, deltaMode = 0, pageHeight = 800) {
  const value = Number(deltaY);
  if (!Number.isFinite(value)) return 0;
  if (deltaMode === 1) return value * 16;
  if (deltaMode === 2) return value * Math.max(1, Number(pageHeight) || 800);
  return value;
}

export function focalLengthAfterWheel(currentFocalLength, wheelDelta) {
  const current = clamp(
    finiteOr(currentFocalLength, defaultCameraFocalLength),
    cameraFocalLengthMinimum,
    cameraFocalLengthMaximum
  );
  return clamp(
    current * Math.exp(-finiteOr(wheelDelta, 0) * focalWheelSensitivity),
    cameraFocalLengthMinimum,
    cameraFocalLengthMaximum
  );
}

export function focalLengthToSliderProgress(focalLengthInput) {
  const focalLength = clamp(
    finiteOr(focalLengthInput, defaultCameraFocalLength),
    cameraFocalLengthMinimum,
    cameraFocalLengthMaximum
  );
  return Math.log(focalLength / cameraFocalLengthMinimum)
    / Math.log(cameraFocalLengthMaximum / cameraFocalLengthMinimum);
}

export function focalLengthFromSliderProgress(progressInput) {
  const progress = clamp(finiteOr(progressInput, 0), 0, 1);
  return cameraFocalLengthMinimum
    * Math.pow(cameraFocalLengthMaximum / cameraFocalLengthMinimum, progress);
}

export function dollyWheelDeltaForPinch(wheelDelta) {
  return finiteOr(wheelDelta, 0) * pinchDollyMultiplier;
}

export function orbitDistanceAfterWheel(
  currentDistance,
  wheelDelta,
  minDistance = 0.12,
  maxDistance = 250
) {
  const minimum = Math.max(0.001, finiteOr(minDistance, 0.12));
  const maximum = Math.max(minimum, finiteOr(maxDistance, 250));
  const current = clamp(finiteOr(currentDistance, minimum), minimum, maximum);
  return clamp(
    current * Math.exp(finiteOr(wheelDelta, 0) * dollyWheelSensitivity),
    minimum,
    maximum
  );
}

export function planarNavigationBasis(forwardInput, fallbackInput = null) {
  const forward = normalizedPlanarDirection(forwardInput)
    || normalizedPlanarDirection(fallbackInput)
    || { x: 0, y: 0, z: -1 };
  return {
    forward,
    right: {
      x: cleanZero(-forward.z),
      y: 0,
      z: cleanZero(forward.x),
    },
  };
}

export function sceneNavigationForView(
  setupViewActive,
  freeNavigation,
  setupNavigation
) {
  return setupViewActive ? setupNavigation : freeNavigation;
}

export function sceneCameraRotationLocked(topViewLocked, setupViewActive) {
  return Boolean(topViewLocked) && !setupViewActive;
}

export function sceneAuthoringModeActive(sceneEditView, setupViewActive) {
  return Boolean(sceneEditView) && !setupViewActive;
}

export function clearSceneNavigationTransientState(state) {
  state?.cameraKeys?.clear?.();
  state?.cameraPrecisionKeys?.clear?.();
  state?.cameraPlanarVelocity?.set?.(0, 0);
  if (!state) return;
  state.sceneCameraPlanarBasis = null;
  state.shotCameraPlanarBasis = null;
  state.cameraAuthoringTranslationContext = null;
  state.cameraFocusTransition = null;
  state.setupCameraDirty = false;
}

export function cameraNavigationReferenceDistance(
  cameraPositionInput,
  orderedTargets = [],
  fallbackDistance = authoringTranslationReferenceDistance
) {
  const cameraPosition = finitePoint(cameraPositionInput);
  const fallback = Math.max(0.01, finiteOr(fallbackDistance, authoringTranslationReferenceDistance));
  if (!cameraPosition) return fallback;
  for (const targetInput of orderedTargets) {
    const target = finitePoint(targetInput);
    if (!target) continue;
    const distance = Math.hypot(
      target.x - cameraPosition.x,
      target.y - cameraPosition.y,
      target.z - cameraPosition.z
    );
    if (distance >= 0.01) return distance;
  }
  return fallback;
}

export function cameraAuthoringTranslationSpeedScale(
  distanceInput,
  verticalFovDegreesInput,
  precision = false
) {
  const distance = Math.max(0, finiteOr(distanceInput, authoringTranslationReferenceDistance));
  const verticalFovDegrees = clamp(
    finiteOr(verticalFovDegreesInput, authoringTranslationReferenceVerticalFov),
    1,
    179
  );
  const visibleHeightScale = Math.tan(verticalFovDegrees * Math.PI / 360)
    / Math.tan(authoringTranslationReferenceVerticalFov * Math.PI / 360);
  const automaticScale = clamp(
    distance / authoringTranslationReferenceDistance * visibleHeightScale,
    authoringTranslationMinimumScale,
    1
  );
  return automaticScale * (precision ? authoringTranslationPrecisionMultiplier : 1);
}

export function translateCameraNavigationTargets(translationInput, targets = []) {
  const translation = finitePoint(translationInput);
  if (!translation) return 0;
  const translatedTargets = new Set();
  let translatedCount = 0;
  for (const target of targets) {
    if (!target || typeof target !== "object" || translatedTargets.has(target)) continue;
    const point = finitePoint(target);
    if (!point) continue;
    translatedTargets.add(target);
    target.x = point.x + translation.x;
    target.y = point.y + translation.y;
    target.z = point.z + translation.z;
    translatedCount += 1;
  }
  return translatedCount;
}

export function worldUnitsPerScreenPixel(distance, verticalFovDegrees, viewportHeight) {
  const safeDistance = Math.max(0.001, finiteOr(distance, 1));
  const safeHeight = Math.max(1, finiteOr(viewportHeight, 1));
  const halfFov = clamp(finiteOr(verticalFovDegrees, 45), 1, 179) * Math.PI / 360;
  return 2 * safeDistance * Math.tan(halfFov) / safeHeight;
}

export function sphericalOrbitAfterPointer(
  spherical,
  deltaX,
  deltaY,
  sensitivity = pointerOrbitSensitivity
) {
  const radius = Math.max(0.001, finiteOr(spherical?.radius, 1));
  const theta = finiteOr(spherical?.theta, 0)
    - finiteOr(deltaX, 0) * finiteOr(sensitivity, pointerOrbitSensitivity);
  const phi = clamp(
    finiteOr(spherical?.phi, Math.PI / 2)
      - finiteOr(deltaY, 0) * finiteOr(sensitivity, pointerOrbitSensitivity),
    0.025,
    Math.PI - 0.025
  );
  return { radius, theta, phi };
}

export function actorTransformHandleScale(distanceInput, verticalFovDegreesInput) {
  const verticalFovDegrees = clamp(finiteOr(verticalFovDegreesInput, 44), 1, 179);
  const halfExtent = Math.tan(verticalFovDegrees * Math.PI / 360);
  const referenceHalfExtent = Math.tan(actorHandleReferenceVerticalFov * Math.PI / 360);
  // Preserve the original 44° distance behavior while bounding extreme world sizes.
  return clamp(
    finiteOr(distanceInput, 0)
      * actorHandleDistanceCoefficient
      * halfExtent
      / referenceHalfExtent,
    1,
    3
  );
}

function normalizedPlanarDirection(value) {
  const x = finiteOr(value?.x, 0);
  const z = finiteOr(value?.z, 0);
  const length = Math.hypot(x, z);
  if (length < 0.000001) return null;
  return {
    x: cleanZero(x / length),
    y: 0,
    z: cleanZero(z / length),
  };
}

function cleanZero(value) {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const z = Number(value?.z);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
