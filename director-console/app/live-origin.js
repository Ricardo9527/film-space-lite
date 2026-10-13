// Rigid-transform math for mapping VCam phone poses into desktop world space.
//
// Poses are camera-to-world { position: {x,y,z}, quaternion: {x,y,z,w} }. Set
// Origin captures `origin = base ∘ phone⁻¹` so that the phone pose at the
// calibration moment maps exactly onto the base Shot camera pose with no
// visual jump; later phone motion is applied 1:1 through the same origin.

export function normalizeQuaternion(q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

export function multiplyQuaternions(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function inverseQuaternion(q) {
  const normalized = normalizeQuaternion(q);
  return { x: -normalized.x, y: -normalized.y, z: -normalized.z, w: normalized.w };
}

export function rotateVector(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

export function composePose(parent, child) {
  const rotated = rotateVector(parent.quaternion, child.position);
  return {
    position: {
      x: parent.position.x + rotated.x,
      y: parent.position.y + rotated.y,
      z: parent.position.z + rotated.z,
    },
    quaternion: normalizeQuaternion(multiplyQuaternions(parent.quaternion, child.quaternion)),
  };
}

export function originFromPoses(basePose, phonePose) {
  const originQuaternion = normalizeQuaternion(
    multiplyQuaternions(basePose.quaternion, inverseQuaternion(phonePose.quaternion))
  );
  const rotated = rotateVector(originQuaternion, phonePose.position);
  return {
    position: {
      x: basePose.position.x - rotated.x,
      y: basePose.position.y - rotated.y,
      z: basePose.position.z - rotated.z,
    },
    quaternion: originQuaternion,
  };
}
