// One project-owned picture on an object's local XY face, facing +Z.
export function defaultBlockoutImage(object, asset) {
  const face = [...object.primitives].sort((a, b) => b.size.x * b.size.y - a.size.x * a.size.y)[0];
  return { asset, position: face ? { ...face.position, z: face.position.z + face.size.z / 2 + 0.002 } : { x: 0, y: 0.5, z: 0.002 },
    width: face?.size.x || 1, height: face?.size.y || 1, rotation: { x: 0, y: 0, z: 0 },
    crop: { x: 0, y: 0, width: 1, height: 1 } };
}

// Crop coordinates start at the top-left of the source image, independent of renderer UVs.
export function blockoutImageUV(crop) {
  return { offset: { x: crop.x, y: 1 - crop.y - crop.height }, repeat: { x: crop.width, y: crop.height } };
}

export function visibleBlockoutImages(project) {
  const layer = project.scene.blockout;
  if (layer.visible === false) return [];
  return layer.groups.filter(g => g.visible !== false).flatMap(g =>
    g.objects.filter(o => o.visible !== false && o.image).map(o => ({ groupID: g.id, objectID: o.id, image: o.image })));
}
