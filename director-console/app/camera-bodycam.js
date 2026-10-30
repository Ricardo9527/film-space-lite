import { Euler, Quaternion, Vector3 } from "../vendor/three/three.module.js";
import { blockingPoseLandmarks, legacyActorPose } from "./actor-pose.js";
import { isBlockingActor } from "./blocking-actor.js";
import { createCameraTrack, normalizeCameraBodycam, sampleCameraTrack } from "./camera-track.js";
import { sampleActor } from "./playback-engine.js";

export function isBodycamActor(actor) {
  return isBlockingActor(actor) && !actor.movableObject;
}

export function effectiveCameraBodycam(trackInput, elapsed = 0) {
  const track = createCameraTrack(trackInput);
  const keys = track.keyframes.filter((key) => key.bodycam != null);
  const index = keys.findLastIndex((key) => key.time <= elapsed + 0.000001);
  if (index < 0) return normalizeCameraBodycam();
  const start = keys[index];
  const end = keys[index + 1];
  const bodycam = start.bodycam;
  if (!bodycam.enabled || !end?.bodycam.enabled || end.bodycam.targetActorID !== bodycam.targetActorID) return bodycam;
  // Sample local installation poses with the same camera interpolation rules.
  const localTrack = {
    ...track,
    keyframes: keys.map((key) => ({ ...key, position: key.bodycam.localPosition, quaternion: key.bodycam.localQuaternion })),
    outTime: keys.at(-1).time,
  };
  const pose = sampleCameraTrack(localTrack, elapsed);
  return { ...bodycam, localPosition: pose.position, localQuaternion: pose.quaternion };
}

export function bodycamActorFrame(project, targetActorID, time, samples = null) {
  const actor = project.scene.actors.find((candidate) => candidate.id === targetActorID);
  if (!actor || !isBodycamActor(actor)) return null;
  const sample = samples?.get(actor.id) || sampleActor(actor, time);
  const pose = sample.blockingPose || legacyActorPose(sample, sample);
  const points = blockingPoseLandmarks(pose);
  const root = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), sample.rotationY)
    .multiply(new Quaternion().setFromEuler(new Euler(pose.rotationX, 0, pose.rotationZ, "XYZ")));
  return {
    position: points.body.clone().multiplyScalar(actor.scale).applyQuaternion(root)
      .add(new Vector3(sample.position.x, sample.position.y, sample.position.z)),
    quaternion: root.multiply(points.torsoQuaternion),
    scale: actor.scale,
  };
}

const vectorJSON = ({ x, y, z }) => ({ x, y, z });
const quaternionJSON = ({ x, y, z, w }) => ({ x, y, z, w });

export function captureBodycamPose(frame, pose, targetActorID) {
  const inverse = frame.quaternion.clone().invert();
  return {
    enabled: true,
    targetActorID,
    localPosition: vectorJSON(new Vector3(pose.position.x, pose.position.y, pose.position.z)
      .sub(frame.position).applyQuaternion(inverse).divideScalar(frame.scale)),
    localQuaternion: quaternionJSON(inverse.multiply(new Quaternion(
      pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w
    )).normalize()),
  };
}

export function applyCameraBodycam(project, shot, pose, elapsed, samples) {
  const bodycam = effectiveCameraBodycam(shot.camera.track, elapsed);
  if (!bodycam.enabled) return null;
  const frame = bodycamActorFrame(project, bodycam.targetActorID, elapsed, samples);
  if (!frame) return { ...pose, bodycamEvaluation: { enabled: true, warning: "Bodycam 绑定人物已不存在；当前使用摄影机轨道。" } };
  const local = bodycam.localPosition;
  const rotation = bodycam.localQuaternion;
  return {
    ...pose,
    position: vectorJSON(new Vector3(local.x, local.y, local.z).multiplyScalar(frame.scale)
      .applyQuaternion(frame.quaternion).add(frame.position)),
    quaternion: quaternionJSON(frame.quaternion.clone().multiply(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))),
    bodycamEvaluation: { enabled: true, targetActorID: bodycam.targetActorID, warning: null },
  };
}
