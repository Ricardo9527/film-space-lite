import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const directorCSS = await readFile(new URL("../app/director.css", import.meta.url), "utf8");

function rule(selector) {
  const start = directorCSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule: ${selector}`);
  const end = directorCSS.indexOf("}", start);
  return directorCSS.slice(start, end + 1);
}

test("Camera workspace structurally hides the Edit timeline", () => {
  assert.match(
    rule(".app-shell.camera-workspace > .camera-timeline"),
    /display:\s*none/
  );
});
