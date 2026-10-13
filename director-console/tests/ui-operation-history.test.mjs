import test from "node:test";
import assert from "node:assert/strict";

import { UIOperationHistory } from "../app/ui-operation-history.js";

const entry = (label) => ({
  id: `entry-${label}`,
  label,
  forward: [{ path: "/name", value: label }],
  inverse: [{ path: "/name", value: "before" }],
  beforeProject: { id: "project-history" },
  afterProject: { id: "project-history" },
});

test("UI operation history tracks only explicitly recorded UI transactions", () => {
  const history = new UIOperationHistory();
  history.record(entry("A"));
  history.record(entry("B"));

  assert.equal(history.peekUndo().label, "B");
  assert.equal(history.commitUndo(), true);
  assert.equal(history.peekUndo().label, "A");
  assert.equal(history.peekRedo().label, "B");
  assert.equal(history.commitRedo(), true);
  assert.equal(history.peekUndo().label, "B");
});

test("recording after undo discards the obsolete redo branch", () => {
  const history = new UIOperationHistory();
  history.record(entry("A"));
  history.record(entry("B"));
  history.commitUndo();
  history.record(entry("C"));

  assert.equal(history.canRedo, false);
  assert.equal(history.peekUndo().label, "C");
});

test("a dropped UI transaction is removed without exposing it to Cmd-Z", () => {
  const history = new UIOperationHistory();
  history.record(entry("A"));
  history.record(entry("B"));

  assert.equal(history.remove("entry-B"), true);
  assert.equal(history.peekUndo().label, "A");
  assert.equal(history.canRedo, false);
});
