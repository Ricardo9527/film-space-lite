export const cameraEditKinds = Object.freeze({
  shot: "shot",
  setup: "camera-setup",
});

export function cameraShortcutTarget(sidebarMode, selectedCameraSetupID) {
  if (sidebarMode === "setups" && selectedCameraSetupID) {
    return {
      kind: cameraEditKinds.setup,
      targetID: selectedCameraSetupID,
    };
  }
  return {
    kind: cameraEditKinds.shot,
    targetID: null,
  };
}

// Recording follows the selected editor object in its visible sidebar.
export function keyframeShortcutTarget(sidebarMode, selection) {
  const kind = { actors: 'actor', shots: 'shot', setups: 'cameraSetup' }[sidebarMode];
  if (!kind || selection?.kind !== kind) return null;
  return { kind: kind === 'cameraSetup' ? cameraEditKinds.setup : kind, targetID: selection.id };
}

export function cameraSetupCanCreateShot({
  viewing = false,
  hasDraft = false,
  canAuthor = false,
} = {}) {
  return Boolean(viewing && !hasDraft && canAuthor);
}

export function cameraKeyframeRecordIntent({
  editViewMode = "scene",
  hasShotDraft = false,
} = {}) {
  if (editViewMode === "scene" && hasShotDraft) return "resolve-shot-draft";
  return editViewMode === "shot" ? "write-shot-draft" : "record-scene-camera";
}

export function shotDraftConflictResult(choice = "return") {
  if (choice === "write") return { writeDraft: true, continueSceneOperation: false, view: "scene" };
  if (choice === "discard") return { writeDraft: false, continueSceneOperation: true, view: "scene" };
  return { writeDraft: false, continueSceneOperation: false, view: "shot" };
}

export function cameraCompositionAspect({
  viewportMode,
  editViewMode,
  shotAspectRatio,
  defaultAspectRatio,
  viewedSetupAspectRatio = null,
}) {
  if (viewportMode === "edit" && editViewMode === "scene" && viewedSetupAspectRatio) {
    return viewedSetupAspectRatio;
  }
  return shotAspectRatio || defaultAspectRatio;
}

export function cameraShortcutAllowedFromField({
  tagName = "",
  inputType = "",
  isContentEditable = false,
} = {}) {
  if (isContentEditable) return false;
  const normalizedTag = String(tagName).toUpperCase();
  if (normalizedTag === "TEXTAREA") return false;
  if (normalizedTag === "SELECT") return true;
  if (normalizedTag !== "INPUT") return true;
  return ["number", "range"].includes(String(inputType).toLowerCase());
}

export class CameraEditSession {
  constructor() {
    this.reset();
  }

  reset() {
    this.edit = null;
    this.viewingSetupID = null;
    this.applyingSetupPose = false;
  }

  shotEdit(shotID = null) {
    if (this.edit?.kind !== cameraEditKinds.shot) return null;
    if (shotID && this.edit.targetID !== shotID) return null;
    return this.edit;
  }

  setupEdit(setupID = null) {
    if (this.edit?.kind !== cameraEditKinds.setup) return null;
    if (setupID && this.edit.targetID !== setupID) return null;
    return this.edit;
  }

  stageShot(targetID, pose, project = null) {
    if (!targetID || !pose) return false;
    this.edit = {
      kind: cameraEditKinds.shot,
      targetID,
      pose,
      project,
    };
    return true;
  }

  stageSetup(targetID, pose, aspectRatio, depthOfField = { enabled: false }) {
    if (!targetID || !pose || !aspectRatio) return false;
    this.edit = {
      kind: cameraEditKinds.setup,
      targetID,
      pose,
      aspectRatio,
      depthOfField: { enabled: depthOfField?.enabled === true },
    };
    return true;
  }

  clear(kind = null) {
    if (!this.edit || kind && this.edit.kind !== kind) return false;
    this.edit = null;
    return true;
  }

  enterSetupView(setupID) {
    if (!setupID) return false;
    if (this.setupEdit() && !this.setupEdit(setupID)) this.edit = null;
    this.viewingSetupID = setupID;
    return true;
  }

  isViewingSetup(setupID = null) {
    if (!this.viewingSetupID) return false;
    return !setupID || this.viewingSetupID === setupID;
  }

  leaveSetupView() {
    const changed = Boolean(this.viewingSetupID);
    this.viewingSetupID = null;
    this.applyingSetupPose = false;
    return changed;
  }

  leaveSetupScope({ discardDraft = false } = {}) {
    const changed = Boolean(this.viewingSetupID || (discardDraft && this.setupEdit()));
    this.leaveSetupView();
    if (discardDraft) this.clear(cameraEditKinds.setup);
    return changed;
  }

  beginApplyingSetupPose() {
    this.applyingSetupPose = true;
  }

  endApplyingSetupPose() {
    this.applyingSetupPose = false;
  }
}
