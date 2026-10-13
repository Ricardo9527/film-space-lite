import * as THREE from "../vendor/three/three.module.js";

export const blockoutGeometryKinds = Object.freeze([
  "box",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "plane",
  "wedge",
]);

const blockoutGeometryRegistry = Object.freeze({
  box: {
    solid: true,
    create: () => new THREE.BoxGeometry(1, 1, 1),
  },
  sphere: {
    solid: true,
    create: () => new THREE.SphereGeometry(0.5, 24, 16),
  },
  cylinder: {
    solid: true,
    create: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  },
  cone: {
    solid: true,
    create: () => new THREE.ConeGeometry(0.5, 1, 24),
  },
  torus: {
    solid: true,
    create: () => new THREE.TorusGeometry(0.36, 0.14, 12, 32),
  },
  plane: {
    solid: false,
    create: () => new THREE.PlaneGeometry(1, 1),
  },
  wedge: {
    solid: true,
    custom: true,
    create: createWedgeGeometry,
  },
});

export function createBlockoutGeometry(kind) {
  const definition = blockoutGeometryRegistry[kind] || blockoutGeometryRegistry.box;
  return definition.create();
}

export function inspectBlockoutGeometry(kind, geometry = createBlockoutGeometry(kind)) {
  const definition = blockoutGeometryRegistry[kind] || blockoutGeometryRegistry.box;
  const errors = [];
  const position = geometry?.attributes?.position;
  if (!position || position.itemSize !== 3 || position.count < 3) {
    return {
      kind,
      solid: definition.solid,
      triangleCount: 0,
      signedVolume: 0,
      watertight: false,
      errors: ["Geometry has no usable triangle positions."],
    };
  }

  const index = geometry.index;
  const triangleVertexCount = index ? index.count : position.count;
  if (triangleVertexCount % 3 !== 0) {
    errors.push("Triangle index count is not divisible by three.");
  }

  const vertices = [];
  let signedVolume = 0;
  let degenerateTriangles = 0;
  const edgeCounts = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const vertexIndex = (offset) => index ? index.getX(offset) : offset;
  const weldedVertexKey = (vertex) => (
    `${quantize(vertex.x)},${quantize(vertex.y)},${quantize(vertex.z)}`
  );

  for (let offset = 0; offset + 2 < triangleVertexCount; offset += 3) {
    a.fromBufferAttribute(position, vertexIndex(offset));
    b.fromBufferAttribute(position, vertexIndex(offset + 1));
    c.fromBufferAttribute(position, vertexIndex(offset + 2));
    vertices.push(a.clone(), b.clone(), c.clone());
    if (![a, b, c].every((vertex) => (
      Number.isFinite(vertex.x) && Number.isFinite(vertex.y) && Number.isFinite(vertex.z)
    ))) {
      errors.push(`Triangle ${offset / 3} contains a non-finite vertex.`);
      continue;
    }
    cross.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (cross.lengthSq() <= 1e-14) degenerateTriangles += 1;
    signedVolume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;

    const keys = [weldedVertexKey(a), weldedVertexKey(b), weldedVertexKey(c)];
    for (const [left, right] of [[0, 1], [1, 2], [2, 0]]) {
      const key = keys[left] < keys[right]
        ? `${keys[left]}|${keys[right]}`
        : `${keys[right]}|${keys[left]}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    }
  }

  if (degenerateTriangles) {
    errors.push(`${degenerateTriangles} degenerate triangle(s) found.`);
  }
  const openEdgeCount = definition.solid
    ? [...edgeCounts.values()].filter((count) => count !== 2).length
    : 0;
  if (definition.solid && openEdgeCount) {
    errors.push(`${openEdgeCount} welded edge(s) are not shared by exactly two triangles.`);
  }
  if (definition.solid && signedVolume <= 1e-9) {
    errors.push("Solid triangle winding is inward or has zero enclosed volume.");
  }
  if (definition.custom && definition.solid) {
    const uniqueVertices = new Map();
    for (const vertex of vertices) uniqueVertices.set(weldedVertexKey(vertex), vertex);
    const interiorPoint = [...uniqueVertices.values()].reduce(
      (sum, vertex) => sum.add(vertex),
      new THREE.Vector3()
    ).multiplyScalar(1 / Math.max(uniqueVertices.size, 1));
    let inwardFaceCount = 0;
    for (let offset = 0; offset < vertices.length; offset += 3) {
      const faceNormal = new THREE.Vector3()
        .subVectors(vertices[offset + 1], vertices[offset])
        .cross(new THREE.Vector3().subVectors(vertices[offset + 2], vertices[offset]));
      const faceCenter = new THREE.Vector3()
        .add(vertices[offset])
        .add(vertices[offset + 1])
        .add(vertices[offset + 2])
        .multiplyScalar(1 / 3);
      if (faceNormal.dot(faceCenter.sub(interiorPoint)) <= 1e-9) inwardFaceCount += 1;
    }
    if (inwardFaceCount) {
      errors.push(`${inwardFaceCount} custom solid triangle(s) do not face outward.`);
    }
  }

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds || !bounds.min || !bounds.max) {
    errors.push("Geometry has no finite bounds.");
  } else {
    for (const value of [
      bounds.min.x, bounds.min.y, bounds.min.z,
      bounds.max.x, bounds.max.y, bounds.max.z,
    ]) {
      if (!Number.isFinite(value)) errors.push("Geometry bounds contain a non-finite value.");
    }
  }

  return {
    kind,
    solid: definition.solid,
    custom: definition.custom === true,
    triangleCount: Math.floor(triangleVertexCount / 3),
    signedVolume,
    watertight: definition.solid ? openEdgeCount === 0 : false,
    bounds: bounds ? {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
    } : null,
    errors: [...new Set(errors)],
  };
}

export function assertBlockoutGeometry(kind, geometry = createBlockoutGeometry(kind)) {
  const report = inspectBlockoutGeometry(kind, geometry);
  if (report.errors.length) {
    throw new Error(`Invalid Blockout ${kind} geometry: ${report.errors.join(" ")}`);
  }
  return report;
}

function createWedgeGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.5, -0.5, -0.5,
     0.5, -0.5, -0.5,
     0.5, -0.5,  0.5,
    -0.5, -0.5,  0.5,
    -0.5,  0.5, -0.5,
     0.5,  0.5, -0.5,
  ], 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    0, 5, 1, 0, 4, 5,
    3, 5, 4, 3, 2, 5,
    0, 3, 4,
    1, 5, 2,
  ]);
  const hardEdged = geometry.toNonIndexed();
  geometry.dispose();
  hardEdged.computeVertexNormals();
  return hardEdged;
}

function quantize(value) {
  return Math.round(value * 1e6);
}
