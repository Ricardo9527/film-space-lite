const ignoredRootFields = new Set(["revision", "modifiedAt"]);
const atomicObjectFields = new Set([
  "position",
  "quaternion",
  "rotation",
  "size",
  "aim",
  "follow",
  "focusTracking",
  "handheld",
  "cameraPose",
]);

export function semanticProjectChanges(baseProject, nextProject) {
  const changes = new Map();
  visitValue(baseProject, nextProject, [], changes);
  return changes;
}

export function semanticOperationConflicts({
  baseProject,
  localProject,
  remoteProject,
}) {
  const localChanges = semanticProjectChanges(baseProject, localProject);
  const remoteChanges = semanticProjectChanges(baseProject, remoteProject);
  const conflicts = [];

  for (const localChange of localChanges.values()) {
    for (const remoteChange of remoteChanges.values()) {
      if (!semanticPathsOverlap(localChange.path, remoteChange.path)) continue;
      conflicts.push({
        path: sharedConflictPath(localChange.path, remoteChange.path),
        label: semanticPathLabel(sharedConflictPath(localChange.path, remoteChange.path)),
        local: localChange,
        remote: remoteChange,
      });
    }
  }
  return deduplicateConflicts(conflicts);
}

export function semanticPathsOverlap(left, right) {
  if (left === right) return true;
  if (isExistenceAncestor(left, right) || isExistenceAncestor(right, left)) return true;
  return isPathAncestor(left, right) || isPathAncestor(right, left);
}

export function semanticPathLabel(path) {
  const parts = path.split("/").filter(Boolean).map(decodePathPart);
  const labels = {
    scene: "场景",
    output: "输出",
    actors: "演员",
    motionActions: "动作列表",
    poseTrack: "人物姿态轨道",
    pose: "人物姿态",
    cameraSetups: "机位",
    shots: "Shot",
    blockout: "布景",
    groups: "布景组",
    objects: "布景对象",
    primitives: "几何部件",
    referenceImages: "参考图",
    environment: "环境",
    visual: "视觉环境",
    visuals: "视觉环境",
    track: "摄影机轨道",
    keyframes: "关键帧",
    segments: "关键帧区段",
    name: "名称",
    position: "位置",
    rotationY: "Y 轴旋转",
    quaternion: "朝向",
    rotation: "旋转",
    scale: "缩放",
    uniformScale: "统一缩放",
    focalLength: "焦距",
    focusDistance: "对焦距离",
    aperture: "光圈",
    depthOfField: "景深",
    opacity: "透明度",
    visible: "显隐",
    locked: "锁定",
    
    appearance: "外观",
    image: "图片贴图",
    crop: "图片裁切",
    materialMode: "材质模式",
    groupID: "所属环境组",
    activeShotID: "当前 Shot",
    frameRate: "帧率",
    folder: "输出目录",
    duration: "时长",
    mode: "模式",
    seconds: "秒数",
    takeDuration: "Take 时长",
    interpolation: "插值",
    aim: "Look At",
    follow: "Follow",
    focusTracking: "焦点跟随",
    handheld: "手持",
    "$exists": "是否存在",
    "$order": "顺序",
  };

  return parts.map((part, index) => {
    if (part.startsWith("#")) return part.slice(1);
    if (part === "groups" && parts[index - 1] === "environment") return "环境组";
    return labels[part] || part;
  }).join(" · ");
}

function visitValue(baseValue, nextValue, pathParts, changes) {
  if (deepEqual(baseValue, nextValue)) return;
  const path = encodePath(pathParts);
  if (
    pathParts.length === 1
    && ignoredRootFields.has(pathParts[0])
  ) {
    return;
  }
  if (isOptionalObjectBoundary(baseValue, nextValue)) {
    addChange(changes, path, baseValue, nextValue);
    return;
  }
  if (isAtomicObject(pathParts, baseValue, nextValue)) {
    addChange(changes, path, baseValue, nextValue);
    return;
  }
  if (Array.isArray(baseValue) || Array.isArray(nextValue)) {
    visitArray(
      Array.isArray(baseValue) ? baseValue : [],
      Array.isArray(nextValue) ? nextValue : [],
      pathParts,
      changes,
    );
    return;
  }
  if (isPlainObject(baseValue) || isPlainObject(nextValue)) {
    const baseObject = isPlainObject(baseValue) ? baseValue : {};
    const nextObject = isPlainObject(nextValue) ? nextValue : {};
    const keys = new Set([...Object.keys(baseObject), ...Object.keys(nextObject)]);
    for (const key of [...keys].sort()) {
      visitValue(baseObject[key], nextObject[key], [...pathParts, key], changes);
    }
    return;
  }
  addChange(changes, path, baseValue, nextValue);
}

function visitArray(baseArray, nextArray, pathParts, changes) {
  if (!isIDCollection(baseArray, nextArray)) {
    addChange(changes, encodePath(pathParts), baseArray, nextArray);
    return;
  }
  const baseByID = new Map(baseArray.map((value) => [value.id, value]));
  const nextByID = new Map(nextArray.map((value) => [value.id, value]));
  const ids = new Set([...baseByID.keys(), ...nextByID.keys()]);

  for (const id of [...ids].sort()) {
    const entityPath = [...pathParts, `#${id}`];
    const inBase = baseByID.has(id);
    const inNext = nextByID.has(id);
    if (inBase !== inNext) {
      addChange(
        changes,
        encodePath([...entityPath, "$exists"]),
        inBase ? {
          index: baseArray.findIndex((value) => value.id === id),
          value: baseByID.get(id),
        } : undefined,
        inNext ? {
          index: nextArray.findIndex((value) => value.id === id),
          value: nextByID.get(id),
        } : undefined,
      );
      continue;
    }
    visitValue(baseByID.get(id), nextByID.get(id), entityPath, changes);
  }

  const baseIDs = baseArray.map((value) => value.id);
  const nextIDs = nextArray.map((value) => value.id);
  if (
    baseIDs.length === nextIDs.length
    && baseIDs.every((id) => nextByID.has(id))
    && JSON.stringify(baseIDs) !== JSON.stringify(nextIDs)
  ) {
    addChange(changes, encodePath([...pathParts, "$order"]), baseIDs, nextIDs);
  }
}

function isAtomicObject(pathParts, baseValue, nextValue) {
  const key = pathParts.at(-1);
  if (!atomicObjectFields.has(key)) return false;
  return isPlainObject(baseValue) || isPlainObject(nextValue);
}

function isOptionalObjectBoundary(baseValue, nextValue) {
  const baseHasNoObject = baseValue === null || baseValue === undefined;
  const nextHasNoObject = nextValue === null || nextValue === undefined;
  return (baseHasNoObject && isPlainObject(nextValue))
    || (nextHasNoObject && isPlainObject(baseValue));
}

function isIDCollection(baseArray, nextArray) {
  if (!baseArray.length && !nextArray.length) return false;
  return [baseArray, nextArray].every((values) => {
    const ids = values.map((value) => value?.id);
    return ids.every((id) => typeof id === "string" && id)
      && new Set(ids).size === ids.length;
  });
}

function addChange(changes, path, before, after) {
  changes.set(path, {
    path,
    before: cloneValue(before),
    after: cloneValue(after),
  });
}

function sharedConflictPath(left, right) {
  if (left === right) return left;
  if (left.endsWith("/$exists") && right.startsWith(left.slice(0, -"/$exists".length))) return left;
  if (right.endsWith("/$exists") && left.startsWith(right.slice(0, -"/$exists".length))) return right;
  if (isPathAncestor(left, right)) return left;
  if (isPathAncestor(right, left)) return right;
  return left;
}

function isExistenceAncestor(candidate, other) {
  if (!candidate.endsWith("/$exists")) return false;
  const entityPath = candidate.slice(0, -"/$exists".length);
  return other === entityPath || other.startsWith(`${entityPath}/`);
}

function isPathAncestor(candidate, other) {
  return other.startsWith(`${candidate}/`);
}

function deduplicateConflicts(conflicts) {
  const seen = new Set();
  return conflicts.filter((conflict) => {
    const key = `${conflict.local.path}\n${conflict.remote.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function encodePath(parts) {
  return `/${parts.map(encodePathPart).join("/")}`;
}

function encodePathPart(part) {
  return String(part).replaceAll("~", "~0").replaceAll("/", "~1");
}

function decodePathPart(part) {
  return String(part).replaceAll("~1", "/").replaceAll("~0", "~");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
}
