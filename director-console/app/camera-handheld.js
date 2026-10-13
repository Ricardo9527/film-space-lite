import { ImprovedNoise } from "../vendor/three/math/ImprovedNoise.js";
import {
  cameraFocalLengthMaximum,
  cameraFocalLengthMinimum,
} from "./camera-track.js";

export const cameraHandheldIntensities = Object.freeze(["off", "subtle", "standard", "strong"]);
export const defaultCameraHandheld = Object.freeze({ intensity: "off" });

const activeIntensities = Object.freeze(["subtle", "standard", "strong"]);
const profileAmplitudeGains = Object.freeze({
  subtle: 0.75,
  standard: 1,
  strong: 1.5,
});
const blendInDuration = 0.8;
const referenceFocalLength = 35;
const perlinNoise = new ImprovedNoise();

// These are Unity Cinemachine's official normal-lens handheld presets, mapped
// directly to Film Space's three active stages.  Each stage owns its complete
// frequency signature instead of merely scaling one shared mild profile:
// Handheld_normal_mild / strong / extreme.
// Source: com.unity.cinemachine/Presets/Noise/Handheld_normal_*.asset
const orientationProfiles = Object.freeze({
  subtle: freezeOrientationProfile({
    pitch: [[7, 0.15], [4, 0.8], [1, 1.2]],
    yaw: [[5, 0.1], [2, 0.75], [0.8, 1.5]],
  }),
  standard: freezeOrientationProfile({
    pitch: [[10, 0.4], [5, 1.44], [3, 2.49]],
    yaw: [[10, 0.06], [3, 0.73], [1, 2]],
  }),
  strong: freezeOrientationProfile({
    pitch: [[15, 0.2], [5, 0.9], [2, 2]],
    yaw: [[7, 0.25], [3, 1], [1, 0]],
  }),
});

const channelCoordinates = Object.freeze({
  pitch: Object.freeze({ x: 11.37, y: 29.41, z: 47.83 }),
  yaw: Object.freeze({ x: 67.19, y: 83.53, z: 101.71 }),
});

export function normalizeCameraHandheld(input = defaultCameraHandheld) {
  if (typeof input === "boolean") {
    return { intensity: input ? "standard" : "off" };
  }
  const source = typeof input === "string" ? { intensity: input } : input;
  if (source?.enabled === false) return { intensity: "off" };
  if (source?.enabled === true) {
    return {
      intensity: activeIntensities.includes(source.intensity) ? source.intensity : "standard",
    };
  }
  return {
    intensity: cameraHandheldIntensities.includes(source?.intensity) ? source.intensity : "off",
  };
}

// Handheld is a deterministic, elapsed-time Shot modifier. It never writes
// camera-track data and intentionally has no mutable noise state, so direct
// seeking, playback, Camera monitoring, and MP4 sampling see the same pose.
export function applyCameraHandheld(shot, pose, elapsedInput = 0) {
  if (!pose) return pose;
  const handheld = normalizeCameraHandheld(shot?.camera?.modifiers?.handheld);
  if (handheld.intensity === "off") return pose;
  const offset = cameraHandheldOffset(elapsedInput, handheld.intensity, pose.focalLength);
  return {
    ...pose,
    quaternion: multiplyQuaternion(pose.quaternion, offset.quaternion),
  };
}

// Exact inverse used by camera authoring. Moving the camera or pressing K while
// Handheld is active therefore records the underlying authored pose rather than
// baking the procedural offset into a keyframe.
export function removeCameraHandheld(shot, pose, elapsedInput = 0) {
  if (!pose) return pose;
  const handheld = normalizeCameraHandheld(shot?.camera?.modifiers?.handheld);
  if (handheld.intensity === "off") return pose;
  const offset = cameraHandheldOffset(elapsedInput, handheld.intensity, pose.focalLength);
  return {
    ...pose,
    quaternion: multiplyQuaternion(pose.quaternion, conjugateQuaternion(offset.quaternion)),
  };
}

export function cameraHandheldOffset(
  elapsedInput = 0,
  intensityInput = defaultCameraHandheld.intensity,
  focalLengthInput = referenceFocalLength
) {
  const elapsed = Math.max(0, Number(elapsedInput) || 0);
  const intensity = cameraHandheldIntensities.includes(intensityInput)
    ? intensityInput
    : defaultCameraHandheld.intensity;
  if (intensity === "off") return identityOffset();

  // A quiet lead-in keeps the preset's initial angular bias from reading as
  // one authored camera move at the head of the Shot.  The fifth-order curve
  // also reaches zero velocity at both ends of the hand-off.
  const blend = smootherStep(Math.min(1, elapsed / blendInDuration));
  const focalLength = clampFinite(
    focalLengthInput,
    cameraFocalLengthMinimum,
    cameraFocalLengthMaximum,
    referenceFocalLength
  );
  const focalScale = clamp(referenceFocalLength / focalLength, 0.55, 1.35);
  // Unity's centered Mathf.PerlinNoise spans roughly -0.5...0.5.  Three's
  // ImprovedNoise is centered around zero at roughly twice that range, so the
  // 0.5 gain preserves the authored preset amplitude at the 35 mm reference.
  const scale = profileAmplitudeGains[intensity] * focalScale * blend * 0.5;
  const pitch = degreesToRadians(combinedPerlin(elapsed, intensity, "pitch") * scale);
  const yaw = degreesToRadians(combinedPerlin(elapsed, intensity, "yaw") * scale);
  const roll = 0;

  return {
    position: { x: 0, y: 0, z: 0 },
    rotationDegrees: {
      pitch: radiansToDegrees(pitch),
      yaw: radiansToDegrees(yaw),
      roll: radiansToDegrees(roll),
    },
    quaternion: localRotationQuaternion(pitch, yaw, roll),
  };
}

function identityOffset() {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotationDegrees: { pitch: 0, yaw: 0, roll: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  };
}

function combinedPerlin(elapsed, intensity, channel) {
  const coordinates = channelCoordinates[channel];
  return orientationProfiles[intensity][channel].reduce((sum, band, index) => (
    sum + band.amplitude * perlinNoise.noise(
      coordinates.x + elapsed * band.frequency,
      coordinates.y + index * 17.13,
      coordinates.z + index * 31.67
    )
  ), 0);
}

function freezeOrientationProfile({ pitch, yaw }) {
  const freezeBands = (bands) => Object.freeze(bands.map(([amplitude, frequency]) => (
    Object.freeze({ amplitude, frequency })
  )));
  return Object.freeze({
    pitch: freezeBands(pitch),
    yaw: freezeBands(yaw),
  });
}

function localRotationQuaternion(pitch, yaw, roll) {
  const pitchQuaternion = axisAngleQuaternion(1, 0, 0, pitch);
  const yawQuaternion = axisAngleQuaternion(0, 1, 0, yaw);
  const rollQuaternion = axisAngleQuaternion(0, 0, 1, roll);
  return multiplyQuaternion(multiplyQuaternion(yawQuaternion, pitchQuaternion), rollQuaternion);
}

function axisAngleQuaternion(x, y, z, angle) {
  const half = angle / 2;
  const sine = Math.sin(half);
  return { x: x * sine, y: y * sine, z: z * sine, w: Math.cos(half) };
}

function multiplyQuaternion(aInput, bInput) {
  const a = normalizeQuaternion(aInput);
  const b = normalizeQuaternion(bInput);
  return normalizeQuaternion({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

function conjugateQuaternion(input) {
  const quaternion = normalizeQuaternion(input);
  return { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: quaternion.w };
}

function normalizeQuaternion(input) {
  const quaternion = input || { x: 0, y: 0, z: 0, w: 1 };
  const length = Math.hypot(
    Number(quaternion.x) || 0,
    Number(quaternion.y) || 0,
    Number(quaternion.z) || 0,
    Number(quaternion.w) || 0
  ) || 1;
  return {
    x: (Number(quaternion.x) || 0) / length,
    y: (Number(quaternion.y) || 0) / length,
    z: (Number(quaternion.z) || 0) / length,
    w: (Number(quaternion.w) || 0) / length,
  };
}

function clampFinite(input, minimum, maximum, fallback) {
  const value = Number(input);
  return Number.isFinite(value) ? clamp(value, minimum, maximum) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smootherStep(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function radiansToDegrees(radians) {
  return radians * 180 / Math.PI;
}
