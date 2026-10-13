import test from "node:test";
import assert from "node:assert/strict";
import { createDesktopProject, addShot, findShot, normalizeDesktopProject } from "../app/project-model.js";
import { applyFilmSpaceOperations, validateFilmSpaceOperation } from "../app/project-command-service.js";
import { cameraAimTargetPosition, sampleShotCamera, describeCameraAimTransition } from "../app/camera-aim.js";
import { normalizeCameraAim } from "../app/camera-track.js";

const aim = { mode: "look-at", targetKind: "environment", environmentID: "environment-statue", localPosition: { x: 0, y: 1, z: -1 }, trackingResponse: 0 };
const pose = { position: { x: 0, y: 2, z: 8 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, focalLength: 35 };

function fixture() {
  const project = addShot(createDesktopProject(), { cameraPose: pose });
  project.scene.environment.groups = [{ id: "group-statue", visible: true, transform: {
    position: { x: 10, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, uniformScale: 2,
  } }];
  project.scene.environment.visuals = [{ id: aim.environmentID, groupID: "group-statue", visible: true,
    asset: { ref: `${project.id}-assets/environment-0123456789abcdef.glb`, sourceName: "Statue.glb", sizeBytes: 100 },
    transform: { position: { x: 1, y: 2, z: 3 }, quaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, uniformScale: 2 },
  }];
  return project;
}

test("environment Aim uses the instance and group transforms for both asset representations", () => {
  const project = fixture();
  for (const asset of [{ ref: "statue.glb" }, { kind: "gaussian", nodes: [] }]) {
    project.scene.environment.visuals[0].asset = asset;
    const target = cameraAimTargetPosition(project, null, aim);
    assert.ok(Math.abs(target.x - 8) < 1e-9);
    assert.equal(target.y, 8);
    assert.ok(Math.abs(target.z - 6) < 1e-9);
  }
  project.scene.environment.groups[0].transform.position.x += 3;
  assert.ok(Math.abs(cameraAimTargetPosition(project, null, aim).x - 11) < 1e-9);
  project.scene.environment.groups[0].visible = false;
  assert.equal(cameraAimTargetPosition(project, null, aim), null);
  project.scene.environment.visuals = [];
  assert.equal(cameraAimTargetPosition(project, null, aim), null);
});

test("MCP environment Aim survives normalization and changes evaluated direction only", () => {
  const project = fixture();
  const shot = findShot(project);
  const op = { action: "update_camera_keyframe_aim", shotID: shot.id, keyframeID: shot.camera.track.keyframes[0].id, aim };
  validateFilmSpaceOperation(op);
  const result = applyFilmSpaceOperations(project, [op]).project;
  const reopened = normalizeDesktopProject(JSON.parse(JSON.stringify(result)));
  const newShot = findShot(reopened);
  assert.deepEqual(newShot.camera.track.keyframes[0].aim, normalizeCameraAim(aim));
  const sample = sampleShotCamera(reopened, newShot, 0);
  assert.deepEqual(sample.position, pose.position);
  assert.equal(sample.focalLength, pose.focalLength);
  assert.notDeepEqual(sample.quaternion, pose.quaternion);
  assert.deepEqual(shot.camera.track.keyframes[0].position, pose.position);
  assert.throws(() => validateFilmSpaceOperation({ ...op, aim: { ...aim, environmentID: undefined } }));
});

test("changing environment binding or local point is an explicit Aim transition", () => {
  const start = { id: "start", time: 0, ...pose, aim };
  for (const endAim of [{ ...aim, environmentID: "environment-other" }, { ...aim, localPosition: { x: 1, y: 1, z: -1 } }]) {
    const track = { keyframes: [start, { id: "end", time: 2, ...pose, aim: endAim }] };
    assert.ok(describeCameraAimTransition(track, 1));
  }
  assert.deepEqual(normalizeCameraAim({ mode: "look-at", targetKind: "world", worldPosition: { x: 1, y: 2, z: 3 } }).worldPosition, { x: 1, y: 2, z: 3 });
});
