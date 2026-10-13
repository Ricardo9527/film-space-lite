import { normalizeDesktopProject } from "./project-model.js";
import { semanticProjectChanges, semanticPathsOverlap } from "./semantic-project-diff.js";

const protectedRootFields = new Set([
  "id",
  "schemaVersion",
  "revision",
  "createdAt",
  "modifiedAt",
]);

export function semanticPatchBetween(baseProject, nextProject) {
  return orderPatchChanges([...semanticProjectChanges(baseProject, nextProject).values()].map((change) => ({
    path: change.path,
    ...(change.after === undefined
      ? { delete: true }
      : { value: structuredClone(change.after) }),
  })));
}

export function invertSemanticPatch(baseProject, nextProject) {
  return orderPatchChanges([...semanticProjectChanges(baseProject, nextProject).values()].map((change) => ({
    path: change.path,
    ...(change.before === undefined
      ? { delete: true }
      : { value: structuredClone(change.before) }),
  })));
}

export function applySemanticProjectPatch(projectInput, changesInput) {
  const changes = Array.isArray(changesInput) ? changesInput : [];
  if (!changes.length) return normalizeDesktopProject(projectInput);
  const project = structuredClone(normalizeDesktopProject(projectInput));
  const addedFieldPaths = [];
  for (const change of changes) applyChange(project, change, addedFieldPaths);
  const normalized = normalizeDesktopProject(project);
  for (const parts of addedFieldPaths) resolveValue(normalized, parts);
  return normalized;
}

export function semanticPatchConflicts({ baseProject, remoteProject, changes }) {
  const remoteChanges = [...semanticProjectChanges(baseProject, remoteProject).values()];
  const conflicts = [];
  for (const localChange of changes || []) {
    for (const remoteChange of remoteChanges) {
      if (!semanticPathsOverlap(localChange.path, remoteChange.path)) continue;
      conflicts.push({
        path: localChange.path,
        local: structuredClone(localChange),
        remote: remoteChange,
      });
    }
  }
  return deduplicate(conflicts);
}

function applyChange(project, change, addedFieldPaths) {
  const parts = decodePath(change?.path);
  if (!parts.length) throw patchError("Patch path must not target the project root");
  if (protectedRootFields.has(parts[0])) {
    throw patchError(`Patch path cannot change protected project field: ${parts[0]}`);
  }

  const marker = parts.at(-1);
  if (marker === "$exists") {
    applyEntityExistence(project, parts, change);
    return;
  }
  if (marker === "$order") {
    applyEntityOrder(project, parts, change);
    return;
  }

  const { parent, key } = resolveParent(project, parts, {
    createMissingObjects: true,
    addedFieldPaths,
  });
  if (!Object.hasOwn(parent, key)) {
    if (change.delete === true) {
      throw patchError(`Patch path does not target an existing project field: ${change.path}`);
    }
    if (!Object.hasOwn(change, "value")) {
      throw patchError(`Patch change requires value or delete: ${change.path}`);
    }
    parent[key] = structuredClone(change.value);
    addedFieldPaths.push(parts);
    return;
  }
  if (change.delete === true) delete parent[key];
  else if (Object.hasOwn(change, "value")) parent[key] = structuredClone(change.value);
  else throw patchError(`Patch change requires value or delete: ${change.path}`);
}

function applyEntityExistence(project, parts, change) {
  const entityPart = parts.at(-2);
  if (!entityPart?.startsWith("#")) {
    throw patchError(`Entity existence path is invalid: ${change.path}`);
  }
  const id = entityPart.slice(1);
  const collection = resolveValue(project, parts.slice(0, -2));
  if (!Array.isArray(collection)) {
    throw patchError(`Entity existence path does not target a collection: ${change.path}`);
  }
  const currentIndex = collection.findIndex((value) => value?.id === id);
  if (change.delete === true) {
    if (currentIndex >= 0) collection.splice(currentIndex, 1);
    return;
  }
  const addition = change.value;
  if (
    !addition
    || typeof addition !== "object"
    || !addition.value
    || addition.value.id !== id
  ) {
    throw patchError(`Entity addition must contain the matching ID: ${change.path}`);
  }
  if (currentIndex >= 0) {
    collection[currentIndex] = structuredClone(addition.value);
    return;
  }
  const index = Math.max(0, Math.min(collection.length, Number(addition.index) || 0));
  collection.splice(index, 0, structuredClone(addition.value));
}

function applyEntityOrder(project, parts, change) {
  if (change.delete === true || !Array.isArray(change.value)) {
    throw patchError(`Collection order patch requires an ID array: ${change.path}`);
  }
  const collection = resolveValue(project, parts.slice(0, -1));
  if (!Array.isArray(collection)) {
    throw patchError(`Collection order path does not target a collection: ${change.path}`);
  }
  const byID = new Map(collection.map((value) => [value?.id, value]));
  if (
    change.value.length !== collection.length
    || change.value.some((id) => !byID.has(id))
    || new Set(change.value).size !== change.value.length
  ) {
    throw patchError(`Collection order must contain exactly the current entity IDs: ${change.path}`);
  }
  collection.splice(0, collection.length, ...change.value.map((id) => byID.get(id)));
}

function resolveParent(project, parts, options = {}) {
  if (parts.length === 1) return { parent: project, key: parts[0] };
  const parent = resolveValue(project, parts.slice(0, -1), options);
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
    throw patchError(`Patch path parent is not an object: /${parts.join("/")}`);
  }
  return { parent, key: parts.at(-1) };
}

function resolveValue(project, parts, options = {}) {
  let current = project;
  for (const [index, part] of parts.entries()) {
    if (part.startsWith("#")) {
      if (!Array.isArray(current)) throw patchError(`Expected an entity collection before ${part}`);
      current = current.find((value) => value?.id === part.slice(1));
      if (!current) throw patchError(`Project entity not found: ${part.slice(1)}`);
      continue;
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      throw patchError(`Project field not found: ${part}`);
    }
    if (!Object.hasOwn(current, part)) {
      if (options.createMissingObjects !== true) {
        throw patchError(`Project field not found: ${part}`);
      }
      current[part] = {};
      options.addedFieldPaths?.push(parts.slice(0, index + 1));
    }
    current = current[part];
  }
  return current;
}

function decodePath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw patchError("Patch path must be a JSON-pointer-style string");
  }
  return path.split("/").slice(1).map((part) => (
    part.replaceAll("~1", "/").replaceAll("~0", "~")
  ));
}

function deduplicate(conflicts) {
  const seen = new Set();
  return conflicts.filter((conflict) => {
    const key = `${conflict.path}\n${conflict.remote.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orderPatchChanges(changes) {
  return changes
    .map((change, originalIndex) => ({ change, originalIndex }))
    .sort((left, right) => {
      const leftRank = patchOrderRank(left.change);
      const rightRank = patchOrderRank(right.change);
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (leftRank === 1) {
        const leftIndex = Number(left.change.value?.index);
        const rightIndex = Number(right.change.value?.index);
        if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex) && leftIndex !== rightIndex) {
          return leftIndex - rightIndex;
        }
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(({ change }) => change);
}

function patchOrderRank(change) {
  if (change.path.endsWith("/$exists") && change.delete === true) return 0;
  if (change.path.endsWith("/$exists")) return 1;
  if (change.path.endsWith("/$order")) return 3;
  return 2;
}

function patchError(message) {
  const error = new Error(`Invalid Film Space semantic patch: ${message}`);
  error.statusCode = 400;
  error.code = "FILM_SPACE_SEMANTIC_PATCH";
  return error;
}
