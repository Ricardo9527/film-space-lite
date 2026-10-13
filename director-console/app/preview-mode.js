export const viewportModes = Object.freeze({
  edit: "edit",
  camera: "camera",
});

export const cameraOperationModes = Object.freeze({
  shot: "shot",
  live: "live",
});

export function normalizeCameraOperationMode(mode = 'shot') { if(mode !== 'shot') throw new Error('简化版只支持 Shot。'); return 'shot'; }

export function cameraWorkspaceEntryMode(modeInput,{shotReady=false}={}) { return shotReady ? 'shot' : null; }

export function cameraWorkspacePreview(modeInput,{shotPose=null,shotAspect='16:9'}={}) { return {mode:'shot',pose:shotPose,aspect:shotAspect}; }

export function scenePreviewDuration(actorDurationInput, cameraDurationInput, cameraReady) {
  const actorDuration = Math.max(Number(actorDurationInput || 0), 0);
  const cameraDuration = Math.max(Number(cameraDurationInput || 0), 0);
  return cameraReady
    ? Math.max(actorDuration, cameraDuration)
    : actorDuration;
}

export function cameraModeOwnsViewport(mode, cameraReady) {
  return Boolean(
    mode === viewportModes.camera
    && cameraReady
  );
}

export function cameraControlsAreEditable(mode) {
  return mode === viewportModes.edit;
}

export function cameraAuthoringGuidesVisible(mode, track) {
  return Boolean(
    mode === viewportModes.edit
    && (track?.start || track?.end)
  );
}
