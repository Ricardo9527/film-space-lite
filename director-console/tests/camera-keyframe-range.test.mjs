import test from "node:test";
import assert from "node:assert/strict";
import { createCameraTrack, moveCameraKeyframes, deleteCameraKeyframes, sampleCameraTrack } from "../app/camera-track.js";
import { CameraKeyframeSelection } from "../app/camera-keyframe-selection.js";
import { createDesktopProject, addShot, normalizeDesktopProject, moveShotCameraKeyframes, deleteShotCameraKeyframes } from "../app/project-model.js";
import { applyFilmSpaceOperations, validateFilmSpaceOperation } from "../app/project-command-service.js";
import { semanticPatchBetween, invertSemanticPatch, applySemanticProjectPatch } from "../app/semantic-project-patch.js";
import { UIOperationHistory } from "../app/ui-operation-history.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const id = (index) => `camera-key-${index}`;
const fixture = (times = [0, 1, 2, 3, 6]) => createCameraTrack({
  interpolation: "linear",
  keyframes: times.map((time, i) => ({
    id: id(i), time, position: { x: i, y: 2, z: 6 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }, focalLength: 35 + i, aperture: 2.8, focusDistance: 5 + i,
  })),
});
const times = (track) => track.keyframes.map((key) => key.time);

test("Shift selects inclusive forward/reverse ranges from a stable anchor; ordinary selection resets", () => {
  const selection = new CameraKeyframeSelection();
  const keys = fixture().keyframes;
  selection.sync("project/shot", keys);
  selection.select(keys, id(2));
  selection.select(keys, id(4), true);
  assert.deepEqual([...selection.ids], [id(2), id(3), id(4)]);
  selection.select(keys, id(0), true);
  assert.deepEqual([...selection.ids], [id(0), id(1), id(2)]);
  assert.equal(selection.anchorID, id(2));
  selection.activate(id(1));
  assert.equal(selection.activeID, id(1));
  assert.equal(selection.ids.size, 3);
  assert.equal(selection.anchorID, id(2));
  selection.select(keys, id(1));
  assert.deepEqual([...selection.ids], [id(1)]);
  selection.select(keys, id(4), true);
  selection.sync("other-project/same-shot", keys);
  assert.deepEqual([...selection.ids], [id(4)]);
  selection.sync("other-project/same-shot", keys.slice(0, 4));
  assert.equal(selection.ids.size, 0);
  selection.activeID = id(2);
  assert.deepEqual([...selection.ids], [id(2)]);
});

test("one common offset preserves internal intervals, optics, identity and sampling", () => {
  const track = fixture([0, 1.013, 2.071, 3.004, 6]);
  const before = structuredClone(track);
  for (const fps of [24, 25, 30, 60]) {
    const moved = moveCameraKeyframes(track, [id(1), id(2), id(3)], 0.51, fps);
    const delta = Math.round(0.51 * fps) / fps;
    for (let i = 1; i <= 3; i++) {
      close(moved.keyframes[i].time, track.keyframes[i].time + delta);
      assert.deepEqual({ ...moved.keyframes[i], time: track.keyframes[i].time }, track.keyframes[i]);
    }
    assert.deepEqual(moved.segments, track.segments);
    const originalPose = sampleCameraTrack(track, 1.5);
    const movedPose = sampleCameraTrack(moved, 1.5 + delta);
    close(movedPose.position.x, originalPose.position.x);
    close(movedPose.focalLength, originalPose.focalLength);
  }
  assert.deepEqual(track, before);
});

test("clamp once at unselected neighbors and the timeline limit, pin zero, preserve dense input", () => {
  const track = fixture();
  assert.deepEqual(times(moveCameraKeyframes(track, [id(0), id(1), id(2), id(3), id(4)], 2)), [0, 3, 4, 5, 8]);
  const left = moveCameraKeyframes(track, [id(1), id(2), id(3)], -100);
  close(left.keyframes[1].time, 1 / 30);
  close(left.keyframes[3].time - left.keyframes[1].time, 2);
  const right = moveCameraKeyframes(track, [id(1), id(2), id(3)], 100);
  close(right.keyframes[3].time, 6 - 1 / 30);
  assert.deepEqual(times(moveCameraKeyframes(track, [id(4)], 3600)), [0, 1, 2, 3, 3600]);
  assert.deepEqual(moveCameraKeyframes(track, [id(0)], 1), track);
  assert.deepEqual(moveCameraKeyframes(track, [id(1), id(2)], 0), track);
  const dense = fixture([0, 0.01, 0.02, 3, 6]);
  assert.deepEqual(moveCameraKeyframes(dense, [id(1)], -1), dense);
  assert.deepEqual(moveCameraKeyframes(dense, [id(1)], 1), dense);
  const shifted = moveCameraKeyframes(dense, [id(1), id(2)], 1);
  close(shifted.keyframes[2].time - shifted.keyframes[1].time, 0.01);
});

test("move follows the anchored Follow reference time and preserves inherited events", () => {
  const track = fixture();
  track.keyframes[1].follow = { enabled: true, targetActorID: "actor-test", referenceTime: 1 };
  track.keyframes[3].follow = { enabled: true, targetActorID: "actor-test", referenceTime: 1 };
  const before = createCameraTrack(track);
  const moved = moveCameraKeyframes(before, [id(1), id(2), id(3)], 1);
  close(moved.keyframes[1].follow.referenceTime, 2);
  assert.equal(moved.keyframes[2].follow, null);
  assert.equal(moved.keyframes[2].aim, null);
  assert.equal(moved.keyframes[2].focusTracking, null);
  close(moved.keyframes[3].follow.referenceTime, 1);
});

function projectFixture() {
  const project = addShot(createDesktopProject({ id: "project-range" }), { id: "shot-range" });
  project.scene.duration = { mode: "manual", seconds: 4 };
  project.scene.shots[0].camera.track = fixture();
  return normalizeDesktopProject(project);
}

test("group move/delete share UI and MCP semantics, survive reload, and undo/redo atomically", () => {
  const base = projectFixture();
  const ids = [id(1), id(2), id(3), id(4)];
  const moved = moveShotCameraKeyframes(base, "shot-range", ids, 2);
  const remote = applyFilmSpaceOperations(base, [{ action: "move_camera_keyframes", shotID: "shot-range", keyframeIDs: ids, deltaTime: 2 }]).project;
  assert.deepEqual(remote.scene, moved.scene);
  assert.deepEqual(moved.scene.duration, base.scene.duration);
  assert.deepEqual(normalizeDesktopProject(JSON.parse(JSON.stringify(moved))).scene, moved.scene);
  const deleted = deleteShotCameraKeyframes(moved, "shot-range", [id(0), ...ids]);
  assert.deepEqual(times(deleted.scene.shots[0].camera.track), [0]);
  const remoteDeleted = applyFilmSpaceOperations(moved, [{ action: "delete_camera_keyframes", shotID: "shot-range", keyframeIDs: [id(0), ...ids] }]).project;
  assert.deepEqual(remoteDeleted.scene, deleted.scene);
  const history = new UIOperationHistory();
  history.record({ id: "range-move", forward: semanticPatchBetween(base, moved), inverse: invertSemanticPatch(base, moved), beforeProject: base, afterProject: moved });
  const restored = applySemanticProjectPatch(moved, history.peekUndo().inverse);
  history.commitUndo();
  assert.deepEqual(restored.scene, base.scene);
  assert.equal(history.canUndo, false);
  assert.deepEqual(applySemanticProjectPatch(restored, history.peekRedo().forward).scene, moved.scene);
  assert.deepEqual(applySemanticProjectPatch(deleted, invertSemanticPatch(moved, deleted)).scene, moved.scene);
});

test("MCP rejects invalid selections and missing IDs without partial edits", () => {
  const base = projectFixture();
  const operation = { action: "move_camera_keyframes", shotID: "shot-range", keyframeIDs: [id(1)], deltaTime: 1 };
  for (const keyframeIDs of [[], [id(1), id(1)]]) {
    assert.throws(() => validateFilmSpaceOperation({ ...operation, keyframeIDs }));
  }
  assert.throws(() => applyFilmSpaceOperations(base, [{ ...operation, keyframeIDs: [id(1), "missing-key"] }]), /not found/);
  assert.throws(() => applyFilmSpaceOperations(base, [{ ...operation, shotID: "missing-shot" }]), /not found/);
  assert.deepEqual(times(base.scene.shots[0].camera.track), [0, 1, 2, 3, 6]);
});
