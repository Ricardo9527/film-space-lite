const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createExportManager(options = {}) {
  const tempRoot = options.tempRoot || path.join(os.tmpdir(), "film-space-exports");
  const encodeFrames = options.encodeFrames || encodeFramesWithFFmpeg;
  const ffmpegPath = resolveFFmpegPath({
    configuredPath: options.ffmpegPath,
    environmentPath: process.env.FILM_SPACE_FFMPEG,
    searchPath: options.searchPath,
    fallbackPaths: options.ffmpegFallbackPaths,
  });
  const sessions = new Map();
  fs.mkdirSync(tempRoot, { recursive: true });

  return {
    get activeCount() { return sessions.size; },
    start(specInput) {
      const spec = normalizeExportSpec(specInput);
      if (!fs.existsSync(spec.outputFolder) || !fs.statSync(spec.outputFolder).isDirectory()) {
        throw requestError("输出文件夹不存在，请重新选择", 400);
      }
      const reservedPaths = new Set(Array.from(sessions.values(), (session) => session.outputPath));
      const fileName = nextVersionedFileName(spec.outputFolder, spec.shotName, ".mp4", reservedPaths);
      const outputPath = path.join(spec.outputFolder, fileName);
      const id = crypto.randomUUID();
      const frameDirectory = fs.mkdtempSync(path.join(tempRoot, `${id}-`));
      sessions.set(id, {
        id,
        spec,
        fileName,
        outputPath,
        frameDirectory,
        temporaryOutputPath: path.join(frameDirectory, "output.mp4"),
        receivedFrames: new Set(),
        encoding: false,
      });
      return { id, fileName, outputPath, frameCount: spec.frameCount };
    },

    writeFrame(id, indexInput, buffer) {
      const session = requireSession(sessions, id);
      if (session.encoding) throw requestError("输出已经进入编码阶段", 409);
      const index = Number(indexInput);
      if (!Number.isInteger(index) || index < 0 || index >= session.spec.frameCount) {
        throw requestError("帧序号超出范围", 400);
      }
      if (!Buffer.isBuffer(buffer) || buffer.length < pngSignature.length || !buffer.subarray(0, 8).equals(pngSignature)) {
        throw requestError("输出帧必须是 PNG", 415);
      }
      fs.writeFileSync(framePath(session.frameDirectory, index), buffer);
      session.receivedFrames.add(index);
      return { received: session.receivedFrames.size, frameCount: session.spec.frameCount };
    },

    async complete(id) {
      const session = requireSession(sessions, id);
      if (session.encoding) throw requestError("输出正在编码", 409);
      if (session.receivedFrames.size !== session.spec.frameCount) {
        throw requestError(`输出帧不完整：${session.receivedFrames.size}/${session.spec.frameCount}`, 409);
      }
      session.encoding = true;
      try {
        await encodeFrames({
          ffmpegPath,
          framePattern: path.join(session.frameDirectory, "frame-%06d.png"),
          outputPath: session.temporaryOutputPath,
          width: session.spec.width,
          height: session.spec.height,
          frameRate: session.spec.frameRate,
          frameCount: session.spec.frameCount,
        });
        fs.copyFileSync(session.temporaryOutputPath, session.outputPath, fs.constants.COPYFILE_EXCL);
        const result = {
          id: session.id,
          fileName: session.fileName,
          outputPath: session.outputPath,
          frameCount: session.spec.frameCount,
          duration: session.spec.frameCount / session.spec.frameRate,
          bytes: fs.statSync(session.outputPath).size,
        };
        cleanupSession(sessions, session);
        return result;
      } catch (error) {
        cleanupSession(sessions, session);
        throw requestError(`MP4 编码失败：${error.message}`, 500);
      }
    },

    cancel(id) {
      const session = sessions.get(id);
      if (!session) return { cancelled: false };
      if (session.encoding) throw requestError("编码已开始，暂时不能取消", 409);
      cleanupSession(sessions, session);
      return { cancelled: true };
    },

    activeCount() {
      return sessions.size;
    },
  };
}

function resolveFFmpegPath(options = {}) {
  const configuredPath = String(options.configuredPath || "").trim();
  if (configuredPath) return configuredPath;

  const environmentPath = String(options.environmentPath || "").trim();
  if (environmentPath) return environmentPath;

  const searchPath = options.searchPath === undefined
    ? process.env.PATH
    : options.searchPath;
  for (const directory of String(searchPath || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, "ffmpeg");
    if (isExecutable(candidate)) return candidate;
  }

  const fallbackPaths = options.fallbackPaths || (
    process.platform === "darwin"
      ? ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]
      : []
  );
  for (const candidate of fallbackPaths) {
    if (isExecutable(candidate)) return candidate;
  }

  return "ffmpeg";
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function normalizeExportSpec(input = {}) {
  const rawOutputFolder = typeof input.outputFolder === "string" ? input.outputFolder.trim() : "";
  const width = finiteInteger(input.width, 16, 16384);
  const height = finiteInteger(input.height, 16, 16384);
  const frameRate = finiteInteger(input.frameRate, 1, 120);
  const frameCount = finiteInteger(input.frameCount, 1, 432000);
  if (!rawOutputFolder || !path.isAbsolute(rawOutputFolder)) throw requestError("请选择输出文件夹", 400);
  const outputFolder = path.resolve(rawOutputFolder);
  if (width % 2 || height % 2) throw requestError("H.264 输出宽高必须是偶数", 400);
  return {
    outputFolder,
    shotName: cleanFileStem(input.shotName),
    width,
    height,
    frameRate,
    frameCount,
  };
}

function frameCountForDuration(durationInput, frameRateInput) {
  const duration = Math.max(Number(durationInput) || 0, 0);
  const frameRate = Math.max(Number(frameRateInput) || 0, 1);
  return Math.max(1, Math.ceil(duration * frameRate - 1e-9));
}

function nextVersionedFileName(folder, shotName, extension = ".mp4", reservedPaths = new Set()) {
  const stem = cleanFileStem(shotName);
  for (let version = 1; version <= 9999; version += 1) {
    const fileName = `${stem}_v${String(version).padStart(3, "0")}${extension}`;
    const outputPath = path.join(folder, fileName);
    if (!reservedPaths.has(outputPath) && !fs.existsSync(outputPath)) return fileName;
  }
  throw requestError("输出版本号已用完", 409);
}

function cleanFileStem(value) {
  const cleaned = String(value || "Shot")
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || "Shot";
}

function finiteInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw requestError("输出规格无效", 400);
  }
  return number;
}

function framePath(directory, index) {
  return path.join(directory, `frame-${String(index).padStart(6, "0")}.png`);
}

function requireSession(sessions, id) {
  const session = sessions.get(id);
  if (!session) throw requestError("输出任务不存在或已经结束", 404);
  return session;
}

function cleanupSession(sessions, session) {
  sessions.delete(session.id);
  fs.rmSync(session.frameDirectory, { recursive: true, force: true });
}

function encodeFramesWithFFmpeg(options) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.ffmpegPath, [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-framerate", String(options.frameRate),
      "-start_number", "0",
      "-i", options.framePattern,
      "-frames:v", String(options.frameCount),
      "-an",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      options.outputPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited with ${code}`));
    });
  });
}

function requestError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  createExportManager,
  frameCountForDuration,
  nextVersionedFileName,
  normalizeExportSpec,
  resolveFFmpegPath,
};
