import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import {visibleContentBounds, updateCameraFarFromBounds} from '../app/camera-clipping.js';

const boxMesh = () => new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));
function assertInside(camera, bounds) {
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
    if (point.z < -camera.near) assert.ok(new THREE.Vector3(x,y,z).project(camera).z <= 1);
  }
}
test('complete Gaussian and mesh bounds include node, object and parent transformations', () => {
  const group=new THREE.Group();group.position.set(30, 10, -220);group.rotation.y=.6;group.scale.setScalar(3);
  const splatRoot=new THREE.Group();splatRoot.position.set(5,0,-10);splatRoot.scale.setScalar(2);
  splatRoot.userData.gaussianBounds=new THREE.Box3(new THREE.Vector3(-3,-2,-4),new THREE.Vector3(8,7,10));group.add(splatRoot);
  const mesh=boxMesh();mesh.position.set(-40,20,-20);group.add(mesh);
  const bounds=visibleContentBounds([group]);
  const expected=splatRoot.userData.gaussianBounds.clone().applyMatrix4(splatRoot.matrixWorld);
  mesh.geometry.computeBoundingBox();expected.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  assert.ok(bounds.equals(expected));
  const camera=new THREE.PerspectiveCamera(44,1,.05,120);updateCameraFarFromBounds(camera,bounds);assertInside(camera,bounds);
  assert.equal(camera.near,.05);assert.ok(camera.far>220);
});
test('camera movement, rotation, object movement, scaling and removal update the range', () => {
 const mesh=boxMesh();mesh.position.z=-205;mesh.scale.setScalar(40);
 const camera=new THREE.PerspectiveCamera(44,1,.05,120);
 for (const z of [0,100,500]) {
  camera.position.z=z;camera.lookAt(mesh.position);
  const bounds=visibleContentBounds([mesh]);updateCameraFarFromBounds(camera,bounds);assertInside(camera,bounds);
 }
 mesh.position.set(400,0,0);mesh.scale.setScalar(80);camera.position.set(-20,5,0);camera.lookAt(mesh.position);
 const bounds=visibleContentBounds([mesh]);updateCameraFarFromBounds(camera,bounds);assertInside(camera,bounds);
 assert.equal(updateCameraFarFromBounds(camera,visibleContentBounds([])),120);
});
test('hidden children and groups do not affect far distance, empty and nearby scenes use 120', () => {
 const group=new THREE.Group(),near=boxMesh(),far=boxMesh();near.position.z=-5;far.position.z=-10000;group.add(near,far);
 far.visible=false;const camera=new THREE.PerspectiveCamera(44,1,.05,120);
 assert.equal(updateCameraFarFromBounds(camera,visibleContentBounds([group])),120);
 far.visible=true;assert.ok(updateCameraFarFromBounds(camera,visibleContentBounds([group]))>10000);
 group.visible=false;assert.equal(updateCameraFarFromBounds(camera,visibleContentBounds([group])),120);
});
test('scene, camera, output and capture call the shared updater before drawing', () => {
 const source=fs.readFileSync(new URL('../app/director-renderer.js',import.meta.url),'utf8');
 assert.match(source,/renderCameraScene\([^\n]+\) \{\s*this.updateCameraClipping\(camera\)/);
 assert.match(source,/this.updateCameraClipping\(activeCamera\);\s*this.renderer.render\(this.scene, activeCamera\)/);
 assert.match(source,/this.updateCameraClipping\(camera\);\s*this.renderer.render\(this.scene,\s*camera\)/);
 assert.match(source,/this.updateCameraClipping\(this.shotCamera\);\s*this.renderShotScene/);
});
