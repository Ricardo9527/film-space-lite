import test from "node:test";
import assert from "node:assert/strict";
import {
  LAST_OPENED_PROJECT_STORAGE_KEY,
  initialProjectID,
  readLastOpenedProjectID,
  rememberLastOpenedProjectID,
} from "../app/project-session.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("startup prefers an explicit project, then the last opened project", () => {
  const summaries = [
    { id: "newest", modifiedAt: "2026-08-01T00:00:00.000Z" },
    { id: "last", modifiedAt: "2026-07-31T00:00:00.000Z" },
  ];
  assert.equal(initialProjectID(summaries, { requestedProjectID: "newest", rememberedProjectID: "last" }), "newest");
  assert.equal(initialProjectID(summaries, { rememberedProjectID: "last" }), "last");
  assert.equal(initialProjectID(summaries, { rememberedProjectID: "missing" }), "newest");
  assert.equal(initialProjectID([], { rememberedProjectID: "last" }), "");
});

test("last opened project persistence is safe when storage is unavailable", () => {
  const storage = createStorage();
  assert.equal(readLastOpenedProjectID(storage), "");
  assert.equal(rememberLastOpenedProjectID(" project-2 ", storage), true);
  assert.equal(storage.getItem(LAST_OPENED_PROJECT_STORAGE_KEY), "project-2");
  assert.equal(readLastOpenedProjectID(storage), "project-2");
  assert.equal(rememberLastOpenedProjectID("", storage), false);
  assert.equal(readLastOpenedProjectID({ getItem() { throw new Error("blocked"); } }), "");
  assert.equal(rememberLastOpenedProjectID("project-3", { setItem() { throw new Error("blocked"); } }), false);
});


test("startup skips unreadable projects even when explicitly requested or remembered", () => {
  const broken = { id: "broken", readError: "Unexpected end of JSON input" };
  const healthy = { id: "healthy" };
  assert.equal(initialProjectID([broken, healthy], { requestedProjectID: "broken", rememberedProjectID: "broken" }), "healthy");
  assert.equal(initialProjectID([broken]), "");
});
