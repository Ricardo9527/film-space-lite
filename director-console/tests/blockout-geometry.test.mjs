import test from "node:test";
import assert from "node:assert/strict";

import * as THREE from "../vendor/three/three.module.js";
import {
  assertBlockoutGeometry,
  blockoutGeometryKinds,
  createBlockoutGeometry,
  inspectBlockoutGeometry,
} from "../app/blockout-geometry.js";
import { blockoutPrimitiveKinds } from "../app/project-model.js";

test("renderer geometry registry exactly matches the durable Blockout primitive contract", () => {
  assert.deepEqual([...blockoutGeometryKinds], [...blockoutPrimitiveKinds]);
});

test("every registered Blockout primitive has finite, non-degenerate geometry", () => {
  for (const kind of blockoutGeometryKinds) {
    const geometry = createBlockoutGeometry(kind);
    const report = inspectBlockoutGeometry(kind, geometry);
    assert.equal(report.errors.length, 0, `${kind}: ${report.errors.join(" ")}`);
    assert.ok(report.triangleCount > 0, kind);
    if (report.solid) {
      assert.equal(report.watertight, true, kind);
      assert.ok(report.signedVolume > 0, kind);
    }
    geometry.dispose();
  }
});

test("wedge uses outward winding and hard face normals", () => {
  const geometry = createBlockoutGeometry("wedge");
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  assert.equal(geometry.index, null);
  assert.equal(position.count, 24);

  const uniqueVertices = new Map();
  for (let offset = 0; offset < position.count; offset += 1) {
    const vertex = new THREE.Vector3().fromBufferAttribute(position, offset);
    uniqueVertices.set(vertex.toArray().join(","), vertex);
  }
  const interiorPoint = [...uniqueVertices.values()].reduce(
    (sum, vertex) => sum.add(vertex),
    new THREE.Vector3()
  ).multiplyScalar(1 / uniqueVertices.size);
  for (let offset = 0; offset < position.count; offset += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, offset);
    const b = new THREE.Vector3().fromBufferAttribute(position, offset + 1);
    const c = new THREE.Vector3().fromBufferAttribute(position, offset + 2);
    const faceNormal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    const faceCenter = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    assert.ok(
      faceNormal.dot(faceCenter.sub(interiorPoint)) > 0,
      `triangle ${offset / 3} should face outward`
    );
    for (let vertex = offset; vertex < offset + 3; vertex += 1) {
      const vertexNormal = new THREE.Vector3().fromBufferAttribute(normal, vertex);
      assert.ok(vertexNormal.distanceTo(faceNormal) < 1e-6);
    }
  }
  geometry.dispose();
});

test("geometry validation rejects an inward-wound custom solid", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ], 3));
  geometry.setIndex([
    0, 2, 1,
    0, 1, 3,
    1, 2, 3,
    2, 0, 3,
  ].map((value, index, values) => values[index - index % 3 + (2 - index % 3)]));
  assert.throws(
    () => assertBlockoutGeometry("wedge", geometry),
    /winding is inward/
  );
  geometry.dispose();
});
