import test from "node:test";
import assert from "node:assert/strict";
import { wireCameraKeyframeMarker } from "../app/camera-keyframe-interaction.js";
import { createCameraTrack } from "../app/camera-track.js";

function fixture() {
  const track = createCameraTrack({ keyframes: [0, 1, 2, 3].map((time) => ({
    id: `key-${time}`, time, position: { x: time, y: 2, z: 6 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
  })) });
  const selection = new Set(["key-1", "key-2", "key-3"]);
  const commits = [], selections = [];
  const markers = track.keyframes.map((key) => ({
    dataset: { cameraKeyframeId: key.id }, style: {}, classList: { toggle() {} }, attributes: {}, handlers: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    closest() { return rail; }, focus() {}, setPointerCapture() {}, hasPointerCapture() { return true; }, releasePointerCapture() {},
  }));
  const rail = { querySelectorAll() { return markers; }, getBoundingClientRect() { return { width: 1000 + 9 * Math.SQRT2 }; } };
  const marker = markers[2];
  wireCameraKeyframeMarker(marker, {
    canEdit: () => true, getTrack: () => track, getSelection: () => selection,
    select: (...args) => selections.push(args), commit: (...args) => commits.push(args),
    frameRate: 30, span: 10, offset: (fraction) => fraction,
  });
  const fire = (type, fields = {}) => marker.handlers[type]({ pointerId: 1, button: 0, clientX: 200,
    preventDefault() {}, stopPropagation() {}, ...fields });
  return { track, markers, selection, commits, selections, fire };
}

test("drag previews every selected marker and commits once on release using full timeline span", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointermove", { clientX: 400 });
  assert.equal(f.commits.length, 0);
  assert.equal(f.markers[1].style.left, 0.3);
  assert.equal(f.markers[2].style.left, 0.4);
  assert.equal(f.markers[3].style.left, 0.5);
  assert.deepEqual(f.track.keyframes.map((key) => key.time), [0, 1, 2, 3]);
  f.fire("pointerup");
  f.fire("click");
  assert.deepEqual(f.commits, [[["key-1", "key-2", "key-3"], 2, "key-2"]]);
  assert.equal(f.selections.length, 0);
});

for (const cancel of ["pointercancel", "lostpointercapture", "Escape"]) {
  test(`${cancel} restores preview without committing`, () => {
    const f = fixture();
    f.fire("pointerdown");
    f.fire("pointermove", { clientX: 400 });
    if (cancel === "Escape") f.fire("keydown", { key: "Escape" });
    else f.fire(cancel);
    f.fire("pointerup");
    assert.equal(f.commits.length, 0);
    assert.equal(f.markers[2].style.left, 0.2);
    f.fire("pointerdown", { shiftKey: true });
    f.fire("click", { shiftKey: true });
    assert.deepEqual(f.selections, [["key-2", true]]);
  });
}

test("Shift click selects a range, ordinary click selects one, arrows nudge the full selection", () => {
  const f = fixture();
  f.fire("pointerdown", { shiftKey: true });
  f.fire("pointermove", { clientX: 400 });
  f.fire("pointerup");
  f.fire("click", { shiftKey: true });
  assert.deepEqual(f.selections, [["key-2", true]]);
  assert.equal(f.commits.length, 0);
  f.fire("pointerdown");
  f.fire("pointerup");
  f.fire("click", { shiftKey: false });
  assert.deepEqual(f.selections[1], ["key-2", false]);
  f.fire("keydown", { key: "ArrowRight" });
  assert.deepEqual(f.commits, [[["key-1", "key-2", "key-3"], 1 / 30, "key-2"]]);
});
