const horizontalIntersectionEpsilon = 1e-8;

export function focusPlaneGroundIntersection(planePoint, planeNormal, groundY = 0) {
  if (![planePoint?.x, planePoint?.y, planePoint?.z].every(Number.isFinite)) return null;
  if (![planeNormal?.x, planeNormal?.y, planeNormal?.z].every(Number.isFinite)) return null;
  if (!Number.isFinite(groundY)) return null;

  const normalLength = Math.hypot(planeNormal.x, planeNormal.y, planeNormal.z);
  if (normalLength <= horizontalIntersectionEpsilon) return null;
  const normal = {
    x: planeNormal.x / normalLength,
    y: planeNormal.y / normalLength,
    z: planeNormal.z / normalLength,
  };
  const horizontalLengthSquared = normal.x * normal.x + normal.z * normal.z;
  if (horizontalLengthSquared <= horizontalIntersectionEpsilon) return null;

  const planeConstant = (
    normal.x * planePoint.x
    + normal.y * planePoint.y
    + normal.z * planePoint.z
  );
  const horizontalConstant = planeConstant - normal.y * groundY;
  const directionLength = Math.sqrt(horizontalLengthSquared);
  return {
    point: {
      x: normal.x * horizontalConstant / horizontalLengthSquared,
      y: groundY,
      z: normal.z * horizontalConstant / horizontalLengthSquared,
    },
    direction: {
      x: -normal.z / directionLength,
      y: 0,
      z: normal.x / directionLength,
    },
  };
}

export function signedDistanceToFocusPlane(point, planePoint, planeNormal) {
  if (![point?.x, point?.y, point?.z].every(Number.isFinite)) return NaN;
  if (![planePoint?.x, planePoint?.y, planePoint?.z].every(Number.isFinite)) return NaN;
  if (![planeNormal?.x, planeNormal?.y, planeNormal?.z].every(Number.isFinite)) return NaN;
  const normalLength = Math.hypot(planeNormal.x, planeNormal.y, planeNormal.z);
  if (normalLength <= horizontalIntersectionEpsilon) return NaN;
  return (
    (point.x - planePoint.x) * planeNormal.x
    + (point.y - planePoint.y) * planeNormal.y
    + (point.z - planePoint.z) * planeNormal.z
  ) / normalLength;
}

export function clipPolygonAboveGround(points, groundY = 0) {
  if (!Array.isArray(points) || points.length < 3 || !Number.isFinite(groundY)) return [];
  if (!points.every((point) => [point?.x, point?.y, point?.z].every(Number.isFinite))) return [];

  const clipped = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const startInside = start.y >= groundY - horizontalIntersectionEpsilon;
    const endInside = end.y >= groundY - horizontalIntersectionEpsilon;
    if (startInside) clipped.push({ ...start, y: Math.max(start.y, groundY) });
    if (startInside === endInside) continue;
    const fraction = (groundY - start.y) / (end.y - start.y);
    clipped.push({
      x: start.x + (end.x - start.x) * fraction,
      y: groundY,
      z: start.z + (end.z - start.z) * fraction,
    });
  }
  return clipped.filter((point, index) => {
    const previous = clipped[(index - 1 + clipped.length) % clipped.length];
    return !previous || Math.hypot(
      point.x - previous.x,
      point.y - previous.y,
      point.z - previous.z
    ) > horizontalIntersectionEpsilon;
  });
}
