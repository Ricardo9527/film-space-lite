import test from "node:test";
import assert from "node:assert/strict";

import {
  applySemanticProjectPatch,
  invertSemanticPatch,
  semanticPatchBetween,
  semanticPatchConflicts,
} from "../app/semantic-project-patch.js";

import { addActor, addBlockoutGroup, createDesktopProject, createVisualEnvironmentGroup, deleteActor, dissolveVisualEnvironmentGroup, removeVisualEnvironment, removeVisualEnvironmentGroup, renameProject, setActorTransform, setProjectFrameRate, setVisualEnvironmentAsset, setVisualEnvironmentOpacity } from "../app/project-model.js";

test("semantic patch preserves unrelated remote fields", () => {
  const base = addActor(createDesktopProject({ id: "project-semantic-patch" }), {
    id: "actor-lead-01",
  });
  const actor = base.scene.actors[0];
  const local = setActorTransform(base, actor.id, { x: 3, y: 0, z: 1 }, actor.rotationY);
  const remote = setProjectFrameRate(renameProject(base, "MCP 名称"), 60);
  const changes = semanticPatchBetween(base, local);

  assert.deepEqual(semanticPatchConflicts({ baseProject: base, remoteProject: remote, changes }), []);
  const replayed = applySemanticProjectPatch(remote, changes);
  assert.equal(replayed.name, "MCP 名称");
  assert.equal(replayed.output.frameRate, 60);
  assert.deepEqual(replayed.scene.actors[0].position, { x: 3, y: 0, z: 1 });
});

test("same entity and atomic field conflicts", () => {
  const base = addActor(createDesktopProject({ id: "project-semantic-conflict" }), {
    id: "actor-lead-01",
  });
  const actor = base.scene.actors[0];
  const local = setActorTransform(base, actor.id, { x: 3, y: 0, z: 1 }, actor.rotationY);
  const remote = setActorTransform(base, actor.id, { x: -2, y: 0, z: 5 }, actor.rotationY);
  const changes = semanticPatchBetween(base, local);
  const conflicts = semanticPatchConflicts({ baseProject: base, remoteProject: remote, changes });

  assert.equal(conflicts.length, 2);
  assert.ok(conflicts.some((conflict) => /actor-lead-01\/position$/.test(conflict.path)));
});

test("entity deletion conflicts with a remote field edit", () => {
  const base = addActor(createDesktopProject({ id: "project-semantic-delete" }), {
    id: "actor-lead-01",
  });
  const actor = base.scene.actors[0];
  const local = deleteActor(base, actor.id);
  const remote = setActorTransform(base, actor.id, { x: 2, y: 0, z: 0 }, actor.rotationY);
  const changes = semanticPatchBetween(base, local);
  const conflicts = semanticPatchConflicts({ baseProject: base, remoteProject: remote, changes });

  assert.equal(conflicts.length, 2);
  assert.ok(conflicts.every((conflict) => /actor-lead-01\/\$exists$/.test(conflict.path)));
});

test("patch and inverse restore entity additions and ordering", () => {
  const base = addActor(createDesktopProject({ id: "project-semantic-inverse" }), {
    id: "actor-lead-01",
  });
  const local = addActor(base, { id: "actor-guest-01" });
  const forward = semanticPatchBetween(base, local);
  const inverse = invertSemanticPatch(base, local);

  const applied = applySemanticProjectPatch(base, forward);
  assert.deepEqual(applied.scene.actors.map((actor) => actor.id), [
    "actor-lead-01",
    "actor-guest-01",
  ]);
  const restored = applySemanticProjectPatch(applied, inverse);
  assert.deepEqual(restored.scene.actors.map((actor) => actor.id), ["actor-lead-01"]);
});

test("different entity additions do not conflict", () => {
  const base = createDesktopProject({ id: "project-semantic-additions" });
  const local = addActor(base, { id: "actor-lead-01" });
  const remote = addBlockoutGroup(base, { id: "blockout-camp-01", name: "营地" });
  const conflicts = semanticPatchConflicts({
    baseProject: base,
    remoteProject: remote,
    changes: semanticPatchBetween(base, local),
  });

  assert.deepEqual(conflicts, []);
});

test("one patch preserves the exact order of multiple added entities", () => {
  const base = createDesktopProject({ id: "project-semantic-multi-add" });
  const first = addActor(base, { id: "actor-zulu-01" });
  const second = addActor(first, { id: "actor-alpha-01" });
  const local = addActor(second, { id: "actor-middle-01" });

  const applied = applySemanticProjectPatch(base, semanticPatchBetween(base, local));
  assert.deepEqual(
    applied.scene.actors.map((actor) => actor.id),
    ["actor-zulu-01", "actor-alpha-01", "actor-middle-01"],
  );
  const restored = applySemanticProjectPatch(applied, invertSemanticPatch(base, local));
  assert.deepEqual(restored.scene.actors, []);
});

test("visual environments are added and removed as stable collection entities", () => {
  const base = createDesktopProject({ id: "project-semantic-visual" });
  const environmentID = "visual-environment-semantic";
  const imported = setVisualEnvironmentAsset(
    base,
    environmentAsset(base.id, "a"),
    { id: environmentID }
  );
  const createPatch = semanticPatchBetween(base, imported);

  assert.deepEqual(createPatch, [{
    path: `/scene/environment/visuals/#${environmentID}/$exists`,
    value: { index: 0, value: imported.scene.environment.visuals[0] },
  }]);
  assert.deepEqual(
    applySemanticProjectPatch(base, createPatch).scene.environment.visuals,
    imported.scene.environment.visuals,
  );

  const removed = removeVisualEnvironment(imported, environmentID);
  const removePatch = semanticPatchBetween(imported, removed);
  assert.deepEqual(removePatch, [{
    path: `/scene/environment/visuals/#${environmentID}/$exists`,
    delete: true,
  }]);
  assert.deepEqual(
    applySemanticProjectPatch(imported, removePatch).scene.environment.visuals,
    [],
  );
  assert.deepEqual(
    applySemanticProjectPatch(removed, invertSemanticPatch(imported, removed))
      .scene.environment.visuals,
    imported.scene.environment.visuals,
  );
});

test("visual replacement keeps field-level patches inside one environment entity", () => {
  const empty = createDesktopProject({ id: "project-semantic-visual-replace" });
  const environmentID = "visual-environment-replace";
  const base = setVisualEnvironmentAsset(empty, environmentAsset(empty.id, "a"), { id: environmentID });
  const replacement = setVisualEnvironmentAsset(
    base,
    environmentAsset(base.id, "b"),
    { environmentID }
  );
  const patch = semanticPatchBetween(base, replacement);

  assert.ok(patch.length > 0);
  assert.ok(patch.every((change) => !change.path.endsWith("/$exists")));
  assert.deepEqual(
    applySemanticProjectPatch(base, patch).scene.environment.visuals,
    replacement.scene.environment.visuals,
  );
});

test("visual-environment grouping is one reversible semantic transaction", () => {
  const empty = createDesktopProject({ id: "project-semantic-environment-group" });
  const first = setVisualEnvironmentAsset(empty, environmentAsset(empty.id, "a"), {
    id: "visual-environment-group-first",
  });
  const base = setVisualEnvironmentAsset(first, environmentAsset(empty.id, "b"), {
    id: "visual-environment-group-second",
  });
  const grouped = createVisualEnvironmentGroup(base, [
    "visual-environment-group-first",
    "visual-environment-group-second",
  ], { id: "visual-environment-group-main", name: "主体组" });
  const patch = semanticPatchBetween(base, grouped);
  const replayed = applySemanticProjectPatch(base, patch);
  assert.deepEqual(replayed.scene.environment, grouped.scene.environment);
  assert.ok(patch.some((change) => (
    change.path === "/scene/environment/groups/#visual-environment-group-main/$exists"
  )));
  assert.ok(patch.some((change) => change.path.endsWith("/groupID")));
  assert.deepEqual(
    applySemanticProjectPatch(replayed, invertSemanticPatch(base, grouped)).scene.environment,
    base.scene.environment,
  );
  assert.deepEqual(
    dissolveVisualEnvironmentGroup(grouped, "visual-environment-group-main").scene.environment,
    base.scene.environment,
  );
  const removed = removeVisualEnvironmentGroup(grouped, "visual-environment-group-main");
  const removalPatch = semanticPatchBetween(grouped, removed);
  assert.deepEqual(
    applySemanticProjectPatch(grouped, removalPatch).scene.environment,
    removed.scene.environment,
  );
  assert.deepEqual(
    applySemanticProjectPatch(removed, invertSemanticPatch(grouped, removed)).scene.environment,
    grouped.scene.environment,
  );
});

test("environment removal conflicts with a remote edit to the same environment entity", () => {
  const empty = createDesktopProject({ id: "project-semantic-visual-conflict" });
  const environmentID = "visual-environment-conflict";
  const base = setVisualEnvironmentAsset(empty, environmentAsset(empty.id, "a"), { id: environmentID });
  const local = removeVisualEnvironment(base, environmentID);
  const remote = setVisualEnvironmentOpacity(base, environmentID, 0.4);
  const changes = semanticPatchBetween(base, local);
  const conflicts = semanticPatchConflicts({ baseProject: base, remoteProject: remote, changes });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].path, `/scene/environment/visuals/#${environmentID}/$exists`);
  assert.equal(conflicts[0].remote.path, `/scene/environment/visuals/#${environmentID}/appearance/opacity`);
});

test("semantic patch still rejects fields outside the normalized project schema", () => {
  const base = createDesktopProject({ id: "project-semantic-unknown-field" });
  assert.throws(
    () => applySemanticProjectPatch(base, [{
      path: "/scene/notAProjectField",
      value: { enabled: true },
    }]),
    /Project field not found: notAProjectField/,
  );
});

function environmentAsset(projectID, suffix) {
  return {
    ref: `${projectID}-assets/environment-${suffix.repeat(16)}.glb`,
    sourceName: `environment-${suffix}.glb`,
    sizeBytes: 1024,
    checksum: suffix.repeat(64),
  };
}
