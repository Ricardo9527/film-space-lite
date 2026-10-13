import test from "node:test";
import assert from "node:assert/strict";

import {
  clipPolygonAboveGround,
  focusPlaneGroundIntersection,
  signedDistanceToFocusPlane,
} from "../app/camera-focus-plane.js";

test("focus plane ground intersection stays on Y=0 and on the optical plane", () => {
  const planePoint = { x: 1.5, y: 1.25, z: -3.5 };
  const planeNormal = { x: 0.25, y: -0.2, z: -1 };
  const intersection = focusPlaneGroundIntersection(planePoint, planeNormal);

  assert.ok(intersection);
  assert.equal(intersection.point.y, 0);
  assert.equal(intersection.direction.y, 0);
  assert.ok(Math.abs(signedDistanceToFocusPlane(
    intersection.point,
    planePoint,
    planeNormal
  )) < 1e-10);
  assert.ok(Math.abs(signedDistanceToFocusPlane({
    x: intersection.point.x + intersection.direction.x * 8,
    y: 0,
    z: intersection.point.z + intersection.direction.z * 8,
  }, planePoint, planeNormal)) < 1e-10);
});

test("vertical optical plane produces a stable horizontal ground line", () => {
  const intersection = focusPlaneGroundIntersection(
    { x: 0, y: 2, z: -4 },
    { x: 0, y: 0, z: -1 }
  );

  assert.deepEqual(intersection.point, { x: 0, y: 0, z: -4 });
  assert.deepEqual(intersection.direction, { x: 1, y: 0, z: 0 });
});

test("horizontal focus plane reports no invented ground intersection", () => {
  assert.equal(focusPlaneGroundIntersection(
    { x: 0, y: 2, z: 0 },
    { x: 0, y: 1, z: 0 }
  ), null);
});

test("focus curtain polygon is clipped exactly at ground level", () => {
  const clipped = clipPolygonAboveGround([
    { x: -2, y: -1, z: 0 },
    { x: 2, y: -1, z: 0 },
    { x: 2, y: 3, z: 0 },
    { x: -2, y: 3, z: 0 },
  ]);

  assert.deepEqual(clipped, [
    { x: 2, y: 0, z: 0 },
    { x: 2, y: 3, z: 0 },
    { x: -2, y: 3, z: 0 },
    { x: -2, y: 0, z: 0 },
  ]);
  assert.ok(clipped.every((point) => point.y >= 0));
});

test("focus curtain disappears when its complete visible rectangle is underground", () => {
  assert.deepEqual(clipPolygonAboveGround([
    { x: -1, y: -2, z: 0 },
    { x: 1, y: -2, z: 0 },
    { x: 1, y: -1, z: 0 },
    { x: -1, y: -1, z: 0 },
  ]), []);
});
