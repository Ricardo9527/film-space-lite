import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createExportManager,
  frameCountForDuration,
  nextVersionedFileName,
  normalizeExportSpec,
  resolveFFmpegPath,
} = require("../app/export-manager.cjs");

const onePixelPNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test("current frame saves PNGs without overwriting and rejects invalid inputs", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "film-space-frame-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = createExportManager({ tempRoot: path.join(root, "temp") });
  const spec = { outputFolder: root, fileName: "开场 房间.png" };
  const first = manager.saveFrame(spec, onePixelPNG);
  const second = manager.saveFrame(spec, onePixelPNG);
  assert.equal(first.fileName, "开场 房间.png");
  assert.equal(second.fileName, "开场 房间_v002.png");
  assert.deepEqual(fs.readFileSync(first.outputPath), onePixelPNG);
  assert.throws(() => manager.saveFrame(spec, Buffer.from("invalid")), /PNG/);
  assert.throws(() => manager.saveFrame({ ...spec, outputFolder: "relative" }, onePixelPNG), /选择输出文件夹/);
  for (const fileName of ["", "  ", "../unsafe", ".png", "a/b", "x".repeat(61)]) {
    assert.throws(() => manager.saveFrame({ ...spec, fileName }, onePixelPNG), /图片名称无效/);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, "temp")), []);
});

test("export names are collision-safe and duration maps to complete frame count", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "film-space-output-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.equal(frameCountForDuration(4, 30), 120);
  assert.equal(nextVersionedFileName(directory, "Shot 01"), "Shot_01_v001.mp4");
  fs.writeFileSync(path.join(directory, "Shot_01_v001.mp4"), "existing");
  assert.equal(nextVersionedFileName(directory, "Shot 01"), "Shot_01_v002.mp4");
});

test("export specifications reject relative folders and odd H.264 dimensions", () => {
  assert.throws(() => normalizeExportSpec({
    outputFolder: "relative/output",
    shotName: "Shot 01",
    width: 1920,
    height: 1080,
    frameRate: 30,
    frameCount: 120,
  }), /选择输出文件夹/);
  assert.throws(() => normalizeExportSpec({
    outputFolder: "/tmp",
    shotName: "Shot 01",
    width: 1919,
    height: 1080,
    frameRate: 30,
    frameCount: 120,
  }), /必须是偶数/);
});

test("ffmpeg resolution falls back to a standard executable when app PATH omits it", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "film-space-ffmpeg-resolution-"));
  const fallback = path.join(root, "ffmpeg");
  fs.writeFileSync(fallback, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(fallback, 0o755);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.equal(resolveFFmpegPath({
    searchPath: "/usr/bin:/bin",
    fallbackPaths: [fallback],
  }), fallback);
  assert.equal(resolveFFmpegPath({
    configuredPath: "/custom/ffmpeg",
    environmentPath: "/environment/ffmpeg",
    searchPath: "",
    fallbackPaths: [fallback],
  }), "/custom/ffmpeg");
  assert.equal(resolveFFmpegPath({
    environmentPath: "/environment/ffmpeg",
    searchPath: "",
    fallbackPaths: [fallback],
  }), "/environment/ffmpeg");
});

test("export manager accepts every PNG frame, encodes, and cleans its session", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "film-space-export-manager-"));
  const outputFolder = path.join(root, "output");
  const tempRoot = path.join(root, "temp");
  fs.mkdirSync(outputFolder);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = createExportManager({
    tempRoot,
    encodeFrames: async ({ outputPath, frameCount }) => {
      fs.writeFileSync(outputPath, `encoded ${frameCount}`);
    },
  });
  const task = manager.start({
    outputFolder,
    shotName: "胜利庆祝",
    width: 1920,
    height: 1080,
    frameRate: 30,
    frameCount: 2,
  });
  manager.writeFrame(task.id, 0, onePixelPNG);
  manager.writeFrame(task.id, 1, onePixelPNG);
  const result = await manager.complete(task.id);
  assert.equal(result.fileName, "胜利庆祝_v001.mp4");
  assert.equal(result.frameCount, 2);
  assert.equal(result.duration, 2 / 30);
  assert.equal(manager.activeCount(), 0);
  assert.equal(fs.readFileSync(result.outputPath, "utf8"), "encoded 2");
});

test("incomplete exports can be cancelled without leaving output files", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "film-space-export-cancel-"));
  const outputFolder = path.join(root, "output");
  fs.mkdirSync(outputFolder);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = createExportManager({ tempRoot: path.join(root, "temp") });
  const task = manager.start({
    outputFolder,
    shotName: "Shot 01",
    width: 1920,
    height: 1080,
    frameRate: 30,
    frameCount: 2,
  });
  manager.writeFrame(task.id, 0, onePixelPNG);
  assert.deepEqual(manager.cancel(task.id), { cancelled: true });
  assert.equal(manager.activeCount(), 0);
  assert.equal(fs.existsSync(task.outputPath), false);
});

function exportFixture(context, encodeFrames = async ({ outputPath }) => fs.writeFileSync(outputPath, "encoded")) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "film-space-export-ownership-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = createExportManager({ tempRoot: path.join(root, "temp"), encodeFrames });
  const spec = { outputFolder: root, shotName: "Shot", width: 1920, height: 1080, frameRate: 30, frameCount: 1 };
  return { manager, spec };
}

test("concurrent same-name exports own different paths and cancelling one preserves the other", async (context) => {
  const { manager, spec } = exportFixture(context);
  const first = manager.start(spec);
  const second = manager.start(spec);
  assert.notEqual(first.outputPath, second.outputPath);
  manager.writeFrame(first.id, 0, onePixelPNG);
  const result = await manager.complete(first.id);
  manager.cancel(second.id);
  assert.equal(fs.readFileSync(result.outputPath, "utf8"), "encoded");
  assert.equal(fs.existsSync(second.outputPath), false);
});

test("an output created after task start is preserved when publishing fails", async (context) => {
  const { manager, spec } = exportFixture(context);
  const task = manager.start(spec);
  fs.writeFileSync(task.outputPath, "another export");
  manager.writeFrame(task.id, 0, onePixelPNG);
  await assert.rejects(manager.complete(task.id), /EEXIST/);
  assert.equal(fs.readFileSync(task.outputPath, "utf8"), "another export");
  assert.equal(manager.activeCount(), 0);
});

test("cancellation and failed encoding only remove task-owned temporary files", async (context) => {
  const { manager, spec } = exportFixture(context, async ({ outputPath }) => {
    fs.writeFileSync(outputPath, "partial encoding");
    throw new Error("encoder stopped");
  });
  const cancelled = manager.start(spec);
  fs.writeFileSync(cancelled.outputPath, "existing video");
  manager.cancel(cancelled.id);
  assert.equal(fs.readFileSync(cancelled.outputPath, "utf8"), "existing video");
  const failed = manager.start(spec);
  manager.writeFrame(failed.id, 0, onePixelPNG);
  await assert.rejects(manager.complete(failed.id), /encoder stopped/);
  assert.equal(fs.existsSync(failed.outputPath), false);
  assert.deepEqual(fs.readdirSync(path.join(spec.outputFolder, "temp")), []);
});
