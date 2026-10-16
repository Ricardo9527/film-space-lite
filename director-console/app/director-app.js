import {startUpdateUI} from "./update-notice.js";
import { actorFramePose, actorPoseParameters, actorPoseKeyframeAtTime, recordActorPose, moveActorPoseFrames } from "./actor-pose.js";
import { recordActorPoseKeyframe, moveActorPoseKeyframes, deleteActorPoseKeyframes, setActorPoseInterpolation } from "./project-model.js";
import { sampleActor } from "./playback-engine.js";
import { CameraKeyframeSelection } from "./camera-keyframe-selection.js";
import { wireCameraKeyframeMarker, wireTimelineKeyframeMarker } from "./camera-keyframe-interaction.js";

import { DirectorRenderer } from "./director-renderer.js";

import { desktopActionLoopBehaviorOptions } from "./action-catalog.js";
import { clothingInk } from "./actor-color-presentation.js";
import { wireInputNumberScrub, wireNumberScrub } from "./number-scrub.js";
import { wireCameraSpeedControl } from "./camera-speed-control.js";
import {
  motionEntryPhaseAtFrame,
  motionPhaseEntryHeight,
  pathHeightFromDrag,
  pathHeightFromKey,
  pathHeightTargetPoint,
  previousPathHeight,
} from "./path-height-control.js";
import {
  aspectRatioValue,
  cameraCompositionGuideGeometry,
  cameraCompositionGuideVanishingPointAfterKey,
  defaultCameraCompositionGuideState,
  fitOutputFrame,
  normalizeCameraCompositionGuideState,
} from "./camera-composition.js";
import {
  stageShotCameraKeyframe,
  updateShotCameraFollowPreservingPosition,
} from "./camera-authoring.js";
import {
  CameraEditSession,
  cameraCompositionAspect,
  cameraEditKinds,
  cameraKeyframeRecordIntent,
  cameraSetupCanCreateShot,
  cameraShortcutAllowedFromField,
  cameraShortcutTarget,
  keyframeShortcutTarget,
} from "./camera-edit-session.js";
import {
  buildCameraOrbitTrack,
  cameraOrbitEndpointSummary,
  defaultCameraOrbitOptions,
  nextCameraOrbitKeyframe,
} from "./camera-orbit.js";
import {
  aimOrientationLocked,
  applyShotCameraConstraints,
  cameraAimTargetPosition,
  cameraOpticalRollDegrees,
  cameraQuaternionFromRotationDegrees,
  cameraRotationDegrees,
  describeCameraAimTransition,
  sampleShotCamera,
  setCameraOpticalRollDegrees,
} from "./camera-aim.js";
import {
  authoredCameraPositionFromGuide,
  evaluatedCameraGuideTrack,
} from "./camera-guide.js";
import {
  effectiveCameraFollowState,
  normalizeCameraFollow,
} from "./camera-follow.js";
import { effectiveCameraFocusTrackingState } from "./camera-focus-tracking.js";
import {
  cameraHandheldIntensities,
  normalizeCameraHandheld,
  removeCameraHandheld,
} from "./camera-handheld.js";
import {
  cameraAimActorHeightPresets,
  cameraApertureMaximum,
  cameraApertureMinimum,
  cameraAimCompositions,
  cameraFocusDistanceMaximum,
  cameraFocusDistanceMinimum,
  cameraFocalLengthMaximum,
  cameraFocalLengthMinimum,
  cameraFocalLengthStops,
  cameraKeyframeAtTime,
  cameraTrackDuration,
  cameraTrackReady,
  cameraTrackSegmentAtTime,
  createCameraTrack,
  normalizeCameraAim,
  normalizeCameraFocusTracking,
  normalizeCameraPose,
  recommendedCameraAimTrackingResponse,
  sampleCameraTrack,
} from "./camera-track.js";
import {
  focalLengthFromSliderProgress,
  focalLengthToSliderProgress,
} from "./camera-viewport-navigation.js";
import { renderShotMP4 } from "./shot-output-session.js";
import { ProjectStateStore } from "./project-state-store.js";
import { outputFrameCount, validH264Resolution } from "./output-export.js";

import { adjacentFrameTime, actorPlaybackPlan, PlaybackController, sampleActionInspection, sampleInitialProject, sampleProject } from "./playback-engine.js";

import {
  actionPlaybackRate,
  actionSourceRange,
  actionTrimPatch,
} from "./action-trim.js";
// 二分求速度的边界必须和 updateMotionAction 的钳制一致，否则预览会和落库的值分家。
import { minimumMoveSpeed } from "./scene-model.js";
import { ProjectAPI, referenceImageAssetURL } from "./project-api.js";
import { defaultBlockoutImage } from "./blockout-image.js";

import {
  initialProjectID as selectInitialProjectID,
  readLastOpenedProjectID,
  rememberLastOpenedProjectID,
} from "./project-session.js";
import { SemanticOperationQueue } from "./semantic-operation-queue.js";
import {
  applySemanticProjectPatch,
  invertSemanticPatch,
  semanticPatchBetween,
} from "./semantic-project-patch.js";
import { semanticPathLabel } from "./semantic-project-diff.js";
import { UIOperationHistory } from "./ui-operation-history.js";
import {
  cameraAuthoringGuidesVisible,
  cameraModeOwnsViewport,
  cameraOperationModes,
  cameraWorkspaceEntryMode,
  cameraWorkspacePreview,
  normalizeCameraOperationMode,
  viewportModes,
} from "./preview-mode.js";
import { projectOutputResolution, addActor, assignVisualEnvironmentsToGroup, addBlockoutObject, addCameraSetup, addMoveAction, addShot, addStayActionAtPoint, canInsertStayActionBefore, clearMotion, clearBlockout, clothingColors, actorColor, createID, createDesktopProject, createVisualEnvironmentGroup, deleteActor, deleteBlockoutGroup, deleteBlockoutObject, deleteCameraSetup, deleteShotCameraKeyframes, deleteShot, desktopAspectRatios, desktopActions, desktopFrameRates, duplicateActor, duplicateBlockoutGroup, duplicateBlockoutObject, duplicateShot, duplicateCameraSetup, faceActionTowardNextTarget, findActor, findCameraSetup, findShot, shotOutputDuration, movePerformanceWithinPoint, moveShotCameraKeyframes, motionPathPoints, normalizeDesktopProject, removeMotionAction, removeVisualEnvironment, removeVisualEnvironmentGroup, dissolveVisualEnvironmentGroup, renameCameraSetup, renameShot, renameProject, sceneActorEnd, setActiveShot, setCameraSetupAspectRatio, setCameraSetupDepthOfField, setCameraSetupPose, setActorProperty, setActorOrPairedRoleTransform, setActorLocked, setActorVisible, setBlockoutLayerLocked, setBlockoutLayerOpacity, setBlockoutLayerVisible, setPathPointPosition, setProjectDefaultAspectRatio, setProjectFrameRate, setProjectOutputFolder, setSceneGroundVisible, setVisualEnvironmentLocked, setVisualEnvironmentAsset, setVisualEnvironmentMaterialMode, setVisualEnvironmentOpacity, setVisualEnvironmentTransform, setVisualEnvironmentVisible, renameVisualEnvironment, setManualSceneEnd, setShotCameraInterpolation, setShotCameraHandheld, setShotCameraDepthOfField, setShotCameraSegmentInterpolation, setShotCameraTrack, setShotAspectRatio, updateBlockoutGroup, updateBlockoutObject, updateShotCameraKeyframe, updateShotCameraKeyframeAim, updateShotCameraKeyframeFocusTracking, updateMotionAction, updateVisualEnvironmentGroup, visualEnvironmentQuaternionFromRotationDegrees, visualEnvironmentRotationDegrees } from "./project-model.js";

const elements = {
  appShell: document.getElementById("appShell"),
  editWorkspace: document.getElementById("editWorkspace"),
  cameraWorkspace: document.getElementById("cameraWorkspace"),
  editViewportMount: document.getElementById("editViewportMount"),
  cameraViewportMount: document.getElementById("cameraViewportMount"),
  cameraShotSourceMode: document.getElementById("cameraShotSourceMode"),
  
  cameraShotConfiguration: document.getElementById("cameraShotConfiguration"),
  
  
  
  
  
  
  liveInterruptDialog: document.getElementById("liveInterruptDialog"),
  liveInterruptDescription: document.getElementById("liveInterruptDescription"),
  projectSelect: document.getElementById("projectSelect"),
  newProject: document.getElementById("newProject"),
  projectState: document.getElementById("projectState"),
  projectManagerDialog: document.getElementById("projectManagerDialog"),
  projectManagerSearch: document.getElementById("projectManagerSearch"),
  projectManagerList: document.getElementById("projectManagerList"),
  projectManagerSummary: document.getElementById("projectManagerSummary"),
  projectManagerActionMenu: document.getElementById("projectManagerActionMenu"),
  projectPackageInput: document.getElementById("projectPackageInput"),
  deleteProjectDialog: document.getElementById("deleteProjectDialog"),
  resetPlayback: document.getElementById("resetPlayback"),
  playPlayback: document.getElementById("playPlayback"),
  pausePlayback: document.getElementById("pausePlayback"),
  editMode: document.getElementById("editMode"),
  cameraMode: document.getElementById("cameraMode"),
  cameraShotSelect: document.getElementById("cameraShotSelect"),
  
  
  cameraOutputSpec: document.getElementById("cameraOutputSpec"),
  chooseOutputFolder: document.getElementById("chooseOutputFolder"),
  revealCameraOutput: document.getElementById("revealCameraOutput"),
  cameraJumpStart: document.getElementById("cameraJumpStart"),
  cameraStepBack: document.getElementById("cameraStepBack"),
  cameraReset: document.getElementById("cameraReset"),
  cameraPlay: document.getElementById("cameraPlay"),
  cameraPause: document.getElementById("cameraPause"),
  cameraStepForward: document.getElementById("cameraStepForward"),
  cameraJumpEnd: document.getElementById("cameraJumpEnd"),
  cameraProgress: document.getElementById("cameraProgress"),
  cameraCurrentTime: document.getElementById("cameraCurrentTime"),
  cameraTotalTime: document.getElementById("cameraTotalTime"),
  cameraProgressLabel: document.getElementById("cameraProgressLabel"),
  cameraExportProgress: document.getElementById("cameraExportProgress"),
  cancelCameraExport: document.getElementById("cancelCameraExport"),
  
  recordCameraOutput: document.getElementById("recordCameraOutput"),
  cameraRecordActions: document.getElementById("cameraRecordActions"),
  transportCluster: document.getElementById("transportCluster"),
  undoAction: document.getElementById("undoAction"),
  redoAction: document.getElementById("redoAction"),
  actorsList: document.getElementById("actorsList"),
  addActor: document.getElementById("addActor"),
  
  
  blockoutModelInput: document.getElementById("blockoutModelInput"),
  actorsSidebarMode: document.getElementById("actorsSidebarMode"),
  cameraSetupsSidebarMode: document.getElementById("cameraSetupsSidebarMode"),
  shotsSidebarMode: document.getElementById("shotsSidebarMode"),
  blockoutSidebarMode: document.getElementById("blockoutSidebarMode"),
  scenePanelTitle: document.getElementById("scenePanelTitle"),
  viewport: document.getElementById("viewport"),
  editViewSwitch: document.getElementById("editViewSwitch"),
  sceneView: document.getElementById("sceneView"),
  shotView: document.getElementById("shotView"),
  shotDraftViewportStatus: document.getElementById("shotDraftViewportStatus"),
  shotDraftViewportLabel: document.getElementById("shotDraftViewportLabel"),
  shotDraftReturn: document.getElementById("shotDraftReturn"),
  shotDraftWrite: document.getElementById("shotDraftWrite"),
  shotDraftDiscard: document.getElementById("shotDraftDiscard"),
  focalLengthFeedback: document.getElementById("focalLengthFeedback"),
  shotFrameOverlay: document.getElementById("shotFrameOverlay"),
  shotOutputFrame: document.getElementById("shotOutputFrame"),
  shotFrameLabel: document.getElementById("shotFrameLabel"),
  cameraCompositionGuide: document.getElementById("cameraCompositionGuide"),
  cameraTimeline: document.getElementById("cameraTimeline"),
  placementBanner: document.getElementById("placementBanner"),
  cancelPlacement: document.getElementById("cancelPlacement"),
  pathHeightControl: document.getElementById("pathHeightControl"),
  pathHeightTargetLabel: document.getElementById("pathHeightTargetLabel"),
  pathHeightMatchPerson: document.getElementById("pathHeightMatchPerson"),
  pathHeightScrubber: document.getElementById("pathHeightScrubber"),
  pathHeightInput: document.getElementById("pathHeightInput"),
  pathHeightGround: document.getElementById("pathHeightGround"),
  inspectorTitle: document.getElementById("inspectorTitle"),
  sceneSettingsButton: document.getElementById("sceneSettingsButton"),
  inspectorContent: document.getElementById("inspectorContent"),
  toast: document.getElementById("toast"),
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  createActionInMotionSpace: document.getElementById("createActionInMotionSpace"),
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  semanticConflictDialog: document.getElementById("semanticConflictDialog"),
  semanticConflictDescription: document.getElementById("semanticConflictDescription"),
  semanticConflictFields: document.getElementById("semanticConflictFields"),
};

const projectAPI = new ProjectAPI();
let project = createDesktopProject();
const projectState = new ProjectStateStore(project);
const uiOperationHistory = new UIOperationHistory();
let semanticBaselineProject = structuredClone(project);
let projectSummaries = [];
let selectedActorID = null;
let selectedPathPointID = null;
let selectedObject = null;
const selectedEnvironmentIDs = new Set();
let environmentSelectionAnchorID = null;
// 演员、布景、机位、Shot、关键帧的选中态各自独立，同一时刻可能都非空，
// 所以 Delete 需要一条归属规则：最后点过时间轴就删关键帧，否则删场景对象。
let deleteScope = "object";
let inspectorPanel = "actor";
let connectionState = { state: "connecting", connected: false, iphoneOnline: false };
// 正常连接不占界面位置；只有服务离线或异常时才主动提示一次。
// 必须声明在 phoneConnection.connect() 之前：它的状态回调是同步触发的，
// 声明放到文件末尾会让 renderConnection 撞上 TDZ 并中断整个模块求值。
const connectionProblemLabels = {
  offline: "本地服务已离线，改动无法保存",
  error: "本地服务连接异常，改动可能未保存",
};
let reportedConnectionProblem = null;

let toastTimer = null;
let transformBaseProject = null;
let pathPointBaseProject = null;
let pathHeightDrag = null;
let cameraKeyframeBaseProject = null;
let cameraAimBaseProject = null;
let actionInspection = null;
let viewportMode = viewportModes.edit;
let editViewMode = "scene";
let renderCameraSpeedControl;
let shotFrameMaskStrong = false;
// 构图辅助线是本次编辑会话的观察偏好，不属于机位、Shot 或项目数据。
let cameraSetupCompositionGuide = defaultCameraCompositionGuideState();
const cameraSetupCompositionGuideOptions = Object.freeze([
  ["none", "关闭"],
  ["thirds", "三分法"],
  ["center", "中心十字"],
  ["golden-triangle", "黄金三角"],
  ["diagonal", "对角线法"],
  ["one-point", "一点透视"],
]);
let sceneSidebarMode = "actors";
let blockoutLayerExpanded = true;
const expandedBlockoutGroupIDs = new Set();
const expandedEnvironmentGroupIDs = new Set();

let selectedCameraSetupID = project.scene.cameraSetups[0]?.id || null;

let liveCaptureAspectRatio = project.output.defaultAspectRatio;

let cameraOperationMode = cameraOperationModes.shot;
const cameraKeyframeSelection = new CameraKeyframeSelection();
const actorPoseSelection = new CameraKeyframeSelection();
let actorPoseDraft = null;
let timelineCollapsed = false;
// 时间轴缩放，单位是像素/秒。null ＝ 还没定过，首次渲染贴合一次。
// 纯界面状态：不进 project、不走语义队列，和「时间轴是否折叠」同级。
let timelinePixelsPerSecond = null;
const timelineMaxPixelsPerSecond = 600;
let timelineScrubbing = false;
// Shot 与机位共用一份摄影机暂存生命周期；同一时刻只能有一个未写入目标。
// 切回 Scene View 只离开观察相机，草稿继续绑定原目标，直到明确写入或放弃。
const cameraEditSession = new CameraEditSession();
let cameraOrbitDraft = null;
let cameraOrbitForm = null;
let cameraLockSettingsExpanded = false;
let cameraOrbitExpanded = false;
let actorTransformExpanded = true;
let actorPoseParametersExpanded = false;
let actorPerformanceExpanded = true;
let actorReturnUpright = true;
let cameraInspectorExpanded = true;
let cameraMotionExpanded = true;
// 焦平面只属于当前编辑会话；关闭景深时隐藏，但保留用户的勾选偏好。
let cameraFocusPlaneVisible = true;
let cameraFocusPicking = false;
let cameraFocusPickCandidate = null;
// 改识别色/角色/身高都会重绘整个检查器，抽屉必须自己记住开合，
// 否则每选一次颜色它就合上一次。
let actorAppearanceExpanded = false;
let cameraGuidePathSource = null;
let cameraGuideProjectSource = null;
let cameraGuideEvaluatedTrack = null;
let cameraPoseRenderAt = 0;
let renderedPlaybackStatus = "idle";
let authoredRevision = 0;
let persistedProjectRevision = 0;
let projectDirty = false;
let appUpdateLocked = false;
let deferredExternalRevision = 0;
let deferredExternalSyncTimer = null;
let environmentImporting = false;
let environmentImportTargetID = null;
let projectManagementBusy = false;
let projectManagerSelectedID = null;
let projectManagerActionID = null;
let projectDeleteTargetID = null;
const environmentStatuses = new Map();
let environmentFocusID = null;
let cameraProgressScrubbing = false;
let operatorSubscription = null;
let applyingOperatorSelection = false;
let exportState = {
  status: "idle",
  taskID: null,
  completedFrames: 0,
  frameCount: 0,
  cancelRequested: false,
  lastResult: null,
  error: null,
};

const semanticOperationQueue = new SemanticOperationQueue({
  projectAPI,
  project,
  resolveConflict: requestSemanticConflictResolution,
  onProject: acceptSemanticQueueProject,
  onState: ({ state }) => {
    if (state === "saving") setSaveState("保存中");
    else if (state === "saved") {
      projectDirty = false;
      setSaveState("已保存");
      void syncDeferredExternalProject();
    }
  },
  onError: (error) => {
    setSaveState("保存失败", true);
    showToast(`项目保存失败：${error.message}`, true);
  },
});

const playback = new PlaybackController({
  onChange: handlePlaybackChange,
});

const directorRenderer = new DirectorRenderer({
  viewport: elements.viewport,
  onSelect: selectActor,
  onSelectSceneObject: selectSceneObject,
  onSceneCameraMoved: syncCameraSetupDraftFromViewport,
  onAddMove: (position) => {
    const actor = selectedActorID ? findActor(project, selectedActorID) : null;
    if (!actor || actor.visible === false || actor.locked || !canEditActorMotion()) {
      directorRenderer.setMovePlacement(false);
      return;
    }
    {}
    void commitProject(
      (current) => addMoveAction(current, selectedActorID, position),
      "已添加移动目标"
    );
  },
  onSelectPathPoint: selectPathPoint,
  onClearPathPointSelection: clearPathPointSelection,
  onPathPointPreview: previewPathPointPosition,
  onPathPointCommit: commitPathPointPosition,
  onSelectCameraKeyframe: selectCameraKeyframe,
  onCameraKeyframePreview: (keyframeID, position) => {
    const shot = findShot(project);
    const source = findShot(cameraKeyframeBaseProject || projectState.current, shot?.id);
    const keyframe = source?.camera.track.keyframes.find((candidate) => candidate.id === keyframeID);
    if (!shot || !keyframe || !canEditCamera()) return;
    if (!cameraKeyframeBaseProject) {
      cameraKeyframeBaseProject = projectState.current;
      authoredRevision += 1;
      cancelScheduledSave();
      setSaveState("未保存");
    }
    const authoredPosition = authoredCameraPositionFromGuide(
      cameraKeyframeBaseProject,
      source,
      keyframe,
      position
    );
    project = updateShotCameraKeyframe(cameraKeyframeBaseProject, shot.id, keyframeID, {
      ...keyframe,
      position: authoredPosition,
    });
    renderInspector();
    syncRenderer();
  },
  onCameraKeyframeCommit: (keyframeID, position) => {
    const base = cameraKeyframeBaseProject || projectState.current;
    cameraKeyframeBaseProject = null;
    const shot = findShot(base);
    const keyframe = shot?.camera.track.keyframes.find((candidate) => candidate.id === keyframeID);
    if (!shot || !keyframe) return;
    const authoredPosition = authoredCameraPositionFromGuide(base, shot, keyframe, position);
    project = projectState.commit(updateShotCameraKeyframe(base, shot.id, keyframeID, {
      ...keyframe,
      position: authoredPosition,
    }));
    cameraKeyframeSelection.activeID = keyframeID;
    finishAuthoredChange("摄影机路径点已更新");
  },
  onCameraAimTargetPreview: (keyframeID, position) => {
    if (keyframeID === "camera-orbit-center" && cameraOrbitForm) {
      cameraOrbitForm.worldPosition = { ...position };
      if (cameraOrbitForm.targetValue.startsWith("environment:")) {
        cameraOrbitForm.localPosition = directorRenderer.visualEnvironmentTargetPoint(cameraOrbitForm.targetValue.slice(12), position);
      }
      for (const input of elements.inspectorContent.querySelectorAll("[data-camera-orbit-world]")) {
        input.value = Number((cameraOrbitForm.targetValue === "world" ? position : cameraOrbitForm.localPosition)[input.dataset.cameraOrbitWorld]).toFixed(2);
      }
      syncRenderer();
      return;
    }
    const base = cameraAimBaseProject || projectState.current;
    const shot = findShot(base);
    const keyframe = shot?.camera.track.keyframes.find((candidate) => candidate.id === keyframeID);
    if (!shot || !keyframe || !canEditCamera()) return;
    if (!cameraAimBaseProject) {
      cameraAimBaseProject = projectState.current;
      authoredRevision += 1;
      cancelScheduledSave();
      setSaveState("未保存");
    }
    const aim = effectiveCameraAim(shot.camera.track, keyframe.time);
    const updatedAim = cameraAimAtWorldPosition(aim, position);
    project = updateShotCameraKeyframeAim(cameraAimBaseProject, shot.id, keyframeID, updatedAim);
    for (const input of elements.inspectorContent.querySelectorAll("[data-camera-aim-world]")) {
      input.value = Number((aim.targetKind === "environment" ? updatedAim.localPosition : position)[input.dataset.cameraAimWorld]).toFixed(2);
    }
    syncRenderer();
  },
  onCameraAimTargetCommit: (keyframeID, position) => {
    if (keyframeID === "camera-orbit-center" && cameraOrbitForm) {
      cameraOrbitForm.worldPosition = { ...position };
      if (cameraOrbitForm.targetValue.startsWith("environment:")) {
        cameraOrbitForm.localPosition = directorRenderer.visualEnvironmentTargetPoint(cameraOrbitForm.targetValue.slice(12), position);
      }
      if (cameraOrbitDraft) previewCameraOrbit();
      else {
        renderInspector();
        syncRenderer();
      }
      return;
    }
    const base = cameraAimBaseProject || projectState.current;
    cameraAimBaseProject = null;
    const shot = findShot(base);
    const keyframe = shot?.camera.track.keyframes.find((candidate) => candidate.id === keyframeID);
    if (!shot || !keyframe) return;
    const aim = effectiveCameraAim(shot.camera.track, keyframe.time);
    project = projectState.commit(updateShotCameraKeyframeAim(base, shot.id, keyframeID, {
      ...cameraAimAtWorldPosition(aim, position),
    }));
    cameraKeyframeSelection.activeID = keyframeID;
    finishAuthoredChange("场景自定义点已更新");
  },
  onTransformPreview: (actorID, pose) => {
    if (!transformBaseProject) {
      transformBaseProject = projectState.current;
      authoredRevision += 1;
      cancelScheduledSave();
      setSaveState("未保存");
    }
    project = setActorOrPairedRoleTransform(
      transformBaseProject,
      actorID,
      pose.position,
      pose.rotationY
    );
    renderActors();
    renderInspector();
    syncRenderer();
  },
  onTransformCommit: (actorID, pose) => {
    const base = transformBaseProject || projectState.current;
    transformBaseProject = null;
    project = projectState.commit(setActorOrPairedRoleTransform(
      base,
      actorID,
      pose.position,
      pose.rotationY
    ));
    finishAuthoredChange("演员变换已更新");
  },
  onSceneObjectTransformPreview: (selection, pose) => {
    if (!transformBaseProject) {
      transformBaseProject = projectState.current;
      authoredRevision += 1;
      cancelScheduledSave();
      setSaveState("未保存");
    }
    project = setSelectedSceneObjectTransform(transformBaseProject, selection, pose);
    renderInspector();
    syncRenderer();
  },
  onSceneObjectTransformCommit: (selection, pose) => {
    const base = transformBaseProject || projectState.current;
    transformBaseProject = null;
    project = projectState.commit(setSelectedSceneObjectTransform(base, selection, pose));
    finishAuthoredChange(
      selection.kind === "environment"
        ? "环境变换已更新"
        : selection.kind === "pairedAction"
          ? "双人组变换已更新"
          : "布景组变换已更新"
    );
  },
  onPlacementChange: (active) => {
    elements.placementBanner.hidden = !active;
    renderInspector();
    renderPathHeightControl();
  },
  onFocalLengthPreview: ({ view, focalLength }) => {
    showFocalLengthFeedback(focalLength);
    // 视口里双指滑动就是变焦，它走的是这条路而不是 orbit 的 change，
    // 所以机位锁定态得在这里也进暂存 —— 否则画面变了、读数不动、K 也存不下来。
    if (view === "scene") syncCameraSetupDraftFromViewport();
    updateShotComposition();
  },
  onFocusDistancePicked: (focusPick) => {
    cameraFocusPicking = false;
    document.getElementById("cameraPickFocusDistance")?.setAttribute("aria-pressed", "false");
    if (cameraSetupViewActive()) {
      const setup = cameraSetupShortcutSelection();
      const edit = setup ? cameraEditSession.setupEdit(setup.id) : null;
      if (!setup) return;
      const pose = {
        ...(edit?.pose || setup.pose),
        focusDistance: focusPick.focusDistance,
      };
      stageCameraSetupEdit(
        setup.id,
        pose,
        edit?.aspectRatio || setup.aspectRatio,
        { depthOfField: edit?.depthOfField || setup.depthOfField }
      );
      renderInspector();
      showToast(`已选取${focusPick.label} · ${focusPick.focusDistance.toFixed(2)} m`);
      return;
    }
    cameraFocusPickCandidate = {
      shotID: findShot(project)?.id || null,
      time: playback.elapsed,
      label: focusPick.label,
      target: focusPick.target,
    };
    const input = document.getElementById("cameraFocusDistance");
    if (input) input.value = focusPick.focusDistance.toFixed(2);
    directorRenderer.setShotCameraEditorValues({ focusDistance: focusPick.focusDistance });
    updateShotComposition();
    renderInspector();
    showToast(`已选取${focusPick.label} · ${focusPick.focusDistance.toFixed(2)} m`);
  },
  onShotCameraPoseChange: (pose) => {
    if (!canEditCamera() || editViewMode !== "shot") return;
    const shot = findShot(project);
    if (!shot) return;
    const samples = currentProjectSamples();
    const previousEdit = cameraEditSession.shotEdit(shot.id);
    const baseProject = previousEdit?.project ? rebaseShotCameraEditProject(previousEdit) : project;
    const baseShot = findShot(baseProject, shot.id) || shot;
    const stagedPose = authoredCameraPoseFromVisible(
      pose,
      baseShot,
      playback.elapsed,
      samples,
      previousEdit?.pose
    );
    const staged = stageShotCameraKeyframe(
      baseProject,
      shot.id,
      stagedPose,
      playback.elapsed,
      project.output.frameRate,
      samples
    );
    cameraEditSession.stageShot(shot.id, stagedPose, staged?.project || null);
    const evaluated = staged?.sampledPose || stagedPose;
    if (aimOrientationLocked(evaluated) || evaluated?.followEvaluation?.enabled) {
      directorRenderer.setCameraTrackPose(evaluated, {
        rotationLocked: aimOrientationLocked(evaluated),
      });
    }
    elements.appShell.dataset.cameraEdit = "staged";
    if (!previousEdit) renderTransport();
    const now = performance.now();
    if (now - cameraPoseRenderAt > 80) {
      cameraPoseRenderAt = now;
      updateCameraKeyframeInspectorState();
    }
  },
  onBlockoutImageError: (message) => showToast(message, true),
  onEnvironmentStatus: (status) => {
    if (status.state === "removed") environmentStatuses.delete(status.environmentID);
    else environmentStatuses.set(status.environmentID, status);
    if (status.state === "ready") {
      const environmentID = status.environmentID;
      const shouldFocus = environmentID === environmentFocusID;
      if (shouldFocus) environmentFocusID = null;
      requestAnimationFrame(() => void (async () => {
        
        if (shouldFocus) directorRenderer.focusVisualEnvironment(environmentID);
      })());
    }
    if (inspectorPanel === "scene" || selectedObject?.kind === "environment") renderInspector();
  },
});

const shotFrameResizeObserver = new ResizeObserver(() => updateShotComposition());
shotFrameResizeObserver.observe(elements.viewport);

{}
{}
// A worker clock keeps countdown/session policy and the media sender alive
// when the browser main-thread timer is throttled. The WebRTC transport renders
// a recording-safe dedicated canvas at 30fps; `?viewfinderTransport=jpeg`
// preserves the bounded JPEG path for engineering A/B diagnostics only.

{}

{}
document.getElementById("projectSettingsCancel").addEventListener("click", () => {
  document.getElementById("projectSettingsDialog").close("cancel");
});
document.getElementById("projectSettingsName").addEventListener("keydown", (event) => {
  // WebKit can end composition before the confirming Enter reaches keydown.
  if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) {
    event.preventDefault();
  }
});
document.getElementById("projectSettingsDialog")?.addEventListener("close", () => {
  const dialog = document.getElementById("projectSettingsDialog");
  if (dialog.returnValue !== "confirm") return;
  const name = document.getElementById("projectSettingsName").value;
  const frameRate = Number(document.getElementById("projectSettingsFrameRate").value);
  const aspectRatio = document.getElementById("projectSettingsAspectRatio")?.value;
  const nameChanged = cleanTrimmed(name) && name !== project.name;
  const frameRateChanged = Number.isFinite(frameRate) && frameRate !== project.output.frameRate;
  const aspectChanged = desktopAspectRatios.includes(aspectRatio)
    && aspectRatio !== project.output.defaultAspectRatio;
  // 只有最后一次提交带回执，否则改三项会连弹三个 toast。
  const last = aspectChanged ? "aspect" : frameRateChanged ? "frameRate" : "name";
  void (async () => {
    if (nameChanged) {
      await commitProject((current) => renameProject(current, name), last === "name" ? "项目设置已更新" : null);
    }
    if (frameRateChanged) {
      await commitProject((current) => setProjectFrameRate(current, frameRate), last === "frameRate" ? "项目设置已更新" : null);
    }
    if (aspectChanged) {
      await commitProject((current) => setProjectDefaultAspectRatio(current, aspectRatio), "项目设置已更新");
    }
  })();
});

function cleanTrimmed(value) {
  return String(value ?? "").trim().length > 0;
}
elements.liveInterruptDialog?.addEventListener("cancel", (event) => event.preventDefault());
elements.liveInterruptDialog?.addEventListener("close", () => {
  const choice = elements.liveInterruptDialog.returnValue === "keep" ? "keep" : "discard";
  {}
});

setupEvents();
setupShellBridge();
{}
initialize();

// 原生壳（WKWebView）的菜单命令入口与菜单联动状态回传。
// 浏览器里 window.webkit 不存在，两个方向都自动降级为 no-op。
function setupShellBridge() { document.documentElement.dataset.host = "browser"; }

// 壳里请求宿主弹原生面板；浏览器里由覆盖式 file input 自己处理。

let blockoutImageImportTarget = null;

function projectManagementLocked() {
  return projectManagementBusy
    || isExporting()
    || environmentImporting
    || Boolean(blockoutImageImportTarget)
    || false;
}

function closeProjectManager() {
  closeProjectManagerActionMenu();
  if (elements.projectManagerDialog.open) elements.projectManagerDialog.close();
}

function renderProjectManager() {
  if (!elements.projectManagerDialog?.open) return;
  closeProjectManagerActionMenu();
  const query = String(elements.projectManagerSearch.value || "").trim().toLocaleLowerCase("zh-Hans");
  const visible = query
    ? projectSummaries.filter((entry) => String(entry.name).toLocaleLowerCase("zh-Hans").includes(query))
    : projectSummaries;
  const selected = projectSummaries.find((entry) => entry.id === projectManagerSelectedID) || null;
  elements.projectManagerList.innerHTML = visible.length ? visible.map((entry) => {
    const current = entry.id === project.id;
    const selectedRow = entry.id === projectManagerSelectedID;
    return `<div class="project-manager-row ${selectedRow ? "selected" : ""} ${current ? "current" : ""}"
      role="option" aria-selected="${selectedRow}" tabindex="0" data-managed-project-id="${escapeHTML(entry.id)}">
      <div class="project-manager-name-cell">
        <span class="project-manager-mark" aria-hidden="true">FS</span>
        <span class="project-manager-name-copy"><strong>${escapeHTML(entry.name)}</strong><small title="${escapeHTML(entry.readError || "")}">${entry.readError ? "无法读取 · 请检查项目文件" : "本机项目"}</small></span>
        ${current ? '<span class="project-manager-current">当前</span>' : ""}
      </div>
      <span class="project-manager-value" title="${escapeHTML(entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString("zh-CN") : "未知")}">${escapeHTML(formatProjectModifiedAt(entry.modifiedAt))}</span>
      <span class="project-manager-value mono">${entry.readError ? "—" : Number(entry.actorCount || 0)}</span>
      <span class="project-manager-value mono">${entry.readError ? "—" : Number(entry.revision || 0)}</span>
      <button class="project-manager-more" type="button" aria-label="${escapeHTML(entry.name)}操作" aria-haspopup="menu" aria-expanded="false" data-managed-project-more="${escapeHTML(entry.id)}">···</button>
    </div>`;
  }).join("") : '<div class="project-manager-empty"><div><strong>没有匹配的项目</strong><span>换一个名称搜索，或清除搜索条件。</span></div></div>';
  elements.projectManagerSummary.innerHTML = `<strong>${escapeHTML(selected?.name || "尚未选择项目")}</strong>${visible.length} 个结果 · 本机共 ${projectSummaries.length} 个项目`;
  document.getElementById("openManagedProject").disabled = !selected || Boolean(selected.readError) || projectManagementBusy;
  document.getElementById("importProjectPackage").disabled = projectManagementBusy;
  document.getElementById("createProjectFromManager").disabled = projectManagementBusy;
  elements.projectManagerList.setAttribute("aria-busy", String(projectManagementBusy));
}

function formatProjectModifiedAt(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未知";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay) return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function selectManagedProject(projectID) {
  if (!projectSummaries.some((entry) => entry.id === projectID)) return;
  projectManagerSelectedID = projectID;
  renderProjectManager();
}

function openProjectManagerActionMenu(button, projectID) {
  projectManagerActionID = projectID;
  const menu = elements.projectManagerActionMenu;
  const unreadable = Boolean(projectSummaries.find((entry) => entry.id === projectID)?.readError);
  menu.querySelectorAll("[data-project-action]").forEach((item) => {
    item.hidden = unreadable ? item.dataset.projectAction !== "reveal" : item.dataset.projectAction === "reveal";
  });
  menu.querySelector("hr").hidden = unreadable;
  menu.hidden = false;
  const rect = button.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, rect.right - menu.offsetWidth));
  const below = rect.bottom + 5;
  const top = below + menu.offsetHeight <= window.innerHeight - 8
    ? below
    : Math.max(8, rect.top - menu.offsetHeight - 5);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  button.setAttribute("aria-expanded", "true");
  menu.querySelector("button:not([hidden])")?.focus({ preventScroll: true });
}

function closeProjectManagerActionMenu() {
  projectManagerActionID = null;
  if (!elements.projectManagerActionMenu) return;
  elements.projectManagerActionMenu.hidden = true;
  elements.projectManagerActionMenu.removeAttribute("style");
  elements.projectManagerList?.querySelectorAll("[data-managed-project-more]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

async function duplicateManagedProject(projectID) {
  if (projectManagementLocked()) return;
  closeProjectManagerActionMenu();
  projectManagementBusy = true;
  renderProjectManager();
  try {
    if (projectID === project.id && !await saveProjectNow(false)) throw new Error("当前项目尚未保存");
    const copy = await projectAPI.duplicate(projectID);
    projectSummaries = await projectAPI.list();
    projectManagerSelectedID = copy.id;
    showToast(`已复制“${copy.name}”`);
  } catch (error) {
    showToast(`项目复制失败：${error.message}`, true);
  } finally {
    projectManagementBusy = false;
    renderProjectManager();
  }
}

function requestManagedProjectImport() {
  if (projectManagementLocked()) return;
  {}
  elements.projectPackageInput.click();
}

async function importManagedProjectFile(file) {
  if (!file || projectManagementLocked()) return;
  projectManagementBusy = true;
  renderProjectManager();
  try {
    await acceptImportedProject(await projectAPI.importPackage(file));
  } catch (error) {
    projectManagementBusy = false;
    renderProjectManager();
    showToast(`项目导入失败：${error.message}`, true);
  }
}

async function acceptImportedProject(importedInput) {
  const imported = normalizeDesktopProject(importedInput);
  projectSummaries = await projectAPI.list();
  projectManagerSelectedID = imported.id;
  projectManagementBusy = false;
  renderProjectManager();
  showToast(`已导入“${imported.name}”`);
}

async function exportManagedProject(projectID) {
  if (projectManagementLocked()) return;
  closeProjectManagerActionMenu();
  projectManagementBusy = true;
  renderProjectManager();
  try {
    if (projectID === project.id && !await saveProjectNow(false)) throw new Error("当前项目尚未保存");
    const summary = projectSummaries.find((entry) => entry.id === projectID);
    if (!summary) throw new Error("项目不存在");
    {}
    const anchor = document.createElement("a");
    anchor.href = projectAPI.packageURL(projectID);
    anchor.download = `${summary.name}.filmspace-lite`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    showToast(`已开始导出“${summary.name}”`);
  } catch (error) {
    showToast(`项目导出失败：${error.message}`, true);
  }
  projectManagementBusy = false;
  renderProjectManager();
}

function requestDeleteManagedProject(projectID) {
  const summary = projectSummaries.find((entry) => entry.id === projectID);
  if (!summary || projectManagementLocked()) return;
  closeProjectManagerActionMenu();
  projectDeleteTargetID = projectID;
  document.getElementById("deleteProjectTitle").textContent = `删除“${summary.name}”？`;
  elements.deleteProjectDialog.showModal();
  document.getElementById("cancelDeleteProject").focus();
}

async function confirmManagedProjectDeletion() {
  const projectID = projectDeleteTargetID;
  const summary = projectSummaries.find((entry) => entry.id === projectID);
  if (!projectID || !summary || projectManagementLocked()) return;
  elements.deleteProjectDialog.close();
  projectDeleteTargetID = null;
  projectManagementBusy = true;
  renderProjectManager();
  try {
    const deletingCurrent = projectID === project.id;
    if (deletingCurrent && projectDirty && !await saveProjectNow(false)) throw new Error("当前项目尚未保存");
    await projectAPI.remove(projectID);
    projectSummaries = await projectAPI.list();
    if (deletingCurrent) {
      if (selectInitialProjectID(projectSummaries)) await loadProject(selectInitialProjectID(projectSummaries), { skipCurrentSave: true });
      else await createNewProject({ skipCurrentSave: true });
      projectSummaries = await projectAPI.list();
      projectManagerSelectedID = project.id;
    } else {
      projectManagerSelectedID = projectSummaries[0]?.id || project.id;
    }
    showToast(`已删除“${summary.name}”`);
  } catch (error) {
    showToast(`项目删除失败：${error.message}`, true);
  } finally {
    projectManagementBusy = false;
    renderProjectManager();
  }
}

async function openSelectedManagedProject() {
  const projectID = projectManagerSelectedID;
  if (!projectID || projectManagementBusy) return;
  const summary = projectSummaries.find((entry) => entry.id === projectID);
  if (summary?.readError) {
    showToast(`项目无法读取：${summary.readError}`, true);
    return;
  }
  if (projectID === project.id) {
    closeProjectManager();
    return;
  }
  closeProjectManager();
  await loadProject(projectID);
}

function openShortcutsDialog() {
  document.getElementById("shortcutsDialog")?.showModal();
}

function postShellState() { document.title = `${project.name} · Film Space Lite`; }

async function initialize() {
  
  try {
    projectSummaries = await projectAPI.list();
    if (projectSummaries.length) {
      const parameters = new URLSearchParams(window.location.search);
      const initialID = selectInitialProjectID(projectSummaries, {
        requestedProjectID: parameters.get("project"),
        rememberedProjectID: readLastOpenedProjectID(),
      });
      if (!initialID) throw new Error("项目文件无法读取，请在项目管理器中检查");
      project = await projectAPI.load(initialID);
    } else {
      const settings = await requestNewProjectSettings();
      if (settings !== null) {
        project = createDesktopProject(settings);
        project = await projectAPI.save(project);
        projectSummaries = await projectAPI.list();
      }
    }
    rememberLastOpenedProjectID(project.id);
    setSaveState("已载入");
  } catch (error) {
    project = createDesktopProject({ name: "临时桌面项目" });
    setSaveState("仅内存", true);
    showToast(`本地项目存储暂不可用：${error.message}`, true);
  }

  persistedProjectRevision = Number(project.revision || 0);
  projectDirty = false;
  projectState.reset(project);
  semanticBaselineProject = structuredClone(project);
  uiOperationHistory.reset();
  semanticOperationQueue.reset(project);
  selectedActorID = project.scene.actors[0]?.id || null;
  selectedObject = selectedActorID
    ? { kind: "actor", id: selectedActorID, parentID: null }
    : null;
  ensureCameraKeyframeSelection();
  playback.setDuration(rehearsalDuration());
  elements.appShell.setAttribute("aria-busy", "false");
  renderAll();
  playback.reset();
  startOperatorBridge();
  // 启动后键盘焦点落到视口，C / Tab / T / F 不用先点一下鼠标才生效。
  focusViewportForShortcuts();
  {}
  const actionLibraryParameters = new URLSearchParams(window.location.search);
  const requestedActionLibrary = actionLibraryParameters.get("actionLibrary");
  {}
}

function focusViewportForShortcuts() {
  const canvas = document.querySelector(".director-canvas");
  if (!canvas) return;
  if (document.activeElement && document.activeElement !== document.body) return;
  canvas.focus({ preventScroll: true });
}

function startOperatorBridge() {
  operatorSubscription?.();
  operatorSubscription = projectAPI.subscribe({
    open: syncOperatorSelection,
    projectChanged: (event) => void applyExternalProjectChange(event),
    projectDeleted: (event) => void applyExternalProjectDeletion(event),
    selectionChanged: applyExternalSelection,
    operatorCommand: applyOperatorCommand,
    captureRequested: (event) => void answerOperatorCapture(event),
    playheadRequested: (event) => void answerOperatorPlayhead(event),
  });
}

async function applyExternalProjectDeletion(event) {
  if (!event?.projectID || event.source === projectAPI.sourceID) return;
  projectSummaries = await projectAPI.list();
  if (event.projectID === project.id) {
    if (selectInitialProjectID(projectSummaries)) await loadProject(selectInitialProjectID(projectSummaries), { skipCurrentSave: true });
    else await createNewProject({ skipCurrentSave: true });
    showToast("当前项目已在另一个窗口中删除", true);
  }
  renderProjectManager();
}

async function applyExternalProjectChange(event) {
  if (
    event?.projectID !== project.id
    || event.source === projectAPI.sourceID
    || Number(event.revision) <= Number(persistedProjectRevision)
  ) {
    return;
  }
  deferredExternalRevision = Math.max(deferredExternalRevision, Number(event.revision) || 0);
  const activeEdit = Boolean(
    transformBaseProject
    || pathPointBaseProject
    || cameraKeyframeBaseProject
    || cameraAimBaseProject
  );
  if (activeEdit || semanticOperationQueue.active) {
    scheduleDeferredExternalSync();
    return;
  }
  await syncDeferredExternalProject();
}

async function syncDeferredExternalProject() {
  if (
    !deferredExternalRevision
  ) {
    return;
  }
  if (
    semanticOperationQueue.active
    || transformBaseProject
    || pathPointBaseProject
    || cameraKeyframeBaseProject
    || cameraAimBaseProject
  ) {
    scheduleDeferredExternalSync();
    return;
  }
  const requestedRevision = deferredExternalRevision;
  try {
    const latest = await projectAPI.load(project.id);
    deferredExternalRevision = latest.revision >= requestedRevision ? 0 : requestedRevision;
    if (!semanticOperationQueue.acceptExternal(latest)) return;
    projectSummaries = await projectAPI.list();
    renderProjectSwitcher();
    showToast("已同步项目更新");
  } catch (error) {
    showToast(`MCP 更新同步失败：${error.message}`, true);
  }
}

function scheduleDeferredExternalSync() {
  if (deferredExternalSyncTimer !== null) return;
  deferredExternalSyncTimer = setTimeout(() => {
    deferredExternalSyncTimer = null;
    void syncDeferredExternalProject();
  }, 150);
}

function applyExternalSelection(selection) {
  if (selection?.projectID !== project.id || selection.source === projectAPI.sourceID) return;
  applyingOperatorSelection = true;
  try {
    const kind = selection.kind || (
      selection.actorID ? "actor"
        : selection.blockoutPrimitiveID ? "blockoutPrimitive"
          : selection.environmentGroupID ? "environmentGroup"
          : selection.blockoutObjectID ? "blockoutObject"
          : selection.blockoutGroupID ? "blockoutGroup"
            : selection.cameraSetupID ? "cameraSetup"
              : selection.shotID ? "shot"
                : null
    );
    if (kind === "actor" && selection.actorID) selectActor(selection.actorID);
    else if (kind === "cameraSetup" && selection.cameraSetupID) selectCameraSetup(selection.cameraSetupID);
    else if (kind === "shot" && selection.shotID) selectShot(selection.shotID, { allowActive: true });
    else if (kind === "blockoutPrimitive" && selection.blockoutGroupID && selection.blockoutPrimitiveID) {
      const group = project.scene.blockout.groups.find((candidate) => candidate.id === selection.blockoutGroupID);
      const object = group?.objects.find((candidate) => (
        candidate.id === selection.blockoutObjectID
        || candidate.primitives.some((primitive) => primitive.id === selection.blockoutPrimitiveID)
      ));
      if (object) selectSceneObject({
        kind: "blockoutObject",
        id: object.id,
        parentID: group.id,
      });
    } else if (kind === "blockoutObject" && selection.blockoutGroupID && selection.blockoutObjectID) {
      selectSceneObject({
        kind,
        id: selection.blockoutObjectID,
        parentID: selection.blockoutGroupID,
      });
    } else if (kind === "blockoutGroup" && selection.blockoutGroupID) {
      selectSceneObject({ kind, id: selection.blockoutGroupID, parentID: null });
    } else if (kind === "blockoutLayer") {
      selectSceneObject({ kind, id: "blockout", parentID: null });
    } else if (kind === "environment" && selection.environmentID) {
      selectSceneObject({ kind, id: selection.environmentID, parentID: null });
    } else if (kind === "environmentGroup" && selection.environmentGroupID) {
      selectSceneObject({ kind, id: selection.environmentGroupID, parentID: null });
    }
    renderAll();
  } finally {
    applyingOperatorSelection = false;
  }
}

function applyOperatorCommand(command) {
  switch (command?.action) {
    case "set_workspace":
      setViewportMode(command.workspace === "camera" ? viewportModes.camera : viewportModes.edit);
      break;
    case "set_edit_view":
      if (viewportMode !== viewportModes.edit) setViewportMode(viewportModes.edit);
      setEditViewMode(command.view === "shot" ? "shot" : "scene");
      break;
    case "set_sidebar":
      setSceneSidebarMode(command.sidebar);
      break;
    case "set_inspector":
      if (["actor", "motion", "camera", "scene"].includes(command.panel)) {
        inspectorPanel = command.panel === "scene"
          ? "scene"
          : command.panel === "camera"
            ? "camera"
            : "actor";
        renderInspectorTabs();
        renderInspector();
      }
      break;
    case "transport":
      if (command.command === "play") startTransportPlayback();
      else if (command.command === "pause") playback.pause();
      else if (command.command === "reset") resetRehearsal();
      break;
    case "view":
      if (command.view === "top") directorRenderer.moveCameraToTopView();
      else if (command.view === "orbit") directorRenderer.moveCameraToOrbitView();
      else if (command.view === "actor") directorRenderer.focusSelectedActor();
      else if (command.view === "environment") directorRenderer.focusVisualEnvironment();
      break;
    case "save":
      void saveProjectNow(false);
      break;
    default:
      break;
  }
}

async function answerOperatorCapture(event) {
  if (!event?.requestID || event.projectID !== project.id) return;
  try {
    if (Array.isArray(event.times)) {
      const originalPlayback = {
        elapsed: playback.elapsed,
        status: playback.status,
      };
      const frames = [];
      try {
        for (const requestedTime of event.times) {
          const snapshot = seekOperatorPlayhead(requestedTime);
          await settleOperatorFrame();
          frames.push({
            requestedTime,
            time: snapshot.time,
            frame: snapshot.frame,
            dataURL: await directorRenderer.captureViewportPNG(event.mode),
          });
        }
      } finally {
        if (event.preservePlayhead !== false) restoreOperatorPlayback(originalPlayback);
      }
      await projectAPI.answerViewportCapture(event.requestID, {
        frames,
        restoredPlayhead: event.preservePlayhead !== false,
      });
      return;
    }
    const dataURL = await directorRenderer.captureViewportPNG(event.mode);
    await projectAPI.answerViewportCapture(event.requestID, { dataURL });
  } catch (error) {
    await projectAPI.answerViewportCapture(event.requestID, {
      error: error?.message || String(error),
    }).catch(() => {});
  }
}

async function answerOperatorPlayhead(event) {
  if (!event?.requestID || event.projectID !== project.id) return;
  try {
    const snapshot = seekOperatorPlayhead(event.time);
    await settleOperatorFrame();
    await projectAPI.answerPlayheadRequest(event.requestID, snapshot);
  } catch (error) {
    await projectAPI.answerPlayheadRequest(event.requestID, {
      error: error?.message || String(error),
    }).catch(() => {});
  }
}

function seekOperatorPlayhead(timeInput) {
  if (playback.status === "playing") playback.pause();
  const shot = findShot(project);
  const duration = shot ? shotOutputDuration(project, shot) : rehearsalDuration();
  const time = Math.max(0, Math.min(Number(timeInput || 0), duration));
  const keyframe = cameraKeyframeAtTime(activeCameraTrack(), time, project.output.frameRate);
  cancelStagedCameraEdit(false);
  cameraKeyframeSelection.activeID = keyframe?.id || null;
  playback.setDuration(rehearsalDuration());
  playback.seek(time);
  renderCameraTimeline();
  renderInspector();
  return operatorPlayheadSnapshot(duration);
}

function restoreOperatorPlayback(snapshot) {
  const duration = rehearsalDuration();
  playback.setDuration(duration);
  const elapsed = Math.max(0, Math.min(Number(snapshot?.elapsed || 0), duration));
  const status = snapshot?.status === "completed"
    ? "completed"
    : elapsed <= 0
      ? "idle"
      : "paused";
  playback.seek(elapsed, { status });
  if (snapshot?.status === "playing") playback.play();
  renderCameraTimeline();
  renderInspector();
}

function operatorPlayheadSnapshot(durationInput) {
  const frameRate = Math.max(Number(project.output.frameRate || 30), 1);
  const duration = Math.max(Number(durationInput || 0), 0);
  return {
    time: playback.elapsed,
    frame: Math.round(playback.elapsed * frameRate),
    frameRate,
    duration,
    status: playback.status,
  };
}

function settleOperatorFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function syncOperatorSelection() {
  if (applyingOperatorSelection || !project?.id) return;
  const selection = selectedObject || {};
  const operatorKind = [
    "actor",
    "cameraSetup",
    "shot",
    "environment",
    "environmentGroup",
    "blockoutLayer",
    "blockoutGroup",
    "blockoutObject",
  ].includes(selection.kind) ? selection.kind : null;
  void projectAPI.setSelection(project.id, {
    kind: operatorKind,
    actorID: selection.kind === "actor" ? selection.id : null,
    cameraSetupID: selection.kind === "cameraSetup" ? selection.id : null,
    shotID: selection.kind === "shot" ? selection.id : null,
    environmentID: selection.kind === "environment" ? selection.id : null,
    environmentGroupID: selection.kind === "environmentGroup" ? selection.id : null,
    blockoutGroupID: selection.kind === "blockoutGroup"
      ? selection.id
      : selection.kind === "blockoutObject" ? selection.parentID : null,
    blockoutObjectID: selection.kind === "blockoutObject" ? selection.id : null,
    blockoutPrimitiveID: null,
  }).catch(() => {});
}

function setupEvents() {
  wirePathHeightControl();
  elements.addActor.addEventListener("click", () => {
    if (sceneSidebarMode === "shots") addNewShot();
    else if (sceneSidebarMode === "setups") addNewCameraSetup();
    // 壳里走原生面板；浏览器里这颗按钮被 file input 覆盖，点不到这里。
    else if (sceneSidebarMode === "blockout") elements.blockoutModelInput.click();
    else addNewActor();
  });
  {}
  elements.blockoutModelInput.addEventListener("change", () => {
    const file = elements.blockoutModelInput.files?.[0];
    elements.blockoutModelInput.value = "";
    if (file) void importVisualEnvironment(file);
  });
  {}
  elements.actorsSidebarMode.addEventListener("click", () => setSceneSidebarMode("actors"));
  elements.cameraSetupsSidebarMode.addEventListener("click", () => setSceneSidebarMode("setups"));
  elements.shotsSidebarMode.addEventListener("click", () => setSceneSidebarMode("shots"));
  elements.blockoutSidebarMode.addEventListener("click", () => {
    // 空布景时没有可选中的「布景整体」行，只切页签。
    if (project.scene.blockout.groups.length) {
      selectSceneObject({ kind: "blockoutLayer", id: "blockout", parentID: null });
    } else {
      setSceneSidebarMode("blockout");
    }
  });
  elements.newProject.addEventListener("click", createNewProject);
  document.getElementById("newProjectCancel").addEventListener("click", () => {
    document.getElementById("newProjectDialog").close("cancel");
  });
  elements.projectSelect.addEventListener("change", () => loadProject(elements.projectSelect.value));
  document.getElementById("closeProjectManager").addEventListener("click", closeProjectManager);
  document.getElementById("cancelProjectManager").addEventListener("click", closeProjectManager);
  document.getElementById("openManagedProject").addEventListener("click", openSelectedManagedProject);
  document.getElementById("importProjectPackage").addEventListener("click", requestManagedProjectImport);
  document.getElementById("createProjectFromManager").addEventListener("click", () => {
    if (projectManagementLocked()) return;
    closeProjectManager();
    void createNewProject();
  });
  elements.projectManagerSearch.addEventListener("input", renderProjectManager);
  elements.projectPackageInput.addEventListener("change", () => {
    const file = elements.projectPackageInput.files?.[0];
    elements.projectPackageInput.value = "";
    if (file) void importManagedProjectFile(file);
  });
  elements.projectManagerList.addEventListener("click", (event) => {
    const more = event.target.closest?.("[data-managed-project-more]");
    if (more) {
      event.stopPropagation();
      const projectID = more.dataset.managedProjectMore;
      projectManagerSelectedID = projectID;
      renderProjectManager();
      const refreshed = elements.projectManagerList.querySelector(`[data-managed-project-more="${CSS.escape(projectID)}"]`);
      if (refreshed) openProjectManagerActionMenu(refreshed, projectID);
      return;
    }
    const row = event.target.closest?.("[data-managed-project-id]");
    if (row) selectManagedProject(row.dataset.managedProjectId);
  });
  elements.projectManagerList.addEventListener("dblclick", (event) => {
    const row = event.target.closest?.("[data-managed-project-id]");
    if (!row || event.target.closest?.("button")) return;
    projectManagerSelectedID = row.dataset.managedProjectId;
    void openSelectedManagedProject();
  });
  elements.projectManagerList.addEventListener("keydown", (event) => {
    const row = event.target.closest?.("[data-managed-project-id]");
    if (!row) return;
    if (event.key === "Enter") {
      event.preventDefault();
      projectManagerSelectedID = row.dataset.managedProjectId;
      void openSelectedManagedProject();
    } else if (event.key === " ") {
      event.preventDefault();
      selectManagedProject(row.dataset.managedProjectId);
    }
  });
  elements.projectManagerActionMenu.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-project-action]")?.dataset.projectAction;
    const projectID = projectManagerActionID;
    if (!action || !projectID) return;
    if (action === "reveal") {
      const summary = projectSummaries.find((entry) => entry.id === projectID);
      closeProjectManagerActionMenu();
      void projectAPI.revealOutput(summary.filePath).catch((error) => showToast(`无法定位项目：${error.message}`, true));
    } else if (action === "duplicate") void duplicateManagedProject(projectID);
    else if (action === "export") void exportManagedProject(projectID);
    else if (action === "delete") requestDeleteManagedProject(projectID);
  });
  elements.projectManagerDialog.addEventListener("cancel", (event) => {
    if (!elements.projectManagerActionMenu.hidden) {
      event.preventDefault();
      closeProjectManagerActionMenu();
    }
  });
  elements.projectManagerDialog.addEventListener("close", closeProjectManagerActionMenu);
  elements.deleteProjectDialog.addEventListener("close", () => { projectDeleteTargetID = null; });
  document.getElementById("cancelDeleteProject").addEventListener("click", () => elements.deleteProjectDialog.close());
  document.getElementById("confirmDeleteProject").addEventListener("click", () => void confirmManagedProjectDeletion());
  window.addEventListener("pointerdown", (event) => {
    if (elements.projectManagerActionMenu.hidden) return;
    if (!event.target.closest?.("#projectManagerActionMenu, [data-managed-project-more]")) {
      closeProjectManagerActionMenu();
    }
  });
  window.addEventListener("resize", closeProjectManagerActionMenu);
  window.addEventListener("scroll", closeProjectManagerActionMenu, true);
  window.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.("#actorContextMenu")) closeActorContextMenu();
  });
  window.addEventListener("blur", closeActorContextMenu);
  window.addEventListener("resize", closeActorContextMenu);
  window.addEventListener("scroll", closeActorContextMenu, true);

  elements.playPlayback.addEventListener("click", startTransportPlayback);
  elements.pausePlayback.addEventListener("click", () => playback.pause());
  elements.resetPlayback.addEventListener("click", resetRehearsal);
  elements.editMode.addEventListener("click", () => setViewportMode(viewportModes.edit));
  elements.cameraMode.addEventListener("click", () => setViewportMode(viewportModes.camera));
  elements.cameraShotSourceMode.addEventListener("click", () => setCameraOperationMode(cameraOperationModes.shot));
  {}
  elements.cameraShotSelect.addEventListener("change", () => selectCameraWorkspaceShot(elements.cameraShotSelect.value));
  {}
  {}
  elements.cameraJumpStart.addEventListener("click", () => jumpCameraTimeline("start"));
  elements.cameraStepBack.addEventListener("click", () => stepCameraTimelineFrame(-1));
  elements.cameraReset.addEventListener("click", resetCameraWorkspacePlayback);
  elements.cameraPlay.addEventListener("click", startCameraWorkspacePlayback);
  elements.cameraPause.addEventListener("click", () => playback.pause());
  elements.cameraStepForward.addEventListener("click", () => stepCameraTimelineFrame(1));
  elements.cameraJumpEnd.addEventListener("click", () => jumpCameraTimeline("end"));
  elements.cameraProgress.addEventListener("pointerdown", () => { cameraProgressScrubbing = true; });
  elements.cameraProgress.addEventListener("input", () => {
    if (playback.status === "playing") playback.pause();
    playback.seek(Number(elements.cameraProgress.value));
  });
  const finishCameraProgressScrub = () => {
    if (!cameraProgressScrubbing) return;
    cameraProgressScrubbing = false;
    renderCameraWorkspace();
  };
  elements.cameraProgress.addEventListener("change", finishCameraProgressScrub);
  elements.cameraProgress.addEventListener("pointerup", finishCameraProgressScrub);
  elements.chooseOutputFolder.addEventListener("click", () => chooseProjectOutputFolder(true));
  elements.revealCameraOutput.addEventListener("click", revealCurrentOutput);
  {}
  elements.recordCameraOutput.addEventListener("click", exportSelectedShotMP4);
  elements.cancelCameraExport.addEventListener("click", requestCameraExportCancel);
  elements.sceneView.addEventListener("click", () => {
    if (sceneSidebarMode === "setups" && cameraEditSession.isViewingSetup()) {
      leaveCameraSetupScope(false);
      renderEditViewMode();
      renderInspector();
      syncRenderer();
      return;
    }
    setEditViewMode("scene");
  });
  elements.shotView.addEventListener("click", () => {
    const target = activeCameraShortcutTarget();
    if (target.kind === cameraEditKinds.setup) toggleCameraSetupView(target.targetID);
    else setEditViewMode("shot");
  });
  renderCameraSpeedControl = wireCameraSpeedControl(document.getElementById("cameraSpeedControl"), directorRenderer);
  elements.shotDraftReturn?.addEventListener("click", () => handleCameraDraftConflictChoice("return"));
  elements.shotDraftWrite?.addEventListener("click", () => handleCameraDraftConflictChoice("write"));
  elements.shotDraftDiscard?.addEventListener("click", () => handleCameraDraftConflictChoice("discard"));
  elements.undoAction.addEventListener("click", undo);
  elements.redoAction.addEventListener("click", redo);
  elements.cancelPlacement.addEventListener("click", () => directorRenderer.setMovePlacement(false));

  let compositionGuidePointerID = null;
  const moveCompositionGuideVanishingPoint = (event) => {
    if (event.pointerId !== compositionGuidePointerID) return;
    const frame = elements.shotOutputFrame.getBoundingClientRect();
    if (frame.width <= 0 || frame.height <= 0) return;
    cameraSetupCompositionGuide = normalizeCameraCompositionGuideState({
      ...cameraSetupCompositionGuide,
      vanishingPoint: {
        x: (event.clientX - frame.left) / frame.width,
        y: (event.clientY - frame.top) / frame.height,
      },
    });
    renderCameraSetupCompositionGuide({
      visible: cameraSetupViewActive(),
      aspectRatio: frame.width / frame.height,
      frame,
    });
  };
  const finishCompositionGuideDrag = (event) => {
    if (event.pointerId !== compositionGuidePointerID) return;
    compositionGuidePointerID = null;
    if (elements.cameraCompositionGuide.hasPointerCapture?.(event.pointerId)) {
      elements.cameraCompositionGuide.releasePointerCapture(event.pointerId);
    }
  };
  elements.cameraCompositionGuide.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.("[data-composition-guide-handle]")
      || cameraSetupCompositionGuide.type !== "one-point"
      || !cameraSetupViewActive()) return;
    event.preventDefault();
    event.stopPropagation();
    compositionGuidePointerID = event.pointerId;
    elements.cameraCompositionGuide.setPointerCapture?.(event.pointerId);
    moveCompositionGuideVanishingPoint(event);
  });
  elements.cameraCompositionGuide.addEventListener("pointermove", moveCompositionGuideVanishingPoint);
  elements.cameraCompositionGuide.addEventListener("pointerup", finishCompositionGuideDrag);
  elements.cameraCompositionGuide.addEventListener("pointercancel", finishCompositionGuideDrag);
  elements.cameraCompositionGuide.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === compositionGuidePointerID) compositionGuidePointerID = null;
  });

  elements.sceneSettingsButton.addEventListener("click", () => {
    if (viewportMode === viewportModes.camera || editViewMode === "shot") return;
    inspectorPanel = inspectorPanel === "scene" ? inspectorPanelForSelection() : "scene";
    renderInspectorTabs();
    renderInspector();
  });

  // 捕获阶段登记，早于任何选中逻辑 —— 归属只看「点在哪」，不看点出了什么结果。
  // focusin 一并接上，否则纯键盘 Tab 进时间轴后 Delete 会去删场景对象。
  const claimDeleteScope = (event) => {
    deleteScope = event.target?.closest?.("#cameraTimeline") ? "keyframe" : "object";
  };
  document.addEventListener("pointerdown", claimDeleteScope, true);
  document.addEventListener("focusin", claimDeleteScope, true);

  window.addEventListener("keydown", (event) => {
    if (appUpdateLocked) return;
    {}
    if (
      document.getElementById("shortcutsDialog").open
      || document.getElementById("newProjectDialog").open
      || document.getElementById("projectSettingsDialog").open
      || elements.semanticConflictDialog.open
      || document.getElementById("shotDraftConflictDialog")?.open
    ) return;
    const typing = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLSelectElement
      || event.target instanceof HTMLTextAreaElement
      || Boolean(event.target?.isContentEditable);
    const cameraShortcutAvailable = !typing || cameraShortcutAllowedFromField({
      tagName: event.target?.tagName,
      inputType: event.target?.type,
      isContentEditable: event.target?.isContentEditable,
    });
    if (isExporting()) {
      if (!typing && event.key === "Escape") requestCameraExportCancel();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveProjectNow(true);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='a' && actorPoseTarget()) {
      event.preventDefault();selectAllActorPoseFrames();return;
    }
    if (event.key === "Escape") {
      if(actorPoseDraft){cancelActorPoseDraft();event.preventDefault();return;}
      if (cameraFocusPicking) {
        cameraFocusPicking = false;
        directorRenderer.setFocusPicking(false);
        document.getElementById("cameraPickFocusDistance")?.setAttribute("aria-pressed", "false");
        showToast("已取消焦点选取");
        event.preventDefault();
        return;
      }
      if (document.getElementById("actorContextMenu")) {
        closeActorContextMenu();
        event.preventDefault();
        return;
      }
      if (cameraOrbitDraft) {
        cancelCameraOrbitPreview(true);
        event.preventDefault();
        return;
      }
      if (cameraEditSession.edit) {
        cancelActiveCameraEdit(true);
        event.preventDefault();
        return;
      }
      directorRenderer.setMovePlacement(false);
      return;
    }
    // 主键盘上「+」要按 ⇧＝，所以两个字符都收；⇧ 不参与判定。
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey
      && ["=", "+", "-", "_"].includes(event.key)) {
      if (viewportMode !== viewportModes.edit) return;
      event.preventDefault();
      zoomTimelineByStep(event.key === "=" || event.key === "+" ? 1 : -1);
      return;
    }
    // ⌫ 和 ⌦ 一起收：macOS 上主键盘那颗是 Backspace，Fn 组合才是 Delete。
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey
      && (event.key === "Delete" || event.key === "Backspace")
      && !document.querySelector("dialog[open]")
      // 右键菜单开着时焦点在菜单按钮上（不是输入框），不拦就会一边删一边留着菜单
      && !document.getElementById("actorContextMenu")) {
      event.preventDefault();
      if (!event.repeat) deleteFocusedSelection();
      return;
    }
    if (cameraShortcutAvailable
      && !event.metaKey && !event.ctrlKey && !event.altKey
      && event.key.toLowerCase() === "c") {
      if (viewportMode !== viewportModes.edit) return;
      event.preventDefault();
      if (event.repeat) return;
      const target = activeCameraShortcutTarget();
      if (target.kind === cameraEditKinds.setup) toggleCameraSetupView(target.targetID);
      else setEditViewMode(editViewMode === "scene" ? "shot" : "scene");
      return;
    }
    // Tab 在 Edit/Camera 之间切换；输入中、对话框打开、或 Camera 尚不可用时放行给焦点导航。
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
      && event.key === "Tab" && !document.querySelector("dialog[open]")) {
      const next = viewportMode === viewportModes.camera ? viewportModes.edit : viewportModes.camera;
      if (next === viewportModes.edit || !elements.cameraMode.disabled) {
        event.preventDefault();
        setViewportMode(next);
        return;
      }
    }
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key === "?") {
      event.preventDefault();
      openShortcutsDialog();
      return;
    }
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "v") {
      if (viewportMode !== viewportModes.edit) return;
      event.preventDefault();
      if (!event.repeat) toggleShotFrameMask();
      return;
    }
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      if (!event.repeat) {
        if (viewportMode === viewportModes.camera) resetCameraWorkspacePlayback();
        else resetRehearsal();
      }
      return;
    }
    if (cameraShortcutAvailable
      && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
      && event.code === "KeyK") {
      if (viewportMode !== viewportModes.edit) return;
      event.preventDefault();
      if (event.repeat) return;
      recordSelectedKeyframe();
      return;
    }
    if (!typing && !event.metaKey && !event.altKey && (event.code === "Comma" || event.code === "Period")) {
      event.preventDefault();
      const forward = event.code === "Period";
      if (event.ctrlKey) jumpCameraTimeline(forward ? "end" : "start");
      else if (event.shiftKey && actorPoseTarget()) jumpActorPoseFrame(forward ? "next" : "previous");
      else if (event.shiftKey) jumpCameraTimeline(forward ? "next" : "previous");
      else stepCameraTimelineFrame(forward ? 1 : -1);
      return;
    }
    if (!typing && event.code === "Space") {
      event.preventDefault();
      if (viewportMode === viewportModes.camera
        && false
        && null?.vcamOnline) {
        if (playback.status === "playing") resetCameraWorkspacePlayback();
        else startCameraWorkspacePlayback();
      } else if (playback.status === "playing") playback.pause();
      else if (viewportMode === viewportModes.camera) startCameraWorkspacePlayback();
      else startTransportPlayback();
    }
  });
}

function startTransportPlayback() {
  persistActorPoseDraft();
  try {
    
  } catch (error) {
    showToast(error.message, true);
    return;
  }
  if (cameraEditSession.edit) {
    showToast("请先写入或取消当前摄影机调整", true);
    return;
  }
  stopActionInspection();
  playback.setDuration(activeTimelineDuration());
  playback.play();
}

function startCameraWorkspacePlayback() { startTransportPlayback(); }

function resetCameraWorkspacePlayback() { resetRehearsal(); }

function setViewportMode(mode, options = {}) {
  if (isExporting()) return false;
  persistActorPoseDraft();
  const nextMode = mode === viewportModes.camera ? viewportModes.camera : viewportModes.edit;
  if (nextMode === viewportModes.camera && activeShotCameraEdit()) {
    showToast("请先记录或取消当前摄影机调整", true);
    return false;
  }
  if (nextMode === viewportModes.camera && cameraOrbitDraft) {
    showToast("请先应用或取消当前环绕预览", true);
    return false;
  }
  const track = activeCameraTrack();
  
  const cameraEntryMode = cameraWorkspaceEntryMode(cameraOperationMode, {
    shotReady: cameraTrackReady(track),
    
  });
  if (nextMode === viewportModes.camera && !cameraEntryMode) {
    showToast("先新建运镜并保存摄影机关键帧", true);
    return false;
  }
  if (nextMode === viewportModes.camera
    && (cameraEditSession.isViewingSetup() || cameraEditSession.setupEdit())) {
    if (cameraEditSession.setupEdit()) {
      showToast("请先写入或放弃当前机位调整", true);
      return false;
    }
    leaveCameraSetupScope(false, false);
  }
  if (nextMode === viewportModes.camera) stopActionInspection(false);
  const previousCameraOperationMode = cameraOperationMode;
  if (nextMode === viewportModes.camera) cameraOperationMode = cameraEntryMode;
  const samples = currentProjectSamples();
  const preview = currentCameraWorkspacePreview(playback.elapsed, samples);
  const pose = options.poseOverride || preview.pose;
  if (pose) directorRenderer.setCameraTrackPose(pose, {
    locked: playback.status === "playing",
    rotationLocked: aimOrientationLocked(pose),
  });
  if (!directorRenderer.setViewportMode(nextMode)) {
    cameraOperationMode = previousCameraOperationMode;
    return false;
  }
  viewportMode = nextMode;
  playback.setDuration(activeTimelineDuration());
  mountViewportForMode(nextMode);
  if (viewportMode === viewportModes.edit) {
    directorRenderer.setEditViewMode(editViewMode);
    inspectorPanel = editViewMode === "shot" ? "camera" : inspectorPanelForSelection();
  } else {
    inspectorPanel = "camera";
  }
  elements.appShell.classList.toggle("camera-workspace", viewportMode === viewportModes.camera);
  syncCameraAuthoringGuides();
  renderViewportMode();
  renderInspectorTabs();
  renderInspector();
  renderTransport();
  // 时间轴的可见性取决于 viewportMode，模式一变就必须重建 ——
  // 否则在 Camera 里播放（那会把它设为 hidden）之后回到 Edit，它再也不出现。
  renderCameraTimeline();
  renderCameraWorkspace();
  syncRenderer();
  return true;
}

function mountViewportForMode(mode) {
  const cameraActive = mode === viewportModes.camera;
  const target = cameraActive ? elements.cameraViewportMount : elements.editViewportMount;
  if (elements.viewport.parentElement !== target) target.appendChild(elements.viewport);
  elements.editWorkspace.hidden = cameraActive;
  elements.cameraWorkspace.hidden = !cameraActive;
  requestAnimationFrame(() => {
    directorRenderer.resize();
    updateShotComposition();
  });
}

function setEditViewMode(mode) {
  if (viewportMode !== viewportModes.edit) return false;
  const nextMode = mode === "shot" ? "shot" : "scene";
  const track = activeCameraTrack();
  if (nextMode === "shot" && !cameraTrackReady(track)) {
    showToast("先新建运镜并记录摄影机起点", true);
    return false;
  }
  if (nextMode === "shot" && cameraEditSession.setupEdit()) {
    void resolveCameraDraftConflict("enter-shot");
    return false;
  }
  if (nextMode === "shot" && cameraEditSession.isViewingSetup()) {
    leaveCameraSetupScope(false, false);
  }
  if (nextMode === "shot") {
    stopActionInspection(false);
    const elapsed = playback.status === "idle" ? 0 : playback.elapsed;
    const shot = findShot(project);
    const samples = currentProjectSamples(elapsed);
    const pose = activeShotCameraEdit()?.project
      ? sampleStagedCameraEdit(elapsed, playback.status)
      : sampleShotCamera(project, shot, elapsed, samples);
    directorRenderer.setCameraTrackPose(pose, {
      locked: playback.status === "playing",
      rotationLocked: aimOrientationLocked(pose),
    });
    inspectorPanel = "camera";
  } else {
    inspectorPanel = inspectorPanelForSelection();
  }
  if (!directorRenderer.setEditViewMode(nextMode)) return false;
  editViewMode = nextMode;
  syncCameraAuthoringGuides();
  renderEditViewMode();
  renderInspectorTabs();
  renderInspector();
  renderTransport();
  syncRenderer();
  return true;
}

function resetRehearsal() {
  if (elements.resetPlayback.disabled) return;
  stopActionInspection();
  playback.reset();
}

function addNewActor() {
  if (!canAuthor()) return;
  const next = addActor(project);
  project = projectState.commit(next);
  selectedActorID = project.scene.actors.at(-1)?.id || null;
  selectedObject = selectedActorID
    ? { kind: "actor", id: selectedActorID, parentID: null }
    : null;
  selectedPathPointID = null;
  inspectorPanel = "actor";
  finishAuthoredChange("已添加演员");
}

function addNewCameraSetup() {
  if (!canAuthor()) return;
  if (cameraEditSession.setupEdit()) {
    showToast("请先写入或放弃当前机位调整", true);
    return;
  }
  leaveCameraSetupScope(false, false);
  const pose = directorRenderer.captureSceneCameraPose();
  project = projectState.commit(addCameraSetup(project, { pose }));
  selectedCameraSetupID = project.scene.cameraSetups.at(-1)?.id || selectedCameraSetupID;
  selectedObject = selectedCameraSetupID
    ? { kind: "cameraSetup", id: selectedCameraSetupID, parentID: null }
    : null;
  setSceneSidebarMode("setups", { render: false });
  inspectorPanel = "camera";
  finishAuthoredChange("已从当前 Scene View 保存机位");
}

function selectCameraSetup(cameraSetupID) {
  if (!findCameraSetup(project, cameraSetupID)) return;
  if (selectedCameraSetupID !== cameraSetupID && cameraEditSession.setupEdit()) {
    showToast("请先写入或放弃当前机位调整", true);
    return;
  }
  if (selectedCameraSetupID !== cameraSetupID) leaveCameraSetupScope(false, false);
  selectedCameraSetupID = cameraSetupID;
  selectedObject = { kind: "cameraSetup", id: cameraSetupID, parentID: null };
  setSceneSidebarMode("setups", { render: false });
  inspectorPanel = "camera";
  renderActors();
  renderInspectorTabs();
  renderInspector();
  renderCameraTimeline();
  syncRenderer();
  syncOperatorSelection();
}

function previewCameraSetup(cameraSetupID) {
  toggleCameraSetupView(cameraSetupID);
}

function recordSelectedKeyframe() {
  if (!canAuthor()) return;
  const target = keyframeShortcutTarget(sceneSidebarMode, selectedObject);
  if (!target) {
    showToast('先选择人物、运镜或机位，再按 K');
    return;
  }
  if (target.kind === 'actor') recordActorPoseAtPlayhead();
  else if (target.kind === cameraEditKinds.setup) updateSelectedCameraSetup(target.targetID);
  else recordCameraKeyframeAtPlayhead();
}

function activeCameraShortcutTarget() {
  const selectedSetupID = findCameraSetup(project, selectedCameraSetupID)?.id || null;
  return cameraShortcutTarget(sceneSidebarMode, selectedSetupID);
}

function cameraSetupShortcutSelection() {
  const target = activeCameraShortcutTarget();
  return target.kind === cameraEditKinds.setup
    ? findCameraSetup(project, target.targetID)
    : null;
}

function cameraSetupViewActive(cameraSetupID = null) {
  return viewportMode === viewportModes.edit
    && editViewMode === "scene"
    && cameraEditSession.isViewingSetup(cameraSetupID);
}

function cameraSetupShotCreationState(cameraSetupID) {
  const viewing = cameraSetupViewActive(cameraSetupID);
  const hasDraft = Boolean(cameraEditSession.setupEdit(cameraSetupID));
  const authoringEnabled = canAuthor();
  const enabled = cameraSetupCanCreateShot({
    viewing,
    hasDraft,
    canAuthor: authoringEnabled,
  });
  if (!authoringEnabled) {
    return { enabled, title: "完成当前播放或操作后可创建运镜" };
  }
  if (!viewing) {
    return { enabled, title: "进入机位视角（C）后可创建运镜" };
  }
  if (hasDraft) {
    return { enabled, title: "先保存当前构图（K），再创建运镜" };
  }
  return { enabled, title: "以此机位的已确认构图创建新运镜" };
}

// 装进机位自己的相机，不碰自由相机 —— 和 Shot View 用 shotCamera 是同一个理由。
function applyCameraSetupViewPose(pose) {
  if (!pose) return false;
  cameraEditSession.beginApplyingSetupPose();
  try {
    return directorRenderer.applySetupViewPose(pose);
  } finally {
    cameraEditSession.endApplyingSetupPose();
  }
}

function leaveCameraSetupScope(discardDraft = false, render = true) {
  const changed = cameraEditSession.leaveSetupScope({ discardDraft });
  if (!changed) return false;
  // 自由相机从没被搬走，所以这里不用还原任何东西 —— 换回去就是原来的画面。
  directorRenderer.leaveSetupView();
  updateShotComposition();
  if (render) {
    renderInspector();
    renderTransport();
  }
  return true;
}

// 机位只在左侧「机位」栏内接管 C / K。C 只切换观察视图，不处理草稿；
// K 才写入，放弃必须是一次明确操作。
function toggleCameraSetupView(cameraSetupID) {
  const setup = cameraSetupShortcutSelection();
  if (!setup || setup.id !== cameraSetupID || viewportMode !== viewportModes.edit) return;
  if (cameraEditSession.isViewingSetup(cameraSetupID)) {
    leaveCameraSetupScope(false);
    renderEditViewMode();
    showToast("已退出机位视角");
    return;
  }
  if (activeShotCameraEdit()) {
    void resolveCameraDraftConflict(`enter-setup:${cameraSetupID}`);
    return;
  }
  if (editViewMode !== "scene") setEditViewMode("scene");
  cameraEditSession.enterSetupView(cameraSetupID);
  const staged = cameraEditSession.setupEdit(cameraSetupID);
  cameraEditSession.beginApplyingSetupPose();
  directorRenderer.enterSetupView({
    ...(staged?.pose || setup.pose),
    depthOfFieldEnabled: (staged?.depthOfField || setup.depthOfField)?.enabled === true,
  }, {
    aspectRatio: staged?.aspectRatio || setup.aspectRatio,
  });
  cameraEditSession.endApplyingSetupPose();
  updateShotComposition();
  renderEditViewMode();
  renderInspector();
  showToast(`正在查看 ${setup.name}`);
}

function sameCameraPose(left, right) {
  if (!left || !right) return false;
  const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
  return ["x", "y", "z"].every((axis) => near(left.position[axis], right.position[axis]))
    && ["x", "y", "z", "w"].every((axis) => near(left.quaternion[axis], right.quaternion[axis]))
    && near(left.focalLength, right.focalLength)
    && near(left.focusDistance, right.focusDistance)
    && near(left.aperture, right.aperture);
}

function stageCameraSetupEdit(cameraSetupID, poseInput, aspectRatioInput, options = {}) {
  const setup = cameraSetupShortcutSelection();
  const hadSetupEdit = Boolean(cameraEditSession.setupEdit(cameraSetupID));
  const pose = normalizeCameraPose(poseInput);
  const aspectRatio = desktopAspectRatios.includes(aspectRatioInput)
    ? aspectRatioInput
    : setup?.aspectRatio;
  const depthOfField = {
    enabled: (options.depthOfField
      || cameraEditSession.setupEdit(cameraSetupID)?.depthOfField
      || setup?.depthOfField)?.enabled === true,
  };
  if (!setup || setup.id !== cameraSetupID || !pose || !aspectRatio) return false;
  if (activeShotCameraEdit()) cancelStagedCameraEdit(true);
  if (sameCameraPose(setup.pose, pose)
    && setup.aspectRatio === aspectRatio
    && setup.depthOfField?.enabled === depthOfField.enabled) {
    cameraEditSession.clear(cameraEditKinds.setup);
  } else {
    cameraEditSession.stageSetup(cameraSetupID, pose, aspectRatio, depthOfField);
  }
  // 姿势本来就是从视口读出来的时候不要再灌回去：那一趟回声会让渲染器从姿势
  // 反推翻滚角，而 OrbitControls 每帧都把地平线抹平，反推出来永远是 0 ——
  // 于是一走动翻滚就没了。只有数字框改出来的姿势才需要推给视口。
  if (options.fromViewport !== true && cameraSetupViewActive(cameraSetupID)) {
    applyCameraSetupViewPose({
      ...pose,
      depthOfFieldEnabled: depthOfField.enabled,
    });
  }
  updateCameraSetupInspectorState();
  if (hadSetupEdit !== Boolean(cameraEditSession.setupEdit(cameraSetupID))) renderTransport();
  updateShotComposition();
  return true;
}

// 拖视口只更新共用的摄影机暂存会话；项目本身不写，必须按 K。
function syncCameraSetupDraftFromViewport() {
  const setup = cameraSetupShortcutSelection();
  if (!setup
    || !cameraSetupViewActive(setup.id)
    || cameraEditSession.applyingSetupPose) return;
  const pose = directorRenderer.captureSetupViewPose();
  if (!pose) return;
  const aspectRatio = cameraEditSession.setupEdit(setup.id)?.aspectRatio || setup.aspectRatio;
  const depthOfField = cameraEditSession.setupEdit(setup.id)?.depthOfField || setup.depthOfField;
  stageCameraSetupEdit(setup.id, pose, aspectRatio, { fromViewport: true, depthOfField });
  const rotation = cameraRotationDegrees(pose.quaternion);
  for (const input of elements.inspectorContent.querySelectorAll("[data-vector-field='camera-setup-position']")) {
    if (document.activeElement !== input) {
      input.value = Number(pose.position[input.dataset.vectorAxis] || 0).toFixed(2);
    }
  }
  for (const input of elements.inspectorContent.querySelectorAll("[data-camera-setup-rotation]")) {
    if (document.activeElement !== input) {
      input.value = Number(rotation[input.dataset.cameraSetupRotation]).toFixed(1);
    }
  }
  const focal = document.getElementById("cameraSetupFocalLength");
  if (focal && document.activeElement !== focal) focal.value = Number(pose.focalLength).toFixed(1);
  const focalSlider = document.getElementById("cameraSetupFocalSlider");
  if (focalSlider && document.activeElement !== focalSlider) {
    focalSlider.value = focalLengthToSliderProgress(pose.focalLength).toFixed(6);
  }
  const focusDistance = document.getElementById("cameraSetupFocusDistance");
  if (focusDistance && document.activeElement !== focusDistance) {
    focusDistance.value = Number(pose.focusDistance).toFixed(2);
  }
  const aperture = document.getElementById("cameraSetupAperture");
  if (aperture && document.activeElement !== aperture) {
    aperture.value = Number(pose.aperture).toFixed(1);
  }
}

// 保存状态徽章和提示行整块重绘太重（拖动中每帧都来，还会吹掉输入框焦点），
// 所以只改这两处的文字与类。
function updateCameraSetupInspectorState() {
  const badge = document.getElementById("cameraSetupEditBadge");
  const notice = document.getElementById("cameraSetupStagedNotice");
  const writeButton = document.getElementById("captureInspectorCameraSetup");
  const createShotButton = document.getElementById("createShotFromCameraSetup");
  const staged = Boolean(cameraEditSession.setupEdit(selectedCameraSetupID));
  if (badge) {
    badge.textContent = staged ? "未保存" : "已保存";
    badge.classList.toggle("staged", staged);
  }
  if (notice) notice.hidden = !staged;
  const saveLabel = staged ? "保存当前构图" : "构图已保存";
  for (const button of [writeButton, keyframeShortcutTarget(sceneSidebarMode, selectedObject)?.kind === cameraEditKinds.setup
    ? document.getElementById("recordSelectedKeyframe") : null]) {
    if (!button) continue;
    button.disabled = !staged || !canAuthor();
    (button.querySelector("span") || button).textContent = saveLabel;
    button.title = staged ? "保存当前构图（K）" : "构图已保存";
  }
  if (createShotButton) {
    const state = cameraSetupShotCreationState(
      createShotButton.dataset.cameraSetupId || selectedCameraSetupID
    );
    createShotButton.disabled = !state.enabled;
    createShotButton.title = state.title;
  }
}

function updateSelectedCameraSetup(cameraSetupID, options = {}) {
  if (!canAuthor()) return;
  const setup = findCameraSetup(project, cameraSetupID);
  const staged = cameraEditSession.setupEdit(cameraSetupID);
  if (!setup || cameraSetupShortcutSelection()?.id !== cameraSetupID || !staged) {
    showToast("构图已保存");
    return;
  }
  if (!cameraSetupViewActive(cameraSetupID) && options.allowSceneWrite !== true) {
    void resolveCameraDraftConflict();
    return;
  }
  
  void commitProject(
    (current) => setCameraSetupDepthOfField(
      setCameraSetupAspectRatio(
        setCameraSetupPose(current, cameraSetupID, staged.pose),
        cameraSetupID,
        staged.aspectRatio
      ),
      cameraSetupID,
      staged.depthOfField
    ),
    "机位构图已保存",
    {
      beforeRender: () => {
        cameraEditSession.clear(cameraEditKinds.setup);
        
      },
      prominentToast: true,
    }
  );
}

function duplicateSelectedCameraSetup(cameraSetupID) {
  if (!canAuthor()) return;
  if (cameraEditSession.setupEdit()) {
    showToast("请先写入或放弃当前机位调整", true);
    return;
  }
  leaveCameraSetupScope(false, false);
  const beforeIDs = new Set(project.scene.cameraSetups.map((setup) => setup.id));
  project = projectState.commit(duplicateCameraSetup(project, cameraSetupID));
  selectedCameraSetupID = project.scene.cameraSetups.find((setup) => !beforeIDs.has(setup.id))?.id
    || selectedCameraSetupID;
  selectedObject = selectedCameraSetupID
    ? { kind: "cameraSetup", id: selectedCameraSetupID, parentID: null }
    : null;
  inspectorPanel = "camera";
  finishAuthoredChange("机位已复制");
}

function deleteSelectedCameraSetup(cameraSetupID) {
  if (!canAuthor() || project.scene.cameraSetups.length <= 1) return;
  if (cameraEditSession.setupEdit()) {
    showToast("请先写入或放弃当前机位调整", true);
    return;
  }
  const index = project.scene.cameraSetups.findIndex((setup) => setup.id === cameraSetupID);
  if (index < 0) return;
  
  leaveCameraSetupScope(false, false);
  project = projectState.commit(deleteCameraSetup(project, cameraSetupID));
  const fallback = project.scene.cameraSetups[Math.min(index, project.scene.cameraSetups.length - 1)]
    || project.scene.cameraSetups[0];
  selectedCameraSetupID = fallback?.id || null;
  selectedObject = selectedCameraSetupID
    ? { kind: "cameraSetup", id: selectedCameraSetupID, parentID: null }
    : null;
  
  finishAuthoredChange(
    "机位已删除"
  );
}

function renameSelectedCameraSetup(cameraSetupID, name) {
  if (!canAuthor()) return;
  project = projectState.commit(renameCameraSetup(project, cameraSetupID, name));
  finishAuthoredChange("机位已重命名");
}

function setCameraOperationMode(mode) {
  normalizeCameraOperationMode(mode);
  if (isExporting()) return;
  cameraOperationMode = cameraOperationModes.shot;
  if (playback.status === 'playing') playback.pause();
  playback.setDuration(activeTimelineDuration()); playback.reset();
  renderCameraWorkspace(); renderTransport(); syncRenderer();
}

function addNewShot() {
  if (!canAuthor()) return;
  setSceneSidebarMode("shots", { render: false });
  cancelStagedCameraEdit(false);
  const cameraPose = directorRenderer.captureSceneCameraPose();
  project = projectState.commit(addShot(project, { cameraPose }));
  selectedObject = findShot(project)
    ? { kind: "shot", id: findShot(project).id, parentID: null }
    : null;
  cameraKeyframeSelection.activeID = findShot(project)?.camera.track.keyframes[0]?.id || null;
  inspectorPanel = "camera";
  playback.reset();
  finishAuthoredChange("已从 Scene View 新建运镜");
}

function addNewShotFromCameraSetup(cameraSetupID) {
  const setup = findCameraSetup(project, cameraSetupID);
  if (!setup) return;
  const state = cameraSetupShotCreationState(setup.id);
  if (!state.enabled) {
    showToast(state.title, true);
    return;
  }
  setSceneSidebarMode("shots", { render: false });
  cancelStagedCameraEdit(false);
  project = projectState.commit(addShot(project, {
    cameraPose: setup.pose,
    aspectRatio: setup.aspectRatio,
    depthOfField: setup.depthOfField,
  }));
  const shot = findShot(project);
  selectedObject = shot
    ? { kind: "shot", id: shot.id, parentID: null }
    : null;
  cameraKeyframeSelection.activeID = shot?.camera.track.keyframes[0]?.id || null;
  inspectorPanel = "camera";
  playback.reset();
  finishAuthoredChange(`已从 ${setup.name} 创建运镜`);
  setEditViewMode("shot");
}

function selectShot(shotID, options = {}) {
  const target = findShot(project, shotID);
  if (!target) return;
  setSceneSidebarMode("shots", { render: false });
  if (findShot(project)?.id === shotID) {
    selectedObject = { kind: "shot", id: shotID, parentID: null };
    inspectorPanel = "camera";
    renderActors();
    renderInspectorTabs();
    renderInspector();
    renderCameraTimeline();
    syncRenderer();
    syncOperatorSelection();
    return;
  }
  if (!canAuthor() && options.allowActive !== true) return;
  cancelStagedCameraEdit(false);
  cameraKeyframeSelection.activeID = null;
  project = projectState.commit(setActiveShot(project, shotID));
  cameraKeyframeSelection.activeID = findShot(project)?.camera.track.keyframes[0]?.id || null;
  selectedObject = { kind: "shot", id: shotID, parentID: null };
  inspectorPanel = "camera";
  playback.reset();
  finishAuthoredChange("已切换运镜");
}

async function selectCameraWorkspaceShot(shotID) {
  if (viewportMode !== viewportModes.camera || isExporting() || playback.status === "playing") return;
  if (!findShot(project, shotID) || findShot(project)?.id === shotID) return;
  playback.reset();
  cameraKeyframeSelection.activeID = null;
  await commitProject(
    (current) => setActiveShot(current, shotID),
    "Camera 已切换 Shot",
    { allowInCamera: true }
  );
  const liveState = null;
  const track = activeCameraTrack();
  if (liveState?.vcamOnline) {
    {}
  } else if (cameraTrackReady(track)) {
    const pose = sampleShotCamera(project, findShot(project), 0, sampleInitialProject(project));
    directorRenderer.setCameraTrackPose(pose, {
      locked: false,
      rotationLocked: aimOrientationLocked(pose),
    });
  }
  renderCameraWorkspace();
}

function duplicateSelectedShot(shotID) {
  if (!canAuthor()) return;
  cancelStagedCameraEdit(false);
  cameraKeyframeSelection.activeID = null;
  project = projectState.commit(duplicateShot(project, shotID));
  selectedObject = findShot(project)
    ? { kind: "shot", id: findShot(project).id, parentID: null }
    : null;
  cameraKeyframeSelection.activeID = findShot(project)?.camera.track.keyframes[0]?.id || null;
  inspectorPanel = "camera";
  playback.reset();
  finishAuthoredChange("已复制运镜");
}

function deleteSelectedShot(shotID) {
  if (!canAuthor()) return;
  cancelStagedCameraEdit(false);
  cameraKeyframeSelection.activeID = null;
  project = projectState.commit(deleteShot(project, shotID));
  selectedObject = findShot(project)
    ? { kind: "shot", id: findShot(project).id, parentID: null }
    : null;
  cameraKeyframeSelection.activeID = findShot(project)?.camera.track.keyframes[0]?.id || null;
  playback.reset();
  finishAuthoredChange("已删除运镜，可使用撤销恢复");
}

function renameSelectedShot(shotID, name) {
  if (!canAuthor()) return;
  project = projectState.commit(renameShot(project, shotID, name));
  finishAuthoredChange("运镜已重命名");
}

async function createNewProject(options = {}) {
  const skipCurrentSave = options?.skipCurrentSave === true;
  
  const settings = await requestNewProjectSettings();
  if (settings === null) return;
  stopActionInspection(false);
  if (playback.status !== "idle") playback.reset();
  if (!skipCurrentSave && !await saveProjectNow(false)) {
    showToast("当前项目尚未保存，已取消新建", true);
    return;
  }
  project = createDesktopProject(settings);
  deferredExternalRevision = 0;
  persistedProjectRevision = 0;
  projectDirty = false;
  invalidateExportResult();
  resetViewportToEdit();
  directorRenderer.resetSceneView();
  authoredRevision += 1;
  projectState.reset(project);
  semanticBaselineProject = structuredClone(project);
  uiOperationHistory.reset();
  semanticOperationQueue.reset(project);
  selectedActorID = null;
  selectedObject = null;
  selectedPathPointID = null;
  selectedCameraSetupID = project.scene.cameraSetups[0]?.id || null;
  
  liveCaptureAspectRatio = project.output.defaultAspectRatio;
  
  inspectorPanel = "scene";
  playback.setDuration(settings.durationSeconds);
  renderAll();
  try {
    project = await projectAPI.save(project);
    persistedProjectRevision = Number(project.revision || 0);
    projectState.reset(project);
    semanticBaselineProject = structuredClone(project);
    semanticOperationQueue.reset(project);
    projectSummaries = await projectAPI.list();
    rememberLastOpenedProjectID(project.id);
    renderAll();
    showToast("已新建独立桌面项目");
  } catch (error) {
    setSaveState("保存失败", true);
    showToast(`新项目保存失败：${error.message}`, true);
  }
}

async function loadProject(id, options = {}) {
  const skipCurrentSave = options?.skipCurrentSave === true;
  if (!id || id === project.id) return;
  
  stopActionInspection(false);
  if (playback.status !== "idle") playback.reset();
  if (!skipCurrentSave && !await saveProjectNow(false)) {
    showToast("当前项目尚未保存，已取消切换", true);
    renderProjectSwitcher();
    return;
  }
  setSaveState("读取中");
  try {
    project = await projectAPI.load(id);
    deferredExternalRevision = 0;
    persistedProjectRevision = Number(project.revision || 0);
    projectDirty = false;
    invalidateExportResult();
    resetViewportToEdit();
    authoredRevision += 1;
    projectState.reset(project);
    semanticBaselineProject = structuredClone(project);
    uiOperationHistory.reset();
    semanticOperationQueue.reset(project);
    selectedActorID = project.scene.actors[0]?.id || null;
    selectedObject = selectedActorID
      ? { kind: "actor", id: selectedActorID, parentID: null }
      : null;
    selectedPathPointID = null;
    selectedCameraSetupID = project.scene.cameraSetups[0]?.id || null;
    
    liveCaptureAspectRatio = project.output.defaultAspectRatio;
    
    ensureCameraKeyframeSelection();
    playback.setDuration(rehearsalDuration());
    playback.reset();
    rememberLastOpenedProjectID(project.id);
    setSaveState("已读取");
    renderAll();
  } catch (error) {
    setSaveState("读取失败", true);
    showToast(`项目读取失败：${error.message}`, true);
    renderProjectSwitcher();
  }
}

function selectActor(actorID) {
  persistActorPoseDraft();
  if (!findActor(project, actorID)) return;
  stopActionInspection(false);
  setSceneSidebarMode("actors", { render: false });
  selectedActorID = actorID;
  selectedObject = { kind: "actor", id: actorID, parentID: null };
  selectedPathPointID = null;
  inspectorPanel = "actor";
  directorRenderer.setMovePlacement(false);
  renderActors();
  renderInspectorTabs();
  renderInspector();
  renderCameraTimeline();
  syncRenderer();
  syncOperatorSelection();
}

function selectSceneObject(selection, options = {}) {
  persistActorPoseDraft();
  if (!validSceneObjectSelection(selection)) return;
  stopActionInspection(false);
  setSceneSidebarMode("blockout", { render: false });
  selectedObject = {
    kind: selection.kind,
    id: selection.id,
    parentID: selection.parentID || null,
  };
  if (selection.kind === "environment") {
    if (options.preserveEnvironmentMulti !== true) {
      selectedEnvironmentIDs.clear();
      selectedEnvironmentIDs.add(selection.id);
    }
    if (options.updateEnvironmentAnchor !== false) environmentSelectionAnchorID = selection.id;
  } else {
    selectedEnvironmentIDs.clear();
    environmentSelectionAnchorID = null;
  }
  selectedActorID = null;
  selectedPathPointID = null;
  inspectorPanel = "object";
  if (selection.kind === "blockoutObject" && selection.parentID) {
    expandedBlockoutGroupIDs.add(selection.parentID);
  }
  if (selection.kind === "environmentGroup") expandedEnvironmentGroupIDs.add(selection.id);
  directorRenderer.setMovePlacement(false);
  renderActors();
  renderInspectorTabs();
  renderInspector();
  renderCameraTimeline();
  syncRenderer();
  syncOperatorSelection();
}

function validSceneObjectSelection(selection, sourceProject = project) {
  if (!selection || typeof selection !== "object") return false;
  if (selection.kind === "blockoutLayer") return true;
  if (selection.kind === "environment") {
    return sourceProject.scene.environment.visuals.some((visual) => visual.id === selection.id);
  }
  if (selection.kind === "environmentGroup") {
    return sourceProject.scene.environment.groups.some((group) => group.id === selection.id);
  }
  const groupID = selection.kind === "blockoutGroup" ? selection.id : selection.parentID;
  const group = sourceProject.scene.blockout.groups.find((candidate) => candidate.id === groupID);
  if (!group) return false;
  return selection.kind === "blockoutGroup"
    || selection.kind === "blockoutObject"
      && group.objects.some((object) => object.id === selection.id);
}

function inspectorPanelForSelection(selection = selectedObject) {
  if (["shot", "cameraSetup"].includes(selection?.kind)) return "camera";
  if (["actor", "pairedAction"].includes(selection?.kind)) return "actor";
  if (["environment", "environmentGroup", "blockoutGroup", "blockoutObject", "blockoutLayer"].includes(selection?.kind)) {
    return "object";
  }
  return "scene";
}

function setSelectedSceneObjectTransform(sourceProject, selection, pose) {
  {}
  if (selection.kind === "blockoutGroup") {
    return updateBlockoutGroup(sourceProject, selection.id, {
      position: pose.position,
      rotationY: pose.rotationY,
    });
  }
  if (selection.kind === "blockoutObject") {
    return updateBlockoutObject(sourceProject, selection.parentID, selection.id, {
      position: pose.position,
      rotationY: pose.rotationY,
    });
  }
  if (selection.kind === "environment") {
    const visual = sourceProject.scene.environment.visuals.find(
      (candidate) => candidate.id === selection.id
    );
    if (!visual) return sourceProject;
    const rotation = visualEnvironmentRotationDegrees(visual);
    return setVisualEnvironmentTransform(sourceProject, visual.id, {
      ...visual.transform,
      position: pose.position,
      quaternion: visualEnvironmentQuaternionFromRotationDegrees({
        pitch: rotation.pitch,
        yaw: pose.rotationY * 180 / Math.PI,
      }),
    });
  }
  if (selection.kind === "environmentGroup") {
    const group = sourceProject.scene.environment.groups.find(
      (candidate) => candidate.id === selection.id
    );
    if (!group) return sourceProject;
    const rotation = visualEnvironmentRotationDegrees(group);
    return updateVisualEnvironmentGroup(sourceProject, group.id, {
      transform: {
        ...group.transform,
        position: pose.position,
        quaternion: visualEnvironmentQuaternionFromRotationDegrees({
          pitch: rotation.pitch,
          yaw: pose.rotationY * 180 / Math.PI,
        }),
      },
    });
  }
  return sourceProject;
}

function setSceneSidebarMode(mode, options = {}) {
  const nextMode = ["actors", "setups", "shots", "blockout"].includes(mode) ? mode : "actors";
  const previousMode = sceneSidebarMode;
  if (previousMode === "setups" && nextMode !== "setups") {
    leaveCameraSetupScope(false, false);
  }
  sceneSidebarMode = nextMode;
  if (nextMode === "setups") {
    const setup = findCameraSetup(project, selectedCameraSetupID) || project.scene.cameraSetups[0];
    selectedCameraSetupID = setup?.id || null;
    selectedObject = setup ? { kind: "cameraSetup", id: setup.id, parentID: null } : null;
    selectedPathPointID = null;
    inspectorPanel = "camera";
  } else {
    if (nextMode === "actors") {
      const actor = findActor(project, selectedActorID) || project.scene.actors[0];
      selectedActorID = actor?.id || null;
      selectedObject = actor ? { kind: "actor", id: actor.id, parentID: null } : null;
      inspectorPanel = "actor";
    } else if (nextMode === "shots") {
      const shot = findShot(project);
      selectedObject = shot ? { kind: "shot", id: shot.id, parentID: null } : null;
      inspectorPanel = "camera";
    } else if (!validSceneObjectSelection(selectedObject)) {
      selectedObject = project.scene.environment.visuals[0]
        ? { kind: "environment", id: project.scene.environment.visuals[0].id, parentID: null }
        : { kind: "blockoutLayer", id: "blockout", parentID: null };
      selectedActorID = null;
      selectedPathPointID = null;
      inspectorPanel = "object";
    }
  }
  if (nextMode === "setups" && editViewMode === "shot" && viewportMode === viewportModes.edit) {
    setEditViewMode("scene");
  }
  if (options.render === false) return;
  renderActors();
  renderEditViewMode();
  renderInspectorTabs();
  renderInspector();
  renderCameraTimeline();
  renderTransport();
  syncRenderer();
  syncOperatorSelection();
}

function selectPathPoint(actorID, pointID) {
  const actor = findActor(project, actorID);
  if (!actor || !motionPathPoints(actor).some((point) => point.id === pointID)) return;
  stopActionInspection(false);
  setSceneSidebarMode("actors", { render: false });
  selectedActorID = actorID;
  selectedObject = { kind: "actor", id: actorID, parentID: null };
  selectedPathPointID = pointID;
  inspectorPanel = "actor";
  directorRenderer.setMovePlacement(false);
  renderActors();
  renderInspectorTabs();
  renderInspector();
  renderCameraTimeline();
  syncRenderer();
  requestAnimationFrame(() => {
    elements.inspectorContent.querySelector(`[data-motion-action-row="${CSS.escape(pointID)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
}

function clearPathPointSelection() {
  if (!selectedPathPointID) return;
  selectedPathPointID = null;
  renderInspector();
  syncRenderer();
}

function selectedPathHeightPoint(sourceProject = project) {
  const actor = selectedActorID ? findActor(sourceProject, selectedActorID) : null;
  const points = actor ? motionPathPoints(actor) : [];
  const point = pathHeightTargetPoint(points, selectedPathPointID);
  return actor && point ? { actor, point, points } : null;
}

function motionEntryHeightSelection(sourceProject, actor) {
  return null;
  if (!actor) return null;
  const phase = motionEntryPhaseAtFrame(
    actorPlaybackPlan(actor).phases,
    playback.elapsed,
    sourceProject.output.frameRate
  );
  const action = phase?.action;
  const height = motionPhaseEntryHeight(phase);
  if (!action || height == null) return null;

  const inheritedActions = actor.motionActions.map((candidate) => {
    if (candidate.id !== action.id) return candidate;
    const inherited = { ...candidate };
    delete inherited.entryHeightY;
    return inherited;
  });
  const inheritedPhase = actorPlaybackPlan({
    ...actor,
    motionActions: inheritedActions,
  }).phases.find((candidate) => (
    candidate.kind === phase.kind && candidate.action?.id === action.id
  ));
  const inheritedHeight = motionPhaseEntryHeight(inheritedPhase);
  return {
    kind: "entry",
    actor,
    action,
    phase,
    height,
    inheritedHeight,
    hasOverride: Number.isFinite(action.entryHeightY),
  };
}

function selectedPathHeightTarget(sourceProject = project) {
  const actor = selectedActorID ? findActor(sourceProject, selectedActorID) : null;
  if (!actor) return null;
  if (playback.status !== "playing") {
    const pathSelection = selectedPathHeightPoint(sourceProject);
    if (pathSelection) {
      return {
        kind: "path",
        ...pathSelection,
        height: Number(pathSelection.point.position.y || 0),
        inheritedHeight: previousPathHeight(
          pathSelection.points,
          pathSelection.point.id
        ),
      };
    }
  }
  return motionEntryHeightSelection(sourceProject, actor);
}

function editablePathHeightTarget(sourceProject = project) {
  const selection = selectedPathHeightTarget(sourceProject);
  if (
    !selection
    || viewportMode !== viewportModes.edit
    || editViewMode !== "scene"
    || !canAuthor()
    || actionInspection
    || directorRenderer.placingMove
    || selection.actor.locked
  ) {
    return null;
  }
  if (selection.kind === "path") {
    if (!canEditActorMotion() || selection.point.fixedByActionID) return null;
  }
  return selection;
}

function pathHeightTargetIdentity(selection) {
  if (!selection) return null;
  return selection.kind === "entry"
    ? { kind: "entry", actorID: selection.actor.id, actionID: selection.action.id }
    : { kind: "path", actorID: selection.actor.id, pointID: selection.point.id };
}

function applyPathHeightTarget(sourceProject, target, height) {
  if (!target) return sourceProject;
  if (target.kind === "entry") {
    return updateMotionAction(sourceProject, target.actorID, target.actionID, {
      entryHeightY: height,
    });
  }
  const actor = findActor(sourceProject, target.actorID);
  const point = actor
    ? motionPathPoints(actor).find((candidate) => candidate.id === target.pointID)
    : null;
  if (!point || !Number.isFinite(Number(height))) return sourceProject;
  return setPathPointPosition(
    sourceProject,
    target.actorID,
    target.pointID,
    { ...point.position, y: Number(height) }
  );
}

function pathHeightTargetValue(sourceProject, target) {
  if (!target) return null;
  if (target.kind === "entry") {
    const actor = findActor(sourceProject, target.actorID);
    const action = actor?.motionActions.find((candidate) => candidate.id === target.actionID);
    return Number.isFinite(action?.entryHeightY) ? Number(action.entryHeightY) : null;
  }
  const actor = findActor(sourceProject, target.actorID);
  const point = actor
    ? motionPathPoints(actor).find((candidate) => candidate.id === target.pointID)
    : null;
  const height = Number(point?.position?.y);
  return Number.isFinite(height) ? height : null;
}

function previewPathPointPosition(actorID, pointID, position) {
  stopActionInspection(false);
  if (!pathPointBaseProject) {
    pathPointBaseProject = projectState.current;
    authoredRevision += 1;
    cancelScheduledSave();
    setSaveState("未保存");
  }
  project = setPathPointPosition(pathPointBaseProject, actorID, pointID, position);
  renderInspector();
  syncRenderer();
}

function commitPathPointPosition(actorID, pointID, position) {
  const base = pathPointBaseProject || projectState.current;
  pathPointBaseProject = null;
  project = projectState.commit(setPathPointPosition(base, actorID, pointID, position));
  finishAuthoredChange("路径点位置已更新");
}

function commitPathHeightTarget(target, height) {
  const base = pathPointBaseProject || projectState.current;
  pathPointBaseProject = null;
  project = projectState.commit(applyPathHeightTarget(base, target, height));
  finishAuthoredChange(
    target.kind === "entry" ? "动作首帧高度已更新" : "路径点高度已更新"
  );
}

function renderPathHeightControl() {
  const selection = editablePathHeightTarget(project);
  elements.pathHeightControl.hidden = !selection;
  if (!selection) return;
  const height = selection.height;
  const inheritedHeight = selection.inheritedHeight;
  const describesStart = selection.kind === "entry"
    ? `“${desktopActions[selection.action.actionID]?.label || "动作"}”首帧`
    : selection.point.isStart
      ? "起点 1"
      : `到达点 ${selection.points.findIndex((point) => point.id === selection.point.id) + 1}`;
  elements.pathHeightTargetLabel.textContent = describesStart;
  if (!pathHeightDrag?.active && document.activeElement !== elements.pathHeightInput) {
    elements.pathHeightInput.value = height.toFixed(2);
  }
  elements.pathHeightInput.setAttribute(
    "aria-label",
    `${describesStart} Y 高度（米）`
  );
  elements.pathHeightScrubber.setAttribute(
    "aria-label",
    `上下拖动调整${describesStart}高度，当前 ${height.toFixed(2)} 米`
  );
  elements.pathHeightControl.setAttribute("aria-label", `${describesStart}高度`);
  elements.pathHeightMatchPerson.disabled = selection.kind === "entry"
    ? !selection.hasOverride
    : inheritedHeight == null || Math.abs(inheritedHeight - height) < 0.000001;
  elements.pathHeightMatchPerson.title = selection.kind === "entry"
    ? selection.hasOverride
      ? "恢复承接上一边界高度"
      : "已承接上一边界高度"
    : inheritedHeight == null
      ? "起点已经是人物高度"
      : "与上一点（人物）同高";
  elements.pathHeightMatchPerson.setAttribute(
    "aria-label",
    elements.pathHeightMatchPerson.title
  );
  elements.pathHeightGround.disabled = Math.abs(height) < 0.000001;
}

function wirePathHeightControl() {
  const matchPerson = elements.pathHeightMatchPerson;
  const scrubber = elements.pathHeightScrubber;
  const input = elements.pathHeightInput;
  const ground = elements.pathHeightGround;

  const releasePointer = (pointerID) => {
    if (scrubber.hasPointerCapture?.(pointerID)) scrubber.releasePointerCapture(pointerID);
  };
  const clearDragAppearance = () => {
    scrubber.removeAttribute("data-adjusting");
    document.body.classList.remove("adjusting-path-height");
  };
  const cancelDrag = () => {
    if (!pathHeightDrag) return;
    const drag = pathHeightDrag;
    pathHeightDrag = null;
    releasePointer(drag.pointerID);
    clearDragAppearance();
    if (!drag.active) return;
    pathPointBaseProject = null;
    project = drag.base;
    if (authoredRevision === drag.startAuthoredRevision + 1) {
      authoredRevision = drag.startAuthoredRevision;
    }
    setSaveState(drag.saveState.label, drag.saveState.error);
    renderInspector();
    syncRenderer();
  };
  const commitDrag = () => {
    if (!pathHeightDrag) return;
    const drag = pathHeightDrag;
    pathHeightDrag = null;
    releasePointer(drag.pointerID);
    clearDragAppearance();
    if (!drag.active) return;
    const currentHeight = pathHeightTargetValue(project, drag.target);
    commitPathHeightTarget(
      drag.target,
      currentHeight == null ? drag.height : currentHeight
    );
  };

  scrubber.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pathHeightDrag || pathPointBaseProject) return;
    const selection = editablePathHeightTarget(projectState.current);
    if (!selection) return;
    scrubber.focus({ preventScroll: true });
    pathHeightDrag = {
      target: pathHeightTargetIdentity(selection),
      pointerID: event.pointerId,
      startClientY: event.clientY,
      startHeight: selection.height,
      height: selection.height,
      base: projectState.current,
      startAuthoredRevision: authoredRevision,
      active: false,
      saveState: {
        label: elements.projectState.textContent,
        error: elements.projectState.classList.contains("error"),
      },
    };
    scrubber.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  scrubber.addEventListener("pointermove", (event) => {
    const drag = pathHeightDrag;
    if (!drag || event.pointerId !== drag.pointerID) return;
    const upwardPixels = drag.startClientY - event.clientY;
    if (!drag.active && Math.abs(upwardPixels) < 3) return;
    if (!drag.active) {
      drag.active = true;
      pathPointBaseProject = drag.base;
      authoredRevision += 1;
      cancelScheduledSave();
      setSaveState("未保存");
      scrubber.dataset.adjusting = "true";
      document.body.classList.add("adjusting-path-height");
    }
    drag.height = pathHeightFromDrag(
      drag.startHeight,
      upwardPixels,
      event.shiftKey
    );
    project = applyPathHeightTarget(drag.base, drag.target, drag.height);
    input.value = drag.height.toFixed(2);
    syncRenderer();
    event.preventDefault();
  });

  scrubber.addEventListener("pointerup", (event) => {
    if (!pathHeightDrag || event.pointerId !== pathHeightDrag.pointerID) return;
    commitDrag();
    event.preventDefault();
  });
  scrubber.addEventListener("pointercancel", cancelDrag);
  scrubber.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && pathHeightDrag?.active) {
      event.preventDefault();
      cancelDrag();
      return;
    }
    if (event.repeat) return;
    const selection = editablePathHeightTarget(projectState.current);
    const height = pathHeightFromKey(
      selection?.height,
      event.key,
      event.shiftKey
    );
    if (!selection || height == null) return;
    event.preventDefault();
    void commitProject(
      (current) => {
        const currentSelection = editablePathHeightTarget(current);
        if (!currentSelection) return current;
        return applyPathHeightTarget(
          current,
          pathHeightTargetIdentity(currentSelection),
          height
        );
      },
      selection.kind === "entry" ? "动作首帧高度已更新" : "路径点高度已更新"
    );
  });

  matchPerson.addEventListener("click", () => {
    if (pathHeightDrag || pathPointBaseProject) return;
    const targetKind = editablePathHeightTarget(project)?.kind;
    void commitProject(
      (current) => {
        const selection = editablePathHeightTarget(current);
        if (!selection) return current;
        return applyPathHeightTarget(
          current,
          pathHeightTargetIdentity(selection),
          selection.kind === "entry" ? null : selection.inheritedHeight
        );
      },
      targetKind === "entry" ? "动作已恢复承接高度" : "路径点已与上一点同高"
    );
  });

  ground.addEventListener("click", () => {
    if (pathHeightDrag || pathPointBaseProject) return;
    const targetKind = editablePathHeightTarget(project)?.kind;
    void commitProject(
      (current) => {
        const selection = editablePathHeightTarget(current);
        if (!selection) return current;
        return applyPathHeightTarget(
          current,
          pathHeightTargetIdentity(selection),
          0
        );
      },
      targetKind === "entry" ? "动作首帧已落到地面" : "路径点已落到地面"
    );
  });

  input.addEventListener("change", () => {
    const height = Number(input.value);
    const selection = editablePathHeightTarget(project);
    if (!selection || !Number.isFinite(height)) {
      input.value = Number(selection?.height || 0).toFixed(2);
      renderPathHeightControl();
      return;
    }
    void commitProject(
      (current) => {
        const currentSelection = editablePathHeightTarget(current);
        if (!currentSelection) return current;
        return applyPathHeightTarget(
          current,
          pathHeightTargetIdentity(currentSelection),
          height
        );
      },
      selection.kind === "entry" ? "动作首帧高度已更新" : "路径点高度已更新"
    );
  });
  wireProjectNumberScrub(
    input,
    (base, height) => {
      const selection = editablePathHeightTarget(base);
      if (!selection) return base;
      return applyPathHeightTarget(
        base,
        pathHeightTargetIdentity(selection),
        height
      );
    },
    "高度已更新",
    { precision: 2 }
  );

  window.addEventListener("blur", cancelDrag);
}

async function commitProject(operation, message, options = {}) {
  if (cameraOrbitDraft) cancelCameraOrbitPreview(false, false);
  const cameraEditAllowed = options.cameraEdit === true && canEditCamera();
  if ((!canAuthor() && !options.allowInCamera && !cameraEditAllowed)) {
    return false;
  }
  const preserveInspection = Boolean(
    options.preserveInspectionFor
    && actionInspection?.actorID === options.preserveInspectionFor.actorID
    && actionInspection?.actionID === options.preserveInspectionFor.actionID
  );
  const next = operation(project);
  if (!preserveInspection) stopActionInspection(false);
  project = projectState.commit(next);
  if (preserveInspection) refreshActionInspectionSample();
  options.beforeRender?.(project);
  finishAuthoredChange(message || "项目已更新", {
    prominentToast: options.prominentToast === true,
  });
  if (options.inspectAfterCommit) {
    startActionInspection(
      options.inspectAfterCommit.actorID,
      options.inspectAfterCommit.actionID
    );
  }
  return true;
}

function requestNewProjectSettings() {
  const dialog = document.getElementById("newProjectDialog");
  const name = document.getElementById("newProjectName");
  const aspectRatio = document.getElementById("newProjectAspectRatio");
  const frameRate = document.getElementById("newProjectFrameRate");
  const duration = document.getElementById("newProjectDuration");
  name.value = "桌面项目 " + (projectSummaries.length + 1);
  aspectRatio.innerHTML = desktopAspectRatios.map(aspect => '<option value="'+aspect+'">'+aspect+'</option>').join("");
  aspectRatio.value = "16:9";
  frameRate.innerHTML = desktopFrameRates.map(rate => '<option value="'+rate+'">'+rate+' fps</option>').join("");
  frameRate.value = "30";
  duration.value = "20";
  enhanceAllSelects();
  dialog.returnValue = "";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      if (dialog.returnValue !== "create") { resolve(null); return; }
      resolve({name:name.value.trim(), defaultAspectRatio:aspectRatio.value, frameRate:Number(frameRate.value), durationSeconds:Number(duration.value)});
    }, {once:true});
    dialog.showModal();
  });
}

function requestSemanticConflictResolution({ conflicts, transaction }) {
  const dialog = elements.semanticConflictDialog;
  const labels = [...new Set(conflicts.map((conflict) => semanticPathLabel(conflict.path)))];
  elements.semanticConflictDescription.textContent = `其他窗口或工具也修改了“${transaction.label}”涉及的内容。请选择保留哪一份。`;
  elements.semanticConflictFields.innerHTML = labels
    .slice(0, 8)
    .map((label) => `<li>${escapeHTML(label)}</li>`)
    .join("");
  if (labels.length > 8) {
    elements.semanticConflictFields.insertAdjacentHTML(
      "beforeend",
      `<li>另有 ${labels.length - 8} 个字段</li>`,
    );
  }
  dialog.returnValue = "";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "ui" ? "ui" : "external");
    }, { once: true });
    dialog.showModal();
  });
}

function finishAuthoredChange(message, options = {}) {
  const inspectorScrollTop = elements.inspectorContent.scrollTop;
  if (!cameraOrbitDraft) cameraOrbitForm = null;
  invalidateExportResult();
  authoredRevision += 1;
  playback.setDuration(activeTimelineDuration());
  ensureSelection();
  ensureCameraKeyframeSelection();
  ensureValidEditViewMode();
  renderAll();
  elements.inspectorContent.scrollTop = inspectorScrollTop;
  syncRenderer();
  if (inspectorPanel === "camera") updateCameraKeyframeInspectorState();
  if (options.persisted) {
    semanticBaselineProject = structuredClone(project);
    if (!semanticOperationQueue.active) semanticOperationQueue.reset(project);
    projectDirty = false;
    setSaveState("已保存");
  } else {
    const baseProject = semanticBaselineProject;
    const forward = semanticPatchBetween(baseProject, project);
    if (forward.length) {
      const inverse = invertSemanticPatch(baseProject, project);
      const historyID = globalThis.crypto?.randomUUID?.()
        || `ui-operation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      uiOperationHistory.record({
        id: historyID,
        label: message || "项目操作",
        forward,
        inverse,
        beforeProject: baseProject,
        afterProject: project,
      });
      semanticBaselineProject = structuredClone(project);
      projectDirty = true;
      void semanticOperationQueue.enqueue({
        baseProject,
        nextProject: project,
        changes: forward,
        inverse,
        label: message || "项目操作",
      }).then((result) => {
        if (result.dropped || result.failed) {
          uiOperationHistory.remove(historyID);
          renderTransport();
        }
      });
    }
  }
  syncOperatorSelection();
  if (message) showToast(message, false, {
    prominent: options.prominentToast === true,
  });
}

function invalidateExportResult() {
  exportState = {
    ...exportState,
    status: "idle",
    taskID: null,
    completedFrames: 0,
    frameCount: 0,
    cancelRequested: false,
    lastResult: null,
    error: null,
  };
}

function ensureSelection() {
  const environmentIDs = new Set(project.scene.environment.visuals.map((visual) => visual.id));
  for (const id of selectedEnvironmentIDs) {
    if (!environmentIDs.has(id)) selectedEnvironmentIDs.delete(id);
  }
  const setupEditTargetID = cameraEditSession.setupEdit()?.targetID
    || cameraEditSession.viewingSetupID;
  if (setupEditTargetID && !findCameraSetup(project, setupEditTargetID)) {
    cameraEditSession.leaveSetupScope();
  }
  if (!findCameraSetup(project, selectedCameraSetupID)) {
    selectedCameraSetupID = project.scene.cameraSetups[0]?.id || null;
  }
  
  if (selectedObject?.kind === "actor") {
    const actor = findActor(project, selectedObject.id);
    selectedActorID = actor?.id || null;
    if (!actor) selectedObject = null;
    else {
      if (selectedPathPointID && !motionPathPoints(actor).some((point) => point.id === selectedPathPointID)) {
        selectedPathPointID = null;
      }
      return;
    }
  }
  
  if (selectedObject?.kind === "cameraSetup" && findCameraSetup(project, selectedObject.id)) {
    selectedCameraSetupID = selectedObject.id;
    return;
  }
  if (selectedObject?.kind === "shot" && findShot(project, selectedObject.id)) return;
  if (["environment", "environmentGroup", "blockoutLayer", "blockoutGroup", "blockoutObject"].includes(selectedObject?.kind)) {
    if (validSceneObjectSelection(selectedObject)) return;
    selectedObject = null;
  }
  const actor = selectedActorID ? findActor(project, selectedActorID) : null;
  if (actor && !selectedObject) {
    selectedObject = { kind: "actor", id: actor.id, parentID: null };
    if (selectedPathPointID && !motionPathPoints(actor).some((point) => point.id === selectedPathPointID)) {
      selectedPathPointID = null;
    }
    return;
  }
  selectedActorID = project.scene.actors[0]?.id || null;
  selectedObject = selectedActorID
    ? { kind: "actor", id: selectedActorID, parentID: null }
    : null;
  selectedPathPointID = null;
}

function ensureCameraKeyframeSelection() {
  const shot = findShot(project);
  const shotEdit = cameraEditSession.shotEdit();
  if (shotEdit && shotEdit.targetID !== shot?.id) {
    cameraEditSession.clear(cameraEditKinds.shot);
    delete elements.appShell.dataset.cameraEdit;
  }
  const track = activeCameraTrack();
  if (!cameraTrackReady(track)) {
    cameraKeyframeSelection.activeID = null;
    cameraEditSession.clear(cameraEditKinds.shot);
    delete elements.appShell.dataset.cameraEdit;
    return;
  }
  if (track.keyframes.some((keyframe) => keyframe.id === cameraKeyframeSelection.activeID)) return;
  cameraKeyframeSelection.activeID = cameraKeyframeAtTime(track, playback.elapsed, project.output.frameRate)?.id
    || track.keyframes[0]?.id
    || null;
}

async function undo() {
  if (actorPoseDraft) { cancelActorPoseDraft(); return; }
  if (!(canAuthor() || canEditCamera()) || !uiOperationHistory.canUndo) return;
  cancelActiveCameraEdit(false);
  stopActionInspection(false);
  await semanticOperationQueue.flush();
  const entry = uiOperationHistory.peekUndo();
  if (!entry) return;
  const baseProject = project;
  const nextProject = applySemanticProjectPatch(baseProject, entry.inverse);
  project = projectState.replace(nextProject);
  semanticBaselineProject = structuredClone(project);
  renderSemanticProjectState();
  const result = await semanticOperationQueue.enqueue({
    baseProject,
    nextProject,
    changes: entry.inverse,
    inverse: entry.forward,
    conflictBaseProject: entry.afterProject,
    label: `撤销：${entry.label}`,
  });
  if (!result.failed) uiOperationHistory.commitUndo();
  renderTransport();
  if (!result.failed) showToast(result.dropped ? "已保留外部更新" : "已撤销");
}

async function redo() {
  if (actorPoseDraft) cancelActorPoseDraft();
  if (!(canAuthor() || canEditCamera()) || !uiOperationHistory.canRedo) return;
  cancelActiveCameraEdit(false);
  stopActionInspection(false);
  await semanticOperationQueue.flush();
  const entry = uiOperationHistory.peekRedo();
  if (!entry) return;
  const baseProject = project;
  const nextProject = applySemanticProjectPatch(baseProject, entry.forward);
  project = projectState.replace(nextProject);
  semanticBaselineProject = structuredClone(project);
  renderSemanticProjectState();
  const result = await semanticOperationQueue.enqueue({
    baseProject,
    nextProject,
    changes: entry.forward,
    inverse: entry.inverse,
    conflictBaseProject: entry.beforeProject,
    label: `重做：${entry.label}`,
  });
  if (!result.failed) uiOperationHistory.commitRedo();
  renderTransport();
  if (!result.failed) showToast(result.dropped ? "已保留外部更新" : "已重做");
}

function cancelScheduledSave() {
  // Kept as a compatibility hook for the Live transaction helper. Semantic
  // operations submit immediately, so there is no debounce timer to cancel.
}

async function saveProjectNow(showConfirmation) {
  persistActorPoseDraft();
  const saved = await semanticOperationQueue.flush();
  if (saved && showConfirmation) showToast("项目已保存");
  return saved;
}

function acceptSemanticQueueProject(nextProject) {
  if (nextProject.id !== project.id) return;
  const inspectorScrollTop = elements.inspectorContent.scrollTop;
  const activeBase = transformBaseProject
    || pathPointBaseProject
    || cameraKeyframeBaseProject
    || cameraAimBaseProject;
  if (activeBase) {
    const previewChanges = semanticPatchBetween(activeBase, project);
    project = applySemanticProjectPatch(nextProject, previewChanges);
    if (transformBaseProject) transformBaseProject = structuredClone(nextProject);
    if (pathPointBaseProject) pathPointBaseProject = structuredClone(nextProject);
    if (cameraKeyframeBaseProject) cameraKeyframeBaseProject = structuredClone(nextProject);
    if (cameraAimBaseProject) cameraAimBaseProject = structuredClone(nextProject);
  } else {
    project = nextProject;
  }
  semanticBaselineProject = structuredClone(nextProject);
  persistedProjectRevision = Number(nextProject.revision || persistedProjectRevision);
  projectDirty = semanticOperationQueue.pending.length > 0;
  projectState.replace(project);
  renderSemanticProjectState();
  elements.inspectorContent.scrollTop = inspectorScrollTop;
  projectAPI.list().then((summaries) => {
    projectSummaries = summaries;
    renderProjectSwitcher();
  }).catch(() => {});
}

function renderSemanticProjectState() {
  playback.setDuration(activeTimelineDuration());
  ensureSelection();
  ensureCameraKeyframeSelection();
  ensureValidEditViewMode();
  renderAll();
  syncRenderer();
  if (inspectorPanel === "camera") updateCameraKeyframeInspectorState();
}

function ensureValidEditViewMode() {
  if (editViewMode !== "shot" || cameraTrackReady(activeCameraTrack())) return;
  editViewMode = "scene";
  directorRenderer.setEditViewMode("scene");
}

async function chooseProjectOutputFolder(showConfirmation = false) {
  if (isExporting()) return null;
  elements.chooseOutputFolder.disabled = true;
  try {
    const result = await projectAPI.chooseOutputFolder();
    if (!result?.folder) return null;
    await commitProject(
      (current) => setProjectOutputFolder(current, result.folder),
      showConfirmation ? "输出文件夹已更新" : null,
      { allowInCamera: true }
    );
    return result.folder;
  } catch (error) {
    if (!String(error.message).includes("取消")) showToast(`无法选择输出文件夹：${error.message}`, true);
    return null;
  } finally {
    renderCameraWorkspace();
  }
}

async function revealCurrentOutput() {
  const path = exportState.lastResult?.outputPath || project.output.folder;
  if (!path) return;
  try {
    await projectAPI.revealOutput(path);
  } catch (error) {
    showToast(`无法在文件夹中显示：${error.message}`, true);
  }
}

function requestCameraExportCancel() {
  if (!isExporting() || ["encoding", "building-blend"].includes(exportState.status)) return;
  exportState.cancelRequested = true;
  exportState.status = "cancelling";
  renderCameraWorkspace();
}

async function exportSelectedShotMP4() {
  if (viewportMode !== viewportModes.camera || isExporting()) return;
  const shot = findShot(project);
  if (!shot || !cameraTrackReady(shot.camera.track)) {
    showToast("当前 Shot 没有可输出的摄影机轨道", true);
    return;
  }
  let outputFolder = project.output.folder;
  if (!outputFolder) outputFolder = await chooseProjectOutputFolder(false);
  if (!outputFolder) return;

  const resolution = selectedShotOutputResolution();
  if (!validH264Resolution(resolution)) {
    showToast("H.264 输出宽高必须是 16～16384 范围内的偶数", true);
    return;
  }

  if (playback.status === "playing") playback.pause();
  playback.reset();
  const snapshot = structuredClone(project);
  const snapshotShot = findShot(snapshot);
  const duration = shotOutputDuration(snapshot, snapshotShot);
  const frameRate = snapshot.output.frameRate;
  const frameCount = outputFrameCount(duration, frameRate);
  exportState = {
    ...exportState,
    status: "preparing",
    taskID: null,
    completedFrames: 0,
    frameCount,
    cancelRequested: false,
    error: null,
  };
  renderCameraWorkspace();

  try {
    const result = await renderShotMP4({
      renderer: directorRenderer,
      api: projectAPI,
      snapshot,
      resolution,
      cancelled: () => exportState.cancelRequested,
      onProgress: (progress) => {
        const statusChanged = exportState.status !== progress.status;
        exportState = { ...exportState, ...progress };
        if (statusChanged) renderCameraWorkspace();
        else updateCameraExportProgress();
      },
    });
    exportState = {
      ...exportState,
      status: "success",
      taskID: null,
      lastResult: result,
      error: null,
    };
    showToast(`MP4 已生成：${result.fileName}`);
  } catch (error) {
    const cancelled = error?.name === "AbortError";
    exportState = {
      ...exportState,
      status: cancelled ? "cancelled" : "error",
      taskID: null,
      error: cancelled ? null : error.message,
    };
    showToast(cancelled ? "已取消本次 MP4 输出" : `MP4 输出失败：${error.message}`, !cancelled);
  } finally {
    exportState.cancelRequested = false;
    playback.reset();
    syncRenderer();
    renderCameraWorkspace();
  }
}

function isExporting() {
  return ["preparing", "rendering", "encoding", "baking-blend", "building-blend", "cancelling"].includes(exportState.status);
}

function handlePlaybackChange(state) {
  if(actorPoseDraft && (state.status==='playing' || Math.round(state.elapsed*project.output.frameRate)!==Math.round(actorPoseDraft.time*project.output.frameRate)))persistActorPoseDraft();
  const sourceProject = cameraPreviewProject();
  const samples = state.status === "idle"
    ? sampleInitialProject(sourceProject)
    : sampleProject(sourceProject, state.elapsed);
  directorRenderer.sync(sourceProject, samples, {
    selectedActorID,
    selectedObject,
    selectedPathPointID,
    sceneObjectSelectionEnabled: sceneSidebarMode === "blockout",
    playbackStatus: state.status,
    timelineSeeking: state.seeking === true,
    editable: canAuthor(),
    actorMotionEditable: canEditActorMotion(),
    shotCameraEditable: canEditCamera(),
    previewActive: false,
    authoringGuidesVisible: viewportMode === viewportModes.edit && editViewMode === "scene",
  });
  applyCameraTrackPrototype(state, samples);
  syncCameraAuthoringGuides(state, samples);
  if (state.status !== renderedPlaybackStatus) {
    renderedPlaybackStatus = state.status;
    renderInspector();
    if (!timelineScrubbing) renderCameraTimeline();
  }
  renderTransport();
  renderPathHeightControl();
  syncActorPoseFields();
  updateCameraTimelineProgress(state);
  if (state.status === "completed") {
    const label = viewportMode === viewportModes.camera ? "摄影机取景预演" : "场景预演";
    showToast(`${label}完成 · R 可重置时间轴`);
  }
}

function rehearsalDuration() {
  return Math.max(Number(cameraPreviewProject().scene.duration?.seconds || 0), 0);
}

function activeTimelineDuration() {
  if (viewportMode !== viewportModes.camera) return rehearsalDuration();
  return shotOutputDuration(cameraPreviewProject(), findShot(project));
}

function currentCameraWorkspacePreview(elapsed = playback.elapsed, samples = currentProjectSamples(elapsed,playback.status)) {
  const shot = findShot(project);
  return cameraWorkspacePreview('shot',{ shotPose: cameraTrackReady(shot?.camera?.track) ? sampleShotCamera(project,shot,elapsed,samples) : null,
    shotAspect: shot?.aspectRatio || project.output.defaultAspectRatio });
}

function applyCameraTrackPrototype(state, samples = currentProjectSamples(state.elapsed, state.status)) {
  // Camera shows the independent Live setup/pose while paired. Edit continues
  // to show the selected authored Shot; the offscreen phone stream keeps its
  // own temporary camera pose and therefore never follows active Shot changes.
  const liveState = null;
  if (liveState?.vcamOnline) {
    {}
  } else {
    {}
  }
  
  const sourceProject = cameraPreviewProject();
  const sourceShot = findShot(sourceProject, findShot(project)?.id);
  const track = sourceShot?.camera?.track || createCameraTrack();
  if (!cameraTrackReady(track)) {
    directorRenderer.clearCameraTrackPose();
    return;
  }
  const sourceSamples = sourceProject === project
    ? samples
    : currentProjectSamples(state.elapsed, state.status, sourceProject);
  const shotEdit = activeShotCameraEdit();
  const sample = shotEdit?.project && editViewMode === "shot" && state.status !== "playing"
    ? sampleStagedCameraEdit(state.elapsed, state.status)
    : sampleShotCamera(sourceProject, sourceShot, state.elapsed, sourceSamples);
  directorRenderer.setCameraTrackPose(sample, {
    locked: (viewportMode === viewportModes.camera || editViewMode === "shot") && state.status === "playing",
    rotationLocked: aimOrientationLocked(sample),
  });
}

function syncCameraAuthoringGuides(state = playback, samples = currentProjectSamples(state.elapsed, state.status)) {
  const sourceProject = cameraPreviewProject();
  const shot = findShot(sourceProject, findShot(project)?.id);
  const track = shot?.camera?.track || createCameraTrack();
  const sourceSamples = sourceProject === project
    ? samples
    : currentProjectSamples(state.elapsed, state.status, sourceProject);
  const guideTrack = cameraGuideTrack(track, sourceProject, shot);
  const ready = cameraTrackReady(track);
  const elapsed = state?.status === "idle" ? 0 : Number(state?.elapsed ?? playback.elapsed ?? 0);
  const pose = ready
    ? sampleShotCamera(sourceProject, shot, elapsed, sourceSamples)
    : guideTrack.start || guideTrack.end;
  directorRenderer.setCameraTrackGuide(guideTrack, {
    visible: editViewMode === "scene" && cameraAuthoringGuidesVisible(viewportMode, guideTrack),
    pose,
    aspectRatio: shot?.aspectRatio || sourceProject.output.defaultAspectRatio,
    selectedKeyframeID: cameraKeyframeSelection.activeID,
    selectable: viewportMode === viewportModes.edit && editViewMode === "scene",
    editable: canEditCamera(),
  });
  const selectedKeyframe = track.keyframes.find((candidate) => candidate.id === cameraKeyframeSelection.activeID) || null;
  const selectedAim = selectedKeyframe
    ? effectiveCameraAim(track, selectedKeyframe.time)
    : normalizeCameraAim();
  const orbitWorldCenterVisible = inspectorPanel === "camera"
    && Boolean(cameraOrbitForm && shot && cameraOrbitForm.shotID === shot.id)
    && !cameraOrbitForm.targetValue.startsWith("actor:")
    && resolveCameraOrbitCenter(cameraOrbitForm, sourceProject);
  directorRenderer.setCameraAimTargetGuides([{
    keyframeID: selectedKeyframe?.id || null,
    position: cameraAimTargetPosition(sourceProject, sourceSamples, selectedAim),
    visible: editViewMode === "scene" && (
      selectedAim.mode === "look-at" && selectedAim.targetKind !== "actor"
    ),
    editable: canEditCamera(),
  }, {
    keyframeID: "camera-orbit-center",
    position: orbitWorldCenterVisible,
    visible: editViewMode === "scene" && Boolean(orbitWorldCenterVisible)
      && (cameraOrbitExpanded || Boolean(cameraOrbitDraft)),
    editable: canEditCameraOrbit(),
  }]);
}

function resetViewportToEdit() {
  viewportMode = viewportModes.edit;
  editViewMode = "scene";
  sceneSidebarMode = "actors";
  cameraKeyframeSelection.activeID = null;
  cameraEditSession.reset();
  cameraOrbitDraft = null;
  cameraOrbitForm = null;
  cameraKeyframeBaseProject = null;
  cameraAimBaseProject = null;
  delete elements.appShell.dataset.cameraEdit;
  directorRenderer.setViewportMode(viewportModes.edit);
  directorRenderer.setEditViewMode("scene");
  directorRenderer.clearCameraTrackPose();
  {}
  elements.appShell.classList.remove("camera-workspace");
  mountViewportForMode(viewportModes.edit);
}

function activeCameraTrack() {
  return findShot(project)?.camera?.track || createCameraTrack();
}

function activeShotCameraEdit() {
  const shot = findShot(project);
  return shot ? cameraEditSession.shotEdit(shot.id) : null;
}

function cameraPreviewProject() {
  const base=cameraOrbitDraft?.project || rebaseShotCameraEditProject() || project;
  if(!actorPoseDraft || actorPoseDraft.projectID!==base.id)return base;
  return {...base,scene:{...base.scene,actors:base.scene.actors.map(actor=>actor.id===actorPoseDraft.actorID
    ?{...actor,poseTrack:recordActorPose(actor.poseTrack,actorPoseDraft.time,actorPoseDraft.pose,base.output.frameRate)}:actor)}};
}

function rebaseShotCameraEditProject(edit = activeShotCameraEdit()) {
  const activeShot = findShot(project);
  const draftShot = edit?.project ? findShot(edit.project, activeShot?.id) : null;
  if (!activeShot || !draftShot?.camera?.track) return null;
  return setShotCameraTrack(project, activeShot.id, draftShot.camera.track);
}

function currentProjectSamples(elapsed = playback.elapsed, status = playback.status, sourceProject = project) {
  return status === "idle"
    ? sampleInitialProject(sourceProject)
    : sampleProject(sourceProject, elapsed);
}

function sampleStagedCameraEdit(elapsed = playback.elapsed, status = playback.status) {
  const edit = activeShotCameraEdit();
  if (!edit?.project) return null;
  const sourceProject = rebaseShotCameraEditProject(edit) || edit.project;
  const sourceShot = findShot(sourceProject, findShot(project)?.id);
  if (!sourceShot) return null;
  return sampleShotCamera(
    sourceProject,
    sourceShot,
    elapsed,
    currentProjectSamples(elapsed, status, sourceProject)
  );
}

function authoredCameraPoseFromVisible(
  visiblePose,
  shot = findShot(project),
  elapsed = playback.elapsed,
  samples = currentProjectSamples(elapsed),
  previousAuthoredPose = null
) {
  if (!visiblePose || !shot?.camera?.track) return visiblePose;
  const unmodifiedPose = removeCameraHandheld(shot, visiblePose, elapsed);
  const base = sampleCameraTrack(shot.camera.track, elapsed);
  const aim = effectiveCameraAim(shot.camera.track, elapsed);
  const sampled = base
    ? applyShotCameraConstraints(project, shot, base, elapsed, samples)
    : null;
  const translation = sampled?.followEvaluation?.translation;
  const authoredPose = translation
    ? {
        ...unmodifiedPose,
        position: {
          x: unmodifiedPose.position.x - translation.x,
          y: unmodifiedPose.position.y - translation.y,
          z: unmodifiedPose.position.z - translation.z,
        },
      }
    : unmodifiedPose;
  return (aim.mode === "look-at" || aimOrientationLocked(sampled)) && base
    ? {
        ...authoredPose,
        quaternion: setCameraOpticalRollDegrees(
          previousAuthoredPose?.quaternion || base.quaternion,
          cameraOpticalRollDegrees(unmodifiedPose.quaternion)
        ),
      }
    : authoredPose;
}

function effectiveCameraAim(trackInput, elapsedInput = 0) {
  return effectiveCameraAimState(trackInput, elapsedInput).aim;
}

function aimStateDisplayLabel(aim) {
  if (aim?.mode !== "look-at") return "自由旋转";
  if (aim.targetKind === "world") return "场景自定义点";
  if (aim.targetKind === "environment") return project.scene.environment.visuals.find((visual) => visual.id === aim.environmentID)?.name || "目标已删除";
  const index = project.scene.actors.findIndex((actor) => actor.id === aim.targetActorID);
  const actorLabel = index >= 0 ? `演员 ${String(index + 1).padStart(2, "0")}` : "目标已删除";
  return `${actorLabel}·${cameraAimHeightLabel(aim.actorHeight)}`;
}

function cameraHandheldIntensityLabel(intensity) {
  if (intensity === "subtle") return "轻微";
  if (intensity === "standard") return "标准";
  if (intensity === "strong") return "强烈";
  return "无";
}

function cameraAimHeightLabel(heightInput, includePercent = false) {
  const height = Math.max(0, Math.min(Number(heightInput) || 0, 1));
  const presets = [
    [cameraAimActorHeightPresets.ground, "脚底"],
    [cameraAimActorHeightPresets.pelvis, "骨盆"],
    [cameraAimActorHeightPresets.chest, "胸口"],
    [cameraAimActorHeightPresets.head, "头顶"],
  ];
  const preset = presets.find(([value]) => Math.abs(value - height) <= 0.012);
  const percent = `${Math.round(height * 100)}%`;
  if (!preset) return percent;
  return includePercent ? `${preset[1]} · ${percent}` : preset[1];
}

function snapCameraAimHeight(heightInput) {
  const height = Math.max(0, Math.min(Number(heightInput) || 0, 1));
  const preset = Object.entries(cameraAimActorHeightPresets)
    .find(([, value]) => Math.abs(value - height) <= 0.012);
  return preset ? { anchor: preset[0], actorHeight: preset[1] } : { anchor: "custom", actorHeight: height };
}

function aimTransitionDisplayLabel(transition) {
  const progress = `${Math.round(transition.progress * 100)}%`;
  if (transition.kind === "tracking-catchup") {
    return `${aimStateDisplayLabel(transition.toAim)} · 收敛到精确锁定 · ${progress}`;
  }
  return `${aimStateDisplayLabel(transition.fromAim)} → ${aimStateDisplayLabel(transition.toAim)} · ${progress}`;
}

function effectiveCameraAimState(trackInput, elapsedInput = 0) {
  const track = createCameraTrack(trackInput);
  const elapsed = Math.min(
    Math.max(Number(elapsedInput || 0), 0),
    cameraTrackDuration(track)
  );
  const keyframe = [...track.keyframes]
    .reverse()
    .find((candidate) => candidate.time <= elapsed + 0.000001 && candidate.aim != null);
  return {
    aim: normalizeCameraAim(keyframe?.aim),
    keyframe,
    index: keyframe ? track.keyframes.findIndex((candidate) => candidate.id === keyframe.id) : -1,
  };
}

function cameraGuideTrack(
  track = activeCameraTrack(),
  sourceProject = cameraPreviewProject(),
  shot = findShot(sourceProject, findShot(project)?.id)
) {
  if (track !== cameraGuidePathSource || sourceProject !== cameraGuideProjectSource) {
    cameraGuidePathSource = track;
    cameraGuideProjectSource = sourceProject;
    cameraGuideEvaluatedTrack = evaluatedCameraGuideTrack(sourceProject, shot);
  }
  return cameraGuideEvaluatedTrack || evaluatedCameraGuideTrack(sourceProject, shot);
}

function syncRenderer() {
  const sourceProject = cameraPreviewProject();
  const samples = playback.status === "idle"
    ? sampleInitialProject(sourceProject)
    : sampleProject(sourceProject, playback.elapsed);
  if (actionInspection?.sample) samples.set(actionInspection.actorID, actionInspection.sample);
  directorRenderer.sync(sourceProject, samples, {
    selectedActorID,
    selectedObject,
    selectedPathPointID,
    sceneObjectSelectionEnabled: sceneSidebarMode === "blockout",
    playbackStatus: actionInspection ? "inspection" : playback.status,
    editable: canAuthor(),
    actorMotionEditable: canEditActorMotion(),
    shotCameraEditable: canEditCamera(),
    previewActive: Boolean(actionInspection),
    authoringGuidesVisible: viewportMode === viewportModes.edit && editViewMode === "scene",
  });
  applyCameraTrackPrototype(playback, samples);
  const activeShot = findShot(sourceProject);
  const setup = cameraSetupShortcutSelection();
  const setupEdit = setup ? cameraEditSession.setupEdit(setup.id) : null;
  const setupDepthOfFieldEnabled = Boolean(
    setup
    && cameraSetupViewActive(setup.id)
    && (setupEdit?.depthOfField || setup.depthOfField)?.enabled === true
  );
  const shotDepthOfFieldEnabled = activeShot?.camera?.depthOfField?.enabled === true;
  const depthOfFieldEnabled = setupDepthOfFieldEnabled || shotDepthOfFieldEnabled;
  directorRenderer.setFocusPlaneVisible(cameraFocusPlaneVisible && depthOfFieldEnabled);
  if (!depthOfFieldEnabled
    || viewportMode !== viewportModes.edit
    || !(editViewMode === "shot" || cameraSetupViewActive())) {
    cameraFocusPicking = false;
    directorRenderer.setFocusPicking(false);
  }
  syncCameraAuthoringGuides(playback, samples);
  if (setup && cameraSetupViewActive(setup.id)) {
    applyCameraSetupViewPose({
      ...(setupEdit?.pose || setup.pose),
      depthOfFieldEnabled: setupDepthOfFieldEnabled,
    });
  }
  updateShotComposition();
  renderPathHeightControl();
}

function toggleActionInspection(actorID, actionID) {
  if (!canAuthor()) return;
  if (actionInspection?.actorID === actorID && actionInspection?.actionID === actionID) {
    stopActionInspection();
    return;
  }
  startActionInspection(actorID, actionID);
}

function startActionInspection(actorID, actionID) {
  if (!canAuthor()) return;
  stopActionInspection(false);
  const actor = findActor(project, actorID);
  if (!actor) return;
  const action = actor.motionActions.find((entry) => entry.id === actionID);
  if (action && !true && desktopActions[action.actionID]?.kind !== action.kind) {
    showToast(`动作资产不可用：${action.actionID}。请在动作库中恢复或重新选择。`, true);
    return;
  }
  const initial = sampleActionInspection(actor, actionID, 0);
  if (initial.duration <= 0) {
    showToast("这个结构点没有可预览的动作");
    return;
  }
  actionInspection = {
    actorID,
    actionID,
    startedAt: performance.now(),
    sample: initial.sample,
    frame: null,
    completed: false,
  };
  renderInspector();
  syncRenderer();
  const tick = (now) => {
    if (!actionInspection || actionInspection.actorID !== actorID || actionInspection.actionID !== actionID) return;
    actionInspection.frame = null;
    const currentActor = findActor(project, actorID);
    if (!currentActor) {
      stopActionInspection();
      return;
    }
    const result = sampleActionInspection(currentActor, actionID, (now - actionInspection.startedAt) / 1000);
    actionInspection.sample = result.sample;
    actionInspection.completed = result.completed;
    syncRenderer();
    if (result.completed) return;
    actionInspection.frame = requestAnimationFrame(tick);
  };
  actionInspection.frame = requestAnimationFrame(tick);
}

function refreshActionInspectionSample() {
  if (!actionInspection) return;
  const actor = findActor(project, actionInspection.actorID);
  if (!actor) return;
  const elapsed = actionInspection.completed
    ? Number.MAX_SAFE_INTEGER
    : (performance.now() - actionInspection.startedAt) / 1000;
  const result = sampleActionInspection(actor, actionInspection.actionID, elapsed);
  actionInspection.sample = result.sample;
  actionInspection.completed = result.completed;
}

function stopActionInspection(render = true) {
  if (!actionInspection) return;
  if (actionInspection.frame != null) cancelAnimationFrame(actionInspection.frame);
  actionInspection = null;
  if (render) renderInspector();
  syncRenderer();
}

// 只有真在播放时才冻结编辑。暂停/播完/拖动播放头之后（seek 会把状态置为 paused）
// 都应可编辑 —— 那正是「停在某一刻观察后微调」的时机，也与 canEditCamera 一致。
function canAuthor() {
  if (appUpdateLocked) return false;
  return viewportMode === viewportModes.edit
    && playback.status !== "playing"
    && !isExporting()
    && !cameraOrbitDraft
    && !false;
}

// 路径和动作编辑写入作者数据，暂停时按当前播放头重新采样预览。
function canEditActorMotion() {
  return canAuthor();
}

function canEditCamera() {
  if (appUpdateLocked) return false;
  return viewportMode === viewportModes.edit
    && playback.status !== "playing"
    && !cameraOrbitDraft
    && !false;
}

function canEditCameraOrbit() {
  if (appUpdateLocked) return false;
  return viewportMode === viewportModes.edit
    && playback.status !== "playing"
    && !isExporting()
    && !false;
}

function renderAll() {
  renderProjectSwitcher();
  renderProjectManager();
  renderActors();
  renderInspectorTabs();
  renderInspector();
  renderViewportMode();
  renderEditViewMode();
  renderTransport();
  renderConnection();
  renderCameraTimeline();
  renderCameraWorkspace();
  syncRenderer();
  postShellState();
  closeSelectPopup();
  enhanceAllSelects();
}

// ── 自绘下拉 ────────────────────────────────────────────────────────────
// 系统 <select> 的弹出层无法样式化也经常错位。这里做渐进增强：原生 select
// 留在 DOM 里继续承载状态和全部既有 change 监听，只是视觉上换成自绘的
// 触发按钮 + fixed 定位的弹层。渲染函数重建 select 后由 renderAll 末尾统一补挂。

let activeSelectPopup = null;

function enhanceAllSelects() {
  for (const select of document.querySelectorAll("select")) {
    if (select.dataset.fsEnhanced) syncSelectTrigger(select);
    else enhanceSelect(select);
  }
}

// 原生 select 被 display:none 之后就退出了无障碍树，可见的 <label for> 也随之
// 指向一个不存在的目标。所以名字得自己接回来：aria-label 优先，其次取关联
// <label> 的文字。包裹式 <label><span>帧率</span><select></label> 要只取 span，
// 否则会把触发按钮自己的文字也算进名字里。
function selectLabelSource(select) {
  // 名字与「哪个 <label> 归它管」是两件事：aria-label 更精确时用它当名字，
  // 但可见标签的点击转发仍然要接上，否则点文字没反应。
  const associated = (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`))
    || select.closest("label");
  const explicit = select.getAttribute("aria-label");
  if (explicit) return { text: explicit, element: associated };
  if (!associated) return { text: "", element: null };
  const span = associated.contains(select) ? associated.querySelector("span") : null;
  return { text: (span || associated).textContent.trim(), element: associated };
}

function enhanceSelect(select) {
  select.dataset.fsEnhanced = "true";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "fs-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const { text: label, element: labelElement } = selectLabelSource(select);
  // 没有名字时读屏只会念出当前值（「移动，按钮」），听不出这是哪个筛选器。
  if (label) {
    trigger.setAttribute("aria-label", label);
    select.dataset.fsLabel = label;
  }
  select.insertAdjacentElement("afterend", trigger);
  select.classList.add("fs-select-native");
  // <label for> 只能指向可标注元素，按钮不算，所以点击文字聚焦得手动接。
  labelElement?.addEventListener("click", (event) => {
    if (event.target.closest(".fs-select-trigger, .fs-select-popup")) return;
    event.preventDefault();
    trigger.focus();
  });
  trigger.addEventListener("click", () => toggleSelectPopup(select, trigger));
  select.addEventListener("change", () => syncSelectTrigger(select));
  select.addEventListener(
    "film-space-select-options-updated",
    () => syncSelectTrigger(select)
  );
  syncSelectTrigger(select);
}

function syncSelectTrigger(select) {
  const trigger = select.nextElementSibling;
  if (!trigger?.classList.contains("fs-select-trigger")) return;
  const option = select.options[select.selectedIndex];
  trigger.textContent = option ? option.textContent : "—";
  trigger.disabled = select.disabled;
}

function closeSelectPopup() {
  if (!activeSelectPopup) return;
  activeSelectPopup.list.remove();
  activeSelectPopup.trigger.setAttribute("aria-expanded", "false");
  window.removeEventListener("pointerdown", activeSelectPopup.onOutside, true);
  window.removeEventListener("keydown", activeSelectPopup.onKey, true);
  window.removeEventListener("scroll", activeSelectPopup.onScroll, true);
  window.removeEventListener("resize", activeSelectPopup.onScroll);
  activeSelectPopup = null;
}

function toggleSelectPopup(select, trigger) {
  if (activeSelectPopup?.select === select) {
    closeSelectPopup();
    return;
  }
  closeSelectPopup();
  const list = document.createElement("div");
  list.className = "fs-select-popup";
  list.setAttribute("role", "listbox");
  // 列表框自己也要有名字，否则读屏只报「列表框」，不知道在选什么。
  if (select.dataset.fsLabel) list.setAttribute("aria-label", select.dataset.fsLabel);
  for (const [index, option] of [...select.options].entries()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "fs-select-option";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === select.selectedIndex));
    item.textContent = option.textContent;
    item.disabled = option.disabled;
    item.addEventListener("click", () => {
      select.value = option.value;
      closeSelectPopup();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncSelectTrigger(select);
      trigger.focus();
    });
    list.append(item);
  }
  // 在打开的 <dialog>（top layer）里必须把弹层挂进 dialog，否则会被压在遮罩下面。
  (trigger.closest("dialog[open]") || document.body).append(list);
  const rect = trigger.getBoundingClientRect();
  list.style.minWidth = `${Math.max(rect.width, 132)}px`;
  const height = Math.min(list.scrollHeight, 280);
  const below = rect.bottom + 4;
  const top = below + height > window.innerHeight - 8
    ? Math.max(8, rect.top - 4 - height)
    : below;
  list.style.top = `${top}px`;
  list.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 12))}px`;
  trigger.setAttribute("aria-expanded", "true");
  const onOutside = (event) => {
    if (!list.contains(event.target) && event.target !== trigger) closeSelectPopup();
  };
  const onScroll = (event) => {
    if (event.target instanceof Node && list.contains(event.target)) return;
    closeSelectPopup();
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeSelectPopup();
      trigger.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const items = [...list.querySelectorAll(".fs-select-option:not(:disabled)")];
      const current = items.indexOf(document.activeElement);
      const next = items[current + (event.key === "ArrowDown" ? 1 : -1)] || items[current] || items[0];
      next?.focus();
    }
  };
  window.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);
  activeSelectPopup = { select, trigger, list, onOutside, onKey, onScroll };
  (list.querySelector('[aria-selected="true"]:not(:disabled)') || list.querySelector(".fs-select-option:not(:disabled)"))?.focus();
}

function renderProjectSwitcher() {
  const readable = projectSummaries.filter((summary) => !summary.readError);
  const items = readable.some((summary) => summary.id === project.id)
    ? readable
    : [{ id: project.id, name: project.name, modifiedAt: project.modifiedAt, actorCount: project.scene.actors.length }, ...readable];
  elements.projectSelect.innerHTML = items.map((summary) => (
    `<option value="${escapeHTML(summary.id)}" ${summary.id === project.id ? "selected" : ""}>${escapeHTML(summary.name)}</option>`
  )).join("");
}

function renderActors() {
  const actors = project.scene.actors;
  const shotsActive = sceneSidebarMode === "shots";
  const setupsActive = sceneSidebarMode === "setups";
  const blockoutActive = sceneSidebarMode === "blockout";
  elements.actorsSidebarMode.classList.toggle("selected", !shotsActive && !setupsActive && !blockoutActive);
  elements.actorsSidebarMode.setAttribute("aria-pressed", String(!shotsActive && !setupsActive && !blockoutActive));
  elements.cameraSetupsSidebarMode.classList.toggle("selected", setupsActive);
  elements.cameraSetupsSidebarMode.setAttribute("aria-pressed", String(setupsActive));
  elements.shotsSidebarMode.classList.toggle("selected", shotsActive);
  elements.shotsSidebarMode.setAttribute("aria-pressed", String(shotsActive));
  elements.blockoutSidebarMode.classList.toggle("selected", blockoutActive);
  elements.blockoutSidebarMode.setAttribute("aria-pressed", String(blockoutActive));
  elements.scenePanelTitle.textContent = shotsActive
    ? "运镜"
    : setupsActive ? "机位" : blockoutActive ? "环境" : "演员";
  // 环境页把现成 GLB 与图片建模分成两个明确入口；图片建模会话本身长期保存在项目里。
  // 该模式下真实 file input 覆盖在按钮上接收点击，按钮退为纯视觉。
  elements.addActor.classList.remove("concealed");
  // 壳宿主不铺覆盖 input（WebKit 不给它弹面板），改由按钮请求原生面板。
  const overlayImport = blockoutActive && !false;
  elements.blockoutModelInput.hidden = !overlayImport;
  elements.blockoutModelInput.disabled = !canAuthor() || environmentImporting;
  {}
  {}
  elements.addActor.tabIndex = overlayImport ? -1 : 0;
  elements.addActor.setAttribute("aria-hidden", String(overlayImport));
  elements.addActor.innerHTML = shotsActive
    ? `<span aria-hidden="true">＋</span> 运镜`
    : setupsActive
      ? `<span aria-hidden="true">＋</span> 机位`
      : blockoutActive
        ? `导入模型`
        : `<span aria-hidden="true">＋</span> 演员`;
  elements.addActor.title = shotsActive
    ? "从当前 Scene View 新建运镜"
    : setupsActive
      ? "保存当前 Scene View 为新机位"
      : blockoutActive
        ? "导入环境 GLB"
        : "添加演员";
  if (setupsActive) {
    renderCameraSetupsSidebar();
    return;
  }
  if (shotsActive) {
    renderShotsSidebar();
    return;
  }
  if (blockoutActive) {
    renderBlockoutSidebar();
    return;
  }
  if (!actors.length) {
    elements.actorsList.innerHTML = `<div class="actors-empty">项目中还没有演员。</div>`;
    return;
  }

  elements.actorsList.innerHTML = actors.map((actor,index) => actorListRowMarkup(actor,index)).join("");
  for (const button of elements.actorsList.querySelectorAll("[data-actor-id]")) {
    button.addEventListener("click", () => selectActor(button.dataset.actorId));
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-actor-visible]")) {
    button.disabled = !canAuthor();
    button.addEventListener("click", () => {
      const actor = findActor(project, button.dataset.toggleActorVisible);
      if (!actor) return;
      void commitProject(
        (current) => setActorVisible(current, actor.id, actor.visible === false),
        actor.visible === false ? "演员已显示" : "演员已隐藏"
      );
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-actor-locked]")) {
    button.disabled = !canAuthor();
    button.addEventListener("click", () => {
      const actor = findActor(project, button.dataset.toggleActorLocked);
      if (!actor) return;
      void commitProject(
        (current) => setActorLocked(current, actor.id, !actor.locked),
        actor.locked ? "演员已解锁" : "演员已锁定"
      );
    });
  }
  for (const row of elements.actorsList.querySelectorAll("[data-actor-row]")) {
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openActorContextMenu(row.dataset.actorRow, event.clientX, event.clientY, row);
    });
  }
}

function actorListRowMarkup(actor, index, { roleName = "", nested = false } = {}) {
  const visible = actor.visible !== false;
  const locked = actor.locked === true;
  const selected = selectedObject?.kind === "actor" && selectedObject.id === actor.id;
  const actorNumber = String(Number(index) + 1).padStart(2, "0");
  const label = roleName ? `${roleName} · 演员 ${actorNumber}` : `演员 ${actorNumber}`;
  return `
    <article class="actor-item ${nested ? "paired-actor-child" : ""} ${selected ? "selected" : ""} ${visible ? "" : "hidden-actor"} ${locked ? "locked-actor" : ""}" role="listitem" data-actor-row="${escapeHTML(actor.id)}">
      <button class="actor-main" type="button" data-actor-id="${escapeHTML(actor.id)}" aria-pressed="${selected}">
        <span class="actor-avatar" style="background:${actorColor(actor)};color:${clothingInk(actor.blockingColor || actor.clothingColorIndex)}">${roleName || actorNumber}</span>
        <span class="actor-name">${label}</span>
      </button>
      <div class="actor-row-actions" aria-label="演员显示与锁定">
        <button class="actor-row-action" type="button" data-toggle-actor-visible="${escapeHTML(actor.id)}" role="switch" aria-checked="${visible}" aria-label="${visible ? "隐藏" : "显示"}${label}" title="${visible ? "隐藏" : "显示"}">
          ${actorVisibilityIcon(visible)}
        </button>
        <button class="actor-row-action ${locked ? "active" : ""}" type="button" data-toggle-actor-locked="${escapeHTML(actor.id)}" role="switch" aria-checked="${locked}" aria-label="${locked ? "解锁" : "锁定"}${label}" title="${locked ? "解锁" : "锁定"}">
          ${actorLockIcon(locked)}
        </button>
      </div>
    </article>
  `;
}

function renderBlockoutSidebar() {
  const visuals = project.scene.environment.visuals;
  const environmentGroups = project.scene.environment.groups;
  const blockout = project.scene.blockout;
  const rows = [];
  const visualRow = (visual, group = null) => {
    const selected = selectedEnvironmentIDs.has(visual.id)
      || selectedObject?.kind === "environment" && selectedObject.id === visual.id;
    const hidden = visual.visible === false || group?.visible === false;
    const locked = visual.locked === true || group?.locked === true;
    return `<div class="actor-item object-item ${group ? "primitive-item" : ""} ${selected ? "selected" : ""} ${hidden ? "hidden-actor" : ""} ${locked ? "locked-actor" : ""}" role="listitem" data-object-row="${escapeHTML(visual.id)}">
        <button class="actor-main object-main" type="button" data-select-environment="${escapeHTML(visual.id)}" aria-pressed="${selected}" aria-label="${escapeHTML(visual.name)}${group ? `，位于${escapeHTML(group.name)}` : ""}">
          <span class="object-avatar" aria-hidden="true">${visual.asset.kind === "gaussian" ? "PLY" : "GLB"}</span>
          <span class="actor-name">${escapeHTML(visual.name)}</span>
        </button>
        <div class="actor-row-actions" aria-label="环境显示与锁定">
          <button class="actor-row-action" type="button" data-toggle-environment-visible="${escapeHTML(visual.id)}" role="switch" aria-checked="${visual.visible !== false}" aria-label="${visual.visible === false ? "显示" : "隐藏"}${escapeHTML(visual.name)}">${actorVisibilityIcon(visual.visible !== false)}</button>
          <button class="actor-row-action ${visual.locked ? "active" : ""}" type="button" data-toggle-environment-locked="${escapeHTML(visual.id)}" role="switch" aria-checked="${visual.locked === true}" aria-label="${visual.locked ? "解锁" : "锁定"}${escapeHTML(visual.name)}">${actorLockIcon(visual.locked === true)}</button>
        </div>
      </div>`;
  };
  for (const group of environmentGroups) {
    const expanded = expandedEnvironmentGroupIDs.has(group.id);
    const selected = selectedObject?.kind === "environmentGroup" && selectedObject.id === group.id;
    const members = visuals.filter((visual) => visual.groupID === group.id);
    rows.push(`
      <article class="object-tree-group environment-tree-group ${expanded ? "expanded" : ""}" role="listitem">
        <div class="actor-item object-item ${selected ? "selected" : ""} ${group.visible === false ? "hidden-actor" : ""} ${group.locked ? "locked-actor" : ""}" data-object-row="${escapeHTML(group.id)}">
          <button class="object-disclosure" type="button" data-toggle-environment-group-expanded="${escapeHTML(group.id)}" aria-expanded="${expanded}" aria-label="${expanded ? "收起" : "展开"}${escapeHTML(group.name)}">${expanded ? "⌄" : "›"}</button>
          <button class="actor-main object-main" type="button" data-select-environment-group="${escapeHTML(group.id)}" aria-pressed="${selected}" title="${members.length} 个环境资产">
            <span class="object-avatar" aria-hidden="true">组</span>
            <span class="actor-name">${escapeHTML(group.name)}</span>
          </button>
          <div class="actor-row-actions" aria-label="环境组显示、锁定与删除">
            <button class="actor-row-action" type="button" data-toggle-environment-group-visible="${escapeHTML(group.id)}" role="switch" aria-checked="${group.visible !== false}" aria-label="${group.visible === false ? "显示" : "隐藏"}${escapeHTML(group.name)}">${actorVisibilityIcon(group.visible !== false)}</button>
            <button class="actor-row-action ${group.locked ? "active" : ""}" type="button" data-toggle-environment-group-locked="${escapeHTML(group.id)}" role="switch" aria-checked="${group.locked === true}" aria-label="${group.locked ? "解锁" : "锁定"}${escapeHTML(group.name)}">${actorLockIcon(group.locked === true)}</button>
            <button class="actor-row-action danger" type="button" data-remove-environment-group="${escapeHTML(group.id)}" aria-label="删除环境组及其 ${members.length} 个资产：${escapeHTML(group.name)}" title="删除环境组及组内资产" ${group.locked ? "disabled" : ""}>${actorDeleteIcon()}</button>
          </div>
        </div>
        ${expanded ? `<div class="object-children" role="list">${members.map((visual) => visualRow(visual, group)).join("")}</div>` : ""}
      </article>`);
  }
  for (const visual of visuals.filter((candidate) => !candidate.groupID)) {
    rows.push(visualRow(visual));
  }
  const groupRows = blockout.groups.map((group) => {
    const expanded = expandedBlockoutGroupIDs.has(group.id);
    const selected = selectedObject?.kind === "blockoutGroup" && selectedObject.id === group.id;
    return `
      <article class="object-tree-group ${expanded ? "expanded" : ""}" role="listitem">
        <div class="actor-item object-item ${selected ? "selected" : ""} ${group.visible === false ? "hidden-actor" : ""}" data-object-row="${escapeHTML(group.id)}">
          <button class="object-disclosure" type="button" data-toggle-blockout-expanded="${escapeHTML(group.id)}" aria-expanded="${expanded}" aria-label="${expanded ? "收起" : "展开"}${escapeHTML(group.name)}">${expanded ? "⌄" : "›"}</button>
          <button class="actor-main object-main" type="button" data-blockout-group-id="${escapeHTML(group.id)}" aria-pressed="${selected}">
            <span class="object-avatar" aria-hidden="true">组</span>
            <span class="actor-name">${escapeHTML(group.name)}</span>
          </button>
          <div class="actor-row-actions" aria-label="布景组显示与锁定">
            <button class="actor-row-action" type="button" data-toggle-blockout-group-visible="${escapeHTML(group.id)}" role="switch" aria-checked="${group.visible !== false}" aria-label="${group.visible === false ? "显示" : "隐藏"}${escapeHTML(group.name)}">${actorVisibilityIcon(group.visible !== false)}</button>
            <button class="actor-row-action ${group.locked ? "active" : ""}" type="button" data-toggle-blockout-group-locked="${escapeHTML(group.id)}" role="switch" aria-checked="${group.locked === true}" aria-label="${group.locked ? "解锁" : "锁定"}${escapeHTML(group.name)}">${actorLockIcon(group.locked === true)}</button>
          </div>
        </div>
        ${expanded ? `<div class="object-children" role="list">
          ${group.objects.map((object) => {
            const objectSelected = selectedObject?.kind === "blockoutObject"
              && selectedObject.id === object.id;
            return `<div class="actor-item object-item primitive-item ${objectSelected ? "selected" : ""} ${object.visible === false ? "hidden-actor" : ""}" role="listitem" data-object-row="${escapeHTML(object.id)}">
              <button class="actor-main object-main" type="button" data-blockout-object-id="${escapeHTML(object.id)}" data-parent-group-id="${escapeHTML(group.id)}" aria-pressed="${objectSelected}">
                <span class="object-avatar primitive-avatar" aria-hidden="true">${blockoutObjectShortLabel(object)}</span>
                <span class="actor-name">${escapeHTML(object.name)}</span>
              </button>
              <div class="actor-row-actions" aria-label="对象显示与锁定">
                <button class="actor-row-action" type="button" data-toggle-blockout-object-visible="${escapeHTML(object.id)}" data-parent-group-id="${escapeHTML(group.id)}" role="switch" aria-checked="${object.visible !== false}" aria-label="${object.visible === false ? "显示" : "隐藏"}${escapeHTML(object.name)}">${actorVisibilityIcon(object.visible !== false)}</button>
                <button class="actor-row-action ${object.locked ? "active" : ""}" type="button" data-toggle-blockout-object-locked="${escapeHTML(object.id)}" data-parent-group-id="${escapeHTML(group.id)}" role="switch" aria-checked="${object.locked === true}" aria-label="${object.locked ? "解锁" : "锁定"}${escapeHTML(object.name)}">${actorLockIcon(object.locked === true)}</button>
              </div>
            </div>`;
          }).join("")}
        </div>` : ""}
      </article>`;
  }).join("");
  const layerSelected = selectedObject?.kind === "blockoutLayer";
  const layerVisible = blockout.visible !== false;
  const layerLocked = blockout.locked === true;
  // 没有布景组时不渲染「布景整体」容器行 —— 空容器没有可管理的对象。
  if (!blockout.groups.length) {
    if (!rows.length) rows.push(`<div class="actors-empty">还没有布景。</div>`);
    elements.actorsList.innerHTML = rows.join("");
    {}
    wireEnvironmentSidebarSelection();
    wireBlockoutSidebarActions();
    wireObjectRowContextMenus();
    return;
  }
  rows.push(`
    <article class="object-tree-group blockout-layer-tree ${blockoutLayerExpanded ? "expanded" : ""}" role="listitem">
      <div class="actor-item object-item blockout-layer-item ${layerSelected ? "selected" : ""} ${layerVisible ? "" : "hidden-actor"} ${layerLocked ? "locked-actor" : ""}" data-blockout-layer-row>
        <button class="object-disclosure" type="button" data-toggle-blockout-layer-expanded aria-expanded="${blockoutLayerExpanded}" aria-label="${blockoutLayerExpanded ? "收起" : "展开"}布景整体">${blockoutLayerExpanded ? "⌄" : "›"}</button>
        <button class="actor-main object-main" type="button" data-select-blockout-layer aria-pressed="${layerSelected}" title="${blockout.groups.length} 个布景组">
          <span class="object-avatar blockout-layer-avatar" aria-hidden="true">总</span>
          <span class="actor-name">布景整体</span>
        </button>
        <div class="actor-row-actions" aria-label="布景整体显示与锁定">
          <button class="actor-row-action" type="button" data-toggle-blockout-layer-visible role="switch" aria-checked="${layerVisible}" aria-label="${layerVisible ? "隐藏" : "显示"}布景整体" title="${layerVisible ? "隐藏" : "显示"}">${actorVisibilityIcon(layerVisible)}</button>
          <button class="actor-row-action ${layerLocked ? "active" : ""}" type="button" data-toggle-blockout-layer-locked role="switch" aria-checked="${layerLocked}" aria-label="${layerLocked ? "解锁" : "锁定"}布景整体" title="${layerLocked ? "解锁" : "锁定"}">${actorLockIcon(layerLocked)}</button>
        </div>
      </div>
      ${blockoutLayerExpanded ? `<div class="object-children blockout-layer-children" role="list">
        ${groupRows || `<div class="object-tree-empty">还没有布景组。</div>`}
      </div>` : ""}
    </article>`);
  elements.actorsList.innerHTML = rows.join("");

  {}
  wireEnvironmentSidebarSelection();
  elements.actorsList.querySelector("[data-select-blockout-layer]")?.addEventListener("click", () => {
    selectSceneObject({ kind: "blockoutLayer", id: "blockout", parentID: null });
  });
  elements.actorsList.querySelector("[data-toggle-blockout-layer-expanded]")?.addEventListener("click", () => {
    blockoutLayerExpanded = !blockoutLayerExpanded;
    renderActors();
  });
  const blockoutLayerRow = elements.actorsList.querySelector("[data-blockout-layer-row]");
  blockoutLayerRow?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openBlockoutLayerContextMenu(event.clientX, event.clientY, blockoutLayerRow);
  });
  elements.actorsList.querySelector("[data-select-blockout-layer]")?.addEventListener("keydown", (event) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    openBlockoutLayerContextMenu(0, 0, blockoutLayerRow);
  });
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-blockout-expanded]")) {
    button.addEventListener("click", () => {
      const id = button.dataset.toggleBlockoutExpanded;
      if (expandedBlockoutGroupIDs.has(id)) expandedBlockoutGroupIDs.delete(id);
      else expandedBlockoutGroupIDs.add(id);
      renderActors();
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-blockout-group-id]")) {
    button.addEventListener("click", () => selectSceneObject({
      kind: "blockoutGroup",
      id: button.dataset.blockoutGroupId,
      parentID: null,
    }));
  }
  for (const button of elements.actorsList.querySelectorAll("[data-blockout-object-id]")) {
    button.addEventListener("click", () => selectSceneObject({
      kind: "blockoutObject",
      id: button.dataset.blockoutObjectId,
      parentID: button.dataset.parentGroupId,
    }));
  }
  wireBlockoutSidebarActions();
  wireObjectRowContextMenus();
}

function wireEnvironmentSidebarSelection() {
  for (const button of elements.actorsList.querySelectorAll("[data-select-environment]")) {
    button.addEventListener("click", (event) => {
      const environmentID = button.dataset.selectEnvironment;
      const orderedIDs = project.scene.environment.visuals.map((visual) => visual.id);
      const anchorID = environmentSelectionAnchorID;
      if (event.shiftKey && anchorID && orderedIDs.includes(anchorID)) {
        const start = orderedIDs.indexOf(anchorID);
        const end = orderedIDs.indexOf(environmentID);
        selectedEnvironmentIDs.clear();
        for (const id of orderedIDs.slice(Math.min(start, end), Math.max(start, end) + 1)) {
          selectedEnvironmentIDs.add(id);
        }
      } else if (event.metaKey || event.ctrlKey) {
        if (selectedEnvironmentIDs.has(environmentID)) selectedEnvironmentIDs.delete(environmentID);
        else selectedEnvironmentIDs.add(environmentID);
        environmentSelectionAnchorID = environmentID;
      } else {
        selectedEnvironmentIDs.clear();
        selectedEnvironmentIDs.add(environmentID);
        environmentSelectionAnchorID = environmentID;
      }
      const primaryID = selectedEnvironmentIDs.has(environmentID)
        ? environmentID
        : [...selectedEnvironmentIDs].at(-1);
      if (primaryID) {
        selectSceneObject(
          { kind: "environment", id: primaryID, parentID: null },
          { preserveEnvironmentMulti: true, updateEnvironmentAnchor: false }
        );
      } else {
        selectedObject = null;
        renderActors();
        renderInspector();
        syncRenderer();
      }
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-select-environment-group]")) {
    button.addEventListener("click", () => selectSceneObject({
      kind: "environmentGroup",
      id: button.dataset.selectEnvironmentGroup,
      parentID: null,
    }));
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-environment-group-expanded]")) {
    button.addEventListener("click", () => {
      const groupID = button.dataset.toggleEnvironmentGroupExpanded;
      if (expandedEnvironmentGroupIDs.has(groupID)) expandedEnvironmentGroupIDs.delete(groupID);
      else expandedEnvironmentGroupIDs.add(groupID);
      renderActors();
    });
  }
}

// 两条渲染出口（有/无布景组）都要接右键菜单：无布景组时环境 GLB 行是移除的唯一入口。
function wireObjectRowContextMenus() {
  for (const row of elements.actorsList.querySelectorAll("[data-object-row]")) {
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openObjectContextMenu(row.dataset.objectRow, event.clientX, event.clientY, row);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      openObjectContextMenu(row.dataset.objectRow, 0, 0, row);
    });
  }
}

function blockoutKindShortLabel(kind) {
  return {
    box: "方",
    sphere: "球",
    cylinder: "柱",
    cone: "锥",
    torus: "环",
    plane: "面",
    wedge: "楔",
  }[kind] || "体";
}

function blockoutObjectShortLabel(object) {
  const semantic = String(object?.semanticType || "");
  if (/tent/.test(semantic)) return "篷";
  if (/banner|flag/.test(semantic)) return "旗";
  if (/tower/.test(semantic)) return "塔";
  if (/tree|forest/.test(semantic)) return "树";
  if (/mountain/.test(semantic)) return "山";
  if (/fire|brazier/.test(semantic)) return "火";
  if (/smoke/.test(semantic)) return "烟";
  return object?.primitives?.length === 1
    ? blockoutKindShortLabel(object.primitives[0].kind)
    : "物";
}

function actorVisibilityIcon(visible) {
  return visible
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.4-5 9.2-5 9.2 5 9.2 5-3.4 5-9.2 5-9.2-5-9.2-5Z"/><circle cx="12" cy="12" r="2.7"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.2 8.5C5 6.7 7.8 5.3 12 5.3c5.8 0 9.2 5 9.2 5s-.8 1.2-2.3 2.5M16.8 15.4c-1.3.8-2.9 1.3-4.8 1.3-5.8 0-9.2-5-9.2-5s1.1-1.7 3.1-3.2M4 4l16 16"/><path d="M9.8 9.8a3.1 3.1 0 0 0 4.4 4.4"/></svg>`;
}

function actorLockIcon(locked) {
  return locked
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M9 10V7a3.5 3.5 0 0 1 6.6-1.6"/></svg>`;
}

function actorDeleteIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>`;
}

function wireBlockoutSidebarActions() {
  const blockout = project.scene.blockout;
  const toggleBlockoutLayerVisible = elements.actorsList.querySelector("[data-toggle-blockout-layer-visible]");
  const toggleBlockoutLayerLocked = elements.actorsList.querySelector("[data-toggle-blockout-layer-locked]");
  for (const toggleEnvironmentVisible of elements.actorsList.querySelectorAll("[data-toggle-environment-visible]")) {
    const environmentID = toggleEnvironmentVisible.dataset.toggleEnvironmentVisible;
    const visual = project.scene.environment.visuals.find((candidate) => candidate.id === environmentID);
    const parentGroup = visual?.groupID
      ? project.scene.environment.groups.find((group) => group.id === visual.groupID)
      : null;
    toggleEnvironmentVisible.disabled = !canAuthor() || parentGroup?.locked === true;
    toggleEnvironmentVisible.addEventListener("click", () => {
      const visible = visual?.visible === false;
      void commitProject(
        (current) => setVisualEnvironmentVisible(current, environmentID, visible),
        visible ? "视觉环境已显示" : "视觉环境已隐藏"
      );
    });
  }
  for (const toggleEnvironmentLocked of elements.actorsList.querySelectorAll("[data-toggle-environment-locked]")) {
    const environmentID = toggleEnvironmentLocked.dataset.toggleEnvironmentLocked;
    const visual = project.scene.environment.visuals.find((candidate) => candidate.id === environmentID);
    const parentGroup = visual?.groupID
      ? project.scene.environment.groups.find((group) => group.id === visual.groupID)
      : null;
    toggleEnvironmentLocked.disabled = !canAuthor() || parentGroup?.locked === true;
    toggleEnvironmentLocked.addEventListener("click", () => {
      const locked = visual?.locked !== true;
      void commitProject(
        (current) => setVisualEnvironmentLocked(current, environmentID, locked),
        locked ? "视觉环境已锁定" : "视觉环境已解锁"
      );
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-environment-group-visible]")) {
    const group = project.scene.environment.groups.find(
      (candidate) => candidate.id === button.dataset.toggleEnvironmentGroupVisible
    );
    button.disabled = !canAuthor();
    button.addEventListener("click", () => {
      if (!group) return;
      const visible = group.visible === false;
      void commitProject(
        (current) => updateVisualEnvironmentGroup(current, group.id, { visible }),
        visible ? "环境组已显示" : "环境组已隐藏"
      );
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-environment-group-locked]")) {
    const group = project.scene.environment.groups.find(
      (candidate) => candidate.id === button.dataset.toggleEnvironmentGroupLocked
    );
    button.disabled = !canAuthor();
    button.addEventListener("click", () => {
      if (!group) return;
      const locked = !group.locked;
      void commitProject(
        (current) => updateVisualEnvironmentGroup(current, group.id, { locked }),
        locked ? "环境组已锁定" : "环境组已解锁"
      );
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-remove-environment-group]")) {
    const group = project.scene.environment.groups.find(
      (candidate) => candidate.id === button.dataset.removeEnvironmentGroup
    );
    button.disabled = !canAuthor() || group?.locked === true;
    button.addEventListener("click", () => {
      if (group) deleteEnvironmentGroupFromList(group.id);
    });
  }
  if (toggleBlockoutLayerVisible) {
    toggleBlockoutLayerVisible.disabled = !canAuthor();
    toggleBlockoutLayerVisible.addEventListener("click", () => {
      const visible = blockout.visible === false;
      void commitProject(
        (current) => setBlockoutLayerVisible(current, visible),
        visible ? "布景整体已显示" : "布景整体已隐藏"
      );
    });
  }
  if (toggleBlockoutLayerLocked) {
    toggleBlockoutLayerLocked.disabled = !canAuthor();
    toggleBlockoutLayerLocked.addEventListener("click", () => {
      const locked = blockout.locked !== true;
      void commitProject(
        (current) => setBlockoutLayerLocked(current, locked),
        locked ? "布景整体已锁定" : "布景整体已解锁"
      );
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-blockout-group-visible]")) {
    const group = project.scene.blockout.groups.find((candidate) => (
      candidate.id === button.dataset.toggleBlockoutGroupVisible
    ));
    button.disabled = !canAuthor() || blockout.locked === true;
    button.addEventListener("click", () => {
      if (!group) return;
      const visible = group.visible === false;
      void commitProject(
        (current) => updateBlockoutGroup(current, group.id, { visible }),
        visible ? "布景组已显示" : "布景组已隐藏"
      );
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-blockout-group-locked]")) {
    const group = project.scene.blockout.groups.find((candidate) => (
      candidate.id === button.dataset.toggleBlockoutGroupLocked
    ));
    button.disabled = !canAuthor() || blockout.locked === true;
    button.addEventListener("click", () => {
      if (!group) return;
      const locked = !group.locked;
      void commitProject(
        (current) => updateBlockoutGroup(current, group.id, { locked }),
        locked ? "布景组已锁定" : "布景组已解锁"
      );
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-blockout-object-visible]")) {
    const group = project.scene.blockout.groups.find((candidate) => (
      candidate.id === button.dataset.parentGroupId
    ));
    const object = group?.objects.find((candidate) => (
      candidate.id === button.dataset.toggleBlockoutObjectVisible
    ));
    button.disabled = !canAuthor() || blockout.locked === true || group?.locked === true;
    button.addEventListener("click", () => {
      if (!group || !object) return;
      const visible = object.visible === false;
      void commitProject(
        (current) => updateBlockoutObject(current, group.id, object.id, { visible }),
        visible ? "布景对象已显示" : "布景对象已隐藏"
      );
    });
  }
  for (const button of elements.actorsList.querySelectorAll("[data-toggle-blockout-object-locked]")) {
    const group = project.scene.blockout.groups.find((candidate) => (
      candidate.id === button.dataset.parentGroupId
    ));
    const object = group?.objects.find((candidate) => (
      candidate.id === button.dataset.toggleBlockoutObjectLocked
    ));
    button.disabled = !canAuthor() || blockout.locked === true || group?.locked === true;
    button.addEventListener("click", () => {
      if (!group || !object) return;
      const locked = !object.locked;
      void commitProject(
        (current) => updateBlockoutObject(current, group.id, object.id, { locked }),
        locked ? "布景对象已锁定" : "布景对象已解锁"
      );
    });
  }
}

function closeActorContextMenu() {
  document.getElementById("actorContextMenu")?.remove();
}

// Shot / 机位列表的通用右键菜单，复用 #actorContextMenu 的样式与关闭逻辑。
function openListContextMenu(clientX, clientY, items) {
  closeActorContextMenu();
  const menu = document.createElement("div");
  menu.id = "actorContextMenu";
  menu.className = "actor-context-menu";
  menu.setAttribute("role", "menu");
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    if (item.danger) button.className = "danger";
    button.disabled = Boolean(item.disabled);
    button.textContent = item.label;
    button.addEventListener("click", () => {
      closeActorContextMenu();
      item.action();
    });
    menu.append(button);
  }
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
}

function openActorContextMenu(actorID, clientX, clientY, row) {
  const actor = findActor(project, actorID);
  if (!actor) return;
  closeActorContextMenu();
  if (selectedActorID !== actorID) {
    selectActor(actorID);
    row = elements.actorsList.querySelector(
      `[data-actor-row="${CSS.escape(actorID)}"]`
    ) || row;
  }
  const pairedAction = null;
  const pairedLocked = pairedAction && ["X", "Y"].some((roleName) => (
    findActor(project, pairedAction.roles[roleName].actorID)?.locked
  ));
  const menu = document.createElement("div");
  menu.id = "actorContextMenu";
  menu.className = "actor-context-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
      <button type="button" role="menuitem" data-context-duplicate ${canAuthor() ? "" : "disabled"}>复制演员</button>
      <button type="button" role="menuitem" class="danger" data-context-delete ${canAuthor() && !actor.locked ? "" : "disabled"}>删除演员</button>
    `;
  document.body.appendChild(menu);
  const rowRect = row.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const anchorX = clientX || rowRect.right - 12;
  const anchorY = clientY || rowRect.top + rowRect.height / 2;
  menu.style.left = `${Math.max(8, Math.min(anchorX, window.innerWidth - menuRect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(anchorY, window.innerHeight - menuRect.height - 8))}px`;
  menu.querySelector("[data-context-duplicate]")?.addEventListener("click", () => {
    closeActorContextMenu();
    duplicateActorFromList(actorID);
  });
  menu.querySelector("[data-context-delete]")?.addEventListener("click", () => {
    closeActorContextMenu();
    void commitProject((current) => deleteActor(current, actorID), "演员已删除");
  });
  {}
  menu.querySelector("button:not(:disabled)")?.focus();
}

function openObjectContextMenu(objectID, clientX, clientY, row) {
  closeActorContextMenu();
  const environmentGroup = project.scene.environment.groups.find((candidate) => candidate.id === objectID);
  const group = project.scene.blockout.groups.find((candidate) => candidate.id === objectID);
  const objectGroup = group
    ? null
    : project.scene.blockout.groups.find((candidate) => (
        candidate.objects.some((object) => object.id === objectID)
      ));
  const object = objectGroup?.objects.find((candidate) => candidate.id === objectID);
  const environment = project.scene.environment.visuals.find((visual) => visual.id === objectID) || null;
  if (!environmentGroup && !group && !object && !environment) return;
  if (environmentGroup) selectSceneObject({ kind: "environmentGroup", id: environmentGroup.id, parentID: null });
  else if (group) selectSceneObject({ kind: "blockoutGroup", id: group.id, parentID: null });
  else if (object) selectSceneObject({
    kind: "blockoutObject",
    id: object.id,
    parentID: objectGroup.id,
  });
  else if (!selectedEnvironmentIDs.has(environment.id)) {
    selectSceneObject({ kind: "environment", id: environment.id, parentID: null });
  }

  const locked = project.scene.blockout.locked === true
    || group?.locked === true
    || objectGroup?.locked === true
    || object?.locked === true;
  const menu = document.createElement("div");
  menu.id = "actorContextMenu";
  menu.className = "actor-context-menu";
  menu.setAttribute("role", "menu");
  const selectedEnvironments = environment
    ? project.scene.environment.visuals.filter((visual) => selectedEnvironmentIDs.has(visual.id))
    : [];
  const selectedEnvironmentsEditable = selectedEnvironments.every((visual) => (
    !visual.locked
    && !project.scene.environment.groups.some((group) => group.id === visual.groupID && group.locked)
  ));
  const environmentParent = environment?.groupID
    ? project.scene.environment.groups.find((candidate) => candidate.id === environment.groupID)
    : null;
  menu.innerHTML = environmentGroup
    ? `<button type="button" role="menuitem" data-context-dissolve-environment-group ${canAuthor() && !environmentGroup.locked ? "" : "disabled"}>解散环境组</button>
       <button type="button" role="menuitem" class="danger" data-context-delete-environment-group ${canAuthor() && !environmentGroup.locked ? "" : "disabled"}>删除组及组内资产</button>`
    : environment
      ? `
        <button type="button" role="menuitem" data-context-group-environments ${canAuthor() && selectedEnvironments.length && selectedEnvironmentsEditable ? "" : "disabled"}>将所选 ${selectedEnvironments.length} 项成组</button>
        ${environment.groupID ? `<button type="button" role="menuitem" data-context-remove-from-environment-group ${canAuthor() && !environment.locked && !environmentParent?.locked ? "" : "disabled"}>移出环境组</button>` : ""}
        <button type="button" role="menuitem" class="danger" data-context-remove-environment ${canAuthor() && !environment.locked && !environmentParent?.locked ? "" : "disabled"}>移除环境资产</button>`
    : `
      <button type="button" role="menuitem" data-context-duplicate ${canAuthor() ? "" : "disabled"}>复制${group ? "布景组" : "对象"}</button>
      <button type="button" role="menuitem" class="danger" data-context-delete ${canAuthor() && !locked ? "" : "disabled"}>删除${group ? "布景组" : "对象"}</button>`;
  document.body.appendChild(menu);
  const rowRect = row.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const anchorX = clientX || rowRect.right - 12;
  const anchorY = clientY || rowRect.top + rowRect.height / 2;
  menu.style.left = `${Math.max(8, Math.min(anchorX, window.innerWidth - menuRect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(anchorY, window.innerHeight - menuRect.height - 8))}px`;
  menu.querySelector("[data-context-duplicate]")?.addEventListener("click", () => {
    closeActorContextMenu();
    if (group) duplicateBlockoutGroupFromList(group.id);
    else duplicateBlockoutObjectFromList(objectGroup.id, object.id);
  });
  menu.querySelector("[data-context-delete]")?.addEventListener("click", () => {
    closeActorContextMenu();
    if (group) deleteBlockoutGroupFromList(group.id);
    else deleteBlockoutObjectFromList(objectGroup.id, object.id);
  });
  menu.querySelector("[data-context-remove-environment]")?.addEventListener("click", () => {
    closeActorContextMenu();
    environmentFocusID = null;
    project = projectState.commit(removeVisualEnvironment(project, environment.id));
    selectedObject = project.scene.blockout.groups.length
      ? { kind: "blockoutLayer", id: "blockout", parentID: null }
      : project.scene.environment.visuals[0]
        ? { kind: "environment", id: project.scene.environment.visuals[0].id, parentID: null }
        : null;
    finishAuthoredChange("视觉环境已从 Scene 移除，可使用撤销恢复");
  });
  menu.querySelector("[data-context-group-environments]")?.addEventListener("click", () => {
    closeActorContextMenu();
    createEnvironmentGroupFromSelection();
  });
  menu.querySelector("[data-context-remove-from-environment-group]")?.addEventListener("click", () => {
    closeActorContextMenu();
    project = projectState.commit(assignVisualEnvironmentsToGroup(project, [environment.id], null));
    selectedEnvironmentIDs.clear();
    selectedEnvironmentIDs.add(environment.id);
    selectedObject = { kind: "environment", id: environment.id, parentID: null };
    finishAuthoredChange("视觉环境已移出组");
  });
  menu.querySelector("[data-context-dissolve-environment-group]")?.addEventListener("click", () => {
    closeActorContextMenu();
    dissolveEnvironmentGroupFromList(environmentGroup.id);
  });
  menu.querySelector("[data-context-delete-environment-group]")?.addEventListener("click", () => {
    closeActorContextMenu();
    deleteEnvironmentGroupFromList(environmentGroup.id);
  });
  menu.querySelector("button:not(:disabled)")?.focus();
}

function createEnvironmentGroupFromSelection() {
  const environmentIDs = project.scene.environment.visuals
    .filter((visual) => selectedEnvironmentIDs.has(visual.id))
    .map((visual) => visual.id);
  if (!environmentIDs.length) return;
  const beforeIDs = new Set(project.scene.environment.groups.map((group) => group.id));
  project = projectState.commit(createVisualEnvironmentGroup(project, environmentIDs, {
    name: `环境组 ${project.scene.environment.groups.length + 1}`,
  }));
  const group = project.scene.environment.groups.find((candidate) => !beforeIDs.has(candidate.id));
  if (!group) return;
  selectedEnvironmentIDs.clear();
  selectedObject = { kind: "environmentGroup", id: group.id, parentID: null };
  expandedEnvironmentGroupIDs.add(group.id);
  finishAuthoredChange(`已将 ${environmentIDs.length} 个视觉环境成组`);
}

function dissolveEnvironmentGroupFromList(groupID) {
  const group = project.scene.environment.groups.find((candidate) => candidate.id === groupID);
  if (!group) return;
  const memberIDs = project.scene.environment.visuals
    .filter((visual) => visual.groupID === groupID)
    .map((visual) => visual.id);
  project = projectState.commit(dissolveVisualEnvironmentGroup(project, groupID));
  expandedEnvironmentGroupIDs.delete(groupID);
  selectedEnvironmentIDs.clear();
  if (memberIDs[0]) {
    selectedEnvironmentIDs.add(memberIDs[0]);
    selectedObject = { kind: "environment", id: memberIDs[0], parentID: null };
  } else {
    selectedObject = null;
  }
  finishAuthoredChange("环境组已解散，成员位置保持不变");
}

function deleteEnvironmentGroupFromList(groupID) {
  const group = project.scene.environment.groups.find((candidate) => candidate.id === groupID);
  if (!group || group.locked) return;
  const memberIDs = project.scene.environment.visuals
    .filter((visual) => visual.groupID === groupID)
    .map((visual) => visual.id);
  project = projectState.commit(removeVisualEnvironmentGroup(project, groupID));
  expandedEnvironmentGroupIDs.delete(groupID);
  for (const memberID of memberIDs) selectedEnvironmentIDs.delete(memberID);
  if (memberIDs.includes(environmentSelectionAnchorID)) environmentSelectionAnchorID = null;
  if (memberIDs.includes(environmentFocusID)) environmentFocusID = null;
  if (
    (selectedObject?.kind === "environmentGroup" && selectedObject.id === groupID)
    || (selectedObject?.kind === "environment" && memberIDs.includes(selectedObject.id))
  ) selectedObject = null;
  finishAuthoredChange(`环境组及 ${memberIDs.length} 个资产已删除，可撤销恢复`);
}

function openBlockoutLayerContextMenu(clientX, clientY, row) {
  closeActorContextMenu();
  if (selectedObject?.kind !== "blockoutLayer") {
    selectSceneObject({ kind: "blockoutLayer", id: "blockout", parentID: null });
    row = elements.actorsList.querySelector("[data-blockout-layer-row]") || row;
  }
  const hasContent = project.scene.blockout.groups.length > 0;
  const locked = project.scene.blockout.locked === true;
  const menu = document.createElement("div");
  menu.id = "actorContextMenu";
  menu.className = "actor-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "布景整体操作");
  menu.innerHTML = `
    <button type="button" role="menuitem" class="danger" data-context-clear-blockout ${canAuthor() && hasContent && !locked ? "" : "disabled"}>删除全部布景</button>
  `;
  document.body.appendChild(menu);
  const rowRect = row.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const anchorX = clientX || rowRect.right - 12;
  const anchorY = clientY || rowRect.top + rowRect.height / 2;
  menu.style.left = `${Math.max(8, Math.min(anchorX, window.innerWidth - menuRect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(anchorY, window.innerHeight - menuRect.height - 8))}px`;
  menu.querySelector("[data-context-clear-blockout]")?.addEventListener("click", () => {
    closeActorContextMenu();
    project = projectState.commit(clearBlockout(project));
    expandedBlockoutGroupIDs.clear();
    selectedObject = { kind: "blockoutLayer", id: "blockout", parentID: null };
    finishAuthoredChange("布景内容已删除，可使用撤销恢复");
  });
  menu.querySelector("button:not(:disabled)")?.focus();
}

function duplicateBlockoutGroupFromList(groupID) {
  const beforeIDs = new Set(project.scene.blockout.groups.map((group) => group.id));
  project = projectState.commit(duplicateBlockoutGroup(project, groupID));
  const duplicate = project.scene.blockout.groups.find((group) => !beforeIDs.has(group.id));
  if (duplicate) {
    expandedBlockoutGroupIDs.add(duplicate.id);
    selectedObject = { kind: "blockoutGroup", id: duplicate.id, parentID: null };
  }
  finishAuthoredChange("布景组已复制");
}

function duplicateBlockoutObjectFromList(groupID, objectID) {
  const beforeIDs = new Set(
    project.scene.blockout.groups.find((group) => group.id === groupID)?.objects.map((object) => object.id)
      || []
  );
  project = projectState.commit(duplicateBlockoutObject(project, groupID, objectID));
  const group = project.scene.blockout.groups.find((candidate) => candidate.id === groupID);
  const duplicate = group?.objects.find((object) => !beforeIDs.has(object.id));
  if (duplicate) {
    expandedBlockoutGroupIDs.add(groupID);
    selectedObject = { kind: "blockoutObject", id: duplicate.id, parentID: groupID };
  }
  finishAuthoredChange("布景对象已复制");
}

function deleteBlockoutGroupFromList(groupID) {
  project = projectState.commit(deleteBlockoutGroup(project, groupID));
  selectedObject = project.scene.blockout.groups.length
    ? { kind: "blockoutLayer", id: "blockout", parentID: null }
    : project.scene.environment.visuals[0]
      ? { kind: "environment", id: project.scene.environment.visuals[0].id, parentID: null }
      : null;
  finishAuthoredChange("布景组已删除，可使用撤销恢复");
}

function deleteBlockoutObjectFromList(groupID, objectID) {
  project = projectState.commit(deleteBlockoutObject(project, groupID, objectID));
  selectedObject = project.scene.blockout.groups.some((group) => group.id === groupID)
    ? { kind: "blockoutGroup", id: groupID, parentID: null }
    : null;
  finishAuthoredChange("布景对象已删除，可使用撤销恢复");
}

function duplicateActorFromList(actorID) {
  if (!canAuthor() || !findActor(project, actorID)) return;
  const previousIDs = new Set(project.scene.actors.map((actor) => actor.id));
  project = projectState.commit(duplicateActor(project, actorID));
  selectedActorID = project.scene.actors.find((actor) => !previousIDs.has(actor.id))?.id || actorID;
  selectedObject = { kind: "actor", id: selectedActorID, parentID: null };
  selectedPathPointID = null;
  inspectorPanel = "actor";
  finishAuthoredChange("演员已复制");
}

function renderCameraSetupsSidebar() {
  const setups = project.scene.cameraSetups;
  const selected = findCameraSetup(project, selectedCameraSetupID) || setups[0];
  elements.actorsList.innerHTML = setups.map((setup, index) => {
    const isSelected = setup.id === selected?.id;
    const position = setup.pose.position;
    
    return `
      <article class="shot-sidebar-item ${isSelected ? "selected" : ""}" role="listitem">
        <button class="shot-sidebar-select" type="button" data-camera-setup-id="${escapeHTML(setup.id)}" aria-pressed="${isSelected}">
          <span class="shot-sidebar-index">M${String(index + 1).padStart(2, "0")}</span>
          <span class="shot-sidebar-copy">
            <strong>${escapeHTML(setup.name)}</strong>
            <small>${Math.round(setup.pose.focalLength)}mm · x ${formatNumber(position.x)} / y ${formatNumber(position.y)} / z ${formatNumber(position.z)}</small>
          </span>
        </button>
      </article>`;
  }).join("");
  for (const button of elements.actorsList.querySelectorAll("[data-camera-setup-id]")) {
    button.addEventListener("click", () => selectCameraSetup(button.dataset.cameraSetupId));
  }
  // 改名在 Inspector；查看/更新/复制/删除收进右键菜单。
  for (const row of elements.actorsList.querySelectorAll("article.shot-sidebar-item")) {
    const setupID = row.querySelector("[data-camera-setup-id]")?.dataset.cameraSetupId;
    if (!setupID) continue;
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      selectCameraSetup(setupID);
      openListContextMenu(event.clientX, event.clientY, [
        { label: "查看机位", action: () => previewCameraSetup(setupID) },
        {
          label: "写入未保存构图",
          disabled: !canAuthor() || !cameraEditSession.setupEdit(setupID),
          action: () => updateSelectedCameraSetup(setupID),
        },
        { label: "复制机位", disabled: !canAuthor(), action: () => duplicateSelectedCameraSetup(setupID) },
        { label: "删除机位", danger: true, disabled: !canAuthor() || setups.length <= 1, action: () => deleteSelectedCameraSetup(setupID) },
      ]);
    });
  }
}

function renderShotsSidebar() {
  const shots = project.scene.shots;
  const activeShot = findShot(project);
  if (!shots.length) {
    elements.actorsList.innerHTML = `<div class="actors-empty">还没有运镜。<br>先在 Scene View 调整观察机位，再新建第一个运镜。</div>`;
    return;
  }
  elements.actorsList.innerHTML = shots.map((shot, index) => {
    const selected = shot.id === activeShot?.id;
    const keyframeCount = shot.camera.track.keyframes.length;
    const duration = cameraTrackDuration(shot.camera.track);
    return `
      <article class="shot-sidebar-item ${selected ? "selected" : ""}" role="listitem" data-shot-row="${escapeHTML(shot.id)}">
        <button class="shot-sidebar-select" type="button" data-shot-id="${escapeHTML(shot.id)}" aria-pressed="${selected}">
          <span class="shot-sidebar-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="shot-sidebar-copy">
            <strong>${escapeHTML(shot.name)}</strong>
            <small>${shot.aspectRatio} · ${keyframeCount} 关键帧 · ${duration.toFixed(1)}s</small>
          </span>
        </button>
      </article>`;
  }).join("");
  for (const button of elements.actorsList.querySelectorAll("[data-shot-id]")) {
    button.addEventListener("click", () => selectShot(button.dataset.shotId));
  }
  // 改名在 Inspector 的「运镜设置」；复制/删除走右键，与演员/布景一致。
  for (const row of elements.actorsList.querySelectorAll("[data-shot-row]")) {
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const shotID = row.dataset.shotRow;
      selectShot(shotID);
      openListContextMenu(event.clientX, event.clientY, [
        { label: "复制运镜", disabled: !canAuthor(), action: () => duplicateSelectedShot(shotID) },
        { label: "删除运镜", danger: true, disabled: !canAuthor(), action: () => deleteSelectedShot(shotID) },
      ]);
    });
  }
}

function renderInspectorTabs() {
  const cameraAuthoringView = viewportMode === viewportModes.camera || editViewMode === "shot";
  // 这一行回答「你在看哪一类东西」，不回答「它叫什么」——名字就在下面第一个字段里，
  // 由用户改。标题重复名字的话，同一个字符串会隔两行出现两次。
  // 演员是例外：它没有可改的名字，序号就是它的身份，别处也不重复。
  let title = "对象";
  if (inspectorPanel === "scene") title = "场景设置";
  else if (inspectorPanel === "camera") {
    title = selectedObject?.kind === "cameraSetup" ? "机位" : "运镜";
  } else if (selectedObject?.kind === "actor") {
    title = "演员";
  } else if (selectedObject?.kind === "environment") {
    title = "视觉环境";
  } else if (selectedObject?.kind === "blockoutGroup") {
    title = "布景组";
  } else if (selectedObject?.kind === "blockoutObject") {
    title = "布景对象";
  } else if (selectedObject?.kind === "blockoutLayer") {
    title = "布景整体";
  }
  elements.inspectorTitle.textContent = title;
  elements.sceneSettingsButton.disabled = cameraAuthoringView;
  elements.sceneSettingsButton.setAttribute("aria-pressed", String(inspectorPanel === "scene"));
  // 时间轴中间那块回答的是同一个问题，所以挂在这里 —— 每条选中路径都会经过
  // renderInspectorTabs，逐个去补 renderCameraTimeline 会漏，而且重画整条太重。
  renderTimelineSelection();
}

function renderTimelineSelection() {
  const slot = document.getElementById("timelineSelection");
  if (!slot) return;
  const count = currentCameraKeyframeIDs().size;
  const selection = count > 1 ? { type: "关键帧", name: `已选 ${count} 个` } : selectionSummary();
  slot.innerHTML = selection
    ? `<span class="timeline-selection-type">${escapeHTML(selection.type)}</span>${
      selection.name ? `<strong>${escapeHTML(selection.name)}</strong>` : ""}`
    : "";
}

// 时间轴工具条中间那八百像素原来是空的。放当前选中对象 —— 左簇是「现在几秒」，
// 右簇是「对这一帧做什么」，中间正好回答「做在谁身上」。类型写在前面、名字跟在后面，
// 和检查器顶栏同一套说法（那里写类型，名字在下面第一个字段里）。
function selectionSummary() {
  const kind = selectedObject?.kind;
  if (kind === "cameraSetup") {
    const setup = findCameraSetup(project, selectedObject.id);
    return setup ? { type: "机位", name: setup.name } : null;
  }
  if (kind === "actor") {
    const index = project.scene.actors.findIndex((actor) => actor.id === selectedObject.id);
    return index >= 0 ? { type: "演员", name: actorTimelineName(index) } : null;
  }
  {}
  if (kind === "environment") {
    const visual = project.scene.environment.visuals.find(
      (candidate) => candidate.id === selectedObject.id
    );
    return visual ? { type: "视觉环境", name: visual.name } : null;
  }
  if (kind === "environmentGroup") {
    const group = project.scene.environment.groups.find(
      (candidate) => candidate.id === selectedObject.id
    );
    return group ? { type: "环境组", name: group.name } : null;
  }
  if (kind === "blockoutLayer") return { type: "布景整体", name: "" };
  if (kind === "blockoutGroup" || kind === "blockoutObject") {
    for (const group of project.scene.blockout.groups) {
      if (kind === "blockoutGroup" && group.id === selectedObject.id) {
        return { type: "布景组", name: group.name };
      }
      const object = group.objects.find((candidate) => candidate.id === selectedObject.id);
      if (object) return { type: "布景对象", name: object.name };
    }
    return null;
  }
  const shot = findShot(project);
  return shot ? { type: "运镜", name: shot.name } : null;
}

function renderViewportMode() {
  const cameraReady = cameraTrackReady(activeCameraTrack());
  const cameraActive = viewportMode === viewportModes.camera;
  elements.editMode.classList.toggle("selected", !cameraActive);
  elements.editMode.setAttribute("aria-pressed", String(!cameraActive));
  elements.cameraMode.classList.toggle("selected", cameraActive);
  elements.cameraMode.setAttribute("aria-pressed", String(cameraActive));
  elements.editMode.disabled = isExporting();
  elements.cameraMode.disabled = !cameraReady || isExporting() || Boolean(cameraOrbitDraft);
  elements.cameraMode.title = cameraOrbitDraft
    ? "请先应用或取消当前环绕预览"
    : cameraReady ? "切换到 Export 预览与输出" : "先新建运镜并保存摄影机关键帧";
  elements.appShell.classList.toggle("camera-workspace", cameraActive);
  elements.appShell.dataset.viewportMode = viewportMode;
  // Edit/Camera 切换器是同一个节点，在顶栏和 Camera 工具行之间搬迁：
  // Export 模式下顶栏整行隐藏，两个模式共用一行骨架，按钮不再跳位。
  const switchGroup = document.querySelector(".viewport-mode-switch");
  const cameraSlot = document.getElementById("cameraModeSwitchSlot");
  const topActions = document.querySelector(".top-actions");
  if (switchGroup && cameraSlot && topActions) {
    if (cameraActive && switchGroup.parentElement !== cameraSlot) cameraSlot.append(switchGroup);
    else if (!cameraActive && switchGroup.parentElement !== topActions) topActions.prepend(switchGroup);
  }
  const helpButton = document.getElementById("showShortcuts");
  if (cameraActive) cameraSlot.append(helpButton);
  else topActions.insertBefore(helpButton, document.getElementById("exitServiceLite"));
  renderEditViewMode();
}

function renderCameraWorkspace() {
  const shot=findShot(project), duration=shotOutputDuration(project,shot), busy=isExporting(), resolution=selectedShotOutputResolution();
  elements.cameraWorkspace.style.setProperty('--camera-aspect',String(aspectRatioValue(currentCameraWorkspacePreview().aspect)));
  elements.cameraWorkspace.dataset.cameraOperationMode='shot';
  elements.cameraShotSelect.innerHTML=project.scene.shots.map(candidate => '<option value="'+escapeHTML(candidate.id)+'" '+(candidate.id===shot?.id?'selected':'')+'>'+escapeHTML(candidate.name)+'</option>').join('');
  elements.cameraShotSelect.disabled=busy || playback.status==='playing' || project.scene.shots.length<2;
  elements.cameraOutputSpec.textContent=resolution.width+'×'+resolution.height+' · '+project.output.frameRate+' fps';
  elements.chooseOutputFolder.textContent=project.output.folder?outputFolderLabel(project.output.folder):'选择输出文件夹';
  elements.chooseOutputFolder.title=project.output.folder||'选择输出文件夹'; elements.chooseOutputFolder.disabled=busy;
  elements.revealCameraOutput.disabled=busy||!(exportState.lastResult?.outputPath||project.output.folder);
  elements.cameraProgress.max=String(duration); elements.cameraProgress.step=String(1/project.output.frameRate);
  elements.cameraTotalTime.textContent=formatTime(duration); elements.cameraRecordActions.hidden=false;
  elements.cancelCameraExport.hidden=!busy || exportState.status==='encoding';
  elements.recordCameraOutput.disabled=busy||!shot||!cameraTrackReady(shot.camera.track);
  updateCameraWorkspaceTransport(); updateCameraExportProgress(); enhanceAllSelects();
}

function updateCameraWorkspaceTransport() {
  const duration = playback.duration;
  const status = playback.status;
  const busy = isExporting();
  const shot = findShot(project);
  const liveMode = false;
  const liveState = null;
  const pairedLive = liveMode;
  const sampledCamera = shot
    ? sampleShotCamera(project, shot, playback.elapsed, currentProjectSamples())
    : null;
  const constraintWarning = sampledCamera?.followEvaluation?.warning
    || sampledCamera?.aimEvaluation?.warning
    || null;
  if (!cameraProgressScrubbing) elements.cameraProgress.value = String(playback.elapsed);
  elements.cameraCurrentTime.textContent = formatTime(playback.elapsed);
  elements.cameraPlay.disabled = busy || duration <= 0 || status === "playing"
    || (pairedLive);
  elements.cameraPause.disabled = busy || status !== "playing" || pairedLive;
  elements.cameraReset.disabled = busy || (duration <= 0 && status === "idle");
  elements.cameraJumpStart.disabled = busy || pairedLive || playback.elapsed <= 0;
  elements.cameraJumpEnd.disabled = busy || pairedLive || duration <= 0 || playback.elapsed >= duration;
  elements.cameraStepBack.disabled = busy || pairedLive || playback.elapsed <= 0;
  elements.cameraStepForward.disabled = busy || pairedLive || duration <= 0 || playback.elapsed >= duration;
  elements.cameraProgress.disabled = busy || pairedLive || duration <= 0;
  elements.cameraPlay.classList.toggle("playing", status === "playing");
  if (!isExporting()) {
    const labels = {
      idle: "选中 Shot 与人物共享同一时间轴",
      playing: "正在预演人物与摄影机",
      paused: "已暂停，可逐帧检查",
      completed: "播放完成",
    };
    elements.cameraProgressLabel.textContent = constraintWarning
      || (exportState.status === "success"
      ? `${exportState.lastResult.fileName} · 已生成`
      : exportState.status === "error"
        ? "上次输出失败，可重试"
        : labels[status]);
  }
}

function updateCameraExportProgress() {
  const busy = isExporting();
  elements.cameraExportProgress.hidden = !busy;
  elements.cameraExportProgress.max = Math.max(exportState.frameCount, 1);
  elements.cameraExportProgress.value = exportState.completedFrames;
  if (!busy) return;
  const labels = {
    preparing: "正在载入输出所需资产",
    rendering: `逐帧渲染 ${exportState.completedFrames} / ${exportState.frameCount}`,
    encoding: "正在编码 H.264 MP4",
    "baking-blend": `正在烘焙 Blender 场景 ${exportState.completedFrames} / ${exportState.frameCount}`,
    "building-blend": "正在创建并验证 .blend",
    cancelling: "正在取消输出",
  };
  elements.cameraProgressLabel.textContent = labels[exportState.status] || "正在生成输出";
}

function selectedShotOutputResolution() {
  const shot = findShot(project);
  return projectOutputResolution(project, shot?.aspectRatio || project.output.defaultAspectRatio);
}

function outputFolderLabel(folder) {
  const components = String(folder).split("/").filter(Boolean);
  return components.at(-1) || folder;
}

function renderEditViewMode() {
  const setupMode = sceneSidebarMode === "setups";
  const setup = setupMode ? findCameraSetup(project, selectedCameraSetupID) : null;
  const cameraReady = cameraTrackReady(activeCameraTrack());
  const targetActive = setupMode
    ? cameraSetupViewActive(setup?.id)
    : editViewMode === "shot";
  elements.sceneView.textContent = "Scene View";
  elements.shotView.textContent = setupMode ? "Still View" : "Shot View";
  elements.sceneView.classList.toggle("selected", !targetActive);
  elements.sceneView.setAttribute("aria-pressed", String(!targetActive));
  elements.shotView.classList.toggle("selected", targetActive);
  elements.shotView.setAttribute("aria-pressed", String(targetActive));
  elements.shotView.disabled = viewportMode !== viewportModes.edit
    || (setupMode ? !setup : !cameraReady);
  elements.shotView.title = setupMode
    ? setup ? "从当前机位观察构图（C）" : "先选择一个机位"
    : cameraReady ? "从当前 Shot 摄影机观察构图（C）" : "先新建运镜并记录摄影机起点";
  elements.sceneView.disabled = viewportMode !== viewportModes.edit;
  const namedMode = setupMode ? targetActive ? "still" : "scene" : editViewMode;
  elements.editViewSwitch.dataset.editViewMode = namedMode;
  renderCameraSpeedControl?.();
  elements.appShell.dataset.editViewMode = namedMode;
  const sceneCameraDraft = editViewMode === "scene" && !cameraEditSession.isViewingSetup()
    ? cameraEditSession.edit
    : null;
  const showDraftStatus = Boolean(viewportMode === viewportModes.edit && sceneCameraDraft);
  if (elements.shotDraftViewportStatus) elements.shotDraftViewportStatus.hidden = !showDraftStatus;
  if (showDraftStatus && elements.shotDraftViewportLabel) {
    const isSetupDraft = sceneCameraDraft.kind === cameraEditKinds.setup;
    const targetName = isSetupDraft
      ? findCameraSetup(project, sceneCameraDraft.targetID)?.name || "当前机位"
      : findShot(project)?.name || "当前 Shot";
    elements.shotDraftViewportLabel.textContent = `${targetName} · 有未写入调整`;
    if (elements.shotDraftReturn) elements.shotDraftReturn.textContent = isSetupDraft ? "返回 Still View" : "返回 Shot View";
    if (elements.shotDraftWrite) elements.shotDraftWrite.textContent = isSetupDraft ? "写入机位调整" : "写入 Shot 调整";
    if (elements.shotDraftDiscard) elements.shotDraftDiscard.textContent = "放弃调整";
  }
  updateShotComposition();
}

function syncCameraSetupVanishingPointControl() {
  const reset = document.getElementById("cameraSetupVanishingPointReset");
  if (!reset) return;
  const { x, y } = cameraSetupCompositionGuide.vanishingPoint;
  const position = `横向 ${Math.round(x * 100)}%，纵向 ${Math.round(y * 100)}%`;
  reset.setAttribute("aria-label", `重置消失点到中心；当前位置${position}；方向键微调，按住 Shift 粗调`);
  reset.title = `可直接拖动画面中的消失点；聚焦此按钮后用方向键微调。当前位置：${position}`;
}

function renderCameraSetupCompositionGuide({ visible, aspectRatio, frame }) {
  const guide = elements.cameraCompositionGuide;
  const active = Boolean(visible && cameraSetupCompositionGuide.type !== "none");
  // SVGElement 没有 HTMLElement.hidden 的反射属性；必须直接切换 attribute。
  guide.toggleAttribute("hidden", !active);
  guide.classList.toggle("interactive", active && cameraSetupCompositionGuide.type === "one-point");
  if (!active) {
    guide.replaceChildren();
    return;
  }

  const geometry = cameraCompositionGuideGeometry(cameraSetupCompositionGuide, aspectRatio);
  const coordinate = (value) => (Number(value) * 1000).toFixed(3);
  const width = Math.max(Number(frame?.width || elements.shotOutputFrame.clientWidth), 1);
  const height = Math.max(Number(frame?.height || elements.shotOutputFrame.clientHeight), 1);
  const ellipse = (candidate, radius, className, attributes = "") => (
    `<ellipse class="${className}" cx="${coordinate(candidate.x)}" cy="${coordinate(candidate.y)}" `
    + `rx="${(radius * 1000 / width).toFixed(3)}" ry="${(radius * 1000 / height).toFixed(3)}" ${attributes}/>`
  );
  const lines = geometry.lines.map((candidate) => (
    `<line class="camera-composition-guide-line ${candidate.kind === "minor" ? "minor" : "major"}" `
    + `x1="${coordinate(candidate.from.x)}" y1="${coordinate(candidate.from.y)}" `
    + `x2="${coordinate(candidate.to.x)}" y2="${coordinate(candidate.to.y)}"/>`
  )).join("");
  const points = geometry.points.map((candidate) => ellipse(
    candidate,
    candidate.kind === "vanishing" ? 4.5 : 3,
    `camera-composition-guide-point ${candidate.kind}`
  )).join("");
  const handle = geometry.interactive
    ? ellipse(
        geometry.vanishingPoint,
        18,
        "camera-composition-guide-handle",
        'data-composition-guide-handle="true"'
      )
    : "";
  guide.innerHTML = `${lines}${points}${handle}`;
  syncCameraSetupVanishingPointControl();
}

function updateShotComposition() {
  const shot = findShot(project);
  const track = shot?.camera?.track;
  const ready = cameraTrackReady(track);
  const shotFrameVisible = viewportMode === viewportModes.edit && editViewMode === "shot" && ready;
  // 只有真正处于机位观察模式时才使用机位画幅；Shot View 与 Camera 永远服从 Shot。
  const viewedSetup = cameraSetupViewActive()
    ? cameraSetupShortcutSelection()
    : null;
  const setupEdit = viewedSetup ? cameraEditSession.setupEdit(viewedSetup.id) : null;
  const sceneFrameVisible = viewportMode === viewportModes.edit
    && editViewMode === "scene"
    && Boolean(viewedSetup);
  const visible = shotFrameVisible || sceneFrameVisible;
  elements.shotFrameOverlay.classList.toggle("camera-setup-frame", Boolean(viewedSetup));
  const aspectRatio = cameraCompositionAspect({
    viewportMode,
    editViewMode,
    shotAspectRatio: shot?.aspectRatio,
    defaultAspectRatio: project.output.defaultAspectRatio,
    viewedSetupAspectRatio: setupEdit?.aspectRatio || viewedSetup?.aspectRatio,
  });
  const frame = fitOutputFrame(
    elements.viewport.clientWidth,
    elements.viewport.clientHeight,
    aspectRatio,
    0.08
  );
  directorRenderer.setShotComposition({
    aspectRatio,
    frameHeightFraction: shotFrameVisible ? frame.heightFraction : 0.84,
  });
  // 机位视角使用独立的摄影机投影，自由视角保持观察投影。
  if (viewedSetup) {
    directorRenderer.setSetupFrameComposition({
      aspectRatio,
      frameHeightFraction: frame.heightFraction,
    });
  }
  directorRenderer.setSceneFramePreview({
    enabled: false,
    aspectRatio,
    frameHeightFraction: frame.heightFraction,
  });
  elements.shotFrameOverlay.hidden = !visible;
  renderShotFrameMask();
  if (!visible) {
    renderCameraSetupCompositionGuide({ visible: false, aspectRatio, frame });
    return;
  }
  Object.assign(elements.shotOutputFrame.style, {
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
  });
  renderCameraSetupCompositionGuide({
    visible: Boolean(viewedSetup),
    aspectRatio,
    frame,
  });
  if (sceneFrameVisible) {
    const pose = directorRenderer.captureSetupViewPose();
    elements.shotFrameLabel.textContent = `${viewedSetup.name} · ${aspectRatio} · ${pose.focalLength.toFixed(1)} mm`;
  } else {
    const sample = activeShotCameraEdit()?.pose || sampleCameraTrack(track, playback.elapsed);
    elements.shotFrameLabel.textContent = `${shot.name} · ${aspectRatio} · ${Math.round(sample.focalLength)} mm`;
  }
}

function toggleShotFrameMask() {
  if (viewportMode !== viewportModes.edit) return;
  if (editViewMode !== "shot" && !cameraSetupViewActive()) return;
  shotFrameMaskStrong = !shotFrameMaskStrong;
  renderShotFrameMask();
}

function renderShotFrameMask() {
  const strong = shotFrameMaskStrong;
  elements.shotFrameOverlay.classList.toggle("strong-mask", strong);
}

let focalLengthFeedbackTimer = null;

function showFocalLengthFeedback(valueInput) {
  const focalLength = Math.max(
    cameraFocalLengthMinimum,
    Math.min(cameraFocalLengthMaximum, Number(valueInput) || 35)
  );
  clearTimeout(focalLengthFeedbackTimer);
  elements.focalLengthFeedback.textContent = `${focalLength.toFixed(1)} mm`;
  elements.focalLengthFeedback.hidden = false;
  focalLengthFeedbackTimer = setTimeout(() => {
    elements.focalLengthFeedback.hidden = true;
  }, 900);
}

// 走带在时间轴重建期间的保管处：留在文档里但不可见，节点引用因此始终有效。
function transportStash() {
  let stash = document.getElementById("transportStash");
  if (!stash) {
    stash = document.createElement("div");
    stash.id = "transportStash";
    stash.hidden = true;
    document.body.append(stash);
  }
  return stash;
}

function stashTransportCluster() {
  const cluster = elements.transportCluster;
  if (cluster && cluster.parentElement?.id !== "transportStash") transportStash().append(cluster);
}

function renderCameraTimeline() {
  const focusedKeyframeID = document.activeElement?.dataset.cameraKeyframeId;
  // 时间轴是项目级的：播放头和演员动作时序不依赖 Shot 是否存在。
  // 只有 Camera 轨道属于 Shot，没有 Shot 时它整行不出现。
  const shot = findShot(project);
  const poseActor=actorPoseTarget();
  const recordTarget=keyframeShortcutTarget(sceneSidebarMode,selectedObject);
  const recordingShot=recordTarget?.kind===cameraEditKinds.shot;
  const setupStaged=recordTarget?.kind===cameraEditKinds.setup&&Boolean(cameraEditSession.setupEdit(recordTarget.targetID));
  const setupSaveLabel=setupStaged?'保存当前构图':'构图已保存';
  const poseRecordLabel=poseActor&&actorPoseKeyframeAtTime(poseActor.poseTrack,playback.elapsed,project.output.frameRate)?'更新人物帧':'添加人物帧';
  const visible = viewportMode === viewportModes.edit;
  elements.cameraTimeline.hidden = !visible;
  // 走带是静态节点，寄居在时间轴里。清空 innerHTML 会连它一起销毁，
  // 之后 elements.transportCluster 就指向一个不在文档里的节点，时间轴再也装不回来。
  // 所以任何重建之前，先把它移到保管处。
  stashTransportCluster();
  if (!visible) {
    elements.cameraTimeline.innerHTML = "";
    return;
  }
  const duration = Math.max(rehearsalDuration(), 0.001);
  const frameStep = 1 / project.output.frameRate;
  const track = shot?.camera.track || null;
  const keyframeAtPlayhead = track
    ? cameraKeyframeAtTime(track, playback.elapsed, project.output.frameRate)
    : null;
  const canEdit = Boolean(track) && canEditCamera();
  const selectedKeyframeIDs = currentCameraKeyframeIDs();
  const canDelete = canDeleteCameraKeyframe();
  const shotEdit = activeShotCameraEdit();
  elements.cameraTimeline.classList.toggle("collapsed", timelineCollapsed);
  // 关键帧可以超出 Scene End（outside-scene），所以轨道跨度取两者较大者，
  // Scene End 因此可能落在轨道中间，其右侧压暗表示「场景之外」。
  // 跨度要罩住三者：Scene End、超出它的摄影机关键帧、以及超出它的人物动作。
  // 少算人物那一项，手动 Scene End 短于走位时后面的块会被挤到最右缘 ——
  // 看不见，也就抓不住。
  const span = Math.max(duration, latestCameraKeyframeTime(track), sceneActorEnd(project), 0.001);
  const scale = timelineScale(span);
  elements.cameraTimeline.style.setProperty("--timeline-track-width", `${(span * scale).toFixed(2)}px`);
  elements.cameraTimeline.style.setProperty("--timeline-playhead", String(Math.min(playback.elapsed / span, 1)));
  elements.cameraTimeline.style.setProperty("--timeline-end", String(Math.min(duration / span, 1)));
  elements.cameraTimeline.innerHTML = `
    <header class="camera-timeline-toolbar">
      <div class="timeline-cluster timeline-cluster-time">
        <div id="timelineTransportSlot" class="timeline-transport-slot"></div>
        <i class="timeline-cluster-sep" aria-hidden="true"></i>
        <output id="cameraTimelineTime" class="timeline-timecode">${timelineTimecode()}</output>
        <i class="timeline-cluster-sep" aria-hidden="true"></i>
        <div class="timeline-scene-end" role="group" aria-label="Scene End">
          <label for="timelineSceneEnd">END</label>
          <div class="input-with-unit"><input id="timelineSceneEnd" type="number" min="0.2" max="3600" step="any" data-scrub-step="0.1" value="${duration.toFixed(1)}" ${canAuthor() ? "" : "disabled"} /><span>s</span></div>
        </div>
      </div>
      <div id="timelineSelection" class="timeline-selection" aria-live="polite"></div>
      <div class="camera-timeline-actions">
        ${poseActor?`<button class="timeline-icon-button" data-actor-pose-jump="previous" type="button" aria-label="上一个人物帧">${timelineIcon('prev')}</button>
          <button id="recordActorPoseTimeline" class="timeline-icon-button timeline-record-button" type="button" aria-label="${poseRecordLabel}" title="${poseRecordLabel}（K）" aria-keyshortcuts="K" ${!canAuthor()||poseActor.locked?'disabled':''}>${timelineIcon('keyframe')}<span>${poseRecordLabel}</span></button>
          <button id="selectAllActorPoseFrames" class="timeline-icon-button" type="button" aria-label="全选人物帧" title="全选人物帧（⌘A / Ctrl+A）">全选</button>
          <button class="timeline-icon-button" data-actor-pose-jump="next" type="button" aria-label="下一个人物帧">${timelineIcon('next')}</button>
          <button id="deleteActorPoseTimeline" class="timeline-icon-button danger" type="button" aria-label="删除人物帧" ${!canAuthor()||!currentActorPoseIDs(poseActor).size?'disabled':''}>${timelineIcon('delete')}</button>`:''}
        ${!poseActor&&!recordingShot ? `<button id="recordSelectedKeyframe" class="timeline-icon-button timeline-record-button" type="button" aria-keyshortcuts="K" title="${recordTarget?setupSaveLabel+(setupStaged?'（K）':''):'先选择人物、运镜或机位'}" ${!recordTarget||!canAuthor()||!setupStaged?'disabled':''}>${timelineIcon('keyframe')}<span>${recordTarget?setupSaveLabel:'添加关键帧'}</span></button>`:''}
        <button class="timeline-icon-button" type="button" data-timeline-jump="start" title="回到开始（Ctrl + ,）" aria-label="回到开始" aria-keyshortcuts="Control+Comma">${timelineIcon("jumpStart")}</button>
        ${track && recordingShot ? `
        <button class="timeline-icon-button" type="button" data-timeline-jump="previous" title="上一个关键帧（Shift + ,）" aria-label="上一个关键帧" aria-keyshortcuts="Shift+Comma">${timelineIcon("prev")}</button>
        <button id="recordCameraKeyframe" class="timeline-icon-button timeline-record-button" type="button" title="${keyframeAtPlayhead ? "更新镜头帧" : "添加镜头帧"}（K）" aria-label="${keyframeAtPlayhead ? "更新镜头帧" : "添加镜头帧"}" aria-keyshortcuts="K" ${canEdit ? "" : "disabled"}>${timelineIcon("keyframe")}<span>${keyframeAtPlayhead ? "更新镜头帧" : "添加镜头帧"}</span></button>
        <button id="cancelCameraEdit" class="timeline-icon-button" type="button" title="取消调整" aria-label="取消调整" ${shotEdit ? "" : "hidden"}>${timelineIcon("cancel")}</button>
        <button class="timeline-icon-button" type="button" data-timeline-jump="next" title="下一个关键帧（Shift + .）" aria-label="下一个关键帧" aria-keyshortcuts="Shift+Period">${timelineIcon("next")}</button>` : ""}
        <button class="timeline-icon-button" type="button" data-timeline-jump="end" title="跳到 Scene End（Ctrl + .）" aria-label="跳到 Scene End" aria-keyshortcuts="Control+Period">${timelineIcon("jumpEnd")}</button>
        ${track && recordingShot ? `<i class="timeline-cluster-sep" aria-hidden="true"></i>
        <button id="deleteCameraKeyframe" class="timeline-icon-button danger" type="button" title="删除关键帧${selectedKeyframeIDs.size > 1 ? `（${deletableCameraKeyframes().length} 个）` : ""}" aria-label="删除关键帧" ${canDelete ? "" : "disabled"}>${timelineIcon("delete")}</button>` : ""}
        <button id="fitCameraTimeline" class="timeline-icon-button" type="button" title="贴合全场（缩到最小）" aria-label="贴合全场" ${timelineCollapsed ? "hidden" : ""}>${timelineIcon("fit")}</button>
        <button id="toggleCameraTimeline" class="timeline-icon-button" type="button" title="${timelineCollapsed ? "展开时间轴" : "收起时间轴"}" aria-label="${timelineCollapsed ? "展开时间轴" : "收起时间轴"}" aria-expanded="${!timelineCollapsed}">${timelineIcon(timelineCollapsed ? "expand" : "collapse")}</button>
      </div>
    </header>
    ${timelineCollapsed ? "" : `
      <div class="camera-timeline-body">
        <div class="timeline-labels" id="timelineLabels" aria-hidden="true">
          <div class="timeline-label-row ruler-row"></div>
          <div class="timeline-label-scroll" id="timelineLabelScroll">
            ${project.scene.actors.map((actor, index) => renderActorTimelineLabel(actor, index)).join("")}
          </div>
          ${!track ? "" : `
          <div class="timeline-label-row camera-row" title="当前运镜的摄影机运动：${escapeHTML(shot.name)}">
            <i class="timeline-lane-badge camera" aria-hidden="true">${timelineIcon("camera")}</i>运镜
          </div>`}
        </div>
        <div class="timeline-lanes" id="timelineLanes">
          <div class="timeline-canvas" id="timelineCanvas" style="width:${(span * scale).toFixed(2)}px">
            <div class="timeline-ruler" aria-hidden="true">
              <div class="timeline-ruler-marks">${timelineRulerMarks(span, span * scale)}</div>
            </div>
            <div class="timeline-actor-viewport" id="timelineActorViewport">
              ${project.scene.actors.map((actor, index) => renderActorTimelineLane(actor, index, span)).join("")}
            </div>
          ${!track ? "" : `
          <div class="timeline-lane camera-lane">
            <div class="timeline-lane-track" data-camera-keyframe-rail>
              ${track.segments.map((segment, index) => {
                const start = track.keyframes[index];
                const end = track.keyframes[index + 1];
                const left = Math.min(start.time / span, 1) * 100;
                const right = Math.min(end.time / span, 1) * 100;
                const label = cameraInterpolationShortLabel(segment.interpolation);
                return `<button class="camera-segment-strip ${segment.interpolation}"
                  type="button"
                  style="left:${left}%;width:${Math.max(right - left, 0.7)}%"
                  data-camera-segment-start="${escapeHTML(segment.startKeyframeID)}"
                  title="关键帧 ${index + 1} → ${index + 2} · ${cameraInterpolationLabel(segment.interpolation)} · ${(end.time - start.time).toFixed(2)} 秒"
                  aria-label="选择分段 ${index + 1} 到 ${index + 2}，${cameraInterpolationLabel(segment.interpolation)}">
                  <span>${label}</span>
                </button>`;
              }).join("")}
              ${track.keyframes.map((keyframe, index) => `
                <button class="camera-keyframe-marker ${selectedKeyframeIDs.has(keyframe.id) ? "selected" : ""} ${keyframe.time > rehearsalDuration() ? "outside-scene" : ""} ${keyframe.aim?.mode === "look-at" ? "look-at" : ""}"
                  type="button"
                  style="left:${keyframeMarkerOffset(keyframe.time / span)}"
                  data-camera-keyframe-id="${escapeHTML(keyframe.id)}"
                  data-camera-keyframe-time="${keyframe.time}"
                  data-camera-aim="${keyframe.aim?.mode || "inherit"}"
                  title="Shift 点击选择区间 · 关键帧 ${index + 1} · ${keyframe.time.toFixed(2)} 秒${keyframe.aim?.mode === "look-at" ? " · 切换 Look At" : ""}"
                  aria-label="关键帧 ${index + 1}，${keyframe.time.toFixed(2)} 秒${keyframe.aim?.mode === "look-at" ? "，切换锁定主体" : ""}"
                  aria-pressed="${selectedKeyframeIDs.has(keyframe.id)}"></button>`).join("")}
            </div>
          </div>`}
            <div class="timeline-beyond-end" aria-hidden="true"></div>
            <i class="timeline-end-line ${canAuthor() ? "draggable" : ""}" id="timelineEndMarker"
              title="拖动调整场景时长"></i>
            <i class="timeline-playhead-line" id="timelinePlayhead" aria-hidden="true"></i>
            <input id="cameraTimelineScrubber" class="timeline-scrub-surface" type="range" min="0" max="${duration}"
              step="${frameStep}" value="${Math.min(playback.elapsed, duration)}" aria-label="时间轴播放头" />
          </div>
        </div>
      </div>`}
  `;
  // 走带是静态节点（elements.* 引用与监听不变），每次重建后搬回槽位。
  document.getElementById("timelineTransportSlot")?.append(elements.transportCluster);
  const sceneEndInput = document.getElementById("timelineSceneEnd");
  wireInputNumberScrub(sceneEndInput);
  sceneEndInput?.addEventListener("change", () => {
    void commitProject(
      (current) => setManualSceneEnd(current, sceneEndInput.value),
      "场景时长已更新"
    );
  });
  wireTimelineEndMarker(duration);
  wireActorTimelineBlocks(span);
  for(const marker of elements.cameraTimeline.querySelectorAll('[data-actor-pose-keyframe-id]'))setupActorPoseMarker(marker,span);
  document.getElementById('recordActorPoseTimeline')?.addEventListener('click',recordSelectedKeyframe);
  document.getElementById('recordSelectedKeyframe')?.addEventListener('click',recordSelectedKeyframe);
  document.getElementById('selectAllActorPoseFrames')?.addEventListener('click',selectAllActorPoseFrames);
  document.getElementById('deleteActorPoseTimeline')?.addEventListener('click',deleteSelectedActorPoseFrames);
  for(const button of elements.cameraTimeline.querySelectorAll('[data-actor-pose-jump]'))button.addEventListener('click',()=>jumpActorPoseFrame(button.dataset.actorPoseJump));
  wireTimelineViewport(span, scale);
  document.getElementById("fitCameraTimeline")?.addEventListener("click", fitTimelineToWindow);
  document.getElementById("toggleCameraTimeline")?.addEventListener("click", () => {
    timelineCollapsed = !timelineCollapsed;
    renderCameraTimeline();
  });
  document.getElementById("recordCameraKeyframe")?.addEventListener("click", recordSelectedKeyframe);
  document.getElementById("cancelCameraEdit")?.addEventListener("click", () => cancelStagedCameraEdit(true));
  document.getElementById("deleteCameraKeyframe")?.addEventListener("click", deleteResolvedCameraKeyframe);
  for (const button of elements.cameraTimeline.querySelectorAll("[data-timeline-jump]")) {
    button.addEventListener("click", () => jumpCameraTimeline(button.dataset.timelineJump));
  }
  const scrubber = document.getElementById("cameraTimelineScrubber");
  scrubber?.addEventListener("pointerdown", () => {
    timelineScrubbing = true;
  });
  scrubber?.addEventListener("input", () => {
    timelineScrubbing = true;
    cancelStagedCameraEdit(false);
    cameraKeyframeSelection.activeID = track
      ? cameraKeyframeAtTime(track, scrubber.value, project.output.frameRate)?.id || null
      : null;
    playback.seek(scrubber.value);
    renderInspector();
  });
  const finishScrubbing = () => {
    if (!timelineScrubbing) return;
    timelineScrubbing = false;
    requestAnimationFrame(renderCameraTimeline);
  };
  scrubber?.addEventListener("change", finishScrubbing);
  scrubber?.addEventListener("pointerup", finishScrubbing);
  scrubber?.addEventListener("pointercancel", finishScrubbing);
  scrubber?.addEventListener("blur", finishScrubbing);
  for (const marker of elements.cameraTimeline.querySelectorAll("[data-camera-keyframe-id]")) {
    setupCameraKeyframeMarker(marker, span);
  }
  for (const segment of elements.cameraTimeline.querySelectorAll("[data-camera-segment-start]")) {
    segment.addEventListener("click", () => selectCameraKeyframe(segment.dataset.cameraSegmentStart));
  }
  renderTimelineSelection();
  updateCameraTimelineProgress(playback);
  if (focusedKeyframeID) focusCameraKeyframe(focusedKeyframeID);
}

// 手动模式下拖动 Scene End 端点；松手才提交，拖动过程只预览数值。
function wireTimelineEndMarker(duration) {
  const marker = document.getElementById("timelineEndMarker");
  if (!marker || !canAuthor()) return;
  const rail = document.getElementById("timelineCanvas");
  if (!rail) return;
  marker.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    try {
      marker.setPointerCapture(event.pointerId);
    } catch {
      // 合成指针没有活动 pointerId；真实拖动才需要捕获。
    }
    const input = document.getElementById("timelineSceneEnd");
    let seconds = duration;
    elements.cameraTimeline.classList.add("scene-end-dragging");
    // 和块拖动同样按秒算：Scene End 可以拖到超出当前跨度（画布随之撑长），
    // 而不是被自己顶出来的那道右墙挡住。
    const apply = (clientX) => {
      const scale = timelinePixelsPerSecond || 1;
      const rect = rail.getBoundingClientRect();
      seconds = Math.max((clientX - rect.left) / scale, 0.2);
      stretchTimelineCanvas(seconds);
      if (input) input.value = seconds.toFixed(1);
      // 直接改驱动变量，而不是只挪标记 —— 端点线、右侧压暗区、拖动区右边界
      // 都由它派生，于是「这段会被裁掉」在拖动过程中就看得见，不必等提交。
      const trackWidth = parseFloat(
        getComputedStyle(elements.cameraTimeline).getPropertyValue("--timeline-track-width")
      ) || rect.width;
      elements.cameraTimeline.style.setProperty("--timeline-end", String(Math.min(seconds * scale / trackWidth, 1)));
    };
    const autoScroll = startTimelineEdgeAutoScroll(apply);
    const move = (moveEvent) => {
      autoScroll.track(moveEvent.clientX);
      apply(moveEvent.clientX);
    };
    const finish = () => {
      autoScroll.stop();
      marker.removeEventListener("pointermove", move);
      marker.removeEventListener("pointerup", finish);
      marker.removeEventListener("pointercancel", finish);
      elements.cameraTimeline.classList.remove("scene-end-dragging");
      void commitProject(
        (current) => setManualSceneEnd(current, seconds),
        "场景时长已更新"
      );
    };
    marker.addEventListener("pointermove", move);
    marker.addEventListener("pointerup", finish);
    marker.addEventListener("pointercancel", finish);
  });
}

function cameraInterpolationLabel(interpolation) {
  return interpolation === "linear" ? "匀速" : interpolation === "smooth" ? "连续平滑" : "缓入缓出";
}

function cameraInterpolationShortLabel(interpolation) {
  return interpolation === "linear" ? "匀" : interpolation === "smooth" ? "顺" : "缓";
}

const timelineIcons = {
  jumpStart: `<path d="M7 5v14"/><path d="M19 5l-9 7 9 7z" fill="currentColor" stroke="none"/>`,
  prev: `<path d="M15 5l-8 7 8 7z" fill="currentColor" stroke="none"/>`,
  next: `<path d="M9 5l8 7-8 7z" fill="currentColor" stroke="none"/>`,
  jumpEnd: `<path d="M17 5v14"/><path d="M5 5l9 7-9 7z" fill="currentColor" stroke="none"/>`,
  keyframe: `<path d="M12 4l8 8-8 8-8-8z" fill="currentColor" stroke="none"/>`,
  cancel: `<path d="M6 6l12 12M18 6L6 18"/>`,
  delete: `<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>`,
  collapse: `<path d="M6 15l6-6 6 6"/>`,
  expand: `<path d="M6 9l6 6 6-6"/>`,
  camera: `<path d="M3 7h11v10H3z"/><path d="M14 11l7-3v8l-7-3z" fill="currentColor" stroke="none"/>`,
  // 贴合：两端竖线夹住向外的双箭头 —— 「把整段摊进这个宽度」
  fit: `<path d="M4 6v12M20 6v12"/><path d="M8 12h8"/><path d="M11 9l-3 3 3 3"/><path d="M13 9l3 3-3 3"/>`,
};

// 轨道内容区宽度（整条减去左侧标签列），用于决定刻度密度。
function timelineTrackWidth() {
  const width = elements.cameraTimeline.getBoundingClientRect().width;
  if (!width) return 0;
  const labelWidth = parseFloat(
    getComputedStyle(elements.cameraTimeline).getPropertyValue("--timeline-label-width")
  ) || 110;
  return Math.max(0, width - labelWidth - 24);
}

// 重建后恢复滚动位置，否则每次编辑都把视野弹回开头。
let timelineScrollLeft = 0;
let timelineScrollTop = 0;

function wireTimelineViewport(span, scale) {
  const lanes = document.getElementById("timelineLanes");
  const labelScroll = document.getElementById("timelineLabelScroll");
  const actorViewport = document.getElementById("timelineActorViewport");
  if (!lanes) return;
  lanes.scrollLeft = timelineScrollLeft;
  lanes.addEventListener("scroll", () => {
    timelineScrollLeft = lanes.scrollLeft;
  });
  // 两列双向同步：滚轨道或滚标签都行。相等就不写，靠这个断掉回授循环
  // （赋同一个值不会再触发 scroll）。
  if (actorViewport && labelScroll) {
    const mirror = (from, to) => () => {
      if (to.scrollTop !== from.scrollTop) to.scrollTop = from.scrollTop;
    };
    actorViewport.addEventListener("scroll", mirror(actorViewport, labelScroll));
    labelScroll.addEventListener("scroll", mirror(labelScroll, actorViewport));
    labelScroll.scrollTop = timelineScrollTop;
    actorViewport.scrollTop = timelineScrollTop;
    actorViewport.addEventListener("scroll", () => {
      timelineScrollTop = actorViewport.scrollTop;
    });
  }
  // 竖向滚轮几乎永远到不了演员区：定位层铺满整个画布，而它是演员区的兄弟、
  // 不是后代 —— 滚动链从它往上走到 .timeline-lanes（overflow-y: hidden）就断了。
  // 只有指针正好压在某个块上时才凑巧生效。所以手动转发。
  lanes.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.metaKey) return;
    if (!actorViewport || !labelScroll) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const room = actorViewport.scrollHeight - actorViewport.clientHeight;
    if (room <= 0) return;
    const next = Math.min(Math.max(actorViewport.scrollTop + event.deltaY, 0), room);
    // 到顶或到底就不再吞掉手势，让它继续冒泡出去。
    if (next === actorViewport.scrollTop) return;
    actorViewport.scrollTop = next;
    labelScroll.scrollTop = next;
    timelineScrollTop = next;
    event.preventDefault();
  }, { passive: false });
  // 触控板捏合到了页面就是 wheel + ctrlKey，和 ⌘＋滚轮同一条码路；
  // 不 preventDefault 会变成整页缩放。锚在指针下方：手指指着哪儿，哪儿不动。
  lanes.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    // 缩放不再重挂监听，所以闭包里的 scale 会过期 —— 每次读实时值。
    const current = timelinePixelsPerSecond || scale;
    const rect = lanes.getBoundingClientRect();
    const offsetInViewport = event.clientX - rect.left;
    const anchorTime = (lanes.scrollLeft + offsetInViewport) / current;
    // 捏合的 deltaY 是几个像素，鼠标滚轮一格却有 100+；同一个系数没法同时服务
    // 两者，所以先夹住每次的步长，免得滚轮一下跳出两三倍。
    const step = Math.max(Math.min(event.deltaY, 24), -24);
    zoomTimeline(current * Math.exp(-step * 0.012), anchorTime, offsetInViewport);
  }, { passive: false });
}

// 键盘缩放没有指针可锚，用播放头 —— 但播放头不在视野里时锚它会把人瞬移回去，
// 那种情况改锚视野中心。
function zoomTimelineByStep(direction) {
  const lanes = document.getElementById("timelineLanes");
  if (!lanes) return;
  const span = timelineSpan();
  const scale = timelineScale(span);
  const playheadOffset = playback.elapsed * scale - lanes.scrollLeft;
  const inView = playheadOffset >= 0 && playheadOffset <= lanes.clientWidth;
  const offsetInViewport = inView ? playheadOffset : lanes.clientWidth / 2;
  const anchorTime = (lanes.scrollLeft + offsetInViewport) / scale;
  zoomTimeline(scale * (direction > 0 ? 1.25 : 0.8), anchorTime, offsetInViewport);
}

function fitTimelineToWindow() {
  timelinePixelsPerSecond = timelineFitScale(timelineSpan());
  timelineScrollLeft = 0;
  renderCameraTimeline();
}

// 播放时不持续居中（整条时间轴一直在动会看着晕），越过可视区 90% 才翻一页，
// 让播放头落回 10% 处。
function followTimelinePlayhead() {
  const lanes = document.getElementById("timelineLanes");
  if (!lanes || playback.status !== "playing") return;
  const scale = timelinePixelsPerSecond;
  if (!scale) return;
  const width = lanes.clientWidth;
  const offset = playback.elapsed * scale - lanes.scrollLeft;
  if (offset <= width * 0.9 && offset >= 0) return;
  lanes.scrollLeft = Math.max(playback.elapsed * scale - width * 0.1, 0);
  timelineScrollLeft = lanes.scrollLeft;
}

// 可视轨道区宽度。重建时旧节点还在（innerHTML 是之后才赋的），量它最准；
// 只有首帧要退回推算，那时得把两侧边框也减掉，否则贴合状态会多出几像素滚动。
function timelineViewportWidth() {
  const lanes = document.getElementById("timelineLanes");
  return lanes?.clientWidth || Math.max(timelineTrackWidth() - 2, 0);
}

// 缩到最小 ＝ 正好装下全部内容。所以「贴合」不是独立命令，就是缩到底，
// 也因此不可能缩出一片空白。
// 右侧留一条窄槽：Scene End 端点的方形帽从线心向右探出 4px，跨度顶满时它会
// 把画布撑宽，贴合状态下反而冒出一条几像素的滚动条。
const timelineEndCapGutter = 6;

function timelineFitScale(span) {
  const viewport = timelineViewportWidth() - timelineEndCapGutter;
  if (viewport <= 0 || !span) return 1;
  return viewport / span;
}

function clampTimelineScale(scale, span) {
  return Math.min(Math.max(scale, timelineFitScale(span)), timelineMaxPixelsPerSecond);
}

// 打开项目时贴合一次。注意这是初始值，不是模式 —— 定下之后编辑再也不会改动它，
// 这正是「拖长一个块，整张图重新洗牌」消失的原因。
function timelineScale(span) {
  if (timelinePixelsPerSecond === null) timelinePixelsPerSecond = timelineFitScale(span);
  timelinePixelsPerSecond = clampTimelineScale(timelinePixelsPerSecond, span);
  return timelinePixelsPerSecond;
}

// 画布宽度是唯一的比例来源：块、分段条、关键帧都按画布百分比定位，覆盖层按
// calc(轨道宽 × 比值)。所以改缩放只要改这一个宽度，它们全部自动跟着走 ——
// 唯一真需要重画的是标尺（刻度密度随宽度变）。
// 这条路径必须便宜：捏合一次会连发几十上百个 wheel，早先每个都跑一遍
// renderCameraTimeline（整条 innerHTML 重建 ＋ 重挂全部监听），手感就是那样毁掉的。
function applyTimelineScale(scale, span) {
  const canvas = document.getElementById("timelineCanvas");
  const width = `${(span * scale).toFixed(2)}px`;
  elements.cameraTimeline.style.setProperty("--timeline-track-width", width);
  if (canvas) canvas.style.width = width;
  const marks = elements.cameraTimeline.querySelector(".timeline-ruler-marks");
  if (marks) marks.innerHTML = timelineRulerMarks(span, span * scale);
}

// 缩放锚点：保持 anchorTime 这一刻停在视口内的同一个像素位置上。
function zoomTimeline(nextScale, anchorTime, anchorOffsetInViewport) {
  const span = timelineSpan();
  const lanes = document.getElementById("timelineLanes");
  const scale = clampTimelineScale(nextScale, span);
  if (!lanes || scale === timelinePixelsPerSecond) return;
  timelinePixelsPerSecond = scale;
  applyTimelineScale(scale, span);
  lanes.scrollLeft = anchorTime * scale - anchorOffsetInViewport;
  timelineScrollLeft = lanes.scrollLeft;
}

// 拖到视口边缘就自动滚 —— 放大之后块的右缘常常正贴在边上，没有这个就根本
// 没有向右拖的余量。指针停在边缘区不动时也要继续滚，所以用 rAF 循环而不是
// 只在 pointermove 里滚一次。
function startTimelineEdgeAutoScroll(apply) {
  const lanes = document.getElementById("timelineLanes");
  if (!lanes) return { track: () => {}, stop: () => {} };
  const margin = 44;
  let clientX = null;
  let frame = null;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    if (clientX === null) return;
    const rect = lanes.getBoundingClientRect();
    const overshoot = clientX > rect.right - margin
      ? clientX - (rect.right - margin)
      : clientX < rect.left + margin
        ? clientX - (rect.left + margin)
        : 0;
    if (!overshoot) return;
    const before = lanes.scrollLeft;
    lanes.scrollLeft = before + Math.max(Math.min(overshoot * 0.35, 28), -28);
    if (lanes.scrollLeft === before) return;
    timelineScrollLeft = lanes.scrollLeft;
    apply(clientX);
  };
  frame = requestAnimationFrame(tick);
  return {
    track: (x) => { clientX = x; },
    stop: () => cancelAnimationFrame(frame),
  };
}

// 拖动过程中把画布撑长，否则「最后一个动作」永远拉不长：画布正好等于内容长度，
// 指针再往右也算不出更晚的时刻。用像素直接写预览，跟画布宽度解耦。
function stretchTimelineCanvas(seconds) {
  const canvas = document.getElementById("timelineCanvas");
  const scale = timelinePixelsPerSecond;
  if (!canvas || !scale) return;
  const needed = Math.max(seconds, 0) * scale;
  if (needed <= parseFloat(canvas.style.width || "0")) return;
  const width = `${needed.toFixed(2)}px`;
  canvas.style.width = width;
  elements.cameraTimeline.style.setProperty("--timeline-track-width", width);
}

function timelineSpan() {
  return Math.max(
    rehearsalDuration(),
    latestCameraKeyframeTime(findShot(project)?.camera.track),
    sceneActorEnd(project),
    0.001
  );
}

function latestCameraKeyframeTime(track) {
  if (!track?.keyframes?.length) return 0;
  return track.keyframes.reduce((latest, keyframe) => Math.max(latest, Number(keyframe.time) || 0), 0);
}

function timelineIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${timelineIcons[name] || ""}</svg>`;
}

function timelineTimecode(state = playback) {
  const duration = Math.max(rehearsalDuration(), 0.001);
  const elapsed = Math.min(Number(state?.elapsed || 0), duration);
  return `${formatTime(elapsed)}<em> / ${formatTime(rehearsalDuration())}</em>`;
}

// 刻度密度跟着轨道实际宽度走：整宽之后能容纳更多标注，窄窗时自动稀疏。
// 每个标注之间再插 4 条次级刻度线，读中间位置不必目测。
function timelineRulerMarks(duration, trackWidth = 0) {
  const targetLabels = Math.max(4, Math.min(24, Math.floor((trackWidth || 700) / 90)));
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]
    .find((candidate) => duration / candidate <= targetLabels) || 300;
  const marks = [];
  for (let time = 0; time <= duration + 0.0001; time += step) {
    const left = Math.min(time / duration, 1) * 100;
    const label = time === 0 ? "0s" : Number(time.toFixed(2)).toString();
    marks.push(`<span class="ruler-major" style="left:${left}%">${label}</span>`);
    for (let sub = 1; sub < 5; sub++) {
      const subTime = time + (step * sub) / 5;
      if (subTime > duration) break;
      marks.push(`<i class="ruler-minor" style="left:${Math.min(subTime / duration, 1) * 100}%"></i>`);
    }
  }
  return marks.join("");
}

function motionPhaseLabel(phase) {
  if (phase.blocking) return phase.kind === "move" ? "移动" : phase.action.posture === "sit" ? "坐下" : "停留";
  if (phase.kind === "move") return "Move";
  if (phase.kind === "turn") return "Turn";
  return desktopActions[phase.action?.actionID]?.label || "Stay";
}

function actorTimelineName(index) {
  return `演员 ${String(index + 1).padStart(2, "0")}`;
}

function authoredTimelinePhases(actor) {
  const rendered = [];
  for (const phase of actorPlaybackPlan(actor).phases.filter((candidate) => candidate.duration > 0)) {
    const previous = rendered.at(-1);
    if (
      previous
      && previous.kind === phase.kind
      && previous.action?.id === phase.action?.id
      && Math.abs(previous.endTime - phase.startTime) < 0.000001
    ) {
      previous.endTime = phase.endTime;
      previous.duration = previous.endTime - previous.startTime;
      continue;
    }
    rendered.push({
      ...phase,
      phaseKey: `${phase.action?.id || phase.actionIndex}:${phase.kind}`,
    });
  }
  return rendered;
}

// 标签列在横向滚动容器之外，所以行要分两处渲染 —— 高度靠同一组 CSS 变量对齐。
function renderActorTimelineLabel(actor, index) {
  const name = actorTimelineName(index);
  return `
    <div class="timeline-label-row" title="${escapeHTML(name)}">
      <i class="timeline-lane-badge actor" style="--actor-color:${actorColor(actor)};--actor-ink:${clothingInk(actor.blockingColor || actor.clothingColorIndex)}" aria-hidden="true">${String(index + 1).padStart(2, "0")}</i>${escapeHTML(name)}
    </div>`;
}

function renderActionTrimHandle(actor, phase, edge, label) {
  const isInEdge = edge === "in";
  const edgeName = isInEdge ? "入点" : "出点";
  const trimmedPart = isInEdge ? "开头" : "结尾";
  const cue = isInEdge ? "入" : "出";
  const instruction = `${label} · ${edgeName}：拖动裁剪${trimmedPart}`;
  return `<i class="actor-timeline-block-handle edge-${edge}"
    data-action-trim-edge="${edge}"
    data-motion-action="${escapeHTML(phase.action.id)}"
    data-motion-actor="${escapeHTML(actor.id)}"
    data-trim-cue="${cue}"
    aria-hidden="true"
    title="${escapeHTML(instruction)}"></i>`;
}

function renderActorTimelineLane(actor, index, duration) {
  // Runtime may split one authored Move into locomotion/turn blend intervals. The
  // editor timeline still shows the director's one durable Move, not hidden internals.
  const phases = authoredTimelinePhases(actor);
  
  const editable = canEditActorMotion() && !actor.locked;
  return `
    <div class="timeline-lane actor-lane" data-motion-lane="${escapeHTML(actor.id)}">
      <div class="timeline-lane-track" data-actor-pose-keyframe-rail>
        ${phases.map((phase, phaseIndex) => {
          const left = Math.min(phase.startTime / duration, 1) * 100;
          const width = Math.max(Math.min(phase.duration / duration, 1) * 100, 0.7);
          const label = motionPhaseLabel(phase);
          // 时间线只裁剪普通 Action 的源动画区间。Move 的 A/B 点是导演路径真相，
          // 继续只在 Inspector 里改速度；Turn 由运行时编译，也不暴露裁剪把手。
          const trimmable = editable && !true && phase.kind === "hold" && phase.actionIndex > 0;
          return `<span class="actor-timeline-block ${phase.kind}" style="left:${left}%;width:${width}%"
            data-motion-block="${phaseIndex}"
            data-motion-phase-key="${escapeHTML(phase.phaseKey)}"
            title="${escapeHTML(label)} · ${phase.duration.toFixed(2)}s">${trimmable
              ? renderActionTrimHandle(actor, phase, "in", label)
              : ""}<span class="actor-timeline-block-label">${escapeHTML(label)}</span>${trimmable
              ? renderActionTrimHandle(actor, phase, "out", label)
              : ""}</span>`;
        }).join("")}
        ${actor.poseTrack.keyframes.map((key,index)=>`<button class="camera-keyframe-marker actor-pose-keyframe-marker ${actor.id===selectedActorID&&currentActorPoseIDs(actor).has(key.id)?'selected':''} ${key.time>rehearsalDuration()?'outside-scene':''}" type="button" style="left:${keyframeMarkerOffset(key.time/duration)}" data-actor-pose-keyframe-id="${key.id}" data-actor-pose-actor-id="${actor.id}" aria-label="人物帧 ${index+1}，${key.time.toFixed(2)} 秒" aria-pressed="${actor.id===selectedActorID&&currentActorPoseIDs(actor).has(key.id)}" title="Shift 点击选择区间 · 人物帧 ${index+1} · ${key.time.toFixed(2)} 秒"></button>`).join('')}
      </div>
    </div>`;
}

// ── 时间轴边缘 ＝ Action 源入点 / 出点 ──
// Inspector 继续负责速度。时间线裁剪保持当前播放速度，把源区间和动作格时长一起缩短；
// Action List 没有空隙，所以裁剪入点后该动作仍从原场景时刻开始，后续动作向前 ripple。

function actorWithMotionPatch(actor, actionID, patch) {
  return {
    ...actor,
    motionActions: actor.motionActions.map((action) => (
      action.id === actionID ? { ...action, ...patch } : action
    )),
  };
}

function motionPhaseByKey(actor, phaseKey) {
  return authoredTimelinePhases(actor).find((phase) => phase.phaseKey === phaseKey) || null;
}

// speed 越大结束越早（巡航段和转身节奏都跟着快），endTime 对 speed 单调递减，
// 所以二分就够。拿 actorPlaybackPlan 本身当预言机，不在这儿复制一份物理 ——
// 加减速曲线、转身节奏、拐角计划将来怎么改，这里都不用跟着改。
function solveMoveSpeedForEnd(actor, phaseKey, actionID, targetEndTime) {
  const endAt = (speed) => motionPhaseByKey(actorWithMotionPatch(actor, actionID, { speed }), phaseKey)?.endTime;
  let slow = minimumMoveSpeed;
  let fast = 20;
  if (!Number.isFinite(endAt(slow)) || !Number.isFinite(endAt(fast))) return null;
  if (endAt(slow) <= targetEndTime) return slow;
  if (endAt(fast) >= targetEndTime) return fast;
  for (let step = 0; step < 32; step += 1) {
    const middle = (slow + fast) / 2;
    if (endAt(middle) > targetEndTime) slow = middle;
    else fast = middle;
  }
  return (slow + fast) / 2;
}

function motionResizePatch(actor, phase, targetEndTime, frameRate) {
  if (phase.kind !== "move") return null;
  const speed = solveMoveSpeedForEnd(actor, phase.phaseKey, phase.action.id, targetEndTime);
  return Number.isFinite(speed) ? { speed: Math.round(speed * 1000) / 1000 } : null;
}

function trimPatchWithSourceDelta(action, edge, sourceDelta) {
  const sourceRange = actionSourceRange(action);
  return actionTrimPatch(
    action,
    edge === "in" ? sourceRange.sourceIn + sourceDelta : sourceRange.sourceIn,
    edge === "out" ? sourceRange.sourceOut + sourceDelta : sourceRange.sourceOut,
    {
      edge,
      minimumAuthoredDuration: 1 / Math.max(project.output.frameRate, 1),
    }
  );
}

function trimPatchChangesAction(action, patch) {
  const sourceRange = actionSourceRange(action);
  return Math.abs(Number(patch.sourceInSeconds) - sourceRange.sourceIn) > 0.0005
    || Math.abs(Number(patch.sourceOutSeconds) - sourceRange.sourceOut) > 0.0005
    || Math.abs(Number(patch.duration) - Number(action.duration || 0)) > 0.0005;
}

// 拖动过程只改样式、不提交 —— 重建 DOM 会连同正在拖的元素一起销毁，手势当场断掉。
// 预览直接跑候选 plan，所以后面的块是真的按物理顺延，不是按像素平移糊上去的。
function wireActorTimelineBlocks(span) {
  for (const handle of elements.cameraTimeline.querySelectorAll("[data-action-trim-edge]")) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !canEditActorMotion()) return;
      const actorID = handle.dataset.motionActor;
      const actionID = handle.dataset.motionAction;
      const edge = handle.dataset.actionTrimEdge;
      const actor = findActor(project, actorID);
      const lane = handle.closest("[data-motion-lane]");
      const block = handle.parentElement;
      const rail = document.getElementById("timelineCanvas");
      const phase = actor && motionPhaseByKey(actor, block.dataset.motionPhaseKey);
      if (!actor || !lane || !rail || !phase) return;
      const blocks = [...lane.querySelectorAll("[data-motion-phase-key]")];
      const readout = block.querySelector(".actor-timeline-block-label");
      const restingLabel = readout?.textContent || "";
      let patch = null;
      let previewed = false;
      const playbackRate = actionPlaybackRate(phase.action);
      const pointerStartTime = (
        event.clientX - rail.getBoundingClientRect().left
      ) / Math.max(timelinePixelsPerSecond || 1, 1);
      event.preventDefault();
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add("is-active");
      elements.cameraTimeline.classList.add("motion-trimming");

      // 直接按秒算，不再按画布百分比 —— 于是目标时刻可以超出当前跨度（把画布
      // 撑长即可），「最后一个动作拉不长」那道墙就没了。rect 每次重取，因为
      // 自动滚动会挪画布，缓存下来就错位。
      const apply = (clientX) => {
        const scale = timelinePixelsPerSecond || 1;
        const pointerTime = (clientX - rail.getBoundingClientRect().left) / scale;
        const sourceDelta = (pointerTime - pointerStartTime) * playbackRate;
        const next = trimPatchWithSourceDelta(phase.action, edge, sourceDelta);
        const phases = authoredTimelinePhases(actorWithMotionPatch(actor, actionID, next));
        // 相位数变了说明拖出了这套预览的假设，交给提交后的重绘去处理。
        if (phases.length !== blocks.length) return;
        previewed = true;
        stretchTimelineCanvas(phases[phases.length - 1].endTime);
        const phasesByKey = new Map(phases.map((candidate) => [candidate.phaseKey, candidate]));
        blocks.forEach((candidateBlock) => {
          const candidate = phasesByKey.get(candidateBlock.dataset.motionPhaseKey);
          if (!candidate) return;
          candidateBlock.style.left = `${(candidate.startTime * scale).toFixed(2)}px`;
          candidateBlock.style.width = `${Math.max(candidate.duration * scale, 2).toFixed(2)}px`;
        });
        const dragged = phases.find((candidate) => candidate.phaseKey === phase.phaseKey);
        if (readout && dragged) {
          readout.textContent = `${edge === "in" ? "入" : "出"} ${Number(
            edge === "in" ? next.sourceInSeconds : next.sourceOutSeconds
          ).toFixed(2)}s · ${dragged.duration.toFixed(2)}s`;
        }
        patch = trimPatchChangesAction(phase.action, next) ? next : null;
      };

      const autoScroll = startTimelineEdgeAutoScroll(apply);
      const move = (moveEvent) => {
        autoScroll.track(moveEvent.clientX);
        apply(moveEvent.clientX);
      };

      const finish = () => {
        autoScroll.stop();
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
        handle.classList.remove("is-active");
        elements.cameraTimeline.classList.remove("motion-trimming");
        if (readout) readout.textContent = restingLabel;
        if (!patch) {
          // 纯点击没有临时状态可收回；只有真正写过拖动预览时才需要重绘。
          if (previewed) renderCameraTimeline();
          return;
        }
        // 缩短人物时间轴会撞上 Scene End 冲突弹窗，用户还可能当场取消。
        // 无论落库与否都要重绘 —— 否则预览的几何会留在屏幕上，界面开始撒谎。
        void commitProject(
          (current) => updateMotionAction(current, actorID, actionID, patch),
          edge === "in" ? "动作入点已裁剪" : "动作出点已裁剪"
        ).finally(() => renderCameraTimeline());
      };

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });
  }
}

function updateCameraTimelineProgress(state = playback) {
  const duration = Math.max(rehearsalDuration(), 0.001);
  const elapsed = Math.min(Number(state?.elapsed || 0), duration);
  // 与 renderCameraTimeline 用同一个跨度和同一种无单位比值，否则 calc 会失效。
  const span = Math.max(duration, latestCameraKeyframeTime(findShot(project)?.camera.track), sceneActorEnd(project), 0.001);
  elements.cameraTimeline.style.setProperty("--timeline-playhead", String(Math.min(elapsed / span, 1)));
  const output = document.getElementById("cameraTimelineTime");
  if (output) output.innerHTML = timelineTimecode(state);
  const scrubber = document.getElementById("cameraTimelineScrubber");
  if (scrubber && document.activeElement !== scrubber) scrubber.value = String(elapsed);
  followTimelinePlayhead();
}

// 菱形在 0% / 100% 处有一半落到轨道外，被 .timeline-lanes 的 overflow 裁掉 ——
// 首帧和末帧因此既看不全也点不着。用 range thumb 那套老办法把它推回轨道内：
// 两端各偏半个身位，中点不动。代价是极端位置与播放头线最多差 6.4px。
const keyframeMarkerWidth = 9 * Math.SQRT2;

function keyframeMarkerOffset(fraction) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return `calc(${(clamped * 100).toFixed(4)}% + ${((0.5 - clamped) * keyframeMarkerWidth).toFixed(2)}px)`;
}

function currentCameraKeyframeIDs() {
  const shot = findShot(project);
  cameraKeyframeSelection.sync(`${project.id}/${shot?.id}`, shot?.camera.track.keyframes || []);
  return cameraKeyframeSelection.ids;
}

function focusCameraKeyframe(id) {
  elements.cameraTimeline.querySelector(`[data-camera-keyframe-id="${id}"]`)?.focus({ preventScroll: true });
}

function setupCameraKeyframeMarker(marker, span) {
  wireCameraKeyframeMarker(marker, {
    canEdit: canEditCamera,
    getTrack: () => findShot(project).camera.track,
    getSelection: currentCameraKeyframeIDs,
    select: selectCameraKeyframe,
    commit: moveSelectedCameraKeyframes,
    frameRate: project.output.frameRate,
    span,
    offset: keyframeMarkerOffset,
  });
}

function selectCameraKeyframe(keyframeID, extend = false) {
  persistActorPoseDraft();
  const activeShot=findShot(project);
  if(activeShot){selectedObject={kind:'shot',id:activeShot.id,parentID:null};inspectorPanel='camera';setSceneSidebarMode('shots',{render:false});}
  const track = activeCameraTrack();
  const keyframe = track.keyframes.find((candidate) => candidate.id === keyframeID);
  if (!keyframe) return;
  if (playback.status === "playing") playback.pause();
  if (cameraOrbitDraft && cameraOrbitDraft.startKeyframeID !== keyframe.id) {
    cancelCameraOrbitPreview(false, false);
  }
  cancelStagedCameraEdit(false);
  currentCameraKeyframeIDs();
  cameraKeyframeSelection.select(track.keyframes, keyframe.id, extend);
  deleteScope = "keyframe";
  playback.seek(keyframe.time);
  renderCameraTimeline();
  renderInspector();
  focusCameraKeyframe(keyframe.id);
}

function jumpCameraTimeline(direction) {
  const keyframes = activeCameraTrack().keyframes;
  const duration = activeTimelineDuration();
  let time = playback.elapsed;
  if (direction === "start") time = 0;
  else if (direction === "end") time = duration;
  else if (direction === "previous") time = [...keyframes].reverse().find((keyframe) => keyframe.time < playback.elapsed - 0.0001)?.time ?? 0;
  else if (direction === "next") time = keyframes.find((keyframe) => (
    keyframe.time > playback.elapsed + 0.0001 && keyframe.time <= duration + 0.0001
  ))?.time ?? duration;
  seekCameraTimeline(time);
}

function stepCameraTimelineFrame(direction) {
  const duration = activeTimelineDuration();
  if (duration <= 0) return;
  seekCameraTimeline(adjacentFrameTime(
    playback.elapsed,
    direction,
    project.output.frameRate,
    duration
  ));
}

function seekCameraTimeline(timeInput) {
  if (playback.status === "playing") playback.pause();
  const time = Math.max(0, Math.min(Number(timeInput || 0), activeTimelineDuration()));
  const keyframe = cameraKeyframeAtTime(activeCameraTrack(), time, project.output.frameRate);
  cancelStagedCameraEdit(false);
  cameraKeyframeSelection.activeID = keyframe?.id || null;
  playback.seek(time);
  renderCameraTimeline();
  renderInspector();
}

function recordCameraKeyframeAtPlayhead() {
  if (cameraEditSession.setupEdit()) {
    void resolveCameraDraftConflict("record-scene-camera");
    return;
  }
  const intent = cameraKeyframeRecordIntent({
    editViewMode,
    hasShotDraft: Boolean(activeShotCameraEdit()),
  });
  if (intent === "resolve-shot-draft") {
    void resolveShotDraftConflict("record-scene-camera");
    return;
  }
  commitCameraKeyframeAtPlayhead({ useStaged: intent === "write-shot-draft" });
}

function commitCameraKeyframeAtPlayhead({ useStaged = false } = {}) {
  const shot = findShot(project);
  if (!shot || !canEditCamera()) return;
  const edit = useStaged ? activeShotCameraEdit() : null;
  const visiblePose = directorRenderer.captureCameraPose();
  const pose = edit?.pose || authoredCameraPoseFromVisible(
    visiblePose,
    shot,
    playback.elapsed,
    currentProjectSamples()
  );
  const existing = cameraKeyframeAtTime(shot.camera.track, playback.elapsed, project.output.frameRate);
  const rebasedEditProject = edit?.project ? rebaseShotCameraEditProject(edit) : null;
  const staged = rebasedEditProject
    ? { project: rebasedEditProject }
    : stageShotCameraKeyframe(
        project,
        shot.id,
        pose,
        playback.elapsed,
        project.output.frameRate,
        currentProjectSamples()
      );
  if (!staged) return;
  const next = staged.project;
  const recorded = cameraKeyframeAtTime(findShot(next, shot.id).camera.track, playback.elapsed, project.output.frameRate);
  cameraEditSession.clear(cameraEditKinds.shot);
  cameraFocusPickCandidate = null;
  delete elements.appShell.dataset.cameraEdit;
  renderEditViewMode();
  cameraKeyframeSelection.activeID = recorded?.id || existing?.id || null;
  project = projectState.commit(next);
  finishAuthoredChange(existing ? "关键帧已更新" : "已记录新关键帧");
}

async function resolveShotDraftConflict(pendingOperation = null) {
  if (!activeShotCameraEdit()) {
    if (pendingOperation === "record-scene-camera") {
      commitCameraKeyframeAtPlayhead({ useStaged: false });
    }
    return;
  }
  const choice = await requestShotDraftConflictChoice();
  handleShotDraftConflictChoice(choice, pendingOperation);
}

async function resolveCameraDraftConflict(pendingOperation = null) {
  const edit = cameraEditSession.edit;
  if (!edit) {
    if (pendingOperation === "enter-shot") setEditViewMode("shot");
    return;
  }
  const choice = await requestCameraDraftConflictChoice(edit.kind);
  handleCameraDraftConflictChoice(choice, pendingOperation);
}

function handleCameraDraftConflictChoice(choice, pendingOperation = null) {
  const edit = cameraEditSession.edit;
  if (!edit) return false;
  if (edit.kind === cameraEditKinds.shot) {
    return handleShotDraftConflictChoice(choice, pendingOperation);
  }
  const setup = findCameraSetup(project, edit.targetID);
  if (!setup) {
    cameraEditSession.clear(cameraEditKinds.setup);
    return false;
  }
  if (choice === "write") {
    updateSelectedCameraSetup(setup.id, { allowSceneWrite: true });
    return true;
  }
  if (choice === "discard") {
    cameraEditSession.clear(cameraEditKinds.setup);
    renderEditViewMode();
    renderInspector();
    syncRenderer();
    if (pendingOperation === "enter-shot") setEditViewMode("shot");
    if (pendingOperation === "record-scene-camera") {
      commitCameraKeyframeAtPlayhead({ useStaged: false });
    }
    return true;
  }
  selectedCameraSetupID = setup.id;
  selectedObject = { kind: "cameraSetup", id: setup.id, parentID: null };
  setSceneSidebarMode("setups", { render: false });
  if (!cameraEditSession.isViewingSetup(setup.id)) toggleCameraSetupView(setup.id);
  else {
    renderEditViewMode();
    renderInspector();
    syncRenderer();
  }
  return true;
}

function requestCameraDraftConflictChoice(kind = cameraEditKinds.shot) {
  const dialog = document.getElementById("shotDraftConflictDialog");
  if (!dialog) return Promise.resolve("return");
  const isSetup = kind === cameraEditKinds.setup;
  const edit = cameraEditSession.edit;
  const targetName = isSetup
    ? findCameraSetup(project, edit?.targetID)?.name || "当前机位"
    : findShot(project)?.name || "当前 Shot";
  const title = document.getElementById("shotDraftConflictTitle");
  const description = document.getElementById("shotDraftConflictDescription");
  const eyebrow = dialog.querySelector(".film-dialog-eyebrow");
  const returnCopy = dialog.querySelector('button[value="return"] span:nth-child(2)');
  const writeCopy = dialog.querySelector('button[value="write"] span:nth-child(2)');
  const discardCopy = dialog.querySelector('button[value="discard"] span:nth-child(2)');
  if (eyebrow) eyebrow.textContent = isSetup ? "STILL ADJUSTMENT" : "SHOT ADJUSTMENT";
  if (title) title.textContent = `${targetName} 有未写入调整`;
  if (description) description.textContent = isSetup
    ? "机位调整仍保留在草稿中。先决定如何处理，再继续其他摄影机操作。"
    : `${targetName} 的镜头调整还没有写入。先决定如何处理，再继续 Scene View 摄影机操作。`;
  if (returnCopy) returnCopy.innerHTML = isSetup
    ? "<strong>返回 Still View</strong><small>保留调整，回到机位画面继续检查。</small>"
    : "<strong>返回 Shot View</strong><small>保留调整，回到镜头画面继续检查。</small>";
  if (writeCopy) writeCopy.innerHTML = isSetup
    ? "<strong>写入机位调整</strong><small>把当前草稿写入原机位。</small>"
    : "<strong>写入 Shot 调整</strong><small>只写入原来的 Shot 调整，不继续当前操作。</small>";
  if (discardCopy) discardCopy.innerHTML = isSetup
    ? "<strong>放弃机位调整</strong><small>丢弃草稿，再继续当前操作。</small>"
    : "<strong>放弃 Shot 调整</strong><small>丢弃调整，然后继续当前 Scene View 操作。</small>";
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue || "return"), { once: true });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close("return");
    }, { once: true });
  });
}

function handleShotDraftConflictChoice(choice, pendingOperation = null) {
  if (!activeShotCameraEdit()) return false;
  if (choice === "write") {
    commitCameraKeyframeAtPlayhead({ useStaged: true });
    return true;
  }
  if (choice === "discard") {
    cancelStagedCameraEdit(false);
    if (pendingOperation === "record-scene-camera") {
      commitCameraKeyframeAtPlayhead({ useStaged: false });
    }
    if (pendingOperation?.startsWith("enter-setup:")) {
      const setupID = pendingOperation.slice("enter-setup:".length);
      selectedCameraSetupID = setupID;
      selectedObject = { kind: "cameraSetup", id: setupID, parentID: null };
      setSceneSidebarMode("setups", { render: false });
      toggleCameraSetupView(setupID);
    }
    return true;
  }
  setEditViewMode("shot");
  return true;
}

function requestShotDraftConflictChoice() {
  return requestCameraDraftConflictChoice(cameraEditKinds.shot);
}

function stageShotFocusTracking(focusTrackingInput, message) {
  const shot = findShot(project);
  if (!shot || !canEditCamera() || editViewMode !== "shot") return false;
  const edit = activeShotCameraEdit();
  const baseProject = edit?.project ? rebaseShotCameraEditProject(edit) : project;
  const baseShot = findShot(baseProject, shot.id);
  if (!baseShot) return false;
  const visiblePose = directorRenderer.captureCameraPose();
  const authoredPose = edit?.pose || authoredCameraPoseFromVisible(
    visiblePose,
    baseShot,
    playback.elapsed,
    currentProjectSamples(playback.elapsed, playback.status, baseProject)
  );
  const staged = edit?.project
    ? {
        project: baseProject,
        keyframe: cameraKeyframeAtTime(
          baseShot.camera.track,
          playback.elapsed,
          project.output.frameRate
        ),
      }
    : stageShotCameraKeyframe(
        baseProject,
        shot.id,
        authoredPose,
        playback.elapsed,
        project.output.frameRate,
        currentProjectSamples(playback.elapsed, playback.status, baseProject)
      );
  const stagedShot = findShot(staged?.project, shot.id);
  const stagedKeyframe = staged?.keyframe || cameraKeyframeAtTime(
    stagedShot?.camera?.track,
    playback.elapsed,
    project.output.frameRate
  );
  if (!stagedShot || !stagedKeyframe) return false;
  const nextProject = updateShotCameraKeyframeFocusTracking(
    staged.project,
    shot.id,
    stagedKeyframe.id,
    focusTrackingInput
  );
  const nextShot = findShot(nextProject, shot.id);
  const samples = currentProjectSamples(playback.elapsed, playback.status, nextProject);
  const evaluated = sampleShotCamera(nextProject, nextShot, playback.elapsed, samples);
  cameraEditSession.stageShot(shot.id, authoredPose, nextProject);
  directorRenderer.setCameraTrackPose(evaluated, {
    locked: false,
    rotationLocked: aimOrientationLocked(evaluated),
  });
  elements.appShell.dataset.cameraEdit = "staged";
  renderInspector();
  renderTransport();
  renderCameraTimeline();
  updateShotComposition();
  if (message) showToast(message);
  return true;
}

function cameraFocusTrackingLabel(sourceProject, focusTrackingInput) {
  const focusTracking = normalizeCameraFocusTracking(focusTrackingInput);
  if (focusTracking.targetKind === "actor") {
    const index = sourceProject?.scene?.actors?.findIndex(
      (actor) => actor.id === focusTracking.targetActorID
    ) ?? -1;
    if (index < 0) return "目标演员已删除";
    return `演员 ${String(index + 1).padStart(2, "0")} · ${cameraFocusBodyPartLabel(focusTracking.actorHeight)}`;
  }
  if (focusTracking.targetKind === "environment") {
    const visual = sourceProject?.scene?.environment?.visuals?.find(
      (candidate) => candidate.id === focusTracking.environmentID
    ) || (!focusTracking.environmentID ? sourceProject?.scene?.environment?.visuals?.[0] : null);
    return visual?.name || "目标环境已删除";
  }
  if (focusTracking.targetKind === "world") return "场景固定点";
  const group = sourceProject?.scene?.blockout?.groups?.find(
    (candidate) => candidate.id === focusTracking.blockoutGroupID
  );
  const object = group?.objects?.find(
    (candidate) => candidate.id === focusTracking.blockoutObjectID
  );
  return object ? `布景 · ${object.name}` : "目标布景已删除";
}

function cameraFocusBodyPartLabel(actorHeight) {
  if (actorHeight >= 0.86) return "头部";
  if (actorHeight >= 0.58) return "胸部";
  if (actorHeight >= 0.32) return "腰部";
  return "下肢";
}

function moveSelectedCameraKeyframes(ids, deltaTime, focusID) {
  const shot = findShot(project);
  if (!shot || !canEditCamera()) return;
  if (playback.status === "playing") playback.pause();
  cancelStagedCameraEdit(false);
  const next = moveShotCameraKeyframes(project, shot.id, ids, deltaTime, project.output.frameRate);
  const nextTrack = findShot(next, shot.id).camera.track;
  cameraKeyframeSelection.activate(focusID);
  deleteScope = "keyframe";
  if (JSON.stringify(nextTrack) === JSON.stringify(shot.camera.track)) {
    renderCameraTimeline();
    focusCameraKeyframe(focusID);
    return;
  }
  project = projectState.commit(next);
  playback.setDuration(rehearsalDuration());
  playback.seek(nextTrack.keyframes.find((key) => key.id === focusID).time);
  finishAuthoredChange("关键帧时间已更新");
  focusCameraKeyframe(focusID);
}

// Delete 按当前作用域删除关键帧选区或选中的场景对象。
function deleteFocusedSelection() {
  if (!canAuthor()) return false;
  if (deleteScope === "actor-pose-frame" || (deleteScope === "keyframe" && actorPoseTarget()))return deleteSelectedActorPoseFrames();
  if (deleteScope === "keyframe") return deleteResolvedCameraKeyframe();
  if (sceneSidebarMode === "setups") {
    if (!selectedCameraSetupID || project.scene.cameraSetups.length <= 1) return false;
    deleteSelectedCameraSetup(selectedCameraSetupID);
    return true;
  }
  if (sceneSidebarMode === "shots") {
    const shot = findShot(project);
    if (!shot) return false;
    deleteSelectedShot(shot.id);
    return true;
  }
  if (sceneSidebarMode === "blockout") return deleteSelectedBlockoutObject();
  
  const actor = selectedActorID && findActor(project, selectedActorID);
  if (!actor || actor.locked) return false;
  const pairedAction = null;
  {}
  void commitProject((current) => deleteActor(current, actor.id), "演员已删除");
  return true;
}

function deleteSelectedBlockoutObject() {
  if (project.scene.blockout.locked === true) return false;
  if (selectedObject?.kind === "blockoutGroup") {
    if (!project.scene.blockout.groups.some((group) => group.id === selectedObject.id)) return false;
    deleteBlockoutGroupFromList(selectedObject.id);
    return true;
  }
  if (selectedObject?.kind === "blockoutObject" && selectedObject.parentID) {
    deleteBlockoutObjectFromList(selectedObject.parentID, selectedObject.id);
    return true;
  }
  if (selectedObject?.kind === "environment") {
    const visual = project.scene.environment.visuals.find(
      (candidate) => candidate.id === selectedObject.id
    );
    if (!visual || visual.locked) return false;
    environmentFocusID = null;
    project = projectState.commit(removeVisualEnvironment(project, visual.id));
    selectedObject = project.scene.blockout.groups.length
      ? { kind: "blockoutLayer", id: "blockout", parentID: null }
      : project.scene.environment.visuals[0]
        ? { kind: "environment", id: project.scene.environment.visuals[0].id, parentID: null }
        : null;
    finishAuthoredChange("视觉环境已从 Scene 移除，可使用撤销恢复");
    return true;
  }
  return false;
}

// 点选是显式意图，播放头位置往往只是上一次操作的残留 —— 所以选中优先。
// 两者必然分家的场合：关键帧在 Scene End 之外时播放头根本够不到它。
function resolvableCameraKeyframe() {
  const track = findShot(project)?.camera.track;
  if (!track) return null;
  return track.keyframes.find((candidate) => candidate.id === cameraKeyframeSelection.activeID)
    || cameraKeyframeAtTime(track, playback.elapsed, project.output.frameRate)
    || null;
}

function deletableCameraKeyframes() {
  const track = findShot(project)?.camera.track;
  if (!track) return [];
  const selected = currentCameraKeyframeIDs();
  const ids = selected.size ? selected : new Set([resolvableCameraKeyframe()?.id]);
  return track.keyframes.filter((key) => key.time > 0 && ids.has(key.id));
}

function canDeleteCameraKeyframe() {
  return canEditCamera() && deletableCameraKeyframes().length > 0;
}

function deleteResolvedCameraKeyframe() {
  const shot = findShot(project);
  const keys = deletableCameraKeyframes();
  if (!shot || !keys.length || !canEditCamera()) return false;
  const previous = [...shot.camera.track.keyframes].reverse().find((key) => key.time < keys[0].time);
  if (playback.status === "playing") playback.pause();
  cancelStagedCameraEdit(false);
  project = projectState.commit(deleteShotCameraKeyframes(project, shot.id, keys.map((key) => key.id)));
  cameraKeyframeSelection.activeID = previous?.id || null;
  playback.setDuration(rehearsalDuration());
  playback.seek(previous?.time || 0);
  finishAuthoredChange("关键帧已删除");
  if (previous) focusCameraKeyframe(previous.id);
  return true;
}

function cancelStagedCameraEdit(showConfirmation = false) {
  if (!activeShotCameraEdit()) return false;
  cameraEditSession.clear(cameraEditKinds.shot);
  cameraFocusPickCandidate = null;
  delete elements.appShell.dataset.cameraEdit;
  renderEditViewMode();
  const track = activeCameraTrack();
  if (cameraTrackReady(track)) {
    const pose = sampleShotCamera(project, findShot(project), playback.elapsed, currentProjectSamples());
    directorRenderer.setCameraTrackPose(pose, {
      locked: false,
      rotationLocked: aimOrientationLocked(pose),
    });
  }
  updateCameraKeyframeInspectorState();
  renderTransport();
  if (!timelineScrubbing) renderCameraTimeline();
  if (showConfirmation) showToast("已取消本次摄影机调整");
  return true;
}

function cancelCameraSetupEdit(showConfirmation = false) {
  const edit = cameraEditSession.setupEdit();
  if (!edit) return false;
  const setup = findCameraSetup(project, edit.targetID);
  cameraEditSession.clear(cameraEditKinds.setup);
  if (setup && cameraSetupViewActive(setup.id)) applyCameraSetupViewPose(setup.pose);
  updateCameraSetupInspectorState();
  updateShotComposition();
  renderTransport();
  if (showConfirmation) showToast("已取消本次机位调整");
  return true;
}

function cancelActiveCameraEdit(showConfirmation = false) {
  return cancelCameraSetupEdit(showConfirmation)
    || cancelStagedCameraEdit(showConfirmation);
}

function cameraAimAtWorldPosition(aim, position) {
  return aim.targetKind === "environment"
    ? { ...aim, localPosition: directorRenderer.visualEnvironmentTargetPoint(aim.environmentID, position) }
    : { ...aim, mode: "look-at", targetKind: "world", worldPosition: position };
}

function cameraEnvironmentTargetOptions(selectedValue) {
  const visuals = project.scene.environment.visuals;
  const missing = selectedValue.startsWith("environment:") && !visuals.some((visual) => `environment:${visual.id}` === selectedValue);
  return (missing ? `<option value="${escapeHTML(selectedValue)}" selected>目标已删除</option>` : "")
    + visuals.map((visual, index) => `<option value="environment:${escapeHTML(visual.id)}" ${selectedValue === `environment:${visual.id}` ? "selected" : ""}>环境 ${index + 1} · ${escapeHTML(visual.name)}</option>`).join("");
}

function ensureCameraOrbitForm(shot, track, startTimeInput = playback.elapsed) {
  if (!shot || !cameraTrackReady(track)) return null;
  const frameRate = project.output.frameRate;
  const startTime = Math.round(Math.max(0, Number(startTimeInput || 0)) * frameRate) / frameRate;
  const contextKey = `${shot.id}:${Math.round(startTime * frameRate)}`;
  if (cameraOrbitForm?.contextKey === contextKey) return cameraOrbitForm;
  const startAim = effectiveCameraAim(track, startTime);
  const actorTargetExists = startAim.targetKind === "actor"
    && project.scene.actors.some((actor) => actor.id === startAim.targetActorID);
  const fallbackActorID = project.scene.actors.find((actor) => actor.id === selectedActorID)?.id
    || project.scene.actors[0]?.id
    || null;
  const targetValue = startAim.mode === "look-at" && startAim.targetKind === "environment"
    ? `environment:${startAim.environmentID}`
    : startAim.mode === "look-at" && startAim.targetKind === "world"
    ? "world"
    : actorTargetExists || fallbackActorID
      ? `actor:${actorTargetExists ? startAim.targetActorID : fallbackActorID}`
      : "world";
  const worldPosition = startAim.mode === "look-at" && startAim.targetKind === "world"
    ? { ...startAim.worldPosition }
    : cameraAimTargetPosition(
        project,
        sampleProject(project, startTime),
        actorTargetExists ? startAim : {
          mode: "look-at",
          targetKind: "actor",
          targetActorID: fallbackActorID,
          actorHeight: cameraAimActorHeightPresets.chest,
          composition: "center",
          trackingResponse: 0,
        }
      ) || { x: 0, y: 1, z: 0 };
  const form = {
    contextKey,
    shotID: shot.id,
    startTime,
    targetValue,
    localPosition: startAim.localPosition || { x: 0, y: 0, z: 0 },
    actorHeight: actorTargetExists ? startAim.actorHeight : cameraAimActorHeightPresets.chest,
    worldPosition,
    endpointMode: "new",
    direction: "clockwise",
    sweepDegrees: 180,
    extraTurns: 0,
    duration: 4,
    endRadius: 2,
    endRelativeHeight: 0,
  };
  const center = resolveCameraOrbitBaseCenter(form, project, shot);
  const defaults = center
    ? defaultCameraOrbitOptions(track, startTime, center, frameRate)
    : null;
  if (defaults) Object.assign(form, defaults);
  if (project.scene.duration.mode === "manual") {
    const remaining = Number(project.scene.duration.seconds || 0) - startTime;
    if (remaining >= 1 / frameRate) form.duration = Math.min(form.duration, remaining);
  }
  cameraOrbitForm = form;
  return form;
}

function resolveCameraOrbitCenter(form, sourceProject) {
  if (!form) return null;
  if (form.targetValue === "world") return form.worldPosition ? { ...form.worldPosition } : null;
  if (form.targetValue.startsWith("environment:")) {
    return cameraAimTargetPosition(sourceProject, null, {
      mode: "look-at", targetKind: "environment",
      environmentID: form.targetValue.slice(12), localPosition: form.localPosition,
    });
  }
  const actorID = form.targetValue.startsWith("actor:") ? form.targetValue.slice(6) : null;
  if (!actorID) return null;
  return cameraAimTargetPosition(
    sourceProject,
    sampleProject(sourceProject, form.startTime),
    {
      mode: "look-at",
      targetKind: "actor",
      targetActorID: actorID,
      actorHeight: form.actorHeight,
      composition: "center",
      trackingResponse: 0,
    }
  );
}

function resolveCameraOrbitBaseCenter(form, sourceProject, shot) {
  const visibleCenter = resolveCameraOrbitCenter(form, sourceProject);
  if (!visibleCenter || !shot) return null;
  const pose = sampleShotCamera(
    sourceProject,
    shot,
    form.startTime,
    sampleProject(sourceProject, form.startTime)
  );
  const translation = pose?.followEvaluation?.translation || { x: 0, y: 0, z: 0 };
  return {
    x: visibleCenter.x - translation.x,
    y: visibleCenter.y - translation.y,
    z: visibleCenter.z - translation.z,
  };
}

function previewCameraOrbit() {
  const baseProject = cameraOrbitDraft?.baseProject || project;
  const baseShot = findShot(baseProject, cameraOrbitForm?.shotID);
  const baseTrack = baseShot?.camera?.track;
  if (!baseShot || !baseTrack || !cameraOrbitForm) {
    showToast("当前没有可预览的摄影机轨道", true);
    return;
  }
  const center = resolveCameraOrbitBaseCenter(cameraOrbitForm, baseProject, baseShot);
  if (!center) {
    showToast("请选择有效的环绕中心", true);
    return;
  }
  cancelStagedCameraEdit(false);
  try {
    const generated = buildCameraOrbitTrack(
      baseTrack,
      cameraOrbitForm.startTime,
      center,
      cameraOrbitForm,
      baseProject.output.frameRate
    );
    if (
      baseProject.scene.duration.mode === "manual"
      && generated.endTime > Number(baseProject.scene.duration.seconds || 0) + 0.000001
    ) {
      throw new RangeError("环绕终点超过手动 Scene End；请先延长场景时长");
    }
    const previewProject = setShotCameraTrack(baseProject, baseShot.id, generated.track);
    cameraOrbitDraft = {
      baseProject,
      project: previewProject,
      shotID: baseShot.id,
      startTime: generated.startTime,
      endTime: generated.endTime,
      startKeyframeID: generated.startKeyframeID,
      endKeyframeID: generated.endKeyframeID,
      createdKeyframeCount: generated.createdKeyframeIDs.length,
    };
    playback.setDuration(Math.max(Number(previewProject.scene.duration.seconds || 0), 0));
    renderInspector();
    renderTransport();
    syncRenderer();
  } catch (error) {
    showToast(error.message || "无法生成环绕轨迹", true);
    renderInspector();
    renderTransport();
  }
}

function applyCameraOrbitPreview() {
  if (!cameraOrbitDraft || !canEditCameraOrbit()) return;
  const draft = cameraOrbitDraft;
  cameraOrbitDraft = null;
  cameraOrbitForm = null;
  project = projectState.commit(draft.project);
  cameraKeyframeSelection.activeID = draft.startKeyframeID;
  playback.setDuration(rehearsalDuration());
  finishAuthoredChange(`环绕已应用 · 新增 ${draft.createdKeyframeCount} 个关键帧`);
}

function cancelCameraOrbitPreview(showConfirmation = false, render = true) {
  if (!cameraOrbitDraft) return;
  cameraOrbitDraft = null;
  cameraGuideProjectSource = null;
  playback.setDuration(rehearsalDuration());
  if (render) {
    renderInspector();
    renderTransport();
    syncRenderer();
  }
  if (showConfirmation) showToast("已取消环绕预览");
}

function renderInspector() {
  renderInspectorContent();
  // Inspector 常被单独重渲染（不经过 renderAll），select 增强在这里兜底。
  enhanceAllSelects();
}

function renderInspectorContent() {
  if (inspectorPanel === "scene") {
    renderSceneInspector();
    return;
  }
  if (inspectorPanel === "camera") {
    const setup = selectedObject?.kind === "cameraSetup"
      ? findCameraSetup(project, selectedObject.id)
      : null;
    if (setup) renderCameraSetupInspector(setup);
    else renderCameraInspector();
    return;
  }
  if (inspectorPanel === "object") {
    renderObjectInspector();
    return;
  }
  

  const actor = findActor(project, selectedObject?.kind === "actor" ? selectedObject.id : selectedActorID);
  if (!actor) {
    elements.inspectorContent.innerHTML = `<div class="inspector-empty">从左侧列表或视口选择一个对象。</div>`;
    return;
  }
  renderActorInspector(actor);
}

function renderActorInspector(actor) {
  const pose=actorPoseValue(actor);
  const pairedAction = null;
  const pairedRole = pairedAction?.roles.X.actorID === actor.id ? "X" : "Y";
  elements.inspectorContent.innerHTML = `
    <details id="actorTransform" class="inspector-section inspector-disclosure" ${actorTransformExpanded ? "open" : ""}>
      <summary>整体位置与初始面向</summary>
      <div class="inspector-disclosure-content">
      <p class="section-caption">平移人物和整条走位路径</p>
      <div class="transform-field-grid two-column">
        <label><span>X</span><input data-actor-position="x" type="number" step="any" data-scrub-step="0.05" value="${Number(actor.position.x).toFixed(2)}" /></label>
        <label><span>Y</span><input data-actor-position="y" type="number" step="any" data-scrub-step="0.05" value="${Number(actor.position.y).toFixed(2)}" /></label>
        <label><span>Z</span><input data-actor-position="z" type="number" step="any" data-scrub-step="0.05" value="${Number(actor.position.z).toFixed(2)}" /></label>
        <label><span>初始面向</span><div class="input-with-unit"><input id="actorInitialFacing" aria-label="初始面向（度）" type="number" min="-360" max="360" step="any" data-scrub-step="0.1" required value="${(actor.rotationY*180/Math.PI).toFixed(1)}" /><span>°</span></div></label>
      </div>
      </div>
    </details>
    <details id="actorPerformance" class="inspector-section inspector-disclosure" ${actorPerformanceExpanded ? "open" : ""}>
      <summary>动作内偏移与姿态</summary>
      <div class="inspector-disclosure-content">
      <p class="section-caption">人物帧控制 · 位置相对走位方向；朝向偏移归零即使用动作面向</p>
      <div class="transform-field-grid two-column">
        ${['offsetX','offsetY','offsetZ'].map((key,index)=>`<label><span>${['X 左右','Y 上下','Z 前后'][index]}</span><div class="input-with-unit"><input data-actor-pose="${key}" aria-label="${actorPoseParameters[key].label}（米）" type="number" required min="-1000" max="1000" step="any" value="${pose[key].toFixed(3)}" /><span>m</span></div></label>`).join('')}
      </div>
      <div class="actor-pose-frame-actions">
        <button id="returnActorToPath" class="secondary-button" type="button">回到走位基准</button>
        <label><input id="actorReturnUpright" type="checkbox" ${actorReturnUpright?'checked':''} />同时恢复直立</label>
      </div>
      <p class="section-caption">当前时刻记帧，偏移与朝向归零；从上个关键帧过渡</p>
      <div class="transform-field-grid two-column">
        <label><span>朝向偏移</span><div class="input-with-unit"><input id="actorRotationY" aria-label="朝向偏移（度）" data-actor-pose="rotationYOffset" type="number" min="-360" max="360" step="any" data-scrub-step="0.1" required value="${(pose.rotationYOffset * 180 / Math.PI).toFixed(1)}" /><span>°</span></div></label>
      </div>
      ${`<div class="transform-field-grid two-column">
        ${[["rotationX", "前后倾斜"], ["rotationZ", "左右倾斜"]].map(([key, label]) => `<label><span>${label}</span><div class="input-with-unit"><input data-actor-pose="${key}" type="number" min="-360" max="360" step="any" data-scrub-step="0.1" required value="${(pose[key] * 180 / Math.PI).toFixed(1)}" aria-label="${label}（度）" /><span>°</span></div></label>`).join("")}
      </div>`}
      <div class="actor-pose-frame-actions">
        <button id="recordActorPoseInspector" class="primary-button" type="button">添加人物帧</button>
        <button id="cancelActorPoseInspector" class="secondary-button" type="button" hidden>取消调整</button>
        <span id="actorPoseFrameStatus" class="field-value"></span>
      </div>
      <details class="actor-pose-parameters" ${actorPoseParametersExpanded?'open':''}>
        <summary>姿态参数</summary>
        <div class="transform-field-grid two-column">
        ${Object.entries(actorPoseParameters).filter(([key])=>!['rotationYOffset','rotationX','rotationZ','offsetX','offsetY','offsetZ'].includes(key)).map(([key,spec])=>{
          const scale=spec.unit==='angle'?180/Math.PI:1;
          return `<label><span>${spec.label}</span><div class="input-with-unit"><input data-actor-pose="${key}" type="number" required min="${spec.min*scale}" max="${spec.max*scale}" step="any" data-scrub-step="${spec.unit==='angle'?'0.1':spec.unit==='meters'?'0.001':'0.01'}" value="${(pose[key]*scale).toFixed(spec.unit==='angle'?1:spec.unit==='meters'?3:2)}" /><span>${spec.unit==='angle'?'°':spec.unit==='meters'?'m':'×'}</span></div></label>`;
        }).join('')}
        <label><span>过渡方式</span><select id="actorPoseInterpolation">${['smooth','ease-in-out','linear'].map((kind,i)=>`<option value="${kind}" ${actor.poseTrack.interpolation===kind?'selected':''}>${['平滑','缓入缓出','线性'][i]}</option>`).join('')}</select></label>
        </div>
      </details>
      </div>
    </details>
    <details id="actorAppearance" class="inspector-section inspector-disclosure" ${actorAppearanceExpanded ? "open" : ""}>
      <summary>外观</summary>
      <div class="inspector-disclosure-content">
        <div class="field">
          <label>角色</label>
          <div class="segment-control">
            ${["blocking-figure"].map((id) => `<button type="button" data-character="${id}" class="${actor.characterAssetID === id ? "selected" : ""}">${id === "blocking-figure" ? "抽象人" : id === "xbot" ? "X Bot" : "Y Bot"}</button>`).join("")}
          </div>
        </div>
        <div class="field">
          <label>识别色</label>
          <div class="color-options">
            ${clothingColors.map((color, index) => `<button class="color-option ${!actor.blockingColor && actor.clothingColorIndex === index ? "selected" : ""}" style="background:${color};--swatch-ring:${clothingInk(index)}" type="button" data-color-index="${index}" aria-label="演员颜色 ${index + 1}" aria-pressed="${!actor.blockingColor && actor.clothingColorIndex === index}"></button>`).join("")}
          </div>
        </div>
        ${`<div class="field">
          <label for="actorColorHex">自定义颜色</label>
          <div class="actor-custom-color">
            <input id="actorColorPicker" type="color" value="${actorColor(actor)}" aria-label="抽象人颜色取色器" />
            <input id="actorColorHex" type="text" required value="${actorColor(actor)}" pattern="#[0-9a-fA-F]{6}" maxlength="7" spellcheck="false" aria-label="抽象人 HEX 色值" title="输入 #RRGGBB 格式，例如 #D97757" />
          </div>
        </div>`}
        <div class="field">
          <div class="field-heading"><label for="actorScale">身高比例</label><span id="actorScaleValue" class="field-value">${actor.scale.toFixed(2)}×</span></div>
          <label><span class="sr-only">身高比例数值</span><input id="actorScale" type="number" min="0.5" max="2" step="any" data-scrub-step="0.01" value="${actor.scale.toFixed(2)}" /></label>
        </div>
      </div>
    </details>
    ${`<div id="actorMotionHost"></div>`}
  `;

  document.getElementById("actorAppearance")?.addEventListener("toggle", (event) => {
    actorAppearanceExpanded = event.currentTarget.open;
  });
  document.getElementById("actorTransform")?.addEventListener("toggle", (event) => {
    actorTransformExpanded = event.currentTarget.open;
  });
  {
    renderMotionInspector(actor, document.getElementById("actorMotionHost"));
  }
  const commitActorTransformFields = () => {
    const position = { ...actor.position };
    for (const input of elements.inspectorContent.querySelectorAll("[data-actor-position]")) {
      position[input.dataset.actorPosition] = Number(input.value);
    }
    const rotationY = actor.rotationY;
    void commitProject(
      (current) => setActorOrPairedRoleTransform(
        current,
        actor.id,
        position,
        rotationY
      ),
      "演员整体位置已更新"
    );
  };
  for (const input of elements.inspectorContent.querySelectorAll("[data-actor-position]")) {
    input.addEventListener("change", commitActorTransformFields);
    wireProjectNumberScrub(
      input,
      (base, value) => {
        const currentActor = findActor(base, actor.id);
        if (!currentActor) return base;
        return setActorOrPairedRoleTransform(base, actor.id, {
          ...currentActor.position,
          [input.dataset.actorPosition]: value,
        }, currentActor.rotationY);
      },
      "演员整体位置已更新"
    );
  }
  const initialFacing=document.getElementById('actorInitialFacing');
  initialFacing.addEventListener('change',()=>{
    if(!initialFacing.reportValidity())return;
    void commitProject(current=>{
      const currentActor=findActor(current,actor.id);
      return setActorOrPairedRoleTransform(current,actor.id,currentActor.position,Number(initialFacing.value)*Math.PI/180);
    },'初始面向已更新');
  });
  wireProjectNumberScrub(initialFacing,(base,value)=>{
    const currentActor=findActor(base,actor.id);
    return setActorOrPairedRoleTransform(base,actor.id,currentActor.position,value*Math.PI/180);
  },'初始面向已更新');
  document.getElementById('actorPerformance').addEventListener('toggle',event=>{actorPerformanceExpanded=event.currentTarget.open;});
  wireActorPoseControls(actor);
  elements.inspectorContent.querySelector('.actor-pose-parameters').addEventListener('toggle',event=>{actorPoseParametersExpanded=event.currentTarget.open;});
  for (const button of elements.inspectorContent.querySelectorAll("[data-character]")) {
    button.addEventListener("click", () => commitProject((current) => setActorProperty(current, actor.id, "characterAssetID", button.dataset.character), "角色已更新"));
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-color-index]")) {
    button.addEventListener("click", () => commitProject((current) => setActorProperty(current, actor.id, "clothingColorIndex", Number(button.dataset.colorIndex)), "识别色已更新"));
  }
  {
    const picker = document.getElementById("actorColorPicker");
    const hex = document.getElementById("actorColorHex");
    picker.disabled = hex.disabled = !canAuthor();
    const applyColor = (input) => {
      if (!input.reportValidity()) return;
      commitProject((current) => setActorProperty(current, actor.id, "blockingColor", input.value), "抽象人颜色已更新");
    };
    picker.addEventListener("change", () => applyColor(picker));
    hex.addEventListener("change", () => applyColor(hex));
    hex.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); applyColor(hex); }
    });
  }
  const scaleInput = document.getElementById("actorScale");
  scaleInput.disabled = !canAuthor();
  scaleInput.addEventListener("input", () => {
    document.getElementById("actorScaleValue").textContent = `${Number(scaleInput.value).toFixed(2)}×`;
  });
  scaleInput.addEventListener("change", () => commitProject((current) => setActorProperty(current, actor.id, "scale", Number(scaleInput.value)), "演员缩放已更新"));
  wireProjectNumberScrub(
    scaleInput,
    (base, value) => setActorProperty(base, actor.id, "scale", value),
    "演员缩放已更新",
    { precision: 2 }
  );
  setInspectorAuthoringDisabled(actor.locked);
}

function renderMotionInspector(actor, target = elements.inspectorContent) {
  const placementActive = directorRenderer.placingMove;
  target.innerHTML = `
    <section class="inspector-section">
      <h2 class="section-title">${"走位"}</h2>
      <div class="inline-actions motion-actions-toolbar">
        <button id="placeMove" class="${placementActive ? "primary-button" : "secondary-button"}" type="button">${placementActive ? "正在选点" : "添加移动"}</button>
        <button id="clearMotion" class="secondary-button" type="button">清空走位</button>
      </div>
      <div class="motion-list">
        ${renderMotionRows(actor)}
      </div>
    </section>
  `;

  document.getElementById("placeMove").addEventListener("click", () => directorRenderer.setMovePlacement(!directorRenderer.placingMove));
  document.getElementById("clearMotion").addEventListener("click", () => commitProject((current) => clearMotion(current, actor.id), "已清空走位，保留起点"));

  for (const input of elements.inspectorContent.querySelectorAll("[data-action-value]")) {
    if (input.type === "number") wireInputNumberScrub(input);
    input.addEventListener("change", () => {
      const key = input.dataset.actionValue;
      const value = ["actionID", "locomotionGait", "loopBehavior", "posture"].includes(key)
        ? input.value
        : Number(input.value);
      const inspectionTarget = { actorID: actor.id, actionID: input.dataset.actionId };
      commitProject(
        (current) => updateMotionAction(current, actor.id, input.dataset.actionId, { [key]: value }),
        "动作参数已更新",
        key === "actionID"
          ? { inspectAfterCommit: inspectionTarget }
          : { preserveInspectionFor: inspectionTarget }
      );
    });
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-preview-action]")) {
    button.addEventListener("click", () => toggleActionInspection(actor.id, button.dataset.previewAction));
  }
  {}
  {}
  for (const button of elements.inspectorContent.querySelectorAll("[data-natural-duration]")) {
    button.addEventListener("click", () => {
      const action = actor.motionActions.find((candidate) => candidate.id === button.dataset.naturalDuration);
      const duration = action ? actionSourceRange(action).duration : null;
      if (!Number.isFinite(duration)) return;
      commitProject(
        (current) => updateMotionAction(current, actor.id, action.id, { duration }),
        "已恢复动作自然时长",
        { preserveInspectionFor: { actorID: actor.id, actionID: action.id } }
      );
    });
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-natural-speed]")) {
    button.addEventListener("click", () => {
      const action = actor.motionActions.find((candidate) => candidate.id === button.dataset.naturalSpeed);
      const speed = desktopActions[action?.actionID]?.defaultSpeed;
      if (!Number.isFinite(speed)) return;
      commitProject(
        (current) => updateMotionAction(current, actor.id, action.id, { speed }),
        "已恢复片段推荐速度",
        { preserveInspectionFor: { actorID: actor.id, actionID: action.id } }
      );
    });
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-select-path-point]")) {
    button.addEventListener("click", () => selectPathPoint(actor.id, button.dataset.selectPathPoint));
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-add-performance-at-point]")) {
    button.addEventListener("click", () => {
      const pointID = button.dataset.addPerformanceAtPoint;
      selectedPathPointID = pointID;
      commitProject(
        (current) => addStayActionAtPoint(current, actor.id, pointID, { duration: 1 }),
        "已在路径点添加动作"
      );
    });
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-face-next-action]")) {
    button.addEventListener("click", () => {
      const actionID = button.dataset.faceNextAction;
      commitProject(
        (current) => faceActionTowardNextTarget(current, actor.id, actionID),
        "动作已面向下一移动目标",
        { preserveInspectionFor: { actorID: actor.id, actionID } }
      );
    });
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-facing-mode]")) {
    button.addEventListener("click", () => {
      const actionID = button.dataset.actionId;
      const action = actor.motionActions.find(candidate => candidate.id === actionID);
      const patch = action.kind === "move"
        ? { facingMode: button.dataset.facingMode }
        : { facingY: null };
      commitProject(current => updateMotionAction(current, actor.id, actionID, patch),
        "动作面向已更新", { preserveInspectionFor: { actorID: actor.id, actionID } });
    });
  }
  for (const input of elements.inspectorContent.querySelectorAll("[data-move-duration]")) {
    const actionID = input.dataset.moveDuration;
    wireInputNumberScrub(input, { precision: 2 });
    input.addEventListener("change", (event) => {
      const phase = actorPlaybackPlan(actor).phases.find(
        (candidate) => candidate.kind === "move" && candidate.action?.id === actionID
      );
      if (!phase) return;
      const patch = motionResizePatch(
        actor,
        phase,
        phase.startTime + Number(event.target.value),
        project.output.frameRate
      );
      if (!patch) return;
      commitProject(
        (current) => updateMotionAction(current, actor.id, actionID, patch),
        "移动时长已更新",
        { preserveInspectionFor: { actorID: actor.id, actionID } }
      );
    });
  }
  for (const input of elements.inspectorContent.querySelectorAll("[data-facing-angle]")) {
    const actionID = input.dataset.facingAngle;
    wireInputNumberScrub(input, { precision: 1 });
    input.addEventListener("change", (event) => {
      commitProject(
        (current) => updateMotionAction(current, actor.id, actionID, {
          facingY: Number(event.target.value) * Math.PI / 180,
          ...(actor.motionActions.find(action => action.id === actionID).kind === "move" ? {facingMode: "fixed"} : {}),
        }),
        "动作面向已更新",
        { preserveInspectionFor: { actorID: actor.id, actionID } }
      );
    });
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-reorder-performance]")) {
    button.addEventListener("click", () => {
      const actionID = button.dataset.reorderPerformance;
      const inspectionTarget = actionInspection?.actorID === actor.id
        ? { actorID: actor.id, actionID: actionInspection.actionID }
        : null;
      commitProject(
        (current) => movePerformanceWithinPoint(current, actor.id, actionID, button.dataset.reorderDirection),
        button.dataset.reorderDirection === "up" ? "动作已上移" : "动作已下移",
        { preserveInspectionFor: inspectionTarget }
      );
    });
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-delete-action]")) {
    button.addEventListener("click", () => commitProject(
      (current) => removeMotionAction(current, actor.id, button.dataset.deleteAction),
      motionDeletionMessage(actor, button.dataset.deleteAction)
    ));
  }
  {}
  setInspectorAuthoringDisabled(actor.locked);
}

// 删 Move 是唯一会连坐的单体删除：removeMotionAction 会把它后面的到达点
// 连同该点上的全部动作一起吃掉。按钮上看不出来，所以让回执把账说清。
function motionDeletionMessage(actor, actionID) {
  const actions = actor.motionActions;
  const index = actions.findIndex((action) => action.id === actionID);
  if (index < 0 || actions[index].kind !== "move") return "动作已删除";
  let performances = 0;
  for (let cursor = index + 1; cursor < actions.length && actions[cursor].kind === "hold"; cursor += 1) {
    if (actions[cursor].duration > 0) performances += 1;
  }
  return performances
    ? `移动已删除，到达点上的 ${performances} 个动作一并移除`
    : "移动已删除";
}

// 一个点里超过 26 个动作时退回数字 —— 真出现了也不该崩，只是不好看。
function performanceLetter(order) {
  return order < 26 ? String.fromCharCode(97 + order) : String(order + 1);
}

function renderMotionRows(actor) {
  const blocking = true;
  const playbackPlan = actorPlaybackPlan(actor);
  const actionByID = new Map(actor.motionActions.map((action) => [action.id, action]));
  const performanceOrder = new Map();
  for (const point of motionPathPoints(actor)) {
    const performanceIDs = point.holdActionIDs.filter((id) => (
      Number(actionByID.get(id)?.duration || 0) > 0
    ));
    performanceIDs.forEach((id, order) => performanceOrder.set(id, {
      order,
      count: performanceIDs.length,
    }));
  }
  const renderFacingEditor = (action, index) => {
    const moving = action.kind === "move";
    const mode = moving ? action.facingMode ?? "path" : Number.isFinite(action.facingY) ? "fixed" : "inherit";
    const phase = playbackPlan.phases.find(candidate => candidate.action.id === action.id);
    // Display the action's base yaw, without the additive pose-keyframe offset.
    const baseYaw = phase?.endRotationY ?? playbackPlan.phases.findLast(candidate => candidate.actionIndex < index)?.endRotationY ?? actor.rotationY;
    const degrees = ((mode === "fixed" ? action.facingY : baseYaw) * 180 / Math.PI).toFixed(1);
    const hasNextMove = actor.motionActions.slice(index + 1).some(candidate => candidate.kind === "move");
    const id = escapeHTML(action.id);
    return `<div class="facing-editor">
      <label class="facing-angle-row">面向角度
        <span class="input-with-unit motion-number facing-angle-field ${mode !== "fixed" ? "inherited" : ""}">
          <input data-facing-angle="${id}" type="number" step="any" data-scrub-step="1" value="${degrees}" aria-label="${moving ? "移动" : "停留"}面向角度（度）" title="输入或拖动，直接指定面向角度" />
          <span>°</span>
        </span>
        <span class="facing-mode-label">${mode === "fixed" ? "指定" : mode === "inherit" ? "保持" : "跟随"}</span>
      </label>
      <div class="facing-command-row">
        <button class="compact-button facing-mode-button ${mode === "inherit" ? "active" : ""}" type="button" data-action-id="${id}" data-facing-mode="inherit" aria-pressed="${mode === "inherit"}" title="保持进入这段${moving ? "移动" : "停留"}时的面向">保持面向</button>
        ${moving
          ? `<button class="compact-button facing-mode-button ${mode === "path" ? "active" : ""}" type="button" data-action-id="${id}" data-facing-mode="path" aria-pressed="${mode === "path"}" title="持续跟随这段移动的方向，路径变化时同步更新">跟随移动方向</button>`
          : `<button class="compact-button" type="button" data-face-next-action="${id}" ${hasNextMove ? "" : "disabled"} title="${hasNextMove ? "按下一段移动的方向设置角度；修改路径后可再次点击对准" : "后面没有移动段"}">朝向移动方向</button>`}
      </div>
    </div>`;
  };
  const renderMoveRow = (action, index) => {
    const timing = playbackPlan.actionTimings[index];
    // 移动片段的推荐速度是从原始动画的根位移算出来的（tools/import_move_action.py），
    // 也就是「脚不打滑」的那个速度。「标准」恢复的就是它，和 stay 那边恢复自然时长对称。
    const moveCatalogAction = desktopActions[action.actionID];
    const turnLabel = timing.turnsInPlace
      ? ` · 含转身 ${timing.turnDuration.toFixed(2)}s / 尾段融合 ${timing.turnMoveBlendDuration.toFixed(2)}s`
      : "";
    // 时长 = 路径长度 ÷ 速度，改不了，所以和速度并成一行、做成只读，不再单占一行。
    // 转身与尾段融合的拆分只有真含转身时才有意义，没有就不占地方。
    const detail = timing.turnsInPlace ? turnLabel.replace(/^ · /, "") : "";
    const previewing = actionInspection?.actorID === actor.id && actionInspection?.actionID === action.id;
    return `
      <article class="motion-row ${previewing ? "selected" : ""}" data-motion-action-row="${escapeHTML(action.id)}">
        <div class="motion-row-head">
          <span><span class="motion-title">${"移动"}</span></span>
          <span class="motion-row-actions">
            <button class="motion-preview ${previewing ? "active" : ""}" type="button" data-preview-action="${escapeHTML(action.id)}" aria-pressed="${previewing}">${previewing ? "停止" : "预览"}</button>
            <button class="motion-delete" type="button" data-delete-action="${escapeHTML(action.id)}" title="删除移动" aria-label="删除 Move">×</button>
          </span>
        </div>
        ${detail ? `<p class="motion-detail">${detail}</p>` : ""}
        ${""}
        <div class="motion-control motion-timing-control">
          <span class="input-with-unit motion-number">
            <input data-action-value="speed" data-action-id="${escapeHTML(action.id)}" type="number" min="0.05" max="20" step="any" data-scrub-step="0.05" value="${action.speed.toFixed(2)}" aria-label="移动速度（米每秒）" />
            <span>m/s</span>
          </span>
          <span class="input-with-unit motion-number">
            <input data-move-duration="${escapeHTML(action.id)}" type="number" min="0.05" max="3600" step="any" data-scrub-step="0.05" value="${timing.totalDuration.toFixed(2)}" aria-label="这段移动的时长（秒）" />
            <span>s</span>
          </span>
          ${""}
        </div>
        ${renderFacingEditor(action, index)}
      </article>`;
  };

  // letter 是这个动作在所属点内部的位置（a / b / c）。外层用数字、点内用字母，
  // 免得「起点 1」里面的动作接着数成 2、3。
  const renderPerformanceRow = (action, index, letter) => {
    const previewing = actionInspection?.actorID === actor.id && actionInspection?.actionID === action.id;
    const behaviorLabels = { loop: "循环", play_once: "单次", hold_last_frame: "末帧" };
    const catalogAction = desktopActions[action.actionID];
    const loopBehaviorOptions = desktopActionLoopBehaviorOptions(catalogAction);
    // 明细行原本写「时长 · 动作名 · 播放方式 · 自带位移」，这些信息在正下方控件或
    // 3D 轨迹里已经可见；素材审核只提供默认播放方式，导演始终可以覆盖。
    const order = performanceOrder.get(action.id);
    const canFindPrevious = canInsertStayActionBefore(actor, action.id);
    const reorderButtons = order?.count > 1
      ? `
        <button class="motion-reorder" type="button" data-reorder-performance="${escapeHTML(action.id)}" data-reorder-direction="up" title="上移动作" aria-label="上移动作" ${order.order === 0 ? "disabled" : ""}>↑</button>
        <button class="motion-reorder" type="button" data-reorder-performance="${escapeHTML(action.id)}" data-reorder-direction="down" title="下移动作" aria-label="下移动作" ${order.order === order.count - 1 ? "disabled" : ""}>↓</button>`
      : "";
    return `
      <article class="motion-row motion-performance ${previewing ? "selected" : ""}" data-motion-action-row="${escapeHTML(action.id)}">
        <div class="motion-row-head">
          <span><span class="motion-index motion-letter">${letter}</span><span class="motion-title">${"停留"}</span></span>
          <span class="motion-row-actions">
            ${reorderButtons}
            <button class="motion-preview ${previewing ? "active" : ""}" type="button" data-preview-action="${escapeHTML(action.id)}" aria-pressed="${previewing}">${previewing ? "停止" : "预览"}</button>
            <button class="motion-delete" type="button" data-delete-action="${escapeHTML(action.id)}" title="删除动作" aria-label="删除动作">×</button>
          </span>
        </div>
        ${`<label class="motion-control blocking-posture-control">动作
          <select data-action-value="posture" data-action-id="${escapeHTML(action.id)}" aria-label="停留动作">
            ${action.gesture || action.joints ? '<option value="custom" selected disabled>自定义动作</option>' : ""}
            <option value="stand" ${!action.gesture && !action.joints && action.posture !== "sit" ? "selected" : ""}>站立</option>
            <option value="sit" ${!action.gesture && !action.joints && action.posture === "sit" ? "selected" : ""}>坐下</option>
          </select>
        </label>
        ${action.posture === "sit" ? `<label class="motion-control blocking-posture-control">座位高度
          <span class="input-with-unit motion-number">
            <input data-action-value="seatHeight" data-action-id="${escapeHTML(action.id)}" type="number" min="0" max="2" step="any" data-scrub-step="0.01" value="${action.seatHeight.toFixed(2)}" aria-label="座位高度（米，人物缩放前）" />
            <span>m</span>
          </span>
        </label>` : ""}`}
        <div class="motion-control motion-timing-control">
          ${""}
          <span class="input-with-unit motion-number">
            <input data-action-value="duration" data-action-id="${escapeHTML(action.id)}" type="number" min="0" max="3600" step="any" data-scrub-step="0.1" value="${action.duration.toFixed(2)}" aria-label="${"停留"}时长（秒）" />
            <span>s</span>
          </span>
          ${""}
        </div>
        ${renderFacingEditor(action, index)}
        ${""}
      </article>`;
  };

  const renderPointGroup = ({ anchor, index, number, performances }) => {
    const selected = anchor.id === selectedPathPointID;
    return `
      <section class="motion-point-group ${selected ? "selected" : ""}" data-motion-action-row="${escapeHTML(anchor.id)}">
        <div class="motion-point-head">
          <button class="motion-point-select" type="button" data-select-path-point="${escapeHTML(anchor.id)}" aria-pressed="${selected}" aria-label="选择${index === 0 ? "起点" : "到达点"} ${number}"><span class="motion-index">${number}</span><span class="motion-title">${index === 0 ? "起点" : "到达点"}</span></button>
          <span class="motion-point-count">${performances.length ? `${performances.length} 个${"停留"}` : "无停留"}</span>
        </div>
        ${performances.length ? `<div class="motion-point-actions">${performances.map(({ action, index: actionIndex }, order) => renderPerformanceRow(action, actionIndex, performanceLetter(order))).join("")}</div>` : ""}
        <button class="compact-button point-performance-button" type="button" data-add-performance-at-point="${escapeHTML(anchor.id)}">＋ 添加${"停留"}</button>
      </section>`;
  };

  const rows = [];
  let point = null;
  let pointNumber = 0;
  const flushPoint = () => {
    if (!point) return;
    rows.push(renderPointGroup(point));
    point = null;
  };

  actor.motionActions.forEach((action, index) => {
    const structural = action.kind === "hold" && action.duration === 0;
    if (structural) {
      flushPoint();
      pointNumber += 1;
      point = { anchor: action, index, number: pointNumber, performances: [] };
    } else if (action.kind === "move") {
      flushPoint();
      rows.push(renderMoveRow(action, index));
    } else if (point) {
      point.performances.push({ action, index });
    }
  });
  flushPoint();
  
  return rows.join("");
}

function renderObjectInspector() {
  if (selectedObject?.kind === "blockoutLayer") {
    renderBlockoutLayerInspector();
    return;
  }
  if (selectedObject?.kind === "environment") {
    renderVisualEnvironmentObjectInspector();
    return;
  }
  if (selectedObject?.kind === "environmentGroup") {
    renderVisualEnvironmentGroupInspector();
    return;
  }
  const groupID = selectedObject?.kind === "blockoutGroup"
    ? selectedObject.id
    : selectedObject?.parentID;
  const group = project.scene.blockout.groups.find((candidate) => candidate.id === groupID);
  if (!group) {
    elements.inspectorContent.innerHTML = `<div class="inspector-empty">从布景列表或视口选择一个对象。</div>`;
    return;
  }
  if (selectedObject.kind === "blockoutObject") {
    const object = group.objects.find((candidate) => candidate.id === selectedObject.id);
    if (object) {
      renderBlockoutObjectInspector(group, object);
      return;
    }
  }
  renderBlockoutGroupInspector(group);
}

function renderBlockoutLayerInspector() {
  const opacity = Number(project.scene.blockout.opacity ?? 1);
  const objectCount = project.scene.blockout.groups.reduce(
    (count, group) => count + group.objects.length,
    0
  );
  const primitiveCount = project.scene.blockout.groups.reduce(
    (count, group) => count + group.objects.reduce(
      (objectCount, object) => objectCount + object.primitives.length,
      0
    ),
    0
  );
  elements.inspectorContent.innerHTML = `
    <section class="inspector-section">
      <h2 class="section-title">透明度</h2>
      <p class="section-caption">${project.scene.blockout.groups.length} 个布景组 · ${objectCount} 个对象 · ${primitiveCount} 个内部几何部件。</p>
      ${renderOpacityField("blockoutLayerOpacity", opacity, "整体透明度")}
    </section>`;
  wireObjectRange(
    "blockoutLayerOpacity",
    (base, value) => setBlockoutLayerOpacity(base, value),
    "布景整体透明度已更新"
  );
  setObjectInspectorAuthoringDisabled(project.scene.blockout.locked === true);
}

function renderVisualEnvironmentObjectInspector() {
  const visual = project.scene.environment.visuals.find(
    (candidate) => candidate.id === selectedObject?.id
  );
  if (!visual) {
    elements.inspectorContent.innerHTML = `<div class="inspector-empty">视觉环境已移除。</div>`;
    return;
  }
  const transform = visual.transform;
  const parentGroup = visual.groupID
    ? project.scene.environment.groups.find((group) => group.id === visual.groupID)
    : null;
  const rotation = visualEnvironmentRotationDegrees(visual);
  const opacity = Number(visual.appearance?.opacity ?? 1);
  const bodyColorIndex = null;
  elements.inspectorContent.innerHTML = `
    <section class="inspector-section">
      <h2 class="section-title"><span>${escapeHTML(visual.name)}</span><span class="object-type-badge">${visual.asset.kind === "gaussian" ? "PLY" : "GLB"}</span></h2>
      <div class="field"><label for="environmentObjectName">名称</label><input id="environmentObjectName" type="text" maxlength="80" value="${escapeHTML(visual.name)}" /></div>
      <p class="section-caption" title="${escapeHTML(visual.asset.sourceName)}">来源：${escapeHTML(visual.asset.sourceName)}</p>
      ${parentGroup ? `<p class="section-caption">变换相对于环境组「${escapeHTML(parentGroup.name)}」</p>` : ""}
      <div class="field"><label for="environmentObjectGroup">所属环境组</label><select id="environmentObjectGroup">
        <option value="">未分组</option>
        ${project.scene.environment.groups.map((group) => `<option value="${escapeHTML(group.id)}" ${group.id === visual.groupID ? "selected" : ""} ${group.locked && group.id !== visual.groupID ? "disabled" : ""}>${escapeHTML(group.name)}</option>`).join("")}
      </select></div>
      <div class="inline-actions">
        ${selectedEnvironmentIDs.size > 1 ? `<button id="groupSelectedEnvironments" class="secondary-button" type="button">将所选 ${selectedEnvironmentIDs.size} 项成组</button>` : ""}
        <button id="groundSelectedEnvironment" class="secondary-button" type="button">贴地到 Y=0</button>
        <button id="replaceSelectedEnvironment" class="secondary-button" type="button">替换</button>
        <button id="removeSelectedEnvironment" class="secondary-button environment-remove-button" type="button">移除</button>
        <input id="selectedEnvironmentFile" type="file" accept=".glb,model/gltf-binary" hidden />
      </div>
    </section>
    <section class="inspector-section">
      <h2 class="section-title">变换</h2>
      ${renderVectorFields("environment-position", transform.position, ["x", "y", "z"], parentGroup ? "组内位置" : "位置")}
      <div class="transform-field-grid environment-orientation-grid">
        <label><span>水平旋转</span><div class="input-with-unit"><input id="environmentObjectYaw" type="number" step="any" data-scrub-step="1" value="${rotation.yaw.toFixed(1)}" /><span>°</span></div></label>
        <label><span>垂直旋转</span><div class="input-with-unit"><input id="environmentObjectPitch" type="number" step="any" data-scrub-step="1" value="${rotation.pitch.toFixed(1)}" /><span>°</span></div></label>
        <label><span>统一缩放</span><input id="environmentObjectScale" type="number" min="0.001" max="1000" step="any" data-scrub-step="0.01" value="${Number(transform.uniformScale).toFixed(3)}" /></label>
      </div>
    </section>
    <section class="inspector-section">
      <h2 class="section-title">外观</h2>
      ${`
        <div class="segment-control">
          <button type="button" data-environment-material-mode="material" class="${visual.appearance.materialMode === "material" ? "selected" : ""}">材质</button>
          <button type="button" data-environment-material-mode="gray" class="${visual.appearance.materialMode === "gray" ? "selected" : ""}">灰模</button>
        </div>
      `}
      ${renderOpacityField("environmentObjectOpacity", opacity, "透明度")}
    </section>`;
  document.getElementById("environmentObjectName")?.addEventListener("change", (event) => {
    void commitProject((current) => renameVisualEnvironment(current, visual.id, event.target.value), "模型名称已更新");
  });
  document.getElementById("environmentObjectName")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) event.currentTarget.blur();
  });
  const commitTransform = () => {
    const position = readVectorFields("environment-position", transform.position);
    const yaw = Number(document.getElementById("environmentObjectYaw")?.value || 0);
    const pitch = Number(document.getElementById("environmentObjectPitch")?.value || 0);
    const uniformScale = Number(document.getElementById("environmentObjectScale")?.value || 1);
    void commitProject((current) => setVisualEnvironmentTransform(current, visual.id, {
      position,
      quaternion: visualEnvironmentQuaternionFromRotationDegrees({ pitch, yaw }),
      uniformScale,
    }), "环境变换已更新");
  };
  document.getElementById("groupSelectedEnvironments")?.addEventListener("click", () => {
    createEnvironmentGroupFromSelection();
  });
  document.getElementById("environmentObjectGroup")?.addEventListener("change", (event) => {
    const groupID = event.target.value || null;
    void commitProject(
      (current) => assignVisualEnvironmentsToGroup(current, [visual.id], groupID),
      groupID ? "视觉环境已移入组" : "视觉环境已移出组"
    );
  });
  for (const input of elements.inspectorContent.querySelectorAll("[data-vector-field='environment-position']")) {
    input.addEventListener("change", commitTransform);
    wireProjectNumberScrub(
      input,
      (base, value) => {
        const currentVisual = base.scene.environment.visuals.find(
          (candidate) => candidate.id === visual.id
        );
        if (!currentVisual) return base;
        return setVisualEnvironmentTransform(base, visual.id, {
          ...currentVisual.transform,
          position: {
            ...currentVisual.transform.position,
            [input.dataset.vectorAxis]: value,
          },
        });
      },
      "环境位置已更新"
    );
  }
  for (const [inputID, axis, message] of [
    ["environmentObjectYaw", "yaw", "环境水平旋转已更新"],
    ["environmentObjectPitch", "pitch", "环境垂直旋转已更新"],
  ]) {
    const input = document.getElementById(inputID);
    input?.addEventListener("change", commitTransform);
    wireProjectNumberScrub(
      input,
      (base, value) => {
        const currentVisual = base.scene.environment.visuals.find(
          (candidate) => candidate.id === visual.id
        );
        if (!currentVisual) return base;
        const currentRotation = visualEnvironmentRotationDegrees(currentVisual);
        return setVisualEnvironmentTransform(base, visual.id, {
          ...currentVisual.transform,
          quaternion: visualEnvironmentQuaternionFromRotationDegrees({
            ...currentRotation,
            [axis]: value,
          }),
        });
      },
      message,
      { precision: 1 }
    );
  }
  document.getElementById("environmentObjectScale")?.addEventListener("change", commitTransform);
  wireProjectNumberScrub(
    document.getElementById("environmentObjectScale"),
    (base, value) => {
      const currentVisual = base.scene.environment.visuals.find(
        (candidate) => candidate.id === visual.id
      );
      return currentVisual
        ? setVisualEnvironmentTransform(base, visual.id, { ...currentVisual.transform, uniformScale: value })
        : base;
    },
    "环境缩放已更新",
    { precision: 3 }
  );
  document.getElementById("groundSelectedEnvironment")?.addEventListener("click", () => {
    const position = directorRenderer.visualEnvironmentGroundedPosition(visual.id);
    if (!position) {
      showToast("环境尚未加载完成", true);
      return;
    }
    void commitProject((current) => setVisualEnvironmentTransform(current, visual.id, {
      ...current.scene.environment.visuals.find((candidate) => candidate.id === visual.id).transform,
      position,
    }), "视觉环境已贴地");
  });
  for (const button of elements.inspectorContent.querySelectorAll("[data-environment-material-mode]")) {
    button.addEventListener("click", () => {
      void commitProject(
        (current) => setVisualEnvironmentMaterialMode(
          current,
          visual.id,
          button.dataset.environmentMaterialMode
        ),
        button.dataset.environmentMaterialMode === "gray" ? "环境已切换为灰模" : "环境材质已恢复"
      );
    });
  }
  
  wireObjectRange(
    "environmentObjectOpacity",
    (base, value) => setVisualEnvironmentOpacity(base, visual.id, value),
    "环境透明度已更新"
  );
  const selectedEnvironmentFile = document.getElementById("selectedEnvironmentFile");
  document.getElementById("replaceSelectedEnvironment")?.addEventListener("click", () => {
    if (!false) selectedEnvironmentFile?.click();
  });
  selectedEnvironmentFile?.addEventListener("change", () => {
    const file = selectedEnvironmentFile.files?.[0];
    selectedEnvironmentFile.value = "";
    if (file) void importVisualEnvironment(file, visual.id);
  });
  document.getElementById("removeSelectedEnvironment")?.addEventListener("click", () => {
    environmentFocusID = null;
    project = projectState.commit(removeVisualEnvironment(project, visual.id));
    selectedObject = project.scene.environment.visuals[0]
      ? { kind: "environment", id: project.scene.environment.visuals[0].id, parentID: null }
      : project.scene.blockout.groups.length
        ? { kind: "blockoutLayer", id: "blockout", parentID: null }
        : null;
    finishAuthoredChange("视觉环境已从 Scene 移除，可使用撤销恢复");
  });
  setObjectInspectorAuthoringDisabled(visual.locked === true || parentGroup?.locked === true);
}

function renderVisualEnvironmentGroupInspector() {
  const group = project.scene.environment.groups.find(
    (candidate) => candidate.id === selectedObject?.id
  );
  if (!group) {
    elements.inspectorContent.innerHTML = `<div class="inspector-empty">环境组已解散。</div>`;
    return;
  }
  const members = project.scene.environment.visuals.filter((visual) => visual.groupID === group.id);
  const supportsMaterialMode = members.length > 0
    && members.every((visual) => null === null);
  const materialMode = members.every((visual) => visual.appearance.materialMode === members[0].appearance.materialMode)
    ? members[0]?.appearance.materialMode : "mixed";
  const hasLockedMember = members.some((visual) => visual.locked);
  const transform = group.transform;
  const rotation = visualEnvironmentRotationDegrees(group);
  elements.inspectorContent.innerHTML = `
    <section class="inspector-section">
      <p class="section-caption">${members.length} 个视觉环境 · 一级环境组</p>
      <div class="field"><label for="environmentGroupName">名称</label><input id="environmentGroupName" type="text" maxlength="80" value="${escapeHTML(group.name)}" /></div>
      <button id="dissolveEnvironmentGroup" class="secondary-button full-width-button" type="button">解散组并保留模型</button>
    </section>
    <section class="inspector-section">
      <h2 class="section-title">组变换</h2>
      ${renderVectorFields("environment-group-position", transform.position, ["x", "y", "z"], "位置")}
      <div class="transform-field-grid environment-orientation-grid">
        <label><span>水平旋转</span><div class="input-with-unit"><input id="environmentGroupYaw" type="number" step="any" data-scrub-step="1" value="${rotation.yaw.toFixed(1)}" /><span>°</span></div></label>
        <label><span>垂直旋转</span><div class="input-with-unit"><input id="environmentGroupPitch" type="number" step="any" data-scrub-step="1" value="${rotation.pitch.toFixed(1)}" /><span>°</span></div></label>
        <label><span>统一缩放</span><input id="environmentGroupScale" type="number" min="0.001" max="1000" step="any" data-scrub-step="0.01" value="${Number(transform.uniformScale).toFixed(3)}" /></label>
      </div>
    </section>
    ${supportsMaterialMode ? `<section class="inspector-section">
      <h2 class="section-title">整组外观</h2>
      ${materialMode === "mixed" ? `<p class="section-caption">当前为混合显示</p>` : ""}
      <div class="segment-control" role="group" aria-label="整组材质模式">
        <button type="button" data-environment-group-material-mode="material" class="${materialMode === "material" ? "selected" : ""}" aria-pressed="${materialMode === "material"}" ${hasLockedMember ? "disabled" : ""}>材质</button>
        <button type="button" data-environment-group-material-mode="gray" class="${materialMode === "gray" ? "selected" : ""}" aria-pressed="${materialMode === "gray"}" ${hasLockedMember ? "disabled" : ""}>灰模</button>
      </div>
      ${hasLockedMember ? `<p class="section-caption">请先解锁组内模型，再统一切换外观。</p>` : ""}
    </section>` : ""}`;
  const commitTransform = () => {
    const position = readVectorFields("environment-group-position", transform.position);
    const yaw = Number(document.getElementById("environmentGroupYaw")?.value || 0);
    const pitch = Number(document.getElementById("environmentGroupPitch")?.value || 0);
    const uniformScale = Number(document.getElementById("environmentGroupScale")?.value || 1);
    void commitProject((current) => updateVisualEnvironmentGroup(current, group.id, {
      transform: {
        position,
        quaternion: visualEnvironmentQuaternionFromRotationDegrees({ pitch, yaw }),
        uniformScale,
      },
    }), "环境组变换已更新");
  };
  document.getElementById("environmentGroupName")?.addEventListener("change", (event) => {
    void commitProject(
      (current) => updateVisualEnvironmentGroup(current, group.id, { name: event.target.value }),
      "环境组已重命名"
    );
  });
  for (const input of elements.inspectorContent.querySelectorAll("[data-vector-field='environment-group-position']")) {
    input.addEventListener("change", commitTransform);
    wireProjectNumberScrub(
      input,
      (base, value) => {
        const current = base.scene.environment.groups.find((candidate) => candidate.id === group.id);
        return current ? updateVisualEnvironmentGroup(base, group.id, {
          transform: {
            ...current.transform,
            position: { ...current.transform.position, [input.dataset.vectorAxis]: value },
          },
        }) : base;
      },
      "环境组位置已更新"
    );
  }
  for (const [inputID, axis, message] of [
    ["environmentGroupYaw", "yaw", "环境组水平旋转已更新"],
    ["environmentGroupPitch", "pitch", "环境组垂直旋转已更新"],
  ]) {
    const input = document.getElementById(inputID);
    input?.addEventListener("change", commitTransform);
    wireProjectNumberScrub(
      input,
      (base, value) => {
        const current = base.scene.environment.groups.find((candidate) => candidate.id === group.id);
        if (!current) return base;
        return updateVisualEnvironmentGroup(base, group.id, {
          transform: {
            ...current.transform,
            quaternion: visualEnvironmentQuaternionFromRotationDegrees({
              ...visualEnvironmentRotationDegrees(current),
              [axis]: value,
            }),
          },
        });
      },
      message,
      { precision: 1 }
    );
  }
  document.getElementById("environmentGroupScale")?.addEventListener("change", commitTransform);
  wireProjectNumberScrub(
    document.getElementById("environmentGroupScale"),
    (base, value) => {
      const current = base.scene.environment.groups.find((candidate) => candidate.id === group.id);
      return current ? updateVisualEnvironmentGroup(base, group.id, {
        transform: { ...current.transform, uniformScale: value },
      }) : base;
    },
    "环境组缩放已更新",
    { precision: 3 }
  );
  document.getElementById("dissolveEnvironmentGroup")?.addEventListener("click", () => {
    dissolveEnvironmentGroupFromList(group.id);
  });
  for (const button of elements.inspectorContent.querySelectorAll("[data-environment-group-material-mode]")) {
    button.addEventListener("click", () => {
      void commitProject(
        (current) => current.scene.environment.visuals
          .filter((visual) => visual.groupID === group.id)
          .reduce((next, visual) => setVisualEnvironmentMaterialMode(
            next, visual.id, button.dataset.environmentGroupMaterialMode
          ), current),
        button.dataset.environmentGroupMaterialMode === "gray" ? "整组已切换为灰模" : "整组材质已恢复"
      );
    });
  }
  setObjectInspectorAuthoringDisabled(group.locked === true);
}

function renderBlockoutGroupInspector(group) {
  const opacity = Number(group.opacity ?? 1);
  elements.inspectorContent.innerHTML = `
    <section class="inspector-section">
      <p class="section-caption">${group.objects.length} 个语义对象 · ${escapeHTML(group.semanticType)}</p>
      <div class="field"><label for="blockoutGroupName">名称</label><input id="blockoutGroupName" type="text" maxlength="80" value="${escapeHTML(group.name)}" /></div>
      <div class="inline-actions">
        <button id="addObjectToGroup" class="secondary-button" type="button">＋ 对象</button>
        <button id="groundBlockoutGroup" class="secondary-button" type="button">贴地到 Y=0</button>
      </div>
    </section>
    <section class="inspector-section">
      <h2 class="section-title">变换</h2>
      ${renderVectorFields("blockout-group-position", group.position, ["x", "y", "z"], "位置")}
      <div class="transform-field-grid two-column">
        <label><span>水平旋转</span><div class="input-with-unit"><input id="blockoutGroupYaw" type="number" step="any" data-scrub-step="1" value="${(group.rotationY * 180 / Math.PI).toFixed(1)}" /><span>°</span></div></label>
        <label><span>统一缩放</span><input id="blockoutGroupScale" type="number" min="0.01" max="1000" step="any" data-scrub-step="0.01" value="${Number(group.scale).toFixed(3)}" /></label>
      </div>
      ${renderOpacityField("blockoutGroupOpacity", opacity, "组透明度")}
    </section>`;
  const commitGroup = (extra = {}) => {
    void commitProject((current) => updateBlockoutGroup(current, group.id, {
      position: readVectorFields("blockout-group-position", group.position),
      rotationY: Number(document.getElementById("blockoutGroupYaw")?.value || 0) * Math.PI / 180,
      scale: Number(document.getElementById("blockoutGroupScale")?.value || 1),
      ...extra,
    }), "布景组已更新");
  };
  document.getElementById("blockoutGroupName")?.addEventListener("change", (event) => {
    void commitProject(
      (current) => updateBlockoutGroup(current, group.id, { name: event.target.value }),
      "布景组已重命名"
    );
  });
  for (const input of elements.inspectorContent.querySelectorAll("[data-vector-field='blockout-group-position']")) {
    input.addEventListener("change", () => commitGroup());
    wireProjectNumberScrub(
      input,
      (base, value) => {
        const currentGroup = base.scene.blockout.groups.find((candidate) => candidate.id === group.id);
        return currentGroup
          ? updateBlockoutGroup(base, group.id, {
              position: { ...currentGroup.position, [input.dataset.vectorAxis]: value },
            })
          : base;
      },
      "布景组位置已更新"
    );
  }
  document.getElementById("blockoutGroupYaw")?.addEventListener("change", () => commitGroup());
  document.getElementById("blockoutGroupScale")?.addEventListener("change", () => commitGroup());
  wireProjectNumberScrub(
    document.getElementById("blockoutGroupScale"),
    (base, value) => updateBlockoutGroup(base, group.id, { scale: value }),
    "布景组缩放已更新",
    { precision: 3 }
  );
  document.getElementById("groundBlockoutGroup")?.addEventListener("click", () => commitGroup({
    position: { ...group.position, y: 0 },
  }));
  document.getElementById("addObjectToGroup")?.addEventListener("click", () => {
    const beforeIDs = new Set(group.objects.map((object) => object.id));
    project = projectState.commit(addBlockoutObject(project, group.id, {
      name: "新对象",
      semanticType: "landmark",
      primitives: [{
        kind: "box",
        name: "主体",
        position: { x: 0, y: 0.5, z: 0 },
        opacity: 1,
      }],
    }));
    const updated = project.scene.blockout.groups.find((candidate) => candidate.id === group.id);
    const object = updated?.objects.find((candidate) => !beforeIDs.has(candidate.id));
    if (object) selectedObject = {
      kind: "blockoutObject",
      id: object.id,
      parentID: group.id,
    };
    expandedBlockoutGroupIDs.add(group.id);
    finishAuthoredChange("已添加布景对象");
  });
  wireObjectRange(
    "blockoutGroupOpacity",
    (base, value) => updateBlockoutGroup(base, group.id, { opacity: value }),
    "布景组透明度已更新"
  );
  setObjectInspectorAuthoringDisabled(
    project.scene.blockout.locked === true || group.locked === true
  );
}

async function applyBlockoutImageAsset(target, asset) {
  try {
    if (project.id !== target.projectID) throw new Error("项目已切换，请在当前对象重新选择图片");
    await commitProject(current => {
      const group = current.scene.blockout.groups.find(g => g.id === target.groupID);
      const object = group?.objects.find(o => o.id === target.objectID);
      if (!object || current.scene.blockout.locked || group.locked || object.locked) throw new Error("对象已删除或锁定");
      return updateBlockoutObject(current, group.id, object.id, { image: object.image ? { ...object.image, asset } : defaultBlockoutImage(object, asset) });
    }, "图片贴图已保存");
  } catch (error) { showToast(`贴图失败：${error.message}`, true); }
  renderInspector();
}

function renderBlockoutImageInspector(object) {
  const image = object.image;
  return `<section class="inspector-section" aria-label="图片贴图">
    <h2 class="section-title">图片贴图</h2>
    <input id="blockoutImageFile" type="file" accept="image/png,image/jpeg,image/webp" hidden />
    <button id="blockoutImageChoose" type="button" class="secondary-button full-width-button" ${blockoutImageImportTarget ? "disabled" : ""}>${blockoutImageImportTarget ? "正在导入…" : image ? "替换图片" : "上传图片"}</button>
    ${image ? `<img alt="贴图原图" src="${escapeHTML(referenceImageAssetURL(project.id, image.asset.ref))}" style="display:block;width:100%;max-height:140px;object-fit:contain;margin:8px 0" />
      <p class="section-caption">${escapeHTML(image.asset.sourceName)}</p>
      ${renderVectorFields("blockout-image-position", image.position, ["x", "y", "z"], "贴图位置", "m")}
      <div class="transform-field-grid two-column">
        <label><span>宽度（m）</span><input id="blockoutImageWidth" type="number" min="0.001" step="any" data-scrub-step="0.01" value="${image.width}" /></label>
        <label><span>高度（m）</span><input id="blockoutImageHeight" type="number" min="0.001" step="any" data-scrub-step="0.01" value="${image.height}" /></label>
      </div>
      ${renderVectorFields("blockout-image-rotation", Object.fromEntries(Object.entries(image.rotation).map(([k,v]) => [k, v * 180 / Math.PI])), ["x", "y", "z"], "贴图旋转", "°")}
      <details><summary>裁切原图</summary><div class="transform-field-grid two-column">
        ${[["x","左侧起点"],["y","顶部起点"],["width","保留宽度"],["height","保留高度"]].map(([key,label]) => `<label><span>${label}（%）</span><input data-image-crop="${key}" type="number" min="${key === "x" || key === "y" ? 0 : 0.01}" max="100" step="any" data-scrub-step="0.1" value="${Number((image.crop[key]*100).toFixed(3))}" /></label>`).join("")}
      </div></details>
      <button id="blockoutImageRemove" type="button" class="secondary-button full-width-button">移除贴图</button>` : `<p class="section-caption">PNG、JPEG 或 WebP。透明 PNG 可用作动物标志，图片跟随对象一起移动和显隐。</p>`}
  </section>`;
}

function wireBlockoutImageInspector(group, object) {
  const target = { projectID: project.id, groupID: group.id, objectID: object.id };
  const input = document.getElementById("blockoutImageFile");
  document.getElementById("blockoutImageChoose").addEventListener("click", () => {
    blockoutImageImportTarget = target;
    if (false) { renderInspector(); return; }
    blockoutImageImportTarget = null;
    input.click();
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    blockoutImageImportTarget = target;
    renderInspector();
    try {
      if (!await saveProjectNow(false)) throw new Error("当前项目尚未保存");
      const asset = await projectAPI.importReferenceImage(target.projectID, file);
      await applyBlockoutImageAsset(target, asset);
    } catch (error) { showToast(`图片导入失败：${error.message}`, true); }
    finally { blockoutImageImportTarget = null; renderInspector(); }
  });
  document.getElementById("blockoutImageRemove")?.addEventListener("click", () => {
    void commitProject(current => updateBlockoutObject(current, group.id, object.id, { image: null }), "贴图已移除");
  });
  if (!object.image) return;
  const commitImage = () => {
    const image = { ...object.image,
      position: readVectorFields("blockout-image-position", object.image.position),
      rotation: Object.fromEntries(Object.entries(readVectorFields("blockout-image-rotation", {})).map(([k,v]) => [k,v*Math.PI/180])),
      width: Number(document.getElementById("blockoutImageWidth").value),
      height: Number(document.getElementById("blockoutImageHeight").value),
      crop: Object.fromEntries([...elements.inspectorContent.querySelectorAll("[data-image-crop]")].map(input => [input.dataset.imageCrop,Number(input.value)/100])),
    };
    void commitProject(current => updateBlockoutObject(current, group.id, object.id, { image }), "贴图已更新");
  };
  for (const field of elements.inspectorContent.querySelectorAll("[data-vector-field^='blockout-image-'],[data-image-crop],#blockoutImageWidth,#blockoutImageHeight")) {
    field.addEventListener("change", commitImage);
    wireProjectNumberScrub(field, (base, value) => {
      const source = base.scene.blockout.groups.find(g => g.id === group.id)?.objects.find(o => o.id === object.id);
      if (!source?.image) return base;
      const image = structuredClone(source.image);
      if (field.dataset.imageCrop) image.crop[field.dataset.imageCrop] = value / 100;
      else if (field.dataset.vectorField === "blockout-image-position") image.position[field.dataset.vectorAxis] = value;
      else if (field.dataset.vectorField === "blockout-image-rotation") image.rotation[field.dataset.vectorAxis] = value * Math.PI / 180;
      else image[field.id === "blockoutImageWidth" ? "width" : "height"] = value;
      return updateBlockoutObject(base, group.id, object.id, { image });
    }, "贴图已更新");
  }
}

function renderBlockoutObjectInspector(group, object) {
  const opacity = Number(object.opacity ?? 1);
  elements.inspectorContent.innerHTML = `
    <section class="inspector-section">
      <p class="section-caption">位于 ${escapeHTML(group.name)} 内 · ${object.primitives.length} 个内部部件</p>
      <div class="field"><label for="blockoutObjectName">名称</label><input id="blockoutObjectName" type="text" maxlength="80" value="${escapeHTML(object.name)}" /></div>
      <button id="groundBlockoutObject" class="secondary-button full-width-button" type="button">对象底部贴地到 Y=0</button>
    </section>
    <section class="inspector-section">
      <h2 class="section-title">变换</h2>
      ${renderVectorFields("blockout-object-position", object.position, ["x", "y", "z"], "位置")}
      <div class="transform-field-grid two-column">
        <label><span>水平旋转</span><div class="input-with-unit"><input id="blockoutObjectYaw" type="number" step="any" data-scrub-step="1" value="${(object.rotationY * 180 / Math.PI).toFixed(1)}" /><span>°</span></div></label>
        <label><span>统一缩放</span><input id="blockoutObjectScale" type="number" min="0.01" max="1000" step="any" data-scrub-step="0.01" value="${Number(object.scale).toFixed(3)}" /></label>
      </div>
    </section>
    <section class="inspector-section">
      <h2 class="section-title">外观</h2>
      ${renderOpacityField("blockoutObjectOpacity", opacity, "对象透明度")}
    </section>${renderBlockoutImageInspector(object)}`;
  wireBlockoutImageInspector(group, object);
  const commitObject = (extra = {}, message = "布景对象已更新") => {
    void commitProject((current) => updateBlockoutObject(current, group.id, object.id, {
      position: readVectorFields("blockout-object-position", object.position),
      rotationY: Number(document.getElementById("blockoutObjectYaw")?.value || 0) * Math.PI / 180,
      scale: Number(document.getElementById("blockoutObjectScale")?.value || 1),
      ...extra,
    }), message);
  };
  document.getElementById("blockoutObjectName")?.addEventListener("change", (event) => {
    void commitProject(
      (current) => updateBlockoutObject(current, group.id, object.id, { name: event.target.value }),
      "布景对象已重命名"
    );
  });
  for (const input of elements.inspectorContent.querySelectorAll("[data-vector-field='blockout-object-position']")) {
    input.addEventListener("change", () => commitObject());
    wireProjectNumberScrub(
      input,
      (base, value) => {
        const currentGroup = base.scene.blockout.groups.find((candidate) => candidate.id === group.id);
        const currentObject = currentGroup?.objects.find((candidate) => candidate.id === object.id);
        return currentObject
          ? updateBlockoutObject(base, group.id, object.id, {
              position: { ...currentObject.position, [input.dataset.vectorAxis]: value },
            })
          : base;
      },
      "布景对象位置已更新"
    );
  }
  document.getElementById("blockoutObjectYaw")?.addEventListener("change", () => commitObject());
  document.getElementById("blockoutObjectScale")?.addEventListener("change", () => commitObject());
  wireProjectNumberScrub(
    document.getElementById("blockoutObjectScale"),
    (base, value) => updateBlockoutObject(base, group.id, object.id, { scale: value }),
    "布景对象缩放已更新",
    { precision: 3 }
  );
  document.getElementById("groundBlockoutObject")?.addEventListener("click", () => {
    const minimumY = blockoutObjectLocalMinimumY(object);
    commitObject({
      position: {
        ...object.position,
        y: object.position.y - minimumY * object.scale,
      },
    }, "布景对象底部已贴地");
  });
  wireObjectRange(
    "blockoutObjectOpacity",
    (base, value) => updateBlockoutObject(base, group.id, object.id, { opacity: value }),
    "布景对象透明度已更新"
  );
  setObjectInspectorAuthoringDisabled(
    project.scene.blockout.locked === true
    || group.locked === true
    || object.locked === true
  );
}

function blockoutObjectLocalMinimumY(object) {
  if (!object.primitives.length) return 0;
  return Math.min(...object.primitives.map((primitive) => {
    if (primitive.kind === "plane") return Number(primitive.position.y || 0);
    return Number(primitive.position.y || 0) - Number(primitive.size.y || 1) / 2;
  }));
}

function renderVectorFields(key, vector, axes, label, unit = "", options = {}) {
  return `
    <div class="object-vector-field">
      <span>${label}</span>
      <div class="transform-field-grid">
        ${axes.map((axis) => `<label><span>${axis.toUpperCase()}</span><div class="${unit ? "input-with-unit" : ""}"><input data-vector-field="${key}" data-vector-axis="${axis}" type="number" ${Number.isFinite(options.minimum) ? `min="${options.minimum}"` : ""} step="any" data-scrub-step="${unit === "°" ? "1" : "0.05"}" value="${Number(vector[axis] || 0).toFixed(unit === "°" ? 1 : 2)}" ${options.disabled ? "disabled" : ""} />${unit ? `<span>${unit}</span>` : ""}</div></label>`).join("")}
      </div>
    </div>`;
}

function readVectorFields(key, fallback) {
  const value = { ...fallback };
  for (const input of elements.inspectorContent.querySelectorAll(`[data-vector-field='${key}']`)) {
    value[input.dataset.vectorAxis] = Number(input.value);
  }
  return value;
}

function renderOpacityField(id, opacity, label) {
  const percent = Math.round(opacity * 100);
  return `
    <div class="field object-opacity-field">
      <div class="field-heading"><label for="${id}">${label}</label><output id="${id}Value">${percent}%</output></div>
      <input id="${id}" type="range" min="0" max="1" step="0.01" value="${opacity}" aria-valuetext="${percent}%" />
    </div>`;
}

function wireObjectRange(id, update, message) {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}Value`);
  if (!input || !output) return;
  const base = projectState.current;
  input.addEventListener("input", () => {
    const value = Number(input.value);
    const percent = Math.round(value * 100);
    output.textContent = `${percent}%`;
    input.setAttribute("aria-valuetext", `${percent}%`);
    project = update(base, value);
    setSaveState("未保存");
    syncRenderer();
  });
  input.addEventListener("change", () => {
    project = projectState.commit(update(base, Number(input.value)));
    finishAuthoredChange(message);
  });
}

function setObjectInspectorAuthoringDisabled(locked) {
  if (canAuthor() && !locked) return;
  for (const control of elements.inspectorContent.querySelectorAll("button, input, select")) {
    if (!control.matches("[data-operator-action]")) control.disabled = true;
  }
}

function renderCameraSetupCompositionGuideInspector() {
  const directionRow = cameraSetupCompositionGuide.type === "golden-triangle"
    ? `<div class="camera-composition-guide-row">
        <span class="camera-composition-guide-label">方向</span>
        <div class="camera-composition-guide-direction" role="group" aria-label="黄金三角方向">
          <button class="${cameraSetupCompositionGuide.direction === "normal" ? "active" : ""}" type="button" data-operator-action data-camera-composition-guide-direction="normal" aria-pressed="${cameraSetupCompositionGuide.direction === "normal"}">↘ 主对角线</button>
          <button class="${cameraSetupCompositionGuide.direction === "mirror" ? "active" : ""}" type="button" data-operator-action data-camera-composition-guide-direction="mirror" aria-pressed="${cameraSetupCompositionGuide.direction === "mirror"}">↙ 主对角线</button>
        </div>
      </div>`
    : cameraSetupCompositionGuide.type === "one-point"
      ? `<div class="camera-composition-guide-row">
          <label for="cameraSetupVanishingPointReset">消失点</label>
          <button id="cameraSetupVanishingPointReset" class="secondary-button camera-composition-guide-reset" type="button" data-operator-action aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown Home">重置到中心</button>
        </div>`
      : "";
  return `<section class="inspector-section camera-composition-guide-section" aria-label="构图辅助线">
    <div class="camera-composition-guide-row">
      <label for="cameraSetupCompositionGuideType">构图辅助线</label>
      <select id="cameraSetupCompositionGuideType" data-operator-action>
        ${cameraSetupCompositionGuideOptions.map(([value, label]) => `<option value="${value}" ${cameraSetupCompositionGuide.type === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </div>
    ${directionRow}
  </section>`;
}

function renderCameraSetupInspector(setup) {
  const edit = cameraEditSession.setupEdit(setup.id);
  const displayPose = edit?.pose || setup.pose;
  const displayAspectRatio = edit?.aspectRatio || setup.aspectRatio;
  const position = displayPose.position;
  // 机位就是一个定住的角度和定住的取景，所以位置、朝向、焦距三样都得能定。
  // 朝向本来就存在 pose.quaternion 里，只是一直没有编辑器 —— Shot 的俯仰/水平/翻滚
  // 读的是渲染器那台活相机，机位没有活相机可读，得把存下来的四元数拆成三个角。
  const rotation = cameraRotationDegrees(displayPose.quaternion);
  const viewing = cameraSetupViewActive(setup.id);
  const staged = Boolean(edit);
  const depthOfField = edit?.depthOfField || setup.depthOfField || { enabled: false };
  const depthOfFieldEnabled = depthOfField.enabled === true;
  const canEditSetup = viewing && canAuthor();
  const createShotState = cameraSetupShotCreationState(setup.id);
  elements.inspectorContent.innerHTML = `
    <section class="inspector-section">
      <div class="camera-track-heading">
        <div class="field"><label for="cameraSetupInspectorName">名称</label><input id="cameraSetupInspectorName" type="text" maxlength="80" value="${escapeHTML(setup.name)}" /></div>
        <span id="cameraSetupEditBadge" class="prototype-badge ${staged ? "staged" : ""}">${staged ? "未保存" : "已保存"}</span>
      </div>
      <div class="inline-actions">
        <button id="previewInspectorCameraSetup" class="secondary-button ${viewing ? "selected" : ""}" type="button" data-operator-action aria-pressed="${viewing}" title="${viewing ? "退出机位视角" : "从这台相机看出去"}（C）" aria-keyshortcuts="C">${viewing ? "退出机位视角" : "查看机位"}</button>
        <button id="captureInspectorCameraSetup" class="secondary-button" type="button" title="${staged ? "保存当前构图（K）" : "构图已保存"}" aria-keyshortcuts="K" ${staged ? "" : "disabled"}>${staged ? "保存当前构图" : "构图已保存"}</button>
      </div>
      <button id="createShotFromCameraSetup" class="secondary-button full-width-button camera-setup-create-shot-button" type="button" data-camera-setup-id="${escapeHTML(setup.id)}" title="${escapeHTML(createShotState.title)}" ${createShotState.enabled ? "" : "disabled"}>从此机位创建运镜</button>
      <p id="cameraSetupStagedNotice" class="camera-staged-notice" ${staged ? "" : "hidden"}>当前构图尚未保存到机位。</p>
    </section>
    <section class="inspector-section">
      <h2 class="section-title">静态摄影机</h2>
      ${renderVectorFields("camera-setup-position", position, ["x", "y", "z"], "位置", "", { disabled: !canEditSetup })}
      <div class="camera-pose-grid" aria-label="机位朝向">
        ${[["pitch", "俯仰"], ["yaw", "水平"], ["roll", "翻滚"]].map(([axis, label]) => `<label><span>${label}</span><input data-camera-setup-rotation="${axis}" type="number" step="any" data-scrub-step="0.5" value="${Number(rotation[axis]).toFixed(1)}" ${canEditSetup ? "" : "disabled"} /></label>`).join("")}
      </div>
      <div class="camera-lens-wheel camera-setup-lens">
        <div class="camera-lens-heading">
          <div><span>镜头焦距</span><small>固定镜头</small></div>
          <label class="camera-lens-value">
            <span class="sr-only">焦距（毫米）</span>
            <input id="cameraSetupFocalLength" type="number" min="${cameraFocalLengthMinimum}" max="${cameraFocalLengthMaximum}" step="any" data-scrub-step="0.5" value="${Number(displayPose.focalLength).toFixed(1)}" ${canEditSetup ? "" : "disabled"} />
            <span aria-hidden="true">mm</span>
          </label>
        </div>
        <div class="camera-lens-track">
          <input id="cameraSetupFocalSlider" type="range" min="0" max="1" step="0.001" value="${focalLengthToSliderProgress(displayPose.focalLength).toFixed(6)}" aria-label="镜头焦距" aria-valuetext="${Number(displayPose.focalLength).toFixed(1)} mm" ${canEditSetup ? "" : "disabled"} />
          <div class="camera-lens-ticks" aria-hidden="true">
            ${cameraFocalLengthStops.map((focalLength) => `<span style="left:${(focalLengthToSliderProgress(focalLength) * 100).toFixed(2)}%">${focalLength}</span>`).join("")}
          </div>
        </div>
      </div>
      <div class="camera-dof-control ${depthOfFieldEnabled ? "enabled" : "disabled"}">
        <div class="camera-dof-heading">
          <strong>景深</strong>
          <label class="camera-focus-plane-toggle">
            <input id="cameraSetupFocusPlaneVisible" type="checkbox" ${cameraFocusPlaneVisible ? "checked" : ""} ${depthOfFieldEnabled && viewing ? "" : "disabled"} />
            <span>焦点线</span>
          </label>
          <button id="cameraSetupDepthOfFieldToggle" class="switch-button" type="button" role="switch" aria-checked="${depthOfFieldEnabled}" aria-label="景深" ${canEditSetup ? "" : "disabled"}><span aria-hidden="true"></span></button>
        </div>
        ${depthOfFieldEnabled ? `<div class="camera-dof-fields">
          <label><span>对焦距离</span><div class="camera-dof-input camera-dof-focus-input">
            <input id="cameraSetupFocusDistance" type="number" min="${cameraFocusDistanceMinimum}" max="${cameraFocusDistanceMaximum}" step="any" data-scrub-step="0.05" value="${Number(displayPose.focusDistance || 5).toFixed(2)}" ${canEditSetup ? "" : "disabled"} /><span aria-hidden="true">m</span>
          </div></label>
          <label><span>光圈</span><div class="camera-dof-input camera-dof-aperture-input">
            <span aria-hidden="true">f/</span><input id="cameraSetupAperture" type="number" min="${cameraApertureMinimum}" max="${cameraApertureMaximum}" step="any" data-scrub-step="0.1" value="${Number(displayPose.aperture || 2.8).toFixed(1)}" ${canEditSetup ? "" : "disabled"} />
          </div></label>
        </div>
        <div class="camera-dof-actions">
          <button id="cameraSetupPickFocusDistance" class="secondary-button" type="button" aria-pressed="${cameraFocusPicking}" ${canEditSetup ? "" : "disabled"}>⌾ 选取焦点</button>
        </div>` : ""}
      </div>
      <div class="field">
        <label for="cameraSetupAspectRatio">画幅</label>
        <select id="cameraSetupAspectRatio" ${canEditSetup ? "" : "disabled"}>
          ${desktopAspectRatios.map((ratio) => `<option value="${ratio}" ${ratio === displayAspectRatio ? "selected" : ""}>${ratio}</option>`).join("")}
        </select>
      </div>
    </section>
    ${viewing ? renderCameraSetupCompositionGuideInspector() : ""}`;
  document.getElementById("cameraSetupInspectorName")?.addEventListener("change", (event) => {
    renameSelectedCameraSetup(setup.id, event.target.value);
  });
  document.getElementById("previewInspectorCameraSetup")?.addEventListener("click", () => {
    toggleCameraSetupView(setup.id);
  });
  document.getElementById("captureInspectorCameraSetup")?.addEventListener("click", () => {
    updateSelectedCameraSetup(setup.id);
  });
  document.getElementById("createShotFromCameraSetup")?.addEventListener("click", () => {
    addNewShotFromCameraSetup(setup.id);
  });
  const readSetupRotation = () => {
    const next = { ...rotation };
    for (const input of elements.inspectorContent.querySelectorAll("[data-camera-setup-rotation]")) {
      const value = Number(input.value);
      if (Number.isFinite(value)) next[input.dataset.cameraSetupRotation] = value;
    }
    return next;
  };
  const stageFromInspector = () => {
    const numericInputs = elements.inspectorContent.querySelectorAll(
      "[data-vector-field='camera-setup-position'], [data-camera-setup-rotation], #cameraSetupFocalLength, #cameraSetupFocusDistance, #cameraSetupAperture"
    );
    if ([...numericInputs].some((input) => input.value === "" || !Number.isFinite(Number(input.value)))) {
      return;
    }
    const pose = {
      ...displayPose,
      position: readVectorFields("camera-setup-position", position),
      quaternion: cameraQuaternionFromRotationDegrees(readSetupRotation()),
      focalLength: Number(document.getElementById("cameraSetupFocalLength")?.value || displayPose.focalLength),
      focusDistance: Number(document.getElementById("cameraSetupFocusDistance")?.value || displayPose.focusDistance),
      aperture: Number(document.getElementById("cameraSetupAperture")?.value || displayPose.aperture),
    };
    stageCameraSetupEdit(
      setup.id,
      pose,
      document.getElementById("cameraSetupAspectRatio")?.value || displayAspectRatio,
      { depthOfField }
    );
  };
  for (const input of elements.inspectorContent.querySelectorAll("[data-vector-field='camera-setup-position']")) {
    input.addEventListener("input", stageFromInspector);
    input.addEventListener("change", stageFromInspector);
    wireInputNumberScrub(input, { precision: 2 });
  }
  for (const input of elements.inspectorContent.querySelectorAll("[data-camera-setup-rotation]")) {
    input.addEventListener("input", stageFromInspector);
    input.addEventListener("change", stageFromInspector);
    wireInputNumberScrub(input, { precision: 1 });
  }
  // 轮子和大读数是同一个值的两个把手：滑杆管粗调（刻度落在 12…200），
  // 读数管精确值。谁动都写进对方，再一起进暂存。
  const focalInput = document.getElementById("cameraSetupFocalLength");
  const focalSlider = document.getElementById("cameraSetupFocalSlider");
  const syncFocalSlider = () => {
    const value = Number(focalInput?.value);
    if (!focalSlider || !Number.isFinite(value)) return;
    focalSlider.value = focalLengthToSliderProgress(value).toFixed(6);
    focalSlider.setAttribute("aria-valuetext", `${value.toFixed(1)} mm`);
  };
  for (const eventName of ["input", "change"]) {
    focalInput?.addEventListener(eventName, () => {
      syncFocalSlider();
      stageFromInspector();
    });
    focalSlider?.addEventListener(eventName, () => {
      if (!focalInput) return;
      focalInput.value = focalLengthFromSliderProgress(focalSlider.value).toFixed(1);
      focalSlider.setAttribute("aria-valuetext", `${focalInput.value} mm`);
      stageFromInspector();
    });
  }
  wireInputNumberScrub(focalInput);
  document.getElementById("cameraSetupAspectRatio")?.addEventListener("change", stageFromInspector);
  for (const id of ["cameraSetupFocusDistance", "cameraSetupAperture"]) {
    const input = document.getElementById(id);
    input?.addEventListener("input", stageFromInspector);
    input?.addEventListener("change", stageFromInspector);
    wireInputNumberScrub(input, { precision: id.endsWith("Distance") ? 2 : 1 });
  }
  document.getElementById("cameraSetupDepthOfFieldToggle")?.addEventListener("click", () => {
    cameraFocusPicking = false;
    directorRenderer.setFocusPicking(false);
    stageCameraSetupEdit(setup.id, displayPose, displayAspectRatio, {
      depthOfField: { enabled: !depthOfFieldEnabled },
    });
    renderInspector();
    syncRenderer();
  });
  document.getElementById("cameraSetupFocusPlaneVisible")?.addEventListener("change", (event) => {
    cameraFocusPlaneVisible = event.target.checked;
    directorRenderer.setFocusPlaneVisible(cameraFocusPlaneVisible && depthOfFieldEnabled);
  });
  document.getElementById("cameraSetupPickFocusDistance")?.addEventListener("click", (event) => {
    cameraFocusPicking = directorRenderer.setFocusPicking(!cameraFocusPicking);
    event.currentTarget.setAttribute("aria-pressed", String(cameraFocusPicking));
  });
  document.getElementById("cameraSetupCompositionGuideType")?.addEventListener("change", (event) => {
    cameraSetupCompositionGuide = normalizeCameraCompositionGuideState({
      ...cameraSetupCompositionGuide,
      type: event.target.value,
    });
    renderInspector();
    updateShotComposition();
  });
  for (const button of elements.inspectorContent.querySelectorAll("[data-camera-composition-guide-direction]")) {
    button.addEventListener("click", () => {
      cameraSetupCompositionGuide = normalizeCameraCompositionGuideState({
        ...cameraSetupCompositionGuide,
        direction: button.dataset.cameraCompositionGuideDirection,
      });
      renderInspector();
      updateShotComposition();
    });
  }
  const resetVanishingPoint = document.getElementById("cameraSetupVanishingPointReset");
  resetVanishingPoint?.addEventListener("click", () => {
    cameraSetupCompositionGuide = normalizeCameraCompositionGuideState({
      ...cameraSetupCompositionGuide,
      vanishingPoint: { x: 0.5, y: 0.5 },
    });
    updateShotComposition();
  });
  resetVanishingPoint?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    cameraSetupCompositionGuide = normalizeCameraCompositionGuideState({
      ...cameraSetupCompositionGuide,
      vanishingPoint: cameraCompositionGuideVanishingPointAfterKey(
        cameraSetupCompositionGuide.vanishingPoint,
        event.key,
        { shiftKey: event.shiftKey }
      ),
    });
    updateShotComposition();
  });
  syncCameraSetupVanishingPointControl();
  setObjectInspectorAuthoringDisabled(false);
}

function renderCameraInspector() {
  const shot = findShot(project);
  const shotEdit = activeShotCameraEdit();
  const track = activeCameraTrack();
  const ready = cameraTrackReady(track);
  const cameraModeActive = viewportMode === viewportModes.camera;
  const shotViewActive = !cameraModeActive && editViewMode === "shot";
  const setupDraft = cameraEditSession.setupEdit();
  const sceneDraftConflict = Boolean(
    (shotEdit || setupDraft) && !cameraModeActive && !shotViewActive
  );
  const canEdit = canEditCamera() && Boolean(shot) && !sceneDraftConflict;
  const canEditShotData = canAuthor() && Boolean(shot) && !sceneDraftConflict;
  const keyframe = shot
    ? cameraKeyframeAtTime(track, playback.elapsed, project.output.frameRate)
    : null;
  const selectedKeyframe = track.keyframes.find((candidate) => candidate.id === cameraKeyframeSelection.activeID) || keyframe;
  const selectedKeyframeIndex = selectedKeyframe
    ? track.keyframes.findIndex((candidate) => candidate.id === selectedKeyframe.id)
    : -1;
  const selectedAimInherited = selectedKeyframeIndex > 0 && selectedKeyframe?.aim == null;
  const selectedAim = selectedKeyframe
    ? effectiveCameraAim(track, selectedKeyframe.time)
    : normalizeCameraAim();
  const selectedAimTransition = selectedKeyframe && !selectedAimInherited
    ? describeCameraAimTransition(track, Math.max(0, selectedKeyframe.time - 0.0001))
    : null;
  const selectedAimTransitionStart = selectedAimTransition && selectedAimTransition.toKeyframeID === selectedKeyframe.id
    ? track.keyframes.find((candidate) => candidate.id === selectedAimTransition.fromKeyframeID)
    : null;
  const liveAimState = effectiveCameraAimState(track, playback.elapsed);
  const liveAim = liveAimState.aim;
  const liveAimTransition = describeCameraAimTransition(track, playback.elapsed);
  const displayedAim = selectedKeyframe ? selectedAim : liveAim;
  const aimTargetExists = displayedAim.mode !== "look-at"
    || displayedAim.targetKind === "world"
    || Boolean(cameraAimTargetPosition(project, sampleProject(project, playback.elapsed), displayedAim));
  const liveAimTargetIndex = project.scene.actors.findIndex((actor) => actor.id === liveAim.targetActorID);
  const liveAimTargetLabel = liveAim.targetKind === "world"
    ? "场景自定义点"
    : liveAim.targetKind === "environment"
      ? project.scene.environment.visuals.find((visual) => visual.id === liveAim.environmentID)?.name || "目标已删除"
    : liveAimTargetIndex >= 0
      ? `演员 ${String(liveAimTargetIndex + 1).padStart(2, "0")}`
      : "目标已删除";
  const selectedFollowInherited = selectedKeyframeIndex > 0 && selectedKeyframe?.follow == null;
  const selectedFollowState = selectedKeyframe
    ? effectiveCameraFollowState(track, selectedKeyframe.time)
    : { follow: normalizeCameraFollow(), keyframe: null, index: -1 };
  const selectedFollow = selectedFollowState.follow;
  const liveFollowState = effectiveCameraFollowState(track, playback.elapsed);
  const liveFollow = liveFollowState.follow;
  const displayedFollow = selectedKeyframe ? selectedFollow : liveFollow;
  const followTargetExists = !displayedFollow.enabled
    || project.scene.actors.some((actor) => actor.id === displayedFollow.targetActorID);
  const liveFollowTargetIndex = project.scene.actors.findIndex((actor) => actor.id === liveFollow.targetActorID);
  const liveFollowTargetLabel = liveFollowTargetIndex >= 0
    ? `演员 ${String(liveFollowTargetIndex + 1).padStart(2, "0")}`
    : "目标已删除";
  const focusSourceProject = shotEdit?.project ? rebaseShotCameraEditProject(shotEdit) : project;
  const focusSourceShot = findShot(focusSourceProject || project, shot?.id) || shot;
  const liveFocusTrackingState = effectiveCameraFocusTrackingState(
    focusSourceShot?.camera?.track,
    playback.elapsed
  );
  const liveFocusTracking = liveFocusTrackingState.focusTracking;
  const focusTrackingLabel = cameraFocusTrackingLabel(project, liveFocusTracking);
  const focusCandidate = cameraFocusPickCandidate && shot
    && cameraFocusPickCandidate.shotID === shot.id
    && Math.abs(Number(cameraFocusPickCandidate.time) - playback.elapsed) <= 0.5 / project.output.frameRate
    ? cameraFocusPickCandidate
    : null;
  const handheld = normalizeCameraHandheld(shot?.camera?.modifiers?.handheld);
  const segment = selectedKeyframe
    ? cameraTrackSegmentAtTime(track, selectedKeyframe.time)
    : cameraTrackSegmentAtTime(track, playback.elapsed);
  // shot 与 draft 同时为 null 时 undefined === undefined 会误判为激活，进而读 null.startTime。
  const orbitPreviewActive = Boolean(cameraOrbitDraft && shot && cameraOrbitDraft.shotID === shot.id);
  const orbitStartTime = orbitPreviewActive ? cameraOrbitDraft.startTime : playback.elapsed;
  const orbitForm = ensureCameraOrbitForm(shot, track, orbitStartTime);
  const orbitNextKeyframe = orbitForm
    ? nextCameraOrbitKeyframe(track, orbitForm.startTime, project.output.frameRate)
    : null;
  const orbitCenter = orbitForm ? resolveCameraOrbitBaseCenter(orbitForm, project, shot) : null;
  let orbitSummary = null;
  let orbitValidationMessage = null;
  if (orbitForm && orbitCenter) {
    try {
      orbitSummary = cameraOrbitEndpointSummary(
        track,
        orbitForm.startTime,
        orbitCenter,
        orbitForm,
        project.output.frameRate
      );
      if (
        project.scene.duration.mode === "manual"
        && orbitSummary.endTime > Number(project.scene.duration.seconds || 0) + 0.000001
      ) {
        orbitValidationMessage = "终点超过手动 Scene End";
      }
    } catch (error) {
      orbitValidationMessage = error.message || "当前设置无法生成环绕";
    }
  } else if (orbitForm) {
    orbitValidationMessage = "请选择有效的环绕中心";
  }
  const orbitCanEdit = canEditCameraOrbit() && Boolean(shot && orbitForm && orbitCenter);
  const orbitCanPreview = orbitCanEdit && !orbitValidationMessage;
  const uniformTrackInterpolation = track.segments.length > 0
    && track.segments.every((candidate) => candidate.interpolation === track.segments[0].interpolation)
    ? track.segments[0].interpolation
    : "mixed";
  const editorState = directorRenderer.shotCameraEditorState();
  const sceneKeyframeActive = !cameraModeActive && !shotViewActive && Boolean(selectedKeyframe);
  const currentPose = sceneKeyframeActive
    ? selectedKeyframe
    : cameraModeActive || shotViewActive
    ? editorState.pose
    : directorRenderer.captureSceneCameraPose();
  const rotation = cameraModeActive || shotViewActive
    ? editorState.rotationDegrees
    : null;
  const depthOfFieldEnabled = shot?.camera?.depthOfField?.enabled === true;
  const focusDistance = Math.max(
    cameraFocusDistanceMinimum,
    Math.min(cameraFocusDistanceMaximum, Number(currentPose.focusDistance) || 5)
  );
  const aperture = Math.max(
    cameraApertureMinimum,
    Math.min(cameraApertureMaximum, Number(currentPose.aperture) || 2.8)
  );
  const positionEditable = canEdit && (shotViewActive || sceneKeyframeActive);
  const pitchYawEditable = shotViewActive && canEdit && liveAim.mode !== "look-at" && !liveAimTransition;
  const rollEditable = shotViewActive && canEdit;
  const lensEditable = canEdit && (shotViewActive || sceneKeyframeActive);
  const focusDistanceEditable = lensEditable && !liveFocusTracking.enabled;
  const selectedKeyframeIDs = currentCameraKeyframeIDs();
  const canDelete = canDeleteCameraKeyframe();
  // 同上：组标题说这一组是什么，不复述 Shot 名。名字在最上面那个字段里。
  const cameraTitle = cameraModeActive ? "输出预览" : "摄影机";
  const cameraCaption = cameraModeActive ? "录制安全视图" : "";
  elements.inspectorContent.innerHTML = `
    ${shot ? `<section class="inspector-section camera-inspector-section">
      <div class="field">
        <label for="shotInspectorName">名称</label>
        <input id="shotInspectorName" type="text" maxlength="80" value="${escapeHTML(shot.name)}" ${canEditShotData ? "" : "disabled"} />
      </div>
      <div class="field">
        <label for="shotAspectRatio">画幅</label>
        <select id="shotAspectRatio" ${canEditShotData ? "" : "disabled"}>
          ${desktopAspectRatios.map((ratio) => `<option value="${ratio}" ${ratio === shot.aspectRatio ? "selected" : ""}>${ratio}</option>`).join("")}
        </select>
      </div>
      <div id="cameraStagedNotice" class="camera-staged-notice" ${shotEdit ? "" : "hidden"}>当前构图尚未写入 Shot。</div>
      <div class="camera-keyframe-actions camera-keyframe-actions-top">
        ${keyframe ? "" : `<span class="camera-keyframe-context" role="status">${liveAimTransition ? `${aimTransitionDisplayLabel(liveAimTransition)} · 两帧之间` : "两帧之间 · 将新建关键帧"}</span>`}
        <button id="recordInspectorCameraKeyframe" class="primary-button" type="button" title="记录或更新关键帧（K）" aria-keyshortcuts="K" ${canEdit ? "" : "disabled"}>${keyframe ? "更新关键帧" : "记录关键帧"}</button>
        <button id="cancelInspectorCameraEdit" class="secondary-button" type="button" ${shotEdit ? "" : "hidden"}>取消调整</button>
        <button id="deleteInspectorCameraKeyframe" class="quiet-inline-button" type="button" ${canDelete ? "" : "disabled"}>删除${selectedKeyframeIDs.size > 1 ? `（${deletableCameraKeyframes().length}）` : ""}</button>
      </div>
    </section>` : ""}
    <details id="cameraInspectorDisclosure" class="inspector-section inspector-disclosure camera-inspector-section camera-keyframe-inspector" ${cameraInspectorExpanded ? "open" : ""}>
      <summary class="camera-track-heading">
        <span>${cameraTitle}${cameraCaption ? ` · ${cameraCaption}` : ""}</span>
        <span id="cameraEditBadge" class="prototype-badge ${shotEdit || orbitPreviewActive ? "staged" : ""}">${orbitPreviewActive ? "环绕预览" : shotEdit ? "未写入" : "项目数据"}</span>
      </summary>
      <div class="inspector-disclosure-content">
      ${shot ? `
        <div class="camera-lens-wheel">
          <div class="camera-lens-heading">
            <div><span>镜头焦距</span><small>连续变焦</small></div>
            <output id="cameraFocalReadout" for="cameraFocalLength">${currentPose.focalLength.toFixed(1)} <span>mm</span></output>
          </div>
          <div class="camera-lens-track">
            <input id="cameraFocalLength" type="range" min="0" max="1" step="0.001" value="${focalLengthToSliderProgress(currentPose.focalLength).toFixed(6)}" aria-label="镜头焦距" aria-valuetext="${currentPose.focalLength.toFixed(1)} mm" ${lensEditable ? "" : "disabled"} />
            <div class="camera-lens-ticks" aria-hidden="true">
              ${cameraFocalLengthStops.map((focalLength) => `<span style="left:${(focalLengthToSliderProgress(focalLength) * 100).toFixed(2)}%">${focalLength}</span>`).join("")}
            </div>
          </div>
        </div>
        <div class="camera-dof-control ${depthOfFieldEnabled ? "enabled" : "disabled"}">
          <div class="camera-dof-heading">
            <strong>景深</strong>
            <label class="camera-focus-plane-toggle">
              <input id="cameraFocusPlaneVisible" type="checkbox" ${cameraFocusPlaneVisible ? "checked" : ""} ${depthOfFieldEnabled ? "" : "disabled"} />
              <span>焦点线</span>
            </label>
            <button id="cameraDepthOfFieldToggle" class="switch-button" type="button" role="switch" aria-checked="${depthOfFieldEnabled}" aria-label="景深" ${canEditShotData && !cameraModeActive ? "" : "disabled"}><span aria-hidden="true"></span></button>
          </div>
          ${depthOfFieldEnabled ? `<div class="camera-dof-fields">
            <label>
              <span>对焦距离</span>
              <div class="camera-dof-input camera-dof-focus-input">
                <input id="cameraFocusDistance" type="number" min="${cameraFocusDistanceMinimum}" max="${cameraFocusDistanceMaximum}" step="any" data-scrub-step="0.05" value="${focusDistance.toFixed(2)}" ${focusDistanceEditable ? "" : "disabled"} />
                <span aria-hidden="true">m</span>
              </div>
            </label>
            <label>
              <span>光圈</span>
              <div class="camera-dof-input camera-dof-aperture-input">
                <span aria-hidden="true">f/</span>
                <input id="cameraAperture" type="number" min="${cameraApertureMinimum}" max="${cameraApertureMaximum}" step="any" data-scrub-step="0.1" value="${aperture.toFixed(1)}" ${lensEditable ? "" : "disabled"} />
              </div>
            </label>
          </div>
          <div class="camera-dof-actions">
            <button id="cameraPickFocusDistance" class="secondary-button" type="button" aria-pressed="${cameraFocusPicking}" ${shotViewActive && lensEditable ? "" : "disabled"}>⌾ 选取焦点</button>
            <button id="cameraFocusTrackingToggle" class="secondary-button ${liveFocusTracking.enabled ? "active" : ""}" type="button" aria-pressed="${liveFocusTracking.enabled}" ${shotViewActive && lensEditable && (liveFocusTracking.enabled || focusCandidate) ? "" : "disabled"}>${focusCandidate ? liveFocusTracking.enabled ? "更新跟焦" : "焦点跟随" : liveFocusTracking.enabled ? "关闭跟焦" : "焦点跟随"}</button>
            <span class="camera-focus-target-label">${escapeHTML(focusCandidate?.label || (liveFocusTracking.enabled ? focusTrackingLabel : "尚未选择目标"))}</span>
          </div>
          ${currentPose.focusTrackingEvaluation?.warning ? `<p class="camera-focus-warning">${escapeHTML(currentPose.focusTrackingEvaluation.warning)}</p>` : ""}` : ""}
        </div>
        <div class="camera-precision-settings">
          <div class="camera-precision-content">
            <div class="camera-pose-grid" aria-label="摄影机位置">
              ${["x", "y", "z"].map((axis) => `<label><span>位置 ${axis.toUpperCase()}</span><input data-camera-position="${axis}" type="number" step="any" data-scrub-step="0.01" value="${Number(currentPose.position[axis]).toFixed(2)}" ${positionEditable ? "" : "disabled"} /></label>`).join("")}
            </div>
            <div class="camera-pose-grid" aria-label="摄影机旋转">
              ${[["pitch", "俯仰"], ["yaw", "水平"], ["roll", "翻滚"]].map(([axis, label]) => `<label><span>${label}</span><input data-camera-rotation="${axis}" type="number" step="any" data-scrub-step="0.5" value="${rotation ? Number(rotation[axis]).toFixed(1) : "—"}" ${(axis === "roll" ? rollEditable : pitchYawEditable) ? "" : "disabled"} /></label>`).join("")}
            </div>
          </div>
        </div>
      ` : `<div class="inspector-empty camera-empty">切到左侧运镜，新建第一个确定机位。</div>`}
      </div>
    </details>
    ${shot ? `<details id="cameraMotionDisclosure" class="inspector-section inspector-disclosure camera-inspector-section" ${cameraMotionExpanded ? "open" : ""}>
      <summary>镜头运动</summary>
      <div class="inspector-disclosure-content">
      <div class="camera-handheld-control">
        <div class="camera-handheld-heading">
          <div><strong>手持感</strong></div>
        </div>
        <div class="camera-handheld-intensity" role="group" aria-label="手持感强度">
          ${cameraHandheldIntensities.map((intensity) => `<button type="button" data-camera-handheld-intensity="${intensity}" aria-pressed="${handheld.intensity === intensity}" ${canEditShotData ? "" : "disabled"}>${cameraHandheldIntensityLabel(intensity)}</button>`).join("")}
        </div>
      </div>
      <div class="camera-motion-row">
        <label for="cameraTrackEasing"><span>全段</span>
          <select id="cameraTrackEasing" ${canEdit ? "" : "disabled"}>
            ${uniformTrackInterpolation === "mixed" ? `<option value="mixed" selected disabled>混合</option>` : ""}
            <option value="ease-in-out" ${uniformTrackInterpolation === "ease-in-out" ? "selected" : ""}>缓入缓出</option>
            <option value="linear" ${uniformTrackInterpolation === "linear" ? "selected" : ""}>匀速</option>
            <option value="smooth" ${uniformTrackInterpolation === "smooth" ? "selected" : ""}>连续平滑</option>
          </select>
        </label>
        ${segment ? `<label for="cameraSegmentEasing"><span>当前段 <strong>${segment.index + 1} → ${segment.index + 2} · ${segment.duration.toFixed(2)} s</strong></span>
          <select id="cameraSegmentEasing" ${canEdit ? "" : "disabled"}>
            <option value="ease-in-out" ${segment.interpolation === "ease-in-out" ? "selected" : ""}>缓入缓出</option>
            <option value="linear" ${segment.interpolation === "linear" ? "selected" : ""}>匀速</option>
            <option value="smooth" ${segment.interpolation === "smooth" ? "selected" : ""}>连续平滑</option>
          </select>
        </label>` : `<p>至少两个关键帧才会形成运动分段。</p>`}
      </div>
      </div>
    </details>
    <section class="inspector-section camera-inspector-section">
      <h2 class="section-title">对准</h2>
        <div class="camera-constraints-editor">
          ${selectedKeyframe ? `<div class="camera-constraint-row ${selectedFollow.enabled ? "active follow" : ""}">
            <div class="camera-constraint-heading">
              <div><strong>位置跟随</strong><span>${selectedFollowInherited ? "沿用上一关键帧" : "从当前关键帧生效"}</span></div>
              <button id="cameraFollowToggle" class="switch-button" type="button" role="switch" aria-checked="${selectedFollow.enabled}" aria-label="位置跟随" ${canEdit && (selectedFollow.enabled || project.scene.actors.length) ? "" : "disabled"}><span aria-hidden="true"></span></button>
            </div>
            ${selectedFollow.enabled ? `<label class="camera-constraint-target"><span>目标演员</span>
              <select id="cameraFollowTarget" aria-label="位置跟随目标演员" ${canEdit && project.scene.actors.length ? "" : "disabled"}>
                ${!followTargetExists && selectedFollow.targetActorID ? `<option value="${escapeHTML(selectedFollow.targetActorID)}" selected>目标已删除</option>` : ""}
                ${project.scene.actors.map((actor, index) => `<option value="${escapeHTML(actor.id)}" ${actor.id === selectedFollow.targetActorID ? "selected" : ""}>演员 ${String(index + 1).padStart(2, "0")}</option>`).join("")}
              </select>
            </label>` : ""}
            ${selectedFollow.enabled && !followTargetExists ? `<p class="warning">目标演员已不存在；当前回退到摄影机轨道。</p>` : ""}
            ${selectedKeyframeIndex > 0 && !selectedFollowInherited ? `<button id="cameraFollowInherit" class="camera-inherit-button" type="button" ${canEdit ? "" : "disabled"}>恢复沿用上一关键帧</button>` : ""}
          </div>` : `<div class="camera-constraint-row camera-constraint-readonly ${liveFollow.enabled ? "active follow" : ""}">
            <div class="camera-constraint-heading">
              <div><strong>位置跟随</strong><span>${liveFollow.enabled && liveFollowState.index >= 0 ? `继承自关键帧 ${liveFollowState.index + 1}` : "当前播放头未启用"}</span></div>
              <button class="switch-button" type="button" role="switch" aria-checked="${liveFollow.enabled}" aria-label="当前位置跟随状态" disabled><span aria-hidden="true"></span></button>
            </div>
            <p class="${followTargetExists ? "" : "warning"}">${liveFollow.enabled ? `正在跟随${liveFollowTargetLabel}；当前播放头没有关键帧，记录后可更改。` : "当前播放头没有关键帧；记录后可设置位置跟随。"}</p>
          </div>`}
          ${selectedKeyframe ? `<div class="camera-constraint-row ${selectedAim.mode === "look-at" ? "active lock" : ""}">
            <div class="camera-constraint-heading">
              <div><strong>方向锁定</strong><span>${selectedAimInherited ? "沿用上一关键帧" : selectedAimTransitionStart ? `${selectedAimTransitionStart.time.toFixed(2)} 秒 → ${selectedKeyframe.time.toFixed(2)} 秒转向` : "当前关键帧方向状态"}</span></div>
              <button id="cameraAimToggle" class="switch-button" type="button" role="switch" aria-checked="${selectedAim.mode === "look-at"}" aria-label="方向锁定" ${canEdit ? "" : "disabled"}><span aria-hidden="true"></span></button>
            </div>
            ${selectedAim.mode === "look-at" ? `<label class="camera-constraint-target"><span>锁定目标</span>
              <select id="cameraAimTarget" aria-label="方向锁定目标" ${canEdit ? "" : "disabled"}>
                ${!aimTargetExists && selectedAim.targetKind === "actor" && selectedAim.targetActorID ? `<option value="actor:${escapeHTML(selectedAim.targetActorID)}" selected>目标已删除</option>` : ""}
                ${project.scene.actors.map((actor, index) => `<option value="actor:${escapeHTML(actor.id)}" ${selectedAim.targetKind === "actor" && actor.id === selectedAim.targetActorID ? "selected" : ""}>演员 ${String(index + 1).padStart(2, "0")}</option>`).join("")}
                ${cameraEnvironmentTargetOptions(selectedAim.targetKind === "environment" ? `environment:${selectedAim.environmentID}` : "")}
                <option value="world" ${selectedAim.targetKind === "world" ? "selected" : ""}>场景自定义点</option>
              </select>
            </label>` : ""}
            ${selectedAim.mode === "look-at" ? `<details id="cameraLockSettings" class="camera-settings-disclosure" ${cameraLockSettingsExpanded ? "open" : ""}>
              <summary>锁定设置 <span>${selectedAim.targetKind === "environment" ? "环境绑定点" : selectedAim.targetKind === "world" ? "场景自定义点" : cameraAimHeightLabel(selectedAim.actorHeight)} · ${selectedAim.composition === "left-third" ? "左三分之一" : selectedAim.composition === "right-third" ? "右三分之一" : "中央"}</span></summary>
              ${selectedAim.targetKind === "actor" ? `<label class="camera-aim-height">
                <span class="camera-aim-height-heading"><span>锁定高度</span><output id="cameraAimHeightReadout" for="cameraAimHeight">${cameraAimHeightLabel(selectedAim.actorHeight, true)}</output></span>
                <input id="cameraAimHeight" type="range" min="0" max="1" step="0.001" value="${selectedAim.actorHeight.toFixed(3)}" list="cameraAimHeightPresets" ${canEdit ? "" : "disabled"} />
                <datalist id="cameraAimHeightPresets">
                  ${Object.values(cameraAimActorHeightPresets).map((value) => `<option value="${value.toFixed(3)}"></option>`).join("")}
                </datalist>
                <span class="camera-aim-height-labels" aria-hidden="true"><span>脚底</span><span>骨盆</span><span>胸口</span><span>头顶</span></span>
              </label>` : `<div class="camera-aim-world-editor">
                <div class="camera-aim-world-heading"><span>${selectedAim.targetKind === "environment" ? "模型局部坐标" : "世界坐标"}</span><small>Scene View 中可直接拖动标记</small></div>
                <div class="camera-aim-world-grid">
                  ${["x", "y", "z"].map((axis) => `<label><span>${axis.toUpperCase()}</span><input data-camera-aim-world="${axis}" type="number" step="any" data-scrub-step="0.01" value="${Number((selectedAim.targetKind === "environment" ? selectedAim.localPosition : selectedAim.worldPosition)[axis]).toFixed(2)}" ${canEdit ? "" : "disabled"} /></label>`).join("")}
                </div>
              </div>`}
              <div class="camera-aim-grid">
                <label><span>画面位置</span>
                  <select id="cameraAimComposition" ${canEdit ? "" : "disabled"}>
                    ${cameraAimCompositions.map((composition) => `<option value="${composition}" ${composition === selectedAim.composition ? "selected" : ""}>${composition === "left-third" ? "左三分之一" : composition === "right-third" ? "右三分之一" : "中央"}</option>`).join("")}
                  </select>
                </label>
                <label><span>锁定响应</span>
                  <select id="cameraAimTracking" ${canEdit ? "" : "disabled"}>
                    <option value="smooth" ${selectedAim.trackingResponse > 0 ? "selected" : ""}>连续平滑（推荐）</option>
                    <option value="exact" ${selectedAim.trackingResponse <= 0 ? "selected" : ""}>精确锁定</option>
                  </select>
                </label>
              </div>
              ${aimTargetExists ? "" : `<p class="camera-aim-note warning">锁定目标不可用；当前使用已保存的自由朝向。</p>`}
            </details>` : ""}
            ${selectedKeyframeIndex > 0 && !selectedAimInherited ? `<button id="cameraAimInherit" class="camera-inherit-button" type="button" ${canEdit ? "" : "disabled"}>恢复沿用上一关键帧</button>` : ""}
            ${selectedAimInherited ? `<button id="cameraAimPin" class="camera-inherit-button" type="button" ${canEdit ? "" : "disabled"}>固定当前方向状态</button>` : ""}
          </div>` : `<div class="camera-constraint-row camera-constraint-readonly ${liveAim.mode === "look-at" || liveAimTransition ? "active lock" : ""}">
            <div class="camera-constraint-heading">
              <div><strong>方向锁定</strong><span>${liveAimTransition
                ? aimTransitionDisplayLabel(liveAimTransition)
                : liveAim.mode === "look-at" && liveAimState.index >= 0 ? `继承自关键帧 ${liveAimState.index + 1}` : "当前播放头为自由旋转"}</span></div>
              <button class="switch-button" type="button" role="switch" aria-checked="${liveAim.mode === "look-at"}" aria-label="当前方向锁定状态" disabled><span aria-hidden="true"></span></button>
            </div>
            <p class="${aimTargetExists ? "" : "warning"}">${liveAimTransition
              ? "转向进行中"
              : liveAim.mode === "look-at" ? `正在锁定${liveAimTargetLabel}` : "当前播放头没有关键帧"}</p>
          </div>`}
        </div>
    </section>
    <section class="inspector-section camera-inspector-section">
      ${orbitForm ? `<details id="cameraOrbitEditor" class="camera-orbit-editor ${orbitPreviewActive ? "previewing" : ""}" ${cameraOrbitExpanded || orbitPreviewActive ? "open" : ""}>
        <summary class="camera-orbit-heading">
          <div><strong>环绕</strong><span>从 ${orbitForm.startTime.toFixed(2)} s 开始</span></div>
          <span class="camera-orbit-scope">普通关键帧</span>
        </summary>
        <div class="camera-orbit-content">
          <div class="camera-orbit-grid">
          <label class="camera-orbit-target"><span>环绕中心</span>
            <select id="cameraOrbitTarget" ${canEditCameraOrbit() ? "" : "disabled"}>
              ${project.scene.actors.map((actor, index) => `<option value="actor:${escapeHTML(actor.id)}" ${orbitForm.targetValue === `actor:${actor.id}` ? "selected" : ""}>演员 ${String(index + 1).padStart(2, "0")}</option>`).join("")}
              ${cameraEnvironmentTargetOptions(orbitForm.targetValue)}
              <option value="world" ${orbitForm.targetValue === "world" ? "selected" : ""}>场景自定义点</option>
            </select>
          </label>
          ${orbitForm.targetValue.startsWith("actor:") ? "" : `<div class="camera-orbit-world camera-orbit-target"><span>${orbitForm.targetValue.startsWith("environment:") ? "局部坐标" : "世界坐标"}</span><div>${["x", "y", "z"].map((axis) => `<label><span>${axis.toUpperCase()}</span><input data-camera-orbit-world="${axis}" type="number" step="any" data-scrub-step="0.01" value="${Number((orbitForm.targetValue.startsWith("environment:") ? orbitForm.localPosition : orbitForm.worldPosition)[axis]).toFixed(2)}" ${orbitCanEdit ? "" : "disabled"} /></label>`).join("")}</div></div>`}
          <fieldset class="camera-orbit-choice camera-orbit-target">
            <legend>终点</legend>
            <label><input type="radio" name="cameraOrbitEndpoint" value="new" ${orbitForm.endpointMode === "new" ? "checked" : ""} ${orbitCanEdit ? "" : "disabled"} /><span>新建终点</span></label>
            <label><input type="radio" name="cameraOrbitEndpoint" value="next-keyframe" ${orbitForm.endpointMode === "next-keyframe" ? "checked" : ""} ${orbitCanEdit && orbitNextKeyframe ? "" : "disabled"} /><span>下一关键帧</span></label>
          </fieldset>
          <fieldset class="camera-orbit-choice camera-orbit-target">
            <legend>方向</legend>
            <label><input type="radio" name="cameraOrbitDirection" value="clockwise" ${orbitForm.direction === "clockwise" ? "checked" : ""} ${orbitCanEdit ? "" : "disabled"} /><span>顺时针</span></label>
            <label><input type="radio" name="cameraOrbitDirection" value="counter-clockwise" ${orbitForm.direction === "counter-clockwise" ? "checked" : ""} ${orbitCanEdit ? "" : "disabled"} /><span>逆时针</span></label>
          </fieldset>
          ${orbitForm.endpointMode === "new" ? `
            <label><span>旋转</span><span class="input-with-unit"><input id="cameraOrbitSweep" type="number" min="1" max="1440" step="any" data-scrub-step="15" value="${Number(orbitForm.sweepDegrees).toFixed(0)}" ${orbitCanEdit ? "" : "disabled"} /><span>°</span></span></label>
            <label><span>时长</span><span class="input-with-unit"><input id="cameraOrbitDuration" type="number" min="${(1 / project.output.frameRate).toFixed(3)}" max="${Math.max(1 / project.output.frameRate, 3600 - orbitForm.startTime).toFixed(3)}" step="any" data-scrub-step="0.1" value="${Number(orbitForm.duration).toFixed(2)}" ${orbitCanEdit ? "" : "disabled"} /><span>s</span></span></label>
          ` : `
            <label><span>加圈</span><span class="input-with-unit"><input id="cameraOrbitExtraTurns" type="number" min="0" max="3" step="1" value="${Number(orbitForm.extraTurns).toFixed(0)}" ${orbitCanEdit ? "" : "disabled"} /><span>圈</span></span></label>
            <div class="camera-orbit-duration"><span>路径</span><strong>${orbitSummary ? `${orbitSummary.totalSweepDegrees.toFixed(0)}° · ${orbitSummary.duration.toFixed(2)} s` : "—"}</strong><small>终点位置与时间保持不变</small></div>
          `}
          <div class="camera-orbit-endpoint camera-orbit-target">
            <span>终点机位</span>
            <label><span>距中心 <strong>${Number(orbitSummary?.startRadius ?? orbitForm.startRadius).toFixed(2)}</strong> →</span>${orbitForm.endpointMode === "new" ? `<span class="input-with-unit"><input id="cameraOrbitEndRadius" type="number" min="0.05" max="1000" step="any" data-scrub-step="0.05" value="${Number(orbitForm.endRadius).toFixed(2)}" ${orbitCanEdit ? "" : "disabled"} /><span>m</span></span>` : `<output>${orbitSummary ? orbitSummary.endRadius.toFixed(2) : "—"} m</output>`}</label>
            <label title="终点比起始机位高多少；负数为下降，0 为平着绕"><span>升降</span>${orbitForm.endpointMode === "new" ? `<span class="input-with-unit"><input id="cameraOrbitEndHeight" type="number" min="-1000" max="1000" step="any" data-scrub-step="0.05" value="${Number(orbitForm.endRelativeHeight).toFixed(2)}" ${orbitCanEdit ? "" : "disabled"} /><span>m</span></span>` : `<output>${orbitSummary ? orbitSummary.endRelativeHeight.toFixed(2) : "—"} m</output>`}</label>
          </div>
          </div>
          ${orbitValidationMessage ? `<p class="camera-orbit-note warning">${escapeHTML(orbitValidationMessage)}</p>` : ""}
          <div class="camera-orbit-actions">
            ${orbitPreviewActive
              ? `<button id="applyCameraOrbit" class="primary-button" type="button" ${orbitCanPreview ? "" : "disabled"}>应用</button><button id="cancelCameraOrbit" class="secondary-button" type="button">取消</button>`
              : `<button id="previewCameraOrbit" class="secondary-button" type="button" ${orbitCanPreview ? "" : "disabled"}>预览</button>`}
          </div>
        </div>
      </details>` : `<details id="cameraOrbitEditor" class="camera-orbit-editor unavailable" ${cameraOrbitExpanded ? "open" : ""}>
        <summary class="camera-orbit-heading"><div><strong>环绕</strong><span>当前不可用</span></div></summary>
        <div class="camera-orbit-content"><p>先记录摄影机起点，再从当前播放头生成轨迹。</p></div>
      </details>`}
    </section>` : ""}
  `;
  releaseCameraControlFocusAfterPointerChoice();
  document.getElementById("cameraInspectorDisclosure")?.addEventListener("toggle", (event) => {
    cameraInspectorExpanded = event.currentTarget.open;
  });
  document.getElementById("cameraMotionDisclosure")?.addEventListener("toggle", (event) => {
    cameraMotionExpanded = event.currentTarget.open;
  });
  document.getElementById("cameraLockSettings")?.addEventListener("toggle", (event) => {
    cameraLockSettingsExpanded = event.currentTarget.open;
  });
  document.getElementById("cameraOrbitEditor")?.addEventListener("toggle", (event) => {
    cameraOrbitExpanded = event.currentTarget.open;
    syncCameraAuthoringGuides();
  });
  document.getElementById("shotInspectorName")?.addEventListener("change", (event) => {
    renameSelectedShot(shot.id, event.target.value);
  });
  document.getElementById("shotAspectRatio")?.addEventListener("change", (event) => {
    commitProject((current) => setShotAspectRatio(current, shot.id, event.target.value), "运镜画幅已更新");
  });
  document.getElementById("cameraDepthOfFieldToggle")?.addEventListener("click", () => {
    const enabled = !depthOfFieldEnabled;
    cameraFocusPicking = false;
    directorRenderer.setFocusPicking(false);
    commitProject(
      (current) => setShotCameraDepthOfField(current, shot.id, { enabled }),
      enabled ? "景深已开启" : "景深已关闭",
      { cameraEdit: true }
    );
  });
  document.getElementById("cameraFocusPlaneVisible")?.addEventListener("change", (event) => {
    cameraFocusPlaneVisible = event.target.checked;
    directorRenderer.setFocusPlaneVisible(cameraFocusPlaneVisible && depthOfFieldEnabled);
  });
  document.getElementById("cameraPickFocusDistance")?.addEventListener("click", (event) => {
    cameraFocusPicking = directorRenderer.setFocusPicking(!cameraFocusPicking);
    event.currentTarget.setAttribute("aria-pressed", String(cameraFocusPicking));
  });
  document.getElementById("cameraFocusTrackingToggle")?.addEventListener("click", () => {
    if (focusCandidate) {
      const candidate = focusCandidate;
      cameraFocusPickCandidate = null;
      stageShotFocusTracking(candidate.target, `已跟焦 ${candidate.label}`);
      return;
    }
    if (liveFocusTracking.enabled) {
      stageShotFocusTracking({ ...liveFocusTracking, enabled: false }, "已从当前帧关闭焦点跟随");
    }
  });
  document.getElementById("cameraTrackEasing")?.addEventListener("change", (event) => {
    commitProject((current) => setShotCameraInterpolation(current, shot.id, event.target.value), "摄影机插值已更新", { cameraEdit: true });
  });
  document.getElementById("cameraSegmentEasing")?.addEventListener("change", (event) => {
    if (!segment) return;
    commitProject(
      (current) => setShotCameraSegmentInterpolation(current, shot.id, segment.startKeyframeID, event.target.value),
      `分段 ${segment.index + 1} → ${segment.index + 2} 插值已更新`,
      { cameraEdit: true }
    );
  });
  for (const button of elements.inspectorContent.querySelectorAll("[data-camera-handheld-intensity]")) {
    button.addEventListener("click", () => {
      const intensity = button.dataset.cameraHandheldIntensity;
      if (intensity === handheld.intensity) return;
      cancelStagedCameraEdit(false);
      commitProject(
        (current) => setShotCameraHandheld(current, shot.id, { intensity }),
        `手持感已设为${cameraHandheldIntensityLabel(intensity)}`,
        { cameraEdit: true }
      );
    });
  }
  const updateCameraOrbitForm = ({ resetGeometry = false, preview = orbitPreviewActive } = {}) => {
    if (!orbitForm) return;
    const targetValue = document.getElementById("cameraOrbitTarget")?.value || orbitForm.targetValue;
    const endpointMode = elements.inspectorContent.querySelector('input[name="cameraOrbitEndpoint"]:checked')?.value
      || orbitForm.endpointMode;
    const direction = elements.inspectorContent.querySelector('input[name="cameraOrbitDirection"]:checked')?.value
      || orbitForm.direction;
    const targetChanged = targetValue !== cameraOrbitForm.targetValue;
    const localPosition = targetChanged && targetValue.startsWith("environment:")
      ? directorRenderer.visualEnvironmentTargetPoint(targetValue.slice(12)) : null;
    if (targetChanged && targetValue.startsWith("environment:") && !localPosition) {
      showToast("模型尚未加载完成，暂时无法选择中心");
      renderInspector();
      return;
    }
    Object.assign(cameraOrbitForm, { targetValue, endpointMode, direction });
    if (localPosition) cameraOrbitForm.localPosition = localPosition;
    const numericFields = {
      cameraOrbitSweep: "sweepDegrees",
      cameraOrbitDuration: "duration",
      cameraOrbitExtraTurns: "extraTurns",
      cameraOrbitEndRadius: "endRadius",
      cameraOrbitEndHeight: "endRelativeHeight",
    };
    for (const [id, property] of Object.entries(numericFields)) {
      const input = document.getElementById(id);
      if (input) cameraOrbitForm[property] = Number(input.value);
    }
    for (const input of elements.inspectorContent.querySelectorAll("[data-camera-orbit-world]")) {
      if (!targetChanged) {
        const coordinates = targetValue.startsWith("environment:") ? cameraOrbitForm.localPosition : cameraOrbitForm.worldPosition;
        coordinates[input.dataset.cameraOrbitWorld] = Number(input.value);
      }
    }
    if (resetGeometry) {
      const center = resolveCameraOrbitBaseCenter(cameraOrbitForm, project, shot);
      const defaults = center
        ? defaultCameraOrbitOptions(track, orbitForm.startTime, center, project.output.frameRate)
        : null;
      if (defaults) {
        cameraOrbitForm.startRadius = defaults.startRadius;
        cameraOrbitForm.startRelativeHeight = defaults.startRelativeHeight;
        cameraOrbitForm.endRadius = defaults.endRadius;
        cameraOrbitForm.endRelativeHeight = defaults.endRelativeHeight;
      }
    }
    if (preview) previewCameraOrbit();
    else {
      renderInspector();
      syncRenderer();
    }
  };
  document.getElementById("previewCameraOrbit")?.addEventListener("click", () => updateCameraOrbitForm({ preview: true }));
  document.getElementById("cameraOrbitTarget")?.addEventListener("change", () => updateCameraOrbitForm({ resetGeometry: true }));
  for (const input of elements.inspectorContent.querySelectorAll('input[name="cameraOrbitEndpoint"], input[name="cameraOrbitDirection"]')) {
    input.addEventListener("change", () => updateCameraOrbitForm());
  }
  for (const id of ["cameraOrbitSweep", "cameraOrbitDuration", "cameraOrbitExtraTurns", "cameraOrbitEndRadius", "cameraOrbitEndHeight"]) {
    document.getElementById(id)?.addEventListener("change", () => updateCameraOrbitForm());
  }
  for (const input of elements.inspectorContent.querySelectorAll("[data-camera-orbit-world]")) {
    input.addEventListener("change", () => updateCameraOrbitForm({ resetGeometry: true }));
    wireInputNumberScrub(input, { previewEvent: null, commitEvent: "change", precision: 2 });
  }
  wireInputNumberScrub(document.getElementById("cameraOrbitEndRadius"), {
    previewEvent: null,
    commitEvent: "change",
    precision: 2,
  });
  wireInputNumberScrub(document.getElementById("cameraOrbitEndHeight"), {
    previewEvent: null,
    commitEvent: "change",
    precision: 2,
  });
  document.getElementById("applyCameraOrbit")?.addEventListener("click", applyCameraOrbitPreview);
  document.getElementById("cancelCameraOrbit")?.addEventListener("click", () => cancelCameraOrbitPreview(true));
  const commitSelectedAim = (aim, message) => {
    if (!selectedKeyframe) return;
    cameraAimBaseProject = null;
    commitProject(
      (current) => updateShotCameraKeyframeAim(current, shot.id, selectedKeyframe.id, aim),
      message,
      { cameraEdit: true }
    );
  };
  const previewSelectedAim = (aim) => {
    if (!selectedKeyframe) return;
    if (!cameraAimBaseProject) {
      cameraAimBaseProject = projectState.current;
      authoredRevision += 1;
      cancelScheduledSave();
      setSaveState("未保存");
    }
    project = updateShotCameraKeyframeAim(
      cameraAimBaseProject,
      shot.id,
      selectedKeyframe.id,
      aim
    );
    syncRenderer();
  };
  const commitSelectedAimPreview = (aim, message) => {
    if (!selectedKeyframe) return;
    const base = cameraAimBaseProject || projectState.current;
    cameraAimBaseProject = null;
    project = projectState.commit(updateShotCameraKeyframeAim(
      base,
      shot.id,
      selectedKeyframe.id,
      aim
    ));
    finishAuthoredChange(message);
  };
  document.getElementById("cameraAimToggle")?.addEventListener("click", () => {
    const nextMode = selectedAim.mode === "look-at" ? "free" : "look-at";
    const targetActorID = selectedAim.targetActorID
      && project.scene.actors.some((actor) => actor.id === selectedAim.targetActorID)
      ? selectedAim.targetActorID
      : project.scene.actors.find((actor) => actor.id === selectedActorID)?.id
        || project.scene.actors[0]?.id
        || null;
    const targetKind = selectedAim.targetKind === "environment" ? "environment"
      : selectedAim.targetKind === "world" || !targetActorID ? "world" : "actor";
    const nextAim = {
      ...selectedAim,
      mode: nextMode,
      targetKind,
      targetActorID,
      trackingResponse: nextMode === "look-at"
        && selectedAim.mode !== "look-at"
        && selectedAim.trackingResponse <= 0
        ? recommendedCameraAimTrackingResponse
        : selectedAim.trackingResponse,
    };
    if (nextMode === "free") {
      const visiblePose = sampleShotCamera(project, shot, selectedKeyframe.time);
      commitProject(
        (current) => {
          const withVisibleOrientation = visiblePose
            ? updateShotCameraKeyframe(current, shot.id, selectedKeyframe.id, {
                ...selectedKeyframe,
                quaternion: visiblePose.quaternion,
              })
            : current;
          return updateShotCameraKeyframeAim(
            withVisibleOrientation,
            shot.id,
            selectedKeyframe.id,
            nextAim
          );
        },
        "镜头已从当前方向切换为自由旋转",
        { cameraEdit: true }
      );
      return;
    }
    commitSelectedAim(nextAim, "已锁定镜头主体");
  });
  document.getElementById("cameraAimInherit")?.addEventListener("click", () => {
    commitSelectedAim(null, "镜头方向已恢复沿用上一关键帧");
  });
  document.getElementById("cameraAimPin")?.addEventListener("click", () => {
    commitSelectedAim({ ...selectedAim }, "已在当前关键帧固定方向状态");
  });
  document.getElementById("cameraAimTarget")?.addEventListener("change", (event) => {
    if (event.target.value === "world") {
      const currentTarget = cameraAimTargetPosition(
        project,
        sampleProject(project, selectedKeyframe.time),
        selectedAim
      );
      commitSelectedAim({
        ...selectedAim,
        mode: "look-at",
        targetKind: "world",
        worldPosition: currentTarget || selectedAim.worldPosition,
      }, "Look At 已切换到场景自定义点");
      return;
    }
    if (event.target.value.startsWith("environment:")) {
      const environmentID = event.target.value.slice(12);
      const localPosition = directorRenderer.visualEnvironmentTargetPoint(environmentID);
      if (!localPosition) {
        showToast("模型尚未加载完成，暂时无法选择中心");
        renderInspector();
        return;
      }
      commitSelectedAim({ ...selectedAim, mode: "look-at", targetKind: "environment", environmentID, localPosition }, "已锁定环境模型");
      return;
    }
    const targetActorID = event.target.value.startsWith("actor:")
      ? event.target.value.slice(6)
      : event.target.value;
    commitSelectedAim({
      ...selectedAim,
      mode: "look-at",
      targetKind: "actor",
      targetActorID,
    }, "Look At 目标演员已更新");
  });
  document.getElementById("cameraAimHeight")?.addEventListener("input", (event) => {
    const height = snapCameraAimHeight(event.target.value);
    event.target.value = height.actorHeight.toFixed(3);
    const readout = document.getElementById("cameraAimHeightReadout");
    if (readout) readout.textContent = cameraAimHeightLabel(height.actorHeight, true);
    previewSelectedAim({ ...selectedAim, mode: "look-at", ...height });
  });
  document.getElementById("cameraAimHeight")?.addEventListener("change", (event) => {
    const height = snapCameraAimHeight(event.target.value);
    commitSelectedAimPreview(
      { ...selectedAim, mode: "look-at", ...height },
      `Look At 锁定高度已更新为 ${cameraAimHeightLabel(height.actorHeight, true)}`
    );
  });
  const commitCameraAimWorldPosition = () => {
    const worldPosition = { ...(selectedAim.targetKind === "environment" ? selectedAim.localPosition : selectedAim.worldPosition) };
    for (const field of elements.inspectorContent.querySelectorAll("[data-camera-aim-world]")) {
      const value = Number(field.value);
      if (!Number.isFinite(value)) return;
      worldPosition[field.dataset.cameraAimWorld] = value;
    }
    commitSelectedAim({
      ...selectedAim,
      mode: "look-at",
      ...(selectedAim.targetKind === "environment" ? { localPosition: worldPosition } : { targetKind: "world", worldPosition }),
    }, "锁定目标坐标已更新");
  };
  for (const input of elements.inspectorContent.querySelectorAll("[data-camera-aim-world]")) {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitCameraAimWorldPosition();
    });
    input.addEventListener("change", commitCameraAimWorldPosition);
    wireInputNumberScrub(input, { previewEvent: null, commitEvent: "change", precision: 2 });
  }
  document.getElementById("cameraAimComposition")?.addEventListener("change", (event) => {
    commitSelectedAim({ ...selectedAim, mode: "look-at", composition: event.target.value }, "Look At 构图位置已更新");
  });
  document.getElementById("cameraAimTracking")?.addEventListener("change", (event) => {
    const trackingResponse = event.target.value === "smooth"
      ? selectedAim.trackingResponse > 0
        ? selectedAim.trackingResponse
        : recommendedCameraAimTrackingResponse
      : 0;
    commitSelectedAim(
      { ...selectedAim, mode: "look-at", trackingResponse },
      trackingResponse > 0 ? "Look At 已使用连续平滑" : "Look At 已使用精确锁定"
    );
  });
  const commitSelectedFollow = (nextFollow, message) => {
    if (!selectedKeyframe) return;
    commitProject((current) => {
      const result = updateShotCameraFollowPreservingPosition(
        current,
        shot.id,
        selectedKeyframe.id,
        nextFollow
      );
      return result?.project || current;
    }, message, { cameraEdit: true });
  };
  document.getElementById("cameraFollowToggle")?.addEventListener("click", () => {
    if (selectedFollow.enabled) {
      commitSelectedFollow(
        { ...selectedFollow, enabled: false },
        "Follow 已从当前关键帧关闭；世界位置已保留"
      );
      return;
    }
    const targetActorID = selectedFollow.targetActorID
      && project.scene.actors.some((actor) => actor.id === selectedFollow.targetActorID)
      ? selectedFollow.targetActorID
      : project.scene.actors.find((actor) => actor.id === selectedActorID)?.id
        || project.scene.actors[0]?.id
        || null;
    if (!targetActorID) return;
    commitSelectedFollow({
      enabled: true,
      targetActorID,
      referenceTime: selectedKeyframe.time,
    }, "Follow 已从当前关键帧启用；世界位置已保留");
  });
  document.getElementById("cameraFollowTarget")?.addEventListener("change", (event) => {
    commitSelectedFollow({
      ...selectedFollow,
      targetActorID: event.target.value,
      referenceTime: selectedKeyframe.time,
    }, "Follow 目标已从当前关键帧更新；世界位置已保留");
  });
  document.getElementById("cameraFollowInherit")?.addEventListener("click", () => {
    commitSelectedFollow(null, "位置跟随已恢复沿用上一关键帧");
  });
  for (const id of ["cameraOrbitSweep", "cameraOrbitDuration", "cameraOrbitExtraTurns"]) {
    wireInputNumberScrub(document.getElementById(id));
  }
  const readCameraEditorInputs = () => {
    const values = { position: {}, rotationDegrees: {} };
    for (const input of elements.inspectorContent.querySelectorAll("[data-camera-position]")) {
      values.position[input.dataset.cameraPosition] = input.value;
    }
    for (const input of elements.inspectorContent.querySelectorAll("[data-camera-rotation]")) {
      values.rotationDegrees[input.dataset.cameraRotation] = input.value;
    }
    const exactFocalLength = document.getElementById("cameraFocalLengthExact")?.value;
    const focalSliderProgress = document.getElementById("cameraFocalLength")?.value;
    values.focalLength = exactFocalLength !== "" && Number.isFinite(Number(exactFocalLength))
      ? exactFocalLength
      : focalSliderProgress == null
        ? undefined
        : focalLengthFromSliderProgress(focalSliderProgress);
    const focusDistanceInput = document.getElementById("cameraFocusDistance")?.value
      ?? currentPose.focusDistance;
    const apertureInput = document.getElementById("cameraAperture")?.value
      ?? currentPose.aperture;
    values.focusDistance = focusDistanceInput !== "" && Number.isFinite(Number(focusDistanceInput))
      ? focusDistanceInput
      : undefined;
    values.aperture = apertureInput !== "" && Number.isFinite(Number(apertureInput))
      ? apertureInput
      : undefined;
    return values;
  };
  const applyShotCameraInputs = () => {
    const values = readCameraEditorInputs();
    directorRenderer.setShotCameraEditorValues(values);
    updateShotComposition();
  };
  const previewSceneKeyframeOptics = () => {
    if (!sceneKeyframeActive) return;
    const values = readCameraEditorInputs();
    directorRenderer.setShotCameraOpticsPreview({
      focusDistance: values.focusDistance,
      aperture: values.aperture,
    });
  };
  const commitSceneKeyframeInputs = () => {
    if (!sceneKeyframeActive || !selectedKeyframe) return;
    const values = readCameraEditorInputs();
    const position = Object.fromEntries(Object.entries(values.position).map(([axis, value]) => [axis, Number(value)]));
    const focalLength = Number(values.focalLength);
    const focusDistance = Number(values.focusDistance);
    const aperture = Number(values.aperture);
    if (![position.x, position.y, position.z, focalLength, focusDistance, aperture].every(Number.isFinite)) {
      showToast("摄影机参数不是有效数字", true);
      renderInspector();
      return;
    }
    project = projectState.commit(updateShotCameraKeyframe(project, shot.id, selectedKeyframe.id, {
      ...selectedKeyframe,
      position,
      focalLength,
      focusDistance,
      aperture,
    }));
    finishAuthoredChange("摄影机关键帧已更新");
  };
  for (const input of elements.inspectorContent.querySelectorAll("[data-camera-position]")) {
    input.addEventListener(shotViewActive ? "input" : "change", shotViewActive ? applyShotCameraInputs : commitSceneKeyframeInputs);
    wireInputNumberScrub(input, {
      previewEvent: shotViewActive ? "input" : null,
      commitEvent: shotViewActive ? "input" : "change",
      precision: 2,
    });
  }
  for (const input of elements.inspectorContent.querySelectorAll("[data-camera-rotation]")) {
    input.addEventListener("input", applyShotCameraInputs);
    // 这三个只挂了 input，没有独立的 change 提交路径，所以预览和落定都走 input，
    // 跟上面 data-camera-position 在 Shot View 下的接法一致。
    wireInputNumberScrub(input, { previewEvent: "input", commitEvent: "input" });
  }
  for (const input of [
    document.getElementById("cameraFocusDistance"),
    document.getElementById("cameraAperture"),
  ].filter(Boolean)) {
    input.addEventListener("input", shotViewActive ? applyShotCameraInputs : previewSceneKeyframeOptics);
    if (!shotViewActive) input.addEventListener("change", commitSceneKeyframeInputs);
    wireInputNumberScrub(input, {
      previewEvent: "input",
      commitEvent: shotViewActive ? "input" : "change",
      precision: input.id === "cameraFocusDistance" ? 2 : 1,
    });
  }
  const focalLength = document.getElementById("cameraFocalLength");
  const focalLengthExact = document.getElementById("cameraFocalLengthExact");
  const focalReadout = document.getElementById("cameraFocalReadout");
  const syncFocalControls = (valueInput) => {
    const value = Math.max(
      cameraFocalLengthMinimum,
      Math.min(cameraFocalLengthMaximum, Number(valueInput) || 35)
    );
    if (focalLength && document.activeElement !== focalLength) {
      focalLength.value = focalLengthToSliderProgress(value);
    }
    focalLength?.setAttribute("aria-valuetext", `${value.toFixed(1)} mm`);
    if (focalLengthExact && document.activeElement !== focalLengthExact) focalLengthExact.value = value.toFixed(1);
    if (focalReadout) focalReadout.innerHTML = `${value.toFixed(1)} <span>mm</span>`;
    return value;
  };
  const previewFocalLength = (valueInput) => {
    const value = syncFocalControls(valueInput);
    if (sceneKeyframeActive) return value;
    directorRenderer.setCurrentFocalLength(value);
    updateShotComposition();
    return value;
  };
  const snapFocalLength = (valueInput) => {
    const value = Number(valueInput) || 35;
    const nearest = cameraFocalLengthStops.reduce((best, candidate) => (
      Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
    ), cameraFocalLengthStops[0]);
    return Math.abs(nearest - value) <= 1 ? nearest : Math.round(value * 2) / 2;
  };
  focalLength?.addEventListener("input", (event) => {
    previewFocalLength(focalLengthFromSliderProgress(event.target.value));
  });
  focalLength?.addEventListener("change", (event) => {
    const value = snapFocalLength(focalLengthFromSliderProgress(event.target.value));
    event.target.value = focalLengthToSliderProgress(value);
    syncFocalControls(value);
    if (sceneKeyframeActive) commitSceneKeyframeInputs();
    else previewFocalLength(value);
  });
  focalLengthExact?.addEventListener("input", (event) => {
    if (event.target.value === "" || !Number.isFinite(Number(event.target.value))) return;
    previewFocalLength(event.target.value);
  });
  focalLengthExact?.addEventListener("change", (event) => {
    const value = Math.max(
      cameraFocalLengthMinimum,
      Math.min(cameraFocalLengthMaximum, Number(event.target.value) || 35)
    );
    event.target.value = value.toFixed(1);
    syncFocalControls(value);
    if (sceneKeyframeActive) commitSceneKeyframeInputs();
    else previewFocalLength(value);
  });
  wireInputNumberScrub(focalLengthExact);
  document.getElementById("recordInspectorCameraKeyframe")?.addEventListener("click", recordCameraKeyframeAtPlayhead);
  document.getElementById("cancelInspectorCameraEdit")?.addEventListener("click", () => cancelStagedCameraEdit(true));
  document.getElementById("deleteInspectorCameraKeyframe")?.addEventListener("click", deleteResolvedCameraKeyframe);
}

function releaseCameraControlFocusAfterPointerChoice() {
  for (const select of elements.inspectorContent.querySelectorAll("select")) {
    let pointerChoiceActive = false;
    select.addEventListener("pointerdown", () => { pointerChoiceActive = true; });
    select.addEventListener("change", () => {
      if (pointerChoiceActive) select.blur();
      pointerChoiceActive = false;
    });
    select.addEventListener("blur", () => { pointerChoiceActive = false; });
  }
  for (const range of elements.inspectorContent.querySelectorAll('input[type="range"]')) {
    range.addEventListener("pointerdown", () => {
      const releasePointerFocus = () => {
        window.removeEventListener("pointerup", releasePointerFocus);
        window.removeEventListener("pointercancel", releasePointerFocus);
        range.blur();
      };
      window.addEventListener("pointerup", releasePointerFocus, { once: true });
      window.addEventListener("pointercancel", releasePointerFocus, { once: true });
    });
  }
}

function updateCameraKeyframeInspectorState() {
  const staged = Boolean(activeShotCameraEdit());
  const notice = document.getElementById("cameraStagedNotice");
  const badge = document.getElementById("cameraEditBadge");
  const cancelInspector = document.getElementById("cancelInspectorCameraEdit");
  const cancelTimeline = document.getElementById("cancelCameraEdit");
  if (notice) notice.hidden = !staged;
  if (cancelInspector) cancelInspector.hidden = !staged;
  if (cancelTimeline) cancelTimeline.hidden = !staged;
  if (badge) {
    badge.textContent = cameraOrbitDraft ? "环绕预览" : staged ? "未写入" : "项目数据";
    badge.classList.toggle("staged", Boolean(staged || cameraOrbitDraft));
  }
  if (viewportMode !== viewportModes.edit || editViewMode !== "shot") return;
  const state = directorRenderer.shotCameraEditorState();
  for (const input of elements.inspectorContent.querySelectorAll("[data-camera-position]")) {
    if (document.activeElement !== input) input.value = Number(state.pose.position[input.dataset.cameraPosition]).toFixed(2);
  }
  for (const input of elements.inspectorContent.querySelectorAll("[data-camera-rotation]")) {
    if (document.activeElement !== input) input.value = Number(state.rotationDegrees[input.dataset.cameraRotation]).toFixed(1);
  }
  const focalLength = document.getElementById("cameraFocalLength");
  const focalLengthExact = document.getElementById("cameraFocalLengthExact");
  const focalReadout = document.getElementById("cameraFocalReadout");
  const focalValue = state.pose.focalLength.toFixed(1);
  if (focalLength && document.activeElement !== focalLength) {
    focalLength.value = focalLengthToSliderProgress(state.pose.focalLength);
  }
  focalLength?.setAttribute("aria-valuetext", `${focalValue} mm`);
  if (focalLengthExact && document.activeElement !== focalLengthExact) focalLengthExact.value = focalValue;
  if (focalReadout) focalReadout.innerHTML = `${focalValue} <span>mm</span>`;
  const focusDistance = document.getElementById("cameraFocusDistance");
  const aperture = document.getElementById("cameraAperture");
  if (focusDistance && document.activeElement !== focusDistance) {
    focusDistance.value = Number(state.pose.focusDistance || 5).toFixed(2);
  }
  if (aperture && document.activeElement !== aperture) {
    aperture.value = Number(state.pose.aperture || 2.8).toFixed(1);
  }
  updateShotComposition();
}

function renderVisualEnvironmentControls() {
  const cards = project.scene.environment.visuals.map((visual) => {
    const assetStatus = environmentStatuses.get(visual.id) || {
      state: "loading",
      triangles: 0,
      message: null,
    };
    const statusLabel = {
      loading: "正在加载环境…",
      ready: assetStatus.triangles > 0
        ? `已加载 · ${formatTriangleCount(assetStatus.triangles)}`
        : "已加载",
      missing: "项目资产缺失",
      error: "加载失败",
    }[assetStatus.state] || "等待加载";
    const statusError = ["missing", "error"].includes(assetStatus.state);
    return `
      <div class="environment-asset-card" data-state="${escapeHTML(assetStatus.state)}">
        <div class="environment-asset-heading">
          <div>
            <strong title="${escapeHTML(visual.name)}">${escapeHTML(visual.name)}</strong>
            <small>${formatAssetBytes(visual.asset.sizeBytes)} · GLB 材质</small>
          </div>
          <span class="environment-status ${statusError ? "error" : ""}" role="status">${escapeHTML(statusLabel)}</span>
        </div>
        ${statusError && assetStatus.message ? `<p class="environment-error">${escapeHTML(assetStatus.message)}</p>` : ""}
        <div class="inline-actions environment-asset-actions">
          <button class="secondary-button" type="button" data-select-visual-environment="${escapeHTML(visual.id)}">检查</button>
          <button class="secondary-button" type="button" data-replace-visual-environment="${escapeHTML(visual.id)}" ${environmentImporting || visual.locked ? "disabled" : ""}>替换</button>
          <button class="secondary-button environment-remove-button" type="button" data-remove-visual-environment="${escapeHTML(visual.id)}" ${visual.locked ? "disabled" : ""}>移除</button>
        </div>
      </div>`;
  }).join("");
  return `
    <div class="environment-empty-state">
      <button id="importVisualEnvironment" class="secondary-button full-width-button" type="button" ${environmentImporting ? "disabled" : ""}>${environmentImporting ? "正在复制到项目…" : "＋ 添加模型"}</button>
      <input id="visualEnvironmentFile" type="file" accept=".glb,model/gltf-binary" hidden />
      <small class="environment-limit">可添加多个 · GLB 最大 256 MB</small>
    </div>
    ${cards || `<p class="section-caption">当前 Scene 还没有视觉环境。</p>`}`;
}

function formatTriangleCount(value) {
  const count = Math.max(0, Math.round(Number(value || 0)));
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)} M 三角面`;
  if (count >= 1_000) return `${Math.round(count / 1_000)} K 三角面`;
  return `${count} 三角面`;
}

function formatAssetBytes(value) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function wireProjectNumberScrub(input, update, message, options = {}) {
  if (!input) return;
  input.closest("label")?.classList.add("scrubbable-input");
  const step = Math.max(Math.abs(Number(input.dataset.scrubStep ?? input.step)) || Number(options.step) || 0.01, 0.000001);
  const minimum = input.hasAttribute("min") && Number.isFinite(Number(input.min))
    ? Number(input.min)
    : -Infinity;
  const maximum = input.hasAttribute("max") && Number.isFinite(Number(input.max))
    ? Number(input.max)
    : Infinity;
  const precision = Number.isInteger(options.precision)
    ? options.precision
    : Math.min(6, Math.max(0, (String(step).split(".")[1] || "").length));
  wireNumberScrub(input, {
    onStart: () => ({
      base: projectState.current,
      saveState: {
        label: elements.projectState.textContent,
        error: elements.projectState.classList.contains("error"),
      },
    }),
    valueAtDelta: (startValue, delta, fine) => {
      const multiplier = fine ? 0.1 : 1;
      return Math.max(minimum, Math.min(maximum, startValue + delta * step * multiplier));
    },
    format: (value) => Number(value).toFixed(precision),
    onPreview: (value, context) => {
      project = update(context.base, value);
      setSaveState("未保存");
      syncRenderer();
    },
    onCancel: (context, startValue) => {
      input.value = Number(startValue).toFixed(precision);
      project = context.base;
      setSaveState(context.saveState.label, context.saveState.error);
      syncRenderer();
    },
    onCommit: (value, context) => {
      project = projectState.commit(update(context.base, value));
      finishAuthoredChange(message);
    },
  });
}

function wireVisualEnvironmentControls() {
  const fileInput = document.getElementById("visualEnvironmentFile");
  const importButton = document.getElementById("importVisualEnvironment");
  if (importButton) importButton.disabled = environmentImporting || !canAuthor();
  importButton?.addEventListener("click", () => {
    environmentImportTargetID = null;
    if (!false) fileInput?.click();
  });
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void importVisualEnvironment(file, environmentImportTargetID);
  });
  for (const button of elements.inspectorContent.querySelectorAll("[data-select-visual-environment]")) {
    button.disabled = !canAuthor();
    button.addEventListener("click", () => selectSceneObject({
      kind: "environment",
      id: button.dataset.selectVisualEnvironment,
      parentID: null,
    }));
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-replace-visual-environment]")) {
    const visual = project.scene.environment.visuals.find(
      (candidate) => candidate.id === button.dataset.replaceVisualEnvironment
    );
    button.disabled = environmentImporting || !canAuthor() || visual?.locked === true;
    button.addEventListener("click", () => {
      const environmentID = button.dataset.replaceVisualEnvironment;
      environmentImportTargetID = environmentID;
      if (!false) fileInput?.click();
    });
  }
  for (const button of elements.inspectorContent.querySelectorAll("[data-remove-visual-environment]")) {
    const visual = project.scene.environment.visuals.find(
      (candidate) => candidate.id === button.dataset.removeVisualEnvironment
    );
    button.disabled = !canAuthor() || visual?.locked === true;
    button.addEventListener("click", () => {
      const environmentID = button.dataset.removeVisualEnvironment;
      environmentFocusID = null;
      project = projectState.commit(removeVisualEnvironment(project, environmentID));
      if (selectedObject?.kind === "environment" && selectedObject.id === environmentID) {
        selectedObject = project.scene.environment.visuals[0]
          ? { kind: "environment", id: project.scene.environment.visuals[0].id, parentID: null }
          : null;
      }
      finishAuthoredChange("视觉环境已从 Scene 移除，可使用撤销恢复");
    });
  }
}

async function importVisualEnvironment(file, targetEnvironmentID = null) {
  if (!canAuthor() || environmentImporting) return;
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (extension !== "glb") {
    showToast("请选择 GLB 文件", true);
    return;
  }
  const maximumBytes = 256 * 1024 * 1024;
  if (file.size < 20 || file.size > maximumBytes) {
    showToast("GLB 必须小于 256 MB", true);
    return;
  }
  environmentImporting = true;
  environmentImportTargetID = targetEnvironmentID;
  renderInspector();
  try {
    if (!await saveProjectNow(false)) throw new Error("当前项目无法写入本地仓库");
    const asset = await projectAPI.importEnvironmentGLB(project.id, file);
    environmentImporting = false;
    environmentImportTargetID = null;
    const environmentID = targetEnvironmentID || createID();
    environmentFocusID = environmentID;
    project = projectState.commit(setVisualEnvironmentAsset(project, asset, targetEnvironmentID
      ? { environmentID: targetEnvironmentID }
      : { id: environmentID }));
    selectedObject = { kind: "environment", id: environmentID, parentID: null };
    const kind = extension.toUpperCase();
    finishAuthoredChange(targetEnvironmentID ? `视觉环境 ${kind} 已替换` : `视觉环境 ${kind} 已导入`);
  } catch (error) {
    environmentImporting = false;
    environmentImportTargetID = null;
    renderInspector();
    showToast(`环境导入失败：${error.message}`, true);
  }
}

function renderSceneInspector() {
  const duration = rehearsalDuration();
  elements.inspectorContent.innerHTML = `
    <div class="scene-inspector">
      <div class="scene-name-field">
        <label for="projectName">项目</label>
        <input id="projectName" type="text" maxlength="80" value="${escapeHTML(project.name)}" aria-label="项目名称" />
      </div>
      <section class="inspector-section scene-environment-section">
        <h2 class="section-title">视觉环境 GLB</h2>
        ${renderVisualEnvironmentControls()}
      </section>
      <section class="inspector-section">
        <h2 class="section-title">场景显示</h2>
        <div class="scene-setting-list">
          <div class="scene-setting-row">
            <div><strong>网格地面</strong><small>进入 Shot View、Export 和桌面输出</small></div>
            <button id="toggleSceneGround" class="switch-button" type="button" role="switch" aria-checked="${project.scene.environment.groundVisible}" aria-label="显示网格地面"><span aria-hidden="true"></span></button>
          </div>
        </div>
      </section>
      <section class="inspector-section">
        <h2 class="section-title">输出</h2>
        <div class="scene-setting-list">
          <div class="scene-setting-row">
            <div><strong>帧率</strong></div>
            <select id="sceneFrameRate" aria-label="输出帧率">${desktopFrameRates.map((rate) => (
              `<option value="${rate}" ${rate === project.output.frameRate ? "selected" : ""}>${rate} fps</option>`
            )).join("")}</select>
          </div>
        </div>
      </section>
    </div>
  `;
  document.getElementById("sceneFrameRate")?.addEventListener("change", (event) => {
    void commitProject(
      (current) => setProjectFrameRate(current, event.target.value),
      "输出帧率已更新"
    );
  });
  const projectName = document.getElementById("projectName");
  const toggleSceneGround = document.getElementById("toggleSceneGround");
  projectName.disabled = !canAuthor();
  projectName.addEventListener("change", () => {
    void commitProject((current) => renameProject(current, projectName.value), "项目已重命名");
  });
  projectName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") projectName.blur();
  });
  toggleSceneGround.disabled = !canAuthor() || playback.status === "playing";
  toggleSceneGround.addEventListener("click", () => {
    const visible = !project.scene.environment.groundVisible;
    project = projectState.commit(setSceneGroundVisible(project, visible));
    finishAuthoredChange(visible ? "场景网格地面已显示" : "场景网格地面已隐藏");
  });
  wireVisualEnvironmentControls();
}

function setInspectorAuthoringDisabled(actorLocked = false) {
  if (!canAuthor() || actorLocked) {
    for (const control of elements.inspectorContent.querySelectorAll("button, input, select")) control.disabled = true;
  }
}

function renderTransport() {
  const duration = playback.duration;
  const status = playback.status;
  const cameraViewportActive = cameraModeOwnsViewport(
    viewportMode,
    cameraTrackReady(activeCameraTrack())
  );
  const shotViewActive = viewportMode === viewportModes.edit && editViewMode === "shot";
  const activeLabel = cameraViewportActive ? "摄影机取景预演" : shotViewActive ? "Shot 构图预演" : "场景预演";
  const sceneToolsDisabled = cameraViewportActive || shotViewActive;
  elements.playPlayback.disabled = duration <= 0
    || status === "playing"
    || Boolean(cameraEditSession.edit)
    || Boolean(cameraOrbitDraft);
  elements.pausePlayback.disabled = status !== "playing";
  elements.resetPlayback.disabled = duration <= 0 && status === "idle";
  elements.undoAction.disabled = !(canAuthor() || canEditCamera())
    || !uiOperationHistory.canUndo
    || Boolean(cameraEditSession.edit)
    || Boolean(cameraOrbitDraft);
  elements.redoAction.disabled = !(canAuthor() || canEditCamera())
    || !uiOperationHistory.canRedo
    || Boolean(cameraEditSession.edit)
    || Boolean(cameraOrbitDraft);
  elements.addActor.disabled = !canAuthor()
    || shotViewActive
    || (sceneSidebarMode === "blockout" && environmentImporting);
  {}
  {}
  elements.newProject.disabled = !canAuthor();
  elements.projectSelect.disabled = !canAuthor();
  elements.playPlayback.setAttribute("aria-label", status === "paused" ? `继续${activeLabel}` : `播放${activeLabel}`);
  elements.playPlayback.title = status === "paused" ? `继续${activeLabel}` : `播放${activeLabel}`;
  elements.pausePlayback.setAttribute("aria-label", `暂停${activeLabel}`);
  elements.pausePlayback.title = `暂停${activeLabel}`;
  elements.playPlayback.classList.toggle("playing", status === "playing");
  updateCameraWorkspaceTransport();
  renderViewportMode();
}

function renderConnection() {
  const problem = connectionProblemLabels[connectionState.state] || null;
  if (problem && reportedConnectionProblem !== connectionState.state) {
    showToast(problem, true);
  }
  reportedConnectionProblem = problem ? connectionState.state : null;
}

function setSaveState(label, error = false) {
  elements.projectState.textContent = label;
  elements.projectState.classList.toggle("error", error);
}

function positionProminentToast() {
  const frameRect = elements.shotFrameOverlay.hidden
    ? null
    : elements.shotOutputFrame.getBoundingClientRect();
  const anchorRect = frameRect?.width && frameRect?.height
    ? frameRect
    : elements.viewport.getBoundingClientRect();
  elements.toast.style.setProperty("--toast-center-x", `${anchorRect.left + anchorRect.width / 2}px`);
  elements.toast.style.setProperty("--toast-center-y", `${anchorRect.top + anchorRect.height / 2}px`);
}

function showToast(message, error = false, options = {}) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", error);
  elements.toast.classList.toggle("prominent", options.prominent === true);
  if (options.prominent) {
    positionProminentToast();
  } else {
    elements.toast.style.removeProperty("--toast-center-x");
    elements.toast.style.removeProperty("--toast-center-y");
  }
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
    elements.toast.classList.remove("prominent");
  }, error ? 5000 : options.prominent ? 2800 : 2200);
}

function formatTime(seconds) {
  const safe = Math.max(Number(seconds || 0), 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

 document.getElementById('manageProjectsLite').addEventListener('click',()=>openProjectManager());
document.getElementById('showShortcuts').addEventListener('click', openShortcutsDialog);
document.getElementById('exitServiceLite').addEventListener('click',async()=>{
  if(isExporting()){showToast('请先完成或取消 MP4 导出。',true);return;}
  try{if(!await saveProjectNow(false))throw new Error("当前项目尚未保存");const response=await fetch('/api/service/shutdown',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const result=await response.json();if(!response.ok)throw new Error(result.error);operatorSubscription?.();updateUI.stop();document.getElementById('exitServiceLite').disabled=true;setSaveState('服务已退出');showToast('本地服务已退出。点击 Film Space Lite 图标可重新打开。');}catch(error){showToast('退出失败：'+error.message,true);}
});
window.addEventListener('pagehide',()=>{if(exportState.taskID&&exportState.status==='rendering')navigator.sendBeacon('/api/exports/'+encodeURIComponent(exportState.taskID),new Blob(['{}'],{type:'application/json'}));});

async function openProjectManager() {
  if (projectManagementLocked()) {
    showToast("请先完成当前导入、导出或 Live 操作，再管理项目", true);
    return;
  }
  try {
    projectSummaries = await projectAPI.list();
    if (!projectManagerSelectedID || !projectSummaries.some((entry) => entry.id === projectManagerSelectedID)) {
      projectManagerSelectedID = project.id;
    }
    elements.projectManagerDialog.showModal();
    renderProjectManager();
    elements.projectManagerSearch.focus();
  } catch (error) {
    showToast(`无法读取项目列表：${error.message}`, true);
  }
}

function actorPoseTarget() {
  const target=keyframeShortcutTarget(sceneSidebarMode,selectedObject);
  return viewportMode === viewportModes.edit && target?.kind==='actor' ? findActor(project,target.targetID) : null;
}
function actorPoseValue(actor) {
  return actorPoseDraft?.actorID===actor.id && actorPoseDraft.projectID===project.id
    && Math.round(actorPoseDraft.time*project.output.frameRate)===Math.round(playback.elapsed*project.output.frameRate)
    ?{...sampleActor(actor,playback.elapsed).blockingPose,...actorPoseDraft.pose}:sampleActor(actor,playback.elapsed).blockingPose;
}
function previewActorPoseField(actor,key,value) {
  if(!canAuthor() || actor.locked)return;
  stopActionInspection(false);
  if(actorPoseDraft && (actorPoseDraft.actorID!==actor.id || Math.round(actorPoseDraft.time*project.output.frameRate)!==Math.round(playback.elapsed*project.output.frameRate)))persistActorPoseDraft();
  actorPoseDraft={projectID:project.id,actorID:actor.id,time:playback.elapsed,pose:{...(actorPoseDraft?.pose ?? {}),[key]:value}};
  syncRenderer();syncActorPoseFields();
}
function persistActorPoseDraft() {
  if(!actorPoseDraft)return;
  const draft=actorPoseDraft;actorPoseDraft=null;
  if(draft.projectID!==project.id || !findActor(project,draft.actorID))return;
  project=projectState.commit(recordActorPoseKeyframe(project,draft.actorID,draft.time,draft.pose));
  const actor=findActor(project,draft.actorID),key=actorPoseKeyframeAtTime(actor.poseTrack,draft.time,project.output.frameRate);
  actorPoseSelection.activeID=key.id;deleteScope='actor-pose-frame';
  finishAuthoredChange('人物帧已更新');
}
function recordActorPoseAtPlayhead() {
  const actor=actorPoseTarget();
  if(!actor || !canAuthor() || actor.locked)return;
  if([...elements.inspectorContent.querySelectorAll('[data-actor-pose]')].some(input=>!input.reportValidity()))return;
  const pose=actorPoseDraft?.pose ?? actorFramePose(actorPoseValue(actor));
  actorPoseDraft={projectID:project.id,actorID:actor.id,time:playback.elapsed,pose};persistActorPoseDraft();
}
function returnActorToPath() {
  const actor=actorPoseTarget();
  if(!actor || !canAuthor() || actor.locked)return;
  const pose={...actorPoseDraft?.pose,offsetX:0,offsetY:0,offsetZ:0,rotationYOffset:0,
    ...(actorReturnUpright?{rotationX:0,rotationZ:0}:{})};
  actorPoseDraft={projectID:project.id,actorID:actor.id,time:playback.elapsed,pose};
  persistActorPoseDraft();
}
function cancelActorPoseDraft() {
  actorPoseDraft=null;renderInspector();syncRenderer();
}
function wireActorPoseControls(actor) {
  for(const input of elements.inspectorContent.querySelectorAll('[data-actor-pose]')) {
    const key=input.dataset.actorPose,spec=actorPoseParameters[key];
    const preview=()=>{if(!input.validity.valid || input.value==='')return;
      previewActorPoseField(actor,key,Number(input.value)*(spec.unit==='angle'?Math.PI/180:1));};
    input.addEventListener('input',preview);input.addEventListener('change',preview);
    wireInputNumberScrub(input, spec.unit==='meters' ? {step:0.05,precision:3} : {});
  }
  document.getElementById('returnActorToPath').addEventListener('click',returnActorToPath);
  document.getElementById('actorReturnUpright').addEventListener('change',event=>{actorReturnUpright=event.target.checked;});
  document.getElementById('recordActorPoseInspector').addEventListener('click',recordActorPoseAtPlayhead);
  document.getElementById('cancelActorPoseInspector').addEventListener('click',cancelActorPoseDraft);
  document.getElementById('actorPoseInterpolation').addEventListener('change',event=>{
    persistActorPoseDraft();
    void commitProject(current=>setActorPoseInterpolation(current,actor.id,event.target.value),'人物过渡方式已更新');
  });
  enhanceAllSelects();syncActorPoseFields();
}
function syncActorPoseFields() {
  const actor=actorPoseTarget();if(!actor)return;
  const pose=actorPoseValue(actor);
  for(const input of elements.inspectorContent.querySelectorAll('[data-actor-pose]')) {
    if(document.activeElement===input || input.classList.contains('scrubbing'))continue;
    const spec=actorPoseParameters[input.dataset.actorPose];
    input.value=(pose[input.dataset.actorPose]*(spec.unit==='angle'?180/Math.PI:1)).toFixed(spec.unit==='angle'?1:spec.unit==='meters'?3:2);
  }
  const button=document.getElementById('recordActorPoseInspector');
  if(button)button.textContent=actorPoseKeyframeAtTime(actor.poseTrack,playback.elapsed,project.output.frameRate)?'更新人物帧':'添加人物帧';
  const status=document.getElementById('actorPoseFrameStatus');
  if(status)status.textContent=`${playback.elapsed.toFixed(2)} s${actorPoseDraft?.actorID===actor.id?' · 调整未记录':''}`;
  const cancel=document.getElementById('cancelActorPoseInspector');
  if(cancel)cancel.hidden=!actorPoseDraft;
}
function currentActorPoseIDs(actor=actorPoseTarget()) {
  actorPoseSelection.sync(`${project.id}/${actor?.id}`,actor?.poseTrack.keyframes || []);
  return actorPoseSelection.ids;
}
function selectActorPoseFrame(actorID,id,extend=false) {
  persistActorPoseDraft();if(playback.status==='playing')playback.pause();
  stopActionInspection(false);
  selectedActorID=actorID;selectedObject={kind:'actor',id:actorID,parentID:null};selectedPathPointID=null;
  setSceneSidebarMode('actors',{render:false});inspectorPanel='actor';
  const actor=findActor(project,actorID),key=actor.poseTrack.keyframes.find(key=>key.id===id);
  currentActorPoseIDs(actor);actorPoseSelection.select(actor.poseTrack.keyframes,id,extend);deleteScope='actor-pose-frame';
  playback.seek(key.time);renderActors();renderInspector();renderCameraTimeline();
  elements.cameraTimeline.querySelector(`[data-actor-pose-keyframe-id="${id}"]`)?.focus({preventScroll:true});
}
function selectAllActorPoseFrames() {
  const actor=actorPoseTarget();if(!actor)return;
  currentActorPoseIDs(actor);actorPoseSelection.ids=new Set(actor.poseTrack.keyframes.map(key=>key.id));
  if(actor.poseTrack.keyframes.length)actorPoseSelection.activate(actor.poseTrack.keyframes[0].id);
  deleteScope='actor-pose-frame';renderCameraTimeline();
}
function deleteSelectedActorPoseFrames() {
  const actor=actorPoseTarget();if(!actor || !canAuthor() || actor.locked)return false;
  const ids=[...currentActorPoseIDs(actor)];if(!ids.length)return false;
  actorPoseDraft=null;actorPoseSelection.activeID=null;
  void commitProject(current=>deleteActorPoseKeyframes(current,actor.id,ids),'人物帧已删除');return true;
}
function moveSelectedActorPoseFrames(actorID,ids,delta,focusID) {
  const actor=findActor(project,actorID);if(!canAuthor() || actor.locked)return;
  persistActorPoseDraft();
  const next=moveActorPoseKeyframes(project,actorID,ids,delta);
  actorPoseSelection.activate(focusID);deleteScope='actor-pose-frame';
  project=projectState.commit(next);finishAuthoredChange('人物帧时间已更新');
  const key=findActor(project,actorID).poseTrack.keyframes.find(key=>key.id===focusID);
  playback.seek(key.time);renderInspector();
  elements.cameraTimeline.querySelector(`[data-actor-pose-keyframe-id="${focusID}"]`)?.focus({preventScroll:true});
}
function setupActorPoseMarker(marker,span) {
  const actorID=marker.dataset.actorPoseActorId;
  wireTimelineKeyframeMarker(marker,{
    canEdit:()=>canAuthor()&&!findActor(project,actorID).locked,
    getTrack:()=>findActor(project,actorID).poseTrack,
    getSelection:()=>currentActorPoseIDs(findActor(project,actorID)),
    select:(id,extend)=>selectActorPoseFrame(actorID,id,extend),
    commit:(ids,delta,id)=>moveSelectedActorPoseFrames(actorID,ids,delta,id),
    frameRate:project.output.frameRate,span,offset:keyframeMarkerOffset,moveTrack:moveActorPoseFrames,
    idProperty:'actorPoseKeyframeId',railSelector:'[data-actor-pose-keyframe-rail]',markerSelector:'[data-actor-pose-keyframe-id]',fixedZero:false,
  });
}
function jumpActorPoseFrame(direction) {
  const actor=actorPoseTarget();if(!actor)return;
  const keys=actor.poseTrack.keyframes;
  const key=direction==='previous'?[...keys].reverse().find(key=>key.time<playback.elapsed-0.0001):keys.find(key=>key.time>playback.elapsed+0.0001);
  if(key)selectActorPoseFrame(actor.id,key.id);
}


function updateActivity() {
  const editingField = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
  const unsaved = Boolean(editingField || elements.projectState.classList.contains('error') || projectDirty || semanticOperationQueue.active || !semanticOperationQueue.lastDrainSucceeded
    || actorPoseDraft || cameraEditSession.edit || cameraOrbitDraft || transformBaseProject || pathPointBaseProject
    || cameraKeyframeBaseProject || cameraAimBaseProject);
  const dialogOpen = [...document.querySelectorAll('dialog[open]')].some(dialog => !['shortcutsDialog', 'updateProgressDialog'].includes(dialog.id));
  const busy = unsaved || environmentImporting || projectManagementBusy || Boolean(blockoutImageImportTarget) || isExporting() || playback.status === 'playing'
    || dialogOpen || elements.appShell.getAttribute('aria-busy') === 'true';
  return {busy, unsaved, reason: unsaved ? '请先保存当前编辑和机位草稿。' : busy ? '页面有正在进行的操作。' : ''};
}
const updateUI = startUpdateUI({
  readActivity: updateActivity,
  currentProjectID: () => project.id,
  setLocked: value => { appUpdateLocked = value; elements.appShell.inert = value; },
  saveBeforeUpdate: async () => {
    if (isExporting() || playback.status === 'playing' || environmentImporting || projectManagementBusy || blockoutImageImportTarget) throw new Error('请先结束播放、导入或导出。');
    if (!await saveProjectNow(false)) throw new Error('项目尚未保存，暂缓更新。');
    const activity = updateActivity();
    if (activity.busy) throw new Error(activity.reason);
  },
});
