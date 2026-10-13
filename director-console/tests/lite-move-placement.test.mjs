import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/three.module.js';
import { createDesktopProject, addActor, addMoveAction, normalizeDesktopProject } from '../app/project-model.js';

const source = readFileSync(new URL('../app/director-renderer.js', import.meta.url), 'utf8');
const methods = ['pickMoveTarget', 'pickHorizontalPlane'].map(name => {
  const start = source.indexOf(`  ${name}(`);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}).join('\n');
const Picker = vm.runInNewContext(`(class {${methods}})`, { THREE });

for (const height of [0, 6.367, -3]) {
  test(`picks and persists an unlimited plane at path height ${height}`, () => {
    const picker = new Picker();
    picker.selectedActorID = 'actor-test';
    picker.actors = new Map([['actor-test', { position: new THREE.Vector3(0, height + 2, 0), userData: {pathPosition:{x:0,y:height,z:0}} }]]);
    picker.pointer = new THREE.Vector2(0, 0);
    picker.updatePointer = () => {};
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(150, height + 10, -110);
    camera.lookAt(150, height, -120);
    camera.updateMatrixWorld();
    picker.activeSceneNavigation = () => ({camera});
    picker.raycaster = new THREE.Raycaster();
    const point = picker.pickMoveTarget({});
    assert.ok(point.distanceTo(new THREE.Vector3(150, height, -120)) < 1e-8);
    let project = addActor(createDesktopProject(), {id:'actor-test', characterAssetID:'blocking-figure'});
    project = addMoveAction(project, 'actor-test', {x:point.x, y:point.y, z:point.z});
    project = normalizeDesktopProject(JSON.parse(JSON.stringify(project)));
    const move = project.scene.actors.find(a => a.id === 'actor-test').motionActions.find(a => a.kind === 'move');
    assert.ok(Math.abs(move.position.y - height) < 1e-8);
    assert.ok(Math.abs(move.position.x - 150) < 1e-8);
  });
}

test('both UI entry points forward all coordinates to the durable Move command', () => {
  assert.equal((source.match(/const point = this.pickMoveTarget\(event\)/g) || []).length, 2);
  assert.match(source, /this.onAddMove\(\{\s*x: point.x,\s*y: point.y,\s*z: point.z/);
  assert.match(source, /this.onAddMove\(\{ x: point.x, y: point.y, z: point.z \}\)/);
  assert.doesNotMatch(source, /pickFloor\(/);
});
