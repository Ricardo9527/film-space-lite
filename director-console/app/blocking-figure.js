import { blockingPoseLandmarks, legacyActorPose } from "./actor-pose.js";
import * as THREE from "../vendor/three/three.module.js";

// Original procedural source: meters, floor at Y=0, front at +Z like other actors.
export function createBlockingFigure(color) {
  const model = new THREE.Group();
  model.name = "BlockingFigure";
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.54, 32), material);
  body.name = "Body";
  body.scale.z = 0.7;
  body.position.y = 1.12;
  const bend = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 32), material);
  bend.name = "BodyBend";
  bend.scale.z = 0.7;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1, 32), material);
  base.name = "BodyBase";
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 32, 20), material);
  head.name = "Head";
  head.position.y = 1.62;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 16), material);
  nose.name = "Nose";
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.62, 0.265);
  model.add(body, bend, base, head, nose);
  applyBlockingFigurePose(model, { posture: "stand" });
  model.traverse((object) => {
    if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  model.userData.basePosition = model.position.clone();
  return model;
}

// The same rigid parts are sampled by Edit, Camera, MP4 and Blender capture.
export function applyBlockingFigurePose(model, sample) {
  const pose=sample.blockingPose || legacyActorPose(sample,sample);
  const points=blockingPoseLandmarks(pose);
  model.rotation.set(pose.rotationX,0,pose.rotationZ,"XYZ");
  const body=model.getObjectByName("Body"),bend=model.getObjectByName("BodyBend"),base=model.getObjectByName("BodyBase");
  body.position.set(points.body.x,points.body.y,points.body.z);body.rotation.x=pose.torsoPitch;
  bend.position.set(points.bend.x,points.bend.y,points.bend.z);bend.rotation.x=points.hipAngle;bend.scale.set(1,pose.bodyHeight,0.7);
  base.position.set(points.base.x,points.base.y,points.base.z);base.rotation.x=points.lowerAngle;base.scale.set(1,points.shin,0.7);
  const head=model.getObjectByName("Head"),nose=model.getObjectByName("Nose");
  head.position.set(points.head.x,points.head.y,points.head.z);head.rotation.x=points.headAngle;
  nose.position.set(points.nose.x,points.nose.y,points.nose.z);nose.rotation.x=Math.PI/2+points.headAngle;
}
