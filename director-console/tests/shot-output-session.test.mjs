import test from "node:test";
import assert from "node:assert/strict";
import { renderShotFrame, renderShotMP4 } from "../app/shot-output-session.js";
import { addShot, createDesktopProject, findShot } from "../app/project-model.js";
import { createCameraTrack } from "../app/camera-track.js";

function fixture() {
  const snapshot = addShot(createDesktopProject());
  snapshot.output.folder = "/tmp/output";
  snapshot.scene.duration.seconds = 0.1;
  const shot = findShot(snapshot);
  shot.camera.track = createCameraTrack({ keyframes: [
    { time: 0, position: { x: 0, y: 1, z: 3 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
    { time: 0.1, position: { x: 0.1, y: 1, z: 3 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
  ] });
  const events = [];
  const renderer = {
    async prepareOutput() {},
    beginOutputRender() { events.push("begin"); },
    sync(project, samples, options) {
      events.push(["sample", options.time]);
      assert.equal(options.editable, false);
      assert.equal(options.authoringGuidesVisible, false);
      assert.equal(options.selectedActorID, null);
    },
    setCameraTrackPose() {},
    async captureOutputFrame() { return new Blob(["png"]); },
    endOutputRender() { events.push("end-render"); },
  };
  const api = {
    async startExport() { events.push("start"); return { id: "task" }; },
    async uploadExportFrame(id, index) { events.push(["upload", id, index]); },
    async completeExport() { events.push("complete"); return { fileName: "result.mp4" }; },
    async cancelExport(id) { events.push(["cancel", id]); },
  };
  return { snapshot, renderer, api, events, resolution: { width: 32, height: 32 },
    onProgress() {}, cancelled: () => false };
}

test("MP4 session samples fixed frames, preserves authored data, and restores renderer", async () => {
  const input = fixture();
  const before = structuredClone(input.snapshot);
  const result = await renderShotMP4(input);
  assert.equal(result.fileName, "result.mp4");
  const samples = input.events.filter((event) => event[0] === "sample").map((event) => event[1]);
  assert.deepEqual(samples, [0, 1 / 30, 2 / 30]);
  assert.deepEqual(input.snapshot, before);
  assert.deepEqual(input.events.slice(-2), ["complete", "end-render"]);
});

test("cancelling on the final frame cancels the task before encoding", async () => {
  const input = fixture();
  let cancel = false;
  input.onProgress = ({ completedFrames }) => { if (completedFrames === 3) cancel = true; };
  input.cancelled = () => cancel;
  await assert.rejects(renderShotMP4(input), { name: "AbortError" });
  assert.ok(!input.events.includes("complete"));
  assert.deepEqual(input.events.slice(-2), [["cancel", "task"], "end-render"]);
});

test("failed encoding reports the failure and cleans up the session", async () => {
  const input = fixture();
  input.api.completeExport = async () => { throw new Error("encoder failed"); };
  await assert.rejects(renderShotMP4(input), /encoder failed/);
  assert.deepEqual(input.events.slice(-2), [["cancel", "task"], "end-render"]);
});

test("cleanup errors retain the original failure context", async () => {
  const input = fixture();
  input.api.uploadExportFrame = async () => { throw new Error("upload failed"); };
  input.api.cancelExport = async () => { throw new Error("connection lost"); };
  await assert.rejects(renderShotMP4(input), (error) => {
    assert.equal(error.name, "AggregateError");
    assert.deepEqual(error.errors.map((entry) => entry.message), ["upload failed", "connection lost"]);
    return true;
  });
  assert.deepEqual(input.events.slice(-1), ["end-render"]);
});

test("current-frame output captures the exact paused time", async () => {
  const input = fixture();
  input.time = 0.08;
  input.fileName = "开场 房间";
  input.api.exportFrame = async (spec, png) => {
    assert.deepEqual(spec, { outputFolder: "/tmp/output", fileName: "开场 房间" });
    assert.ok(png instanceof Blob);
    return { fileName: "frame.png" };
  };
  assert.equal((await renderShotFrame(input)).fileName, "frame.png");
  assert.deepEqual(input.events.filter((event) => event[0] === "sample").map((event) => event[1]),
    [0.08]);
  assert.deepEqual(input.events.slice(-1), ["end-render"]);
});

test("current-frame failure restores output renderer", async () => {
  const input = fixture();
  input.time = 0;
  input.api.exportFrame = async () => { throw new Error("disk full"); };
  await assert.rejects(renderShotFrame(input), /disk full/);
  assert.deepEqual(input.events.slice(-1), ["end-render"]);
});
