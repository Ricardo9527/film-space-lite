import { aimOrientationLocked, sampleShotCamera } from "./camera-aim.js";
import { outputFrameCount, outputSampleTime } from "./output-export.js";
import { sampleProject } from "./playback-engine.js";
import { findShot, shotOutputDuration } from "./project-model.js";

export async function renderShotMP4({ renderer, api, snapshot, resolution, onProgress, cancelled }) {
  const shot = findShot(snapshot);
  const duration = shotOutputDuration(snapshot, shot);
  const frameRate = snapshot.output.frameRate;
  const frameCount = outputFrameCount(duration, frameRate);
  let taskID = null;
  const checkCancelled = () => {
    if (cancelled()) throw new DOMException("Export cancelled", "AbortError");
  };
  try {
    await renderer.prepareOutput(snapshot);
    checkCancelled();
    const task = await api.startExport({
      outputFolder: snapshot.output.folder,
      shotName: shot.name,
      width: resolution.width,
      height: resolution.height,
      frameRate,
      frameCount,
    });
    taskID = task.id;
    onProgress({ status: "rendering", taskID, completedFrames: 0 });
    renderer.beginOutputRender(resolution.width, resolution.height);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      checkCancelled();
      const time = outputSampleTime(frameIndex, frameRate, duration);
      const samples = sampleProject(snapshot, time);
      renderer.sync(snapshot, samples, {
        selectedActorID: null,
        selectedPathPointID: null,
        playbackStatus: "paused",
        timelineSeeking: false,
        editable: false,
        shotCameraEditable: false,
        previewActive: false,
        authoringGuidesVisible: false,
      });
      const pose = sampleShotCamera(snapshot, shot, time, samples);
      renderer.setCameraTrackPose(pose, {
        locked: true,
        rotationLocked: aimOrientationLocked(pose),
      });
      const pngBlob = await renderer.captureOutputFrame();
      await api.uploadExportFrame(taskID, frameIndex, pngBlob);
      onProgress({ status: "rendering", taskID, completedFrames: frameIndex + 1 });
    }
    checkCancelled();
    onProgress({ status: "encoding", taskID, completedFrames: frameCount });
    return await api.completeExport(taskID);
  } catch (error) {
    if (taskID) {
      try {
        await api.cancelExport(taskID);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `${error.message}；清理导出任务失败：${cleanupError.message}`);
      }
    }
    throw error;
  } finally {
    renderer.endOutputRender();
  }
}
