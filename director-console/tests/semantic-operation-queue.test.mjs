import test from "node:test";
import assert from "node:assert/strict";

import { SemanticOperationQueue } from "../app/semantic-operation-queue.js";
import { applySemanticProjectPatch } from "../app/semantic-project-patch.js";
import {
  addActor,
  createDesktopProject,
  removeVisualEnvironment,
  renameProject,
  setActorTransform,
  setProjectFrameRate,
  setVisualEnvironmentAsset,
} from "../app/project-model.js";

class FakeProjectAPI {
  constructor(project) {
    this.sourceID = "ui:test";
    this.project = structuredClone(project);
    this.beforeApply = null;
  }

  async load() {
    return structuredClone(this.project);
  }

  async applyOperations(projectID, expectedRevision, operations, source) {
    if (this.beforeApply) {
      const mutate = this.beforeApply;
      this.beforeApply = null;
      this.project = mutate(this.project);
      this.project.revision += 1;
    }
    if (projectID !== this.project.id || expectedRevision !== this.project.revision) {
      const error = new Error("revision conflict");
      error.status = 409;
      throw error;
    }
    assert.equal(source, this.sourceID);
    const operation = operations[0];
    this.project = applySemanticProjectPatch(this.project, operation.changes);
    this.project.revision = expectedRevision + 1;
    return { project: structuredClone(this.project), results: [{ changed: true }] };
  }
}

function fixture() {
  const project = addActor(createDesktopProject({ id: "project-queue-01" }), {
    id: "actor-lead-01",
  });
  project.revision = 57;
  return project;
}

test("semantic queue submits against the current revision", async () => {
  const base = fixture();
  const api = new FakeProjectAPI(base);
  const projects = [];
  const queue = new SemanticOperationQueue({
    projectAPI: api,
    project: base,
    onProject: (project) => projects.push(project),
  });
  const next = renameProject(base, "UI 名称");

  const result = await queue.enqueue({ baseProject: base, nextProject: next });
  await queue.flush();

  assert.equal(result.changed, true);
  assert.equal(api.project.revision, 58);
  assert.equal(api.project.name, "UI 名称");
  assert.equal(projects.at(-1).revision, 58);
});

test("revision conflict reloads and replays non-overlapping UI fields", async () => {
  const base = fixture();
  const api = new FakeProjectAPI(base);
  api.beforeApply = (project) => setProjectFrameRate(project, 60);
  const queue = new SemanticOperationQueue({ projectAPI: api, project: base });
  const next = renameProject(base, "UI 名称");

  const result = await queue.enqueue({ baseProject: base, nextProject: next });
  await queue.flush();

  assert.equal(result.changed, true);
  assert.equal(api.project.revision, 59);
  assert.equal(api.project.name, "UI 名称");
  assert.equal(api.project.output.frameRate, 60);
});

test("semantic queue saves visual environment import, replacement, and removal", async () => {
  const base = fixture();
  const api = new FakeProjectAPI(base);
  const queue = new SemanticOperationQueue({ projectAPI: api, project: base });
  const imported = setVisualEnvironmentAsset(base, {
    ref: `${base.id}-assets/environment-${"a".repeat(16)}.glb`,
    sourceName: "environment-a.glb",
    sizeBytes: 59 * 1024 * 1024,
    checksum: "a".repeat(64),
  }, { id: "visual-environment-queue" });

  const importResult = await queue.enqueue({ baseProject: base, nextProject: imported });
  await queue.flush();
  assert.equal(importResult.changed, true);
  assert.equal(api.project.revision, 58);
  assert.deepEqual(
    api.project.scene.environment.visuals,
    imported.scene.environment.visuals,
  );

  const replacementBase = structuredClone(api.project);
  const replaced = setVisualEnvironmentAsset(replacementBase, {
    ref: `${base.id}-assets/environment-${"b".repeat(16)}.glb`,
    sourceName: "environment-b.glb",
    sizeBytes: 23 * 1024 * 1024,
    checksum: "b".repeat(64),
  }, { environmentID: "visual-environment-queue" });
  const replaceResult = await queue.enqueue({
    baseProject: replacementBase,
    nextProject: replaced,
  });
  await queue.flush();
  assert.equal(replaceResult.changed, true);
  assert.equal(api.project.revision, 59);
  assert.equal(api.project.scene.environment.visuals[0].asset.sourceName, "environment-b.glb");

  const removalBase = structuredClone(api.project);
  const removed = removeVisualEnvironment(removalBase, "visual-environment-queue");
  const removeResult = await queue.enqueue({
    baseProject: removalBase,
    nextProject: removed,
  });
  await queue.flush();
  assert.equal(removeResult.changed, true);
  assert.equal(api.project.revision, 60);
  assert.deepEqual(api.project.scene.environment.visuals, []);
});

test("same-field conflict can keep the external value", async () => {
  const base = fixture();
  const api = new FakeProjectAPI(base);
  api.beforeApply = (project) => renameProject(project, "MCP 名称");
  const decisions = [];
  const queue = new SemanticOperationQueue({
    projectAPI: api,
    project: base,
    resolveConflict: async ({ conflicts }) => {
      decisions.push(conflicts);
      return "external";
    },
  });

  const result = await queue.enqueue({
    baseProject: base,
    nextProject: renameProject(base, "UI 名称"),
  });
  await queue.flush();

  assert.equal(result.dropped, true);
  assert.equal(api.project.revision, 58);
  assert.equal(api.project.name, "MCP 名称");
  assert.equal(decisions.length, 1);
});

test("same-field conflict can explicitly apply the UI value", async () => {
  const base = fixture();
  const api = new FakeProjectAPI(base);
  api.beforeApply = (project) => renameProject(project, "MCP 名称");
  const queue = new SemanticOperationQueue({
    projectAPI: api,
    project: base,
    resolveConflict: async () => "ui",
  });

  await queue.enqueue({
    baseProject: base,
    nextProject: renameProject(base, "UI 名称"),
  });
  await queue.flush();

  assert.equal(api.project.revision, 59);
  assert.equal(api.project.name, "UI 名称");
});

test("undo preflight preserves a later external edit to the same field", async () => {
  const base = fixture();
  const local = setActorTransform(
    base,
    "actor-lead-01",
    { x: 3, y: 0, z: 0 },
    0,
  );
  const api = new FakeProjectAPI(local);
  api.project.revision = 58;
  api.project = setActorTransform(
    api.project,
    "actor-lead-01",
    { x: 9, y: 0, z: 0 },
    0,
  );
  api.project.revision = 59;
  const queue = new SemanticOperationQueue({
    projectAPI: api,
    project: api.project,
    resolveConflict: async () => "external",
  });

  const result = await queue.enqueue({
    baseProject: api.project,
    nextProject: base,
    conflictBaseProject: local,
  });
  await queue.flush();

  assert.equal(result.dropped, true);
  assert.deepEqual(api.project.scene.actors[0].position, { x: 9, y: 0, z: 0 });
});

test("failed creation settles dependent edits while independent edits still save", async () => {
  const base = fixture();
  const api = new FakeProjectAPI(base);
  const originalApply = api.applyOperations.bind(api);
  let rejectCreation;
  let attempts = 0;
  api.applyOperations = (...args) => ++attempts === 1
    ? new Promise((_, reject) => { rejectCreation = reject; })
    : originalApply(...args);
  const errors = [];
  const queue = new SemanticOperationQueue({ projectAPI: api, project: base, onError: (error) => errors.push(error) });
  const added = addActor(base, { id: "new-actor" });
  const moved = setActorTransform(added, "new-actor", { x: 2, y: 0, z: 0 }, 0);
  const renamed = renameProject(moved, "Independent name");
  const creating = queue.enqueue({ baseProject: base, nextProject: added });
  const moving = queue.enqueue({ baseProject: added, nextProject: moved });
  const renaming = queue.enqueue({ baseProject: moved, nextProject: renamed });
  rejectCreation(new Error("offline during creation"));
  const results = await Promise.all([creating, moving, renaming]);
  assert.equal(await queue.flush(), false);
  assert.equal(results[0].failed, true);
  assert.match(results[0].error.message, /offline/);
  assert.equal(results[1].failed, true);
  assert.match(results[1].error.message, /Project entity not found/);
  assert.equal(results[2].changed, true);
  assert.equal(api.project.name, "Independent name");
  assert.equal(api.project.scene.actors.some((actor) => actor.id === "new-actor"), false);
  assert.equal(attempts, 2);
  assert.equal(errors.length, 2);
  assert.equal(queue.active, false);
  queue.reset(api.project);
  assert.equal(await queue.flush(), true);
});

test("an external deletion drops dependent edits without leaving unresolved transactions", async () => {
  const base = fixture();
  const api = new FakeProjectAPI(base);
  let release;
  const apply = api.applyOperations.bind(api);
  api.applyOperations = async (...args) => {
    if (release === undefined) await new Promise((resolve) => { release = resolve; });
    return apply(...args);
  };
  const queue = new SemanticOperationQueue({ projectAPI: api, project: base, resolveConflict: async () => "external" });
  const moved = setActorTransform(base, "actor-lead-01", { x: 1, y: 0, z: 0 }, 0);
  const movedAgain = setActorTransform(moved, "actor-lead-01", { x: 2, y: 0, z: 0 }, 0);
  const first = queue.enqueue({ baseProject: base, nextProject: moved });
  const second = queue.enqueue({ baseProject: moved, nextProject: movedAgain });
  api.project.scene.actors = [];
  api.project.revision++;
  release();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].dropped, true);
  assert.equal(results[1].failed, true);
  assert.equal(await queue.flush(), false);
  assert.deepEqual(queue.projectedProject().scene.actors, []);
});
