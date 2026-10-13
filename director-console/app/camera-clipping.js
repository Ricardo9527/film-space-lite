import * as THREE from "../vendor/three/three.module.js";

// Reuse loaded asset bounds; Gaussian meshes do not expose ordinary geometry.
// Traverse visibility explicitly because Box3.setFromObject includes hidden nodes.
export function visibleContentBounds(roots, target = new THREE.Box3()) {
  target.makeEmpty();
  const box = new THREE.Box3();
  function include(object) {
    if (!object.visible) return;
    if (object.userData.gaussianBounds) {
      target.union(box.copy(object.userData.gaussianBounds).applyMatrix4(object.matrixWorld));
      return;
    }
    if (object.isMesh) {
      let localBounds;
      if (object.boundingBox !== undefined) {
        if (object.boundingBox === null) object.computeBoundingBox();
        localBounds = object.boundingBox;
      } else {
        if (object.geometry.boundingBox === null) object.geometry.computeBoundingBox();
        localBounds = object.geometry.boundingBox;
      }
      target.union(box.copy(localBounds).applyMatrix4(object.matrixWorld));
    }
    for (const child of object.children) include(child);
  }
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    include(root);
  }
  return target;
}

export function updateCameraFarFromBounds(camera, worldBounds) {
  camera.updateWorldMatrix(true, false);
  const farthestDepth = worldBounds.isEmpty()
    ? 0
    : -worldBounds.clone().applyMatrix4(camera.matrixWorldInverse).min.z;
  const far = Math.max(120, farthestDepth + Math.max(10, farthestDepth * 0.05));
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  return far;
}
