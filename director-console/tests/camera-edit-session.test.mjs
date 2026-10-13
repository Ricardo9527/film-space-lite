import test from "node:test";
import assert from "node:assert/strict";

import {
  CameraEditSession,
  cameraCompositionAspect,
  cameraEditKinds,
  cameraKeyframeRecordIntent,
  cameraSetupCanCreateShot,
  cameraShortcutAllowedFromField,
  cameraShortcutTarget,
  shotDraftConflictResult,
} from "../app/camera-edit-session.js";

const pose = {
  position: { x: 1, y: 2, z: 3 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  focalLength: 35,
};

test("Camera Setup owns C and K only inside the Setup sidebar", () => {
  assert.deepEqual(cameraShortcutTarget("setups", "camera-setup-01"), {
    kind: cameraEditKinds.setup,
    targetID: "camera-setup-01",
  });
  for (const sidebarMode of ["actors", "shots", "blockout"]) {
    assert.deepEqual(cameraShortcutTarget(sidebarMode, "camera-setup-01"), {
      kind: cameraEditKinds.shot,
      targetID: null,
    });
  }
  assert.deepEqual(cameraShortcutTarget("setups", null), {
    kind: cameraEditKinds.shot,
    targetID: null,
  });
});

test("leaving Still View preserves the Setup draft until an explicit discard", () => {
  const session = new CameraEditSession();
  session.enterSetupView("camera-setup-01");
  session.stageSetup("camera-setup-01", pose, "21:9", { enabled: true });

  assert.equal(session.isViewingSetup("camera-setup-01"), true);
  assert.equal(session.setupEdit("camera-setup-01").aspectRatio, "21:9");
  assert.deepEqual(session.setupEdit("camera-setup-01").depthOfField, { enabled: true });
  assert.equal(session.leaveSetupScope(), true);
  assert.equal(session.isViewingSetup(), false);
  assert.equal(session.setupEdit("camera-setup-01").aspectRatio, "21:9");
  assert.equal(session.leaveSetupScope({ discardDraft: true }), true);
  assert.equal(session.setupEdit(), null);

  session.stageShot("shot-01", pose, { id: "staged-shot-project" });
  session.leaveSetupScope({ discardDraft: true });
  assert.equal(session.shotEdit("shot-01").project.id, "staged-shot-project");
});

test("Camera Setup aspect is isolated from Shot View and Camera workspace", () => {
  const shared = {
    shotAspectRatio: "16:9",
    defaultAspectRatio: "4:3",
    viewedSetupAspectRatio: "21:9",
  };
  assert.equal(cameraCompositionAspect({
    ...shared,
    viewportMode: "edit",
    editViewMode: "scene",
  }), "21:9");
  assert.equal(cameraCompositionAspect({
    ...shared,
    viewportMode: "edit",
    editViewMode: "shot",
  }), "16:9");
  assert.equal(cameraCompositionAspect({
    ...shared,
    viewportMode: "camera",
    editViewMode: "scene",
  }), "16:9");
});

test("a Camera Setup creates a Shot only from its confirmed C view", () => {
  assert.equal(cameraSetupCanCreateShot({
    viewing: true,
    hasDraft: false,
    canAuthor: true,
  }), true);
  assert.equal(cameraSetupCanCreateShot({
    viewing: false,
    hasDraft: false,
    canAuthor: true,
  }), false);
  assert.equal(cameraSetupCanCreateShot({
    viewing: true,
    hasDraft: true,
    canAuthor: true,
  }), false);
  assert.equal(cameraSetupCanCreateShot({
    viewing: true,
    hasDraft: false,
    canAuthor: false,
  }), false);
});

test("C and K remain available from numeric camera fields but not text editing", () => {
  assert.equal(cameraShortcutAllowedFromField({
    tagName: "INPUT",
    inputType: "number",
  }), true);
  assert.equal(cameraShortcutAllowedFromField({ tagName: "SELECT" }), true);
  assert.equal(cameraShortcutAllowedFromField({
    tagName: "INPUT",
    inputType: "text",
  }), false);
  assert.equal(cameraShortcutAllowedFromField({ tagName: "TEXTAREA" }), false);
  assert.equal(cameraShortcutAllowedFromField({ isContentEditable: true }), false);
});

test("C may leave a Shot draft alive while K resolves it before Scene camera authoring", () => {
  assert.equal(cameraKeyframeRecordIntent({
    editViewMode: "shot",
    hasShotDraft: true,
  }), "write-shot-draft");
  assert.equal(cameraKeyframeRecordIntent({
    editViewMode: "scene",
    hasShotDraft: false,
  }), "record-scene-camera");
  assert.equal(cameraKeyframeRecordIntent({
    editViewMode: "scene",
    hasShotDraft: true,
  }), "resolve-shot-draft");

  assert.deepEqual(shotDraftConflictResult("return"), {
    writeDraft: false,
    continueSceneOperation: false,
    view: "shot",
  });
  assert.deepEqual(shotDraftConflictResult("write"), {
    writeDraft: true,
    continueSceneOperation: false,
    view: "scene",
  });
  assert.deepEqual(shotDraftConflictResult("discard"), {
    writeDraft: false,
    continueSceneOperation: true,
    view: "scene",
  });
});

test("reset clears drafts, viewed setups, and programmatic-application guards", () => {
  const session = new CameraEditSession();
  session.stageShot("shot-01", pose, { id: "staged-shot-project" });
  session.reset();
  assert.equal(session.edit, null);

  session.enterSetupView("camera-setup-01");
  session.stageSetup("camera-setup-01", pose, "9:16");
  session.beginApplyingSetupPose();

  session.reset();

  assert.equal(session.edit, null);
  assert.equal(session.isViewingSetup(), false);
  assert.equal(session.applyingSetupPose, false);
});
