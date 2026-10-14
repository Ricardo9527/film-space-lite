import { createActorPoseTrack, recordActorPose, moveActorPoseFrames, migrateLegacyActorPoseTrack } from "./actor-pose.js";
import { output1080Resolution } from "./camera-composition.js";
import { blockingCharacterID, isBlockingActor, blockingMotionActions, blockingPostureFields, compileBlockingPlayback, sampleBlockingPhase } from "./blocking-actor.js";
import {
  defaultMoveSpeed,
  minimumMoveSpeed,
  normalizeAngle,
} from "./scene-model.js";
import { desktopActions, isDesktopActionID } from "./action-catalog.js";

import { deleteCameraKeyframe, deleteCameraKeyframes, cameraTrackDuration, createCameraTrack, moveCameraKeyframe, moveCameraKeyframes, normalizeCameraFollow, normalizeCameraFocusTracking, normalizeCameraPose, recordCameraKeyframe, setCameraSegmentInterpolation, setCameraTrackInterpolation, setCameraTrackDuration as resizeCameraTrack, setCameraTrackEndpoint as recordCameraTrackEndpoint, updateCameraKeyframe, updateCameraKeyframeAim, updateCameraKeyframeFollow, updateCameraKeyframeFocusTracking } from "./camera-track.js";
import { actorDuration, sampleActor } from "./playback-engine.js";

import {
  defaultCameraHandheld,
  normalizeCameraHandheld,
} from "./camera-handheld.js";
import {
  inverseQuaternion,
  multiplyQuaternions,
  rotateVector,
} from "./live-origin.js";

export { desktopActions } from "./action-catalog.js";

export const desktopProjectSchemaVersion = 70;

// Keep the index and color values aligned with HumanFigureFactory on Phone Lite.
export const clothingColors = [
  "#1a5ce0",
  "#d92e2e",
  "#1a9e52",
  "#e08f1f",
  "#8c3dd1",
  "#ddd2ba",
  "#5f656c",
];
export const clothingColorMaxIndex = clothingColors.length - 1;
export const desktopCharacters = [blockingCharacterID];
export const desktopLoopBehaviors = ["loop", "play_once", "hold_last_frame"];

export const desktopAspectRatios = ["16:9", "9:16", "1:1", "4:3", "21:9"];
export const desktopFrameRates = [24, 25, 30, 60];
export const defaultDesktopAspectRatio = "16:9";
export const defaultDesktopFrameRate = 30;
export function projectOutputResolution(project, aspectRatio = project.output.defaultAspectRatio) {
  return output1080Resolution(aspectRatio);
}
export const defaultDesktopResolution = Object.freeze({ width: 1920, height: 1080 });
export const desktopCameraSensor = Object.freeze({ width: 36, height: 24 });
export const blockoutPrimitiveKinds = Object.freeze([
  "box",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "plane",
  "wedge",
]);
export const defaultDesktopCameraSetupPose = Object.freeze({
  position: Object.freeze({ x: 0, y: 1.6, z: 5 }),
  quaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  focalLength: 35,
  focusDistance: 5,
  aperture: 2.8,
});

export function createID() {
  return globalThis.crypto?.randomUUID?.()
    ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createDesktopProject(options = {}) {
  const now = new Date().toISOString();
  const initialSetup = createCameraSetup({
    id: "camera-setup-01",
    name: "机位 01",
    pose: options.cameraSetupPose,
    aspectRatio: options.defaultAspectRatio,
  });
  return {
    edition: "lite",
    schemaVersion: desktopProjectSchemaVersion,
    revision: clampInteger(options.revision, 0, Number.MAX_SAFE_INTEGER, 0),
    id: options.id || createID(),
    name: cleanName(options.name, "未命名项目"),
    createdAt: options.createdAt || now,
    modifiedAt: options.modifiedAt || now,
    output: {
      defaultAspectRatio: normalizeAspectRatio(options.defaultAspectRatio),
      frameRate: normalizeFrameRate(options.frameRate),
      resolution: { ...defaultDesktopResolution },
      folder: normalizeOutputFolder(options.outputFolder),
    },
    scene: {
      environment: {
        groundVisible: options.groundVisible !== false,
        groups: [],
        visuals: [],
        
      },
      duration: {
        mode: "manual",
        seconds: clampFinite(options.durationSeconds, 0.2, 3600, 20),
      },
      actors: [],
      
      blockout: createBlockoutLayer(),
      cameraSetups: [initialSetup],
      shots: [],
      activeShotID: null,
    },
  };
}

export function actorColor(actor) {
  return isBlockingActor(actor) && actor.blockingColor
    ? actor.blockingColor
    : clothingColors[actor.clothingColorIndex];
}

function normalizeBlockingColor(value, characterAssetID) {
  if (value == null) return null;
  if (characterAssetID !== blockingCharacterID) throw new Error("自定义颜色只适用于抽象人。");
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error("颜色必须为 #RRGGBB 格式。");
  }
  return value.toLowerCase();
}

function normalizeBlockingTilt(value, characterAssetID) {
  const angle = value ?? 0;
  if (!Number.isFinite(angle)) throw new Error("倾斜角度必须是有限数值。");
  if (angle !== 0 && characterAssetID !== blockingCharacterID) throw new Error("倾斜只适用于抽象人。");
  return normalizeAngle(angle);
}

export function createActor(options = {}) {
  if (options.characterAssetID && options.characterAssetID !== blockingCharacterID) throw new Error("简化版只支持抽象人。");
  options = { ...options, characterAssetID: blockingCharacterID };
  const position = sanitizeVector(options.position, { x: 0, y: 0, z: 0 });
  const rotationY = normalizeAngle(Number(options.rotationY || 0));
  return {
    id: options.id || createID(),
    position,
    rotationY,
    rotationX: normalizeBlockingTilt(options.rotationX, options.characterAssetID),
    rotationZ: normalizeBlockingTilt(options.rotationZ, options.characterAssetID),
    clothingColorIndex: clampInteger(options.clothingColorIndex, 0, clothingColors.length - 1, 0),
    blockingColor: normalizeBlockingColor(options.blockingColor, options.characterAssetID),
    characterAssetID: blockingCharacterID,
    scale: clampFinite(options.scale, 0.5, 2, 1),
    animationID: "idle",
    visible: options.visible !== false,
    locked: options.locked === true,
    motionActions: [createAnchorAction(position)],
    poseTrack: createActorPoseTrack(options.poseTrack),
  };
}

export function normalizeDesktopProject(input) {
  const fallback = createDesktopProject();
  if (!input || typeof input !== "object") return fallback;
  if (input.edition !== "lite") throw new Error("请使用 Film Space Lite 项目；此版本不导入完整版项目。");

  if (input.scene?.pairedActions?.length || input.scene?.environment?.reconstructions?.length || input.scene?.shots?.some(s => s.camera?.liveSource)) throw new Error("简化版项目包含不支持的场景内容。");
  const actorsInput = Array.isArray(input.scene?.actors)
    ? input.scene.actors
    : Array.isArray(input.humans)
      ? input.humans
      : [];
  const usedActorIDs = new Set();
  const migratesDesktopV1Colors = input.schemaVersion === 1 && Array.isArray(input.scene?.actors);
  const actors = actorsInput.map((actor, index) => normalizeActor({
    ...actor,
    clothingColorIndex: migratesDesktopV1Colors
      ? migrateDesktopV1ColorIndex(actor?.clothingColorIndex)
      : actor?.clothingColorIndex,
  }, index, usedActorIDs, input.schemaVersion));
  
  const usedShotIDs = new Set();
  const shots = (Array.isArray(input.scene?.shots) ? input.scene.shots : [])
    .map((shot, index) => normalizeShot(shot, index, usedShotIDs, input.output?.defaultAspectRatio));
  const activeShotID = shots.some((shot) => shot.id === input.scene?.activeShotID)
    ? input.scene.activeShotID
    : shots[0]?.id || null;
  const usedCameraSetupIDs = new Set();
  const cameraSetups = (Array.isArray(input.scene?.cameraSetups) ? input.scene.cameraSetups : [])
    .map((setup, index) => normalizeCameraSetup(setup, index, usedCameraSetupIDs, shots));
  if (!cameraSetups.length) {
    const legacyShot = shots.find((shot) => shot.id === activeShotID) || shots[0];
    cameraSetups.push(createCameraSetup({
      id: "camera-setup-01",
      name: "机位 01",
      pose: legacyShot?.camera?.track?.keyframes?.[0],
    }));
  }
  const durationMode = "manual";
  const actorEnd = Math.max(
    0,
    ...actors.map(actorDuration)
  );
  const cameraEnd = Math.max(0, ...shots.map((shot) => cameraTrackDuration(shot.camera.track)));
  const storedDuration = clampFinite(input.scene?.duration?.seconds, 0, 3600, 0);
  const durationSeconds = input.scene?.duration?.mode === "manual"
    ? Math.max(0.2, storedDuration)
    : storedDuration || Math.max(actorEnd, cameraEnd) || 20;
  const projectID = validID(input.id) ? input.id : fallback.id;
  const visualEnvironmentInput = Array.isArray(input.scene?.environment?.visuals)
    ? input.scene.environment.visuals
    : input.scene?.environment?.visual
      ? [input.scene.environment.visual]
      : [];
  const usedVisualEnvironmentGroupIDs = new Set();
  const visualEnvironmentGroups = (Array.isArray(input.scene?.environment?.groups)
    ? input.scene.environment.groups
    : [])
    .map((group, index) => normalizeVisualEnvironmentGroup(
      group,
      index,
      usedVisualEnvironmentGroupIDs
    ));
  const visualEnvironmentGroupIDs = new Set(visualEnvironmentGroups.map((group) => group.id));
  const usedVisualEnvironmentIDs = new Set();
  const visualEnvironments = visualEnvironmentInput
    .map((visual, index) => normalizeVisualEnvironment(
      visual,
      projectID,
      index,
      usedVisualEnvironmentIDs,
      visualEnvironmentGroupIDs
    ))
    .filter(Boolean);
  

  return {
    edition: "lite",
    schemaVersion: desktopProjectSchemaVersion,
    revision: clampInteger(input.revision, 0, Number.MAX_SAFE_INTEGER, 0),
    id: projectID,
    name: cleanName(input.name, "未命名项目"),
    createdAt: validDateString(input.createdAt) ? input.createdAt : fallback.createdAt,
    modifiedAt: validDateString(input.modifiedAt) ? input.modifiedAt : fallback.modifiedAt,
    output: {
      defaultAspectRatio: normalizeAspectRatio(input.output?.defaultAspectRatio),
      frameRate: normalizeFrameRate(input.output?.frameRate),
      resolution: { ...defaultDesktopResolution },
      folder: normalizeOutputFolder(input.output?.folder),
    },
    scene: {
      environment: {
        groundVisible: input.scene?.environment?.groundVisible !== false,
        groups: visualEnvironmentGroups,
        visuals: visualEnvironments,
        
      },
      duration: {
        mode: durationMode,
        seconds: durationSeconds,
      },
      actors,
      
      blockout: normalizeBlockoutLayer(input.scene?.blockout, projectID),
      cameraSetups,
      shots,
      activeShotID,
    },
  };
}

export function addActor(project, options = {}) {
  const next = cloneProject(project);
  const index = next.scene.actors.length;
  const columnOffsets = [0, -0.9, 0.9];
  const fallbackPosition = {
    x: columnOffsets[index % columnOffsets.length],
    y: 0,
    z: Math.floor(index / 3) * 0.8,
  };
  next.scene.actors.push(createActor({
    ...options,
    position: options.position || fallbackPosition,
    clothingColorIndex: Number.isFinite(options.clothingColorIndex)
      ? options.clothingColorIndex
      : index % clothingColors.length,
  }));
  return touch(next);
}

export function deleteActor(project, actorID) {
  const next = cloneProject(project);
  const actor = next.scene.actors.find((candidate) => candidate.id === actorID);
  if (!actor || actor.locked) return project;
  next.scene.actors = next.scene.actors.filter((actor) => actor.id !== actorID);
  return touch(next);
}

export function duplicateActor(project, actorID) {
  const next = cloneProject(project);
  const source = next.scene.actors.find((actor) => actor.id === actorID);
  if (!source) return project;
  const offset = { x: 0.6, y: 0, z: 0.6 };
  const actionIDMap = new Map(source.motionActions.map((action) => [action.id, createID()]));
  const duplicate = {
    ...structuredClone(source),
    id: createID(),
    position: addVectors(source.position, offset),
    visible: true,
    locked: false,
    poseTrack: {...source.poseTrack,keyframes:source.poseTrack.keyframes.map(key=>({...key,id:createID()}))},
    motionActions: source.motionActions.map((action) => ({
      ...structuredClone(action),
      id: actionIDMap.get(action.id),
      ...(action.sourceActionID
        ? { sourceActionID: actionIDMap.get(action.sourceActionID) || action.sourceActionID }
        : {}),
      position: addVectors(action.position, offset),
    })),
  };
  duplicate.motionActions = reflowMotionActions(
    duplicate.motionActions,
    duplicate.position,
    duplicate.rotationY
  );
  next.scene.actors.push(duplicate);
  return touch(next);
}

export function setActorVisible(project, actorID, visible) {
  return updateActor(project, actorID, (actor) => ({
    ...actor,
    visible: Boolean(visible),
  }), { allowLocked: true });
}

export function setActorLocked(project, actorID, locked) {
  return updateActor(project, actorID, (actor) => ({
    ...actor,
    locked: Boolean(locked),
  }), { allowLocked: true });
}

export function setActorTransform(project, actorID, position, rotationY) {
  return updateActor(project, actorID, (actor) => {
    const nextPosition = sanitizeVector(position, actor.position);
    const delta = subtractVectors(nextPosition, actor.position);
    return {
      ...actor,
      position: nextPosition,
      rotationY: normalizeAngle(Number.isFinite(rotationY) ? rotationY : actor.rotationY),
      motionActions: actor.motionActions.map((action) => ({
        ...action,
        position: addVectors(action.position, delta),
        ...(Number.isFinite(action.entryHeightY)
          ? { entryHeightY: Number(action.entryHeightY) + delta.y }
          : {}),
      })),
    };
  });
}

export function setActorOrPairedRoleTransform(project, actorID, position, rotationY) { return setActorTransform(project, actorID, position, rotationY); }

export function faceActorTowardNextTarget(project, actorID) {
  return updateActor(project, actorID, (actor) => {
    const target = nextMoveTarget(actor.motionActions, 0, actor.position);
    if (!target) return actor;
    return {
      ...actor,
      rotationY: headingBetween(actor.position, target),
    };
  });
}

export function faceActionTowardNextTarget(project, actorID, actionID) {
  return updateActor(project, actorID, (actor) => {
    const actionIndex = actor.motionActions.findIndex((action) => action.id === actionID);
    if (actionIndex < 0 || actor.motionActions[actionIndex].kind !== "hold") return actor;
    const action = actor.motionActions[actionIndex];
    const target = nextMoveTarget(actor.motionActions, actionIndex + 1, action.position);
    if (!target) return actor;
    return {
      ...actor,
      motionActions: actor.motionActions.map((candidate, index) => (
        index === actionIndex
          ? { ...candidate, facingY: headingBetween(action.position, target) }
          : candidate
      )),
    };
  });
}

export function setActorProperty(project, actorID, key, value) {
  const allowed = new Set(["clothingColorIndex", "blockingColor", "characterAssetID", "scale", "rotationX", "rotationZ"]);
  if (!allowed.has(key)) return project;
  return updateActor(project, actorID, (actor) => {
    if (key === "clothingColorIndex") {
      return { ...actor, clothingColorIndex: clampInteger(value, 0, clothingColors.length - 1, actor.clothingColorIndex), blockingColor: null };
    }
    if (key === "rotationX" || key === "rotationZ") {
      if (!isBlockingActor(actor)) throw new Error("倾斜只适用于抽象人。");
      return { ...actor, [key]: normalizeBlockingTilt(value, actor.characterAssetID) };
    }
    if (key === "blockingColor") {
      return { ...actor, blockingColor: normalizeBlockingColor(value, actor.characterAssetID) };
    }
    if (key === "characterAssetID") {
      const characterAssetID = desktopCharacters.includes(value) ? value : actor.characterAssetID;
      return { ...actor, characterAssetID, blockingColor: characterAssetID === blockingCharacterID ? actor.blockingColor : null, rotationX: characterAssetID === blockingCharacterID ? actor.rotationX : 0, rotationZ: characterAssetID === blockingCharacterID ? actor.rotationZ : 0 };
    }
    if (key === "scale") {
      return { ...actor, scale: clampFinite(value, 0.5, 2, actor.scale) };
    }
    return actor;
  });
}

export function addMoveAction(project, actorID, target, options = {}) {
  return updateActor(project, actorID, (actor) => {
    const actions = ensureAnchor(actor.motionActions, actor.position);
    const anchor = actions.at(-1)?.position || actor.position;
    const position = sanitizeVector(target, anchor);
    const requestedAction = desktopActions[options.actionID]?.kind === "move"
      ? desktopActions[options.actionID]
      : desktopActions.walk;
    const speed = clampFinite(options.speed, minimumMoveSpeed, 20, requestedAction.defaultSpeed || defaultMoveSpeed);
    const incomingMovePhaseSync = normalizeIncomingMovePhaseSync(
      options.incomingMovePhaseSync
    );
    return {
      ...actor,
      motionActions: [
        ...actions,
        {
          id: createID(),
          kind: "move",
          actionID: requestedAction.id,
          position,
          speed,
          duration: 0,
          facingY: null,
          locomotionGait: options.locomotionGait === "run" || requestedAction.locomotionGait === "run" ? "run" : "walk",
          loopBehavior: requestedAction.loopBehavior,
          ...(incomingMovePhaseSync ? { incomingMovePhaseSync } : {}),
        },
        createAnchorAction(position),
      ],
    };
  });
}

export function addStayAction(project, actorID, options = {}) {
  return updateActor(project, actorID, (actor) => {
    const actions = ensureAnchor(actor.motionActions, actor.position);
    const position = actions.at(-1)?.position || actor.position;
    return {
      ...actor,
      motionActions: [
        ...actions,
        createStayAction(position, options),
      ],
    };
  });
}

export function addStayActionAtPoint(project, actorID, pointID, options = {}) {
  return updateActor(project, actorID, (actor) => {
    const actions = ensureAnchor(actor.motionActions, actor.position);
    const point = motionPathPoints({ ...actor, motionActions: actions })
      .find((candidate) => candidate.id === pointID);
    if (!point) return actor;

    const lastHoldID = point.holdActionIDs.at(-1);
    const lastHoldIndex = lastHoldID
      ? actions.findIndex((action) => action.id === lastHoldID)
      : -1;
    const incomingMoveIndex = point.incomingMoveID
      ? actions.findIndex((action) => action.id === point.incomingMoveID)
      : -1;
    const insertionIndex = lastHoldIndex >= 0
      ? lastHoldIndex + 1
      : incomingMoveIndex >= 0
        ? incomingMoveIndex + 1
        : 0;
    const motionActions = [...actions];
    motionActions.splice(insertionIndex, 0, createStayAction(point.position, options));
    return { ...actor, motionActions };
  });
}

export function canInsertStayActionBefore(actor, targetActionIDInput) {
  if (!actor) return false;
  const targetActionID = String(targetActionIDInput || "");
  const targetIndex = actor.motionActions.findIndex(
    (action) => action.id === targetActionID
  );
  const target = actor.motionActions[targetIndex];
  if (
    targetIndex <= 0
    || target?.kind !== "hold"
    || Number(target.duration || 0) <= 0
  ) {
    return false;
  }
  let pointStartIndex = 0;
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    if (actor.motionActions[index].kind !== "move") continue;
    pointStartIndex = index + 1;
    break;
  }
  let pointEndIndex = actor.motionActions.length;
  for (let index = targetIndex + 1; index < actor.motionActions.length; index += 1) {
    if (actor.motionActions[index].kind !== "move") continue;
    pointEndIndex = index;
    break;
  }
  const positiveDurationActions = actor.motionActions
    .slice(pointStartIndex, pointEndIndex)
    .filter((action) => (
      action.kind === "hold" && Number(action.duration || 0) > 0
    ));
  return positiveDurationActions.length === 1
    && positiveDurationActions[0].id === targetActionID;
}

export function insertStayActionBefore(
  project,
  actorID,
  targetActionID,
  options = {}
) {
  const actor = findActor(project, actorID);
  if (!canInsertStayActionBefore(actor, targetActionID)) return project;
  return updateActor(project, actorID, (currentActor) => {
    const actions = ensureAnchor(currentActor.motionActions, currentActor.position);
    const targetIndex = actions.findIndex((action) => action.id === targetActionID);
    if (targetIndex <= 0) return currentActor;
    const motionActions = [...actions];
    motionActions.splice(
      targetIndex,
      0,
      createStayAction(actions[targetIndex].position, options)
    );
    return { ...currentActor, motionActions };
  });
}

export function movePerformanceWithinPoint(project, actorID, actionID, direction) {
  const actor = findActor(project, actorID);
  if (!actor) return project;
  const point = motionPathPoints(actor)
    .find((candidate) => candidate.holdActionIDs.includes(actionID));
  if (!point) return project;

  const actionByID = new Map(actor.motionActions.map((action) => [action.id, action]));
  const performanceIDs = point.holdActionIDs.filter((id) => {
    const action = actionByID.get(id);
    return action?.kind === "hold" && Number(action.duration || 0) > 0;
  });
  const sourceOrder = performanceIDs.indexOf(actionID);
  const offset = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const targetOrder = sourceOrder + offset;
  if (sourceOrder < 0 || offset === 0 || targetOrder < 0 || targetOrder >= performanceIDs.length) {
    return project;
  }

  const targetID = performanceIDs[targetOrder];
  return updateActor(project, actorID, (currentActor) => {
    const motionActions = [...currentActor.motionActions];
    const sourceIndex = motionActions.findIndex((action) => action.id === actionID);
    const targetIndex = motionActions.findIndex((action) => action.id === targetID);
    if (sourceIndex < 0 || targetIndex < 0) return currentActor;
    [motionActions[sourceIndex], motionActions[targetIndex]] = [motionActions[targetIndex], motionActions[sourceIndex]];
    return { ...currentActor, motionActions };
  });
}

export function updateMotionAction(project, actorID, actionID, patch = {}) {
  if (["sourceInSeconds", "sourceOutSeconds", "entryHeightY", "incomingMovePhaseSync"].some(key => Object.hasOwn(patch,key))) throw new Error("抽象人不支持源动画参数。");
  return updateActor(project, actorID, actor => ({ ...actor, motionActions: actor.motionActions.map((action,index) => {
    if (action.id !== actionID) return action;
    if (patch.actionID != null && patch.actionID !== action.actionID) throw new Error("抽象人只支持移动和停留。");
    if (index === 0 && (["posture","seatHeight","gesture","joints","transitionSeconds"].some(key=>Object.hasOwn(patch,key)))) throw new Error("坐姿只适用于抽象人的停留。");
    const next = { ...action };
    if (Object.hasOwn(patch,"speed")) next.speed = clampFinite(patch.speed,minimumMoveSpeed,20,action.speed);
    if (Object.hasOwn(patch,"duration") && action.kind === "hold" && index > 0) next.duration = clampFinite(patch.duration,0,3600,action.duration);
    if (Object.hasOwn(patch,"facingY")) next.facingY = Number.isFinite(patch.facingY) ? normalizeAngle(patch.facingY) : null;
    if (Object.hasOwn(patch,"position")) next.position = sanitizeVector(patch.position,action.position);
    if (["posture","seatHeight","gesture","joints","transitionSeconds"].some(key=>Object.hasOwn(patch,key))) {
      if(Object.hasOwn(patch,"posture")) { delete next.gesture; delete next.joints; }
      const normalized=blockingPostureFields({ ...next,...patch });
      for(const key of ["gesture","joints","transitionSeconds"]) delete next[key];
      Object.assign(next,normalized);
    }
    return blockingMotionActions([next])[0];
  }) }));
}

export function motionPathPoints(actor) {
  if (!actor) return [];
  const actions = Array.isArray(actor.motionActions) ? actor.motionActions : [];
  const points = [];
  let point = {
    id: actions[0]?.kind === "hold" ? actions[0].id : actor.id,
    position: sanitizeVector(actor.position, { x: 0, y: 0, z: 0 }),
    isStart: true,
    incomingMoveID: null,
    holdActionIDs: [],
  };

  for (const action of actions) {
    if (action.kind === "move") {
      points.push(point);
      point = {
        id: null,
        position: sanitizeVector(action.position, point.position),
        isStart: false,
        incomingMoveID: action.id,
        holdActionIDs: [],
      };
      continue;
    }
    if (
      ["intrinsic", "entry-height"].includes(action.anchorSource)
      && point.holdActionIDs.length
    ) {
      points.push(point);
      point = {
        id: action.id,
        position: sanitizeVector(action.position, point.position),
        isStart: false,
        incomingMoveID: null,
        holdActionIDs: [],
        fixedByActionID: action.sourceActionID || null,
      };
    }
    point.holdActionIDs.push(action.id);
    if (!point.id) point.id = action.id;
  }
  points.push(point);
  return points.map((entry) => ({
    ...entry,
    id: entry.id || entry.incomingMoveID,
  }));
}

export function setPathPointPosition(project, actorID, pointID, position) {
  return updateActor(project, actorID, (actor) => {
    const point = motionPathPoints(actor).find((candidate) => candidate.id === pointID);
    if (!point) return actor;
    const nextPosition = sanitizeVector(position, point.position);
    const affectedIDs = new Set(point.holdActionIDs);
    if (point.incomingMoveID) affectedIDs.add(point.incomingMoveID);
    return {
      ...actor,
      position: point.isStart ? { ...nextPosition } : actor.position,
      motionActions: actor.motionActions.map((action) => (
        affectedIDs.has(action.id)
          ? { ...action, position: { ...nextPosition } }
          : action
      )),
    };
  });
}

export function removeMotionAction(project, actorID, actionID) {
  return updateActor(project, actorID, (actor) => {
    const index = actor.motionActions.findIndex((action) => action.id === actionID);
    if (index <= 0) return actor;
    const target = actor.motionActions[index];
    if (target.kind === "move") {
      let end = index + 1;
      while (end < actor.motionActions.length && actor.motionActions[end].kind === "hold") end += 1;
      return {
        ...actor,
        motionActions: ensureAnchor([
          ...actor.motionActions.slice(0, index),
          ...actor.motionActions.slice(end),
        ], actor.position),
      };
    }
    return {
      ...actor,
      motionActions: ensureAnchor(actor.motionActions.filter((action) => action.id !== actionID), actor.position),
    };
  });
}

export function clearMotion(project, actorID) { return updateActor(project, actorID, actor => ({ ...actor, motionActions: [createAnchorAction(actor.position)] })); }

export function renameProject(project, name) {
  const next = cloneProject(project);
  next.name = cleanName(name, next.name);
  return touch(next);
}

export function setSceneGroundVisible(project, visible) {
  const next = cloneProject(project);
  next.scene.environment.groundVisible = Boolean(visible);
  return touch(next);
}

export function createVisualEnvironmentGroup(project, environmentIDsInput, options = {}) {
  const environmentIDs = uniqueValidIDs(environmentIDsInput);
  if (!environmentIDs.length) return project;
  const visuals = environmentIDs.map((id) => (
    project.scene.environment.visuals.find((visual) => visual.id === id)
  ));
  if (visuals.some((visual) => !visual || !visualEnvironmentEditable(project, visual))) return project;
  const worldTransforms = visuals.map((visual) => visualEnvironmentWorldTransform(project, visual));
  const position = worldTransforms.reduce((sum, transform) => ({
    x: sum.x + transform.position.x / worldTransforms.length,
    y: sum.y + transform.position.y / worldTransforms.length,
    z: sum.z + transform.position.z / worldTransforms.length,
  }), { x: 0, y: 0, z: 0 });
  const group = normalizeVisualEnvironmentGroup({
    id: validID(options.id) ? options.id : createID(),
    name: options.name,
    transform: { ...defaultVisualEnvironmentTransform(), position },
  }, project.scene.environment.groups.length, new Set([
    ...project.scene.environment.groups.map((candidate) => candidate.id),
    ...project.scene.environment.visuals.map((visual) => visual.id),
  ]));
  const next = cloneProject(project);
  next.scene.environment.groups.push(group);
  for (let index = 0; index < visuals.length; index += 1) {
    const visual = next.scene.environment.visuals.find((candidate) => candidate.id === visuals[index].id);
    visual.groupID = group.id;
    visual.transform = visualEnvironmentLocalTransform(group.transform, worldTransforms[index]);
  }
  return touch(next);
}

export function updateVisualEnvironmentGroup(project, groupID, patch = {}) {
  const current = project.scene.environment.groups.find((group) => group.id === groupID);
  if (!current) return project;
  const onlyPresentation = Object.keys(patch).every((key) => ["visible", "locked"].includes(key));
  if (current.locked && !onlyPresentation) return project;
  const next = cloneProject(project);
  const group = next.scene.environment.groups.find((candidate) => candidate.id === groupID);
  if (patch.name !== undefined) group.name = cleanName(patch.name, group.name);
  if (patch.visible !== undefined) group.visible = Boolean(patch.visible);
  if (patch.locked !== undefined) group.locked = Boolean(patch.locked);
  if (patch.transform !== undefined) {
    const transform = normalizeVisualEnvironmentTransform(patch.transform, group.transform);
    const transformChanged = !visualEnvironmentTransformsMatch(group.transform, transform);
    group.transform = transform;
    if (transformChanged) {
      for (const visual of next.scene.environment.visuals.filter(
        (candidate) => candidate.groupID === groupID
      )) {
      }
    }
  }
  return touch(next);
}

export function assignVisualEnvironmentsToGroup(project, environmentIDsInput, groupIDInput = null) {
  const environmentIDs = uniqueValidIDs(environmentIDsInput);
  if (!environmentIDs.length) return project;
  const groupID = validID(groupIDInput) ? groupIDInput : null;
  const targetGroup = groupID
    ? project.scene.environment.groups.find((group) => group.id === groupID)
    : null;
  if (groupID && (!targetGroup || targetGroup.locked)) return project;
  const visuals = environmentIDs.map((id) => (
    project.scene.environment.visuals.find((visual) => visual.id === id)
  ));
  if (visuals.some((visual) => !visual || !visualEnvironmentEditable(project, visual))) return project;
  const worldTransforms = visuals.map((visual) => visualEnvironmentWorldTransform(project, visual));
  const next = cloneProject(project);
  for (let index = 0; index < visuals.length; index += 1) {
    const visual = next.scene.environment.visuals.find((candidate) => candidate.id === visuals[index].id);
    visual.groupID = groupID;
    visual.transform = targetGroup
      ? visualEnvironmentLocalTransform(targetGroup.transform, worldTransforms[index])
      : worldTransforms[index];
  }
  return touch(next);
}

export function dissolveVisualEnvironmentGroup(project, groupID) {
  const group = project.scene.environment.groups.find((candidate) => candidate.id === groupID);
  if (!group || group.locked) return project;
  const memberIDs = project.scene.environment.visuals
    .filter((visual) => visual.groupID === groupID)
    .map((visual) => visual.id);
  const detached = memberIDs.length
    ? assignVisualEnvironmentsToGroup(project, memberIDs, null)
    : project;
  const next = cloneProject(detached);
  next.scene.environment.groups = next.scene.environment.groups
    .filter((candidate) => candidate.id !== groupID);
  return touch(next);
}

export function removeVisualEnvironmentGroup(project, groupID) {
  const group = project.scene.environment.groups.find((candidate) => candidate.id === groupID);
  if (!group || group.locked) return project;
  const memberIDs = new Set(project.scene.environment.visuals
    .filter((visual) => visual.groupID === groupID)
    .map((visual) => visual.id));
  const next = cloneProject(project);
  next.scene.environment.groups = next.scene.environment.groups
    .filter((candidate) => candidate.id !== groupID);
  next.scene.environment.visuals = next.scene.environment.visuals
    .filter((visual) => !memberIDs.has(visual.id));
  
  return touch(next);
}

export function visualEnvironmentWorldTransform(project, visualInput) {
  const visual = typeof visualInput === "string"
    ? project.scene.environment.visuals.find((candidate) => candidate.id === visualInput)
    : visualInput;
  if (!visual) return null;
  const group = visual.groupID
    ? project.scene.environment.groups.find((candidate) => candidate.id === visual.groupID)
    : null;
  return group
    ? composeVisualEnvironmentTransforms(group.transform, visual.transform)
    : structuredClone(visual.transform);
}

export function setVisualEnvironmentAsset(project, assetInput, options = {}) {
  const next = cloneProject(project);
  const asset = normalizeEnvironmentAsset(assetInput, next.id);
  if (!asset) return project;
  const environmentID = validID(options.environmentID) ? options.environmentID : null;
  const currentIndex = environmentID
    ? next.scene.environment.visuals.findIndex((visual) => visual.id === environmentID)
    : -1;
  const current = currentIndex >= 0 ? next.scene.environment.visuals[currentIndex] : null;
  if (environmentID && !current) return project;
  if (current?.locked) return project;
  const visual = {
    id: current?.id || (validID(options.id) ? options.id : createID()),
    name: current?.name || cleanName(asset.sourceName, "环境模型"),
    asset,
    visible: current?.visible !== false,
    locked: current?.locked === true,
    appearance: current?.appearance || defaultVisualEnvironmentAppearance(),
    transform: options.transform !== undefined
      ? normalizeVisualEnvironmentTransform(options.transform, current?.transform)
      : current?.transform || defaultVisualEnvironmentTransform(),
    groupID: current?.groupID || null,
  };
  if (currentIndex >= 0) next.scene.environment.visuals[currentIndex] = visual;
  else next.scene.environment.visuals.push(visual);
  return touch(next);
}

export function renameVisualEnvironment(project, environmentID, name) {
  const current = project.scene.environment.visuals.find((visual) => visual.id === environmentID);
  if (!current || !visualEnvironmentEditable(project, current)) return project;
  const nextName = cleanName(name, current.name);
  if (nextName === current.name) return project;
  const next = cloneProject(project);
  next.scene.environment.visuals.find((visual) => visual.id === environmentID).name = nextName;
  return touch(next);
}

export function setVisualEnvironmentVisible(project, environmentID, visible) {
  const next = cloneProject(project);
  const visual = next.scene.environment.visuals.find((candidate) => candidate.id === environmentID);
  if (!visual || !visualEnvironmentEditable(project, visual)) return project;
  visual.visible = Boolean(visible);
  return touch(next);
}

export function setVisualEnvironmentLocked(project, environmentID, locked) {
  const next = cloneProject(project);
  const visual = next.scene.environment.visuals.find((candidate) => candidate.id === environmentID);
  if (!visual || visualEnvironmentGroupLocked(project, visual)) return project;
  visual.locked = Boolean(locked);
  return touch(next);
}

export function setVisualEnvironmentOpacity(project, environmentID, opacity) {
  const next = cloneProject(project);
  const visual = next.scene.environment.visuals.find((candidate) => candidate.id === environmentID);
  if (!visual || !visualEnvironmentEditable(project, visual)) return project;
  visual.appearance = {
    ...normalizeVisualEnvironmentAppearance(visual.appearance),
    opacity: clampFinite(opacity, 0, 1, 1),
  };
  return touch(next);
}

export function setVisualEnvironmentMaterialMode(project, environmentID, materialMode) {
  const next = cloneProject(project);
  const visual = next.scene.environment.visuals.find((candidate) => candidate.id === environmentID);
  if (!visual || !visualEnvironmentEditable(project, visual)) return project;
  visual.appearance = {
    ...normalizeVisualEnvironmentAppearance(visual.appearance),
    materialMode: materialMode === "gray" ? "gray" : "material",
  };
  return touch(next);
}

export function setVisualEnvironmentTransform(project, environmentID, transformInput) {
  const next = setVisualEnvironmentTransformOnly(project, environmentID, transformInput);
  if (next === project) return project;
  
  return touch(next);
}

export function removeVisualEnvironment(project, environmentID) {
  const next = cloneProject(project);
  const visual = next.scene.environment.visuals.find((candidate) => candidate.id === environmentID);
  if (!visual || !visualEnvironmentEditable(project, visual)) return project;
  next.scene.environment.visuals = next.scene.environment.visuals
    .filter((visual) => visual.id !== environmentID);
  return touch(next);
}

export function createBlockoutLayer(options = {}) {
  return {
    opacity: clampFinite(options.opacity, 0, 1, 1),
    visible: options.visible !== false,
    locked: options.locked === true,
    referenceImages: Array.isArray(options.referenceImages) ? structuredClone(options.referenceImages) : [],
    groups: Array.isArray(options.groups) ? structuredClone(options.groups) : [],
  };
}

export function setBlockoutLayerOpacity(project, opacity) {
  if (project.scene.blockout.locked === true) return project;
  const next = cloneProject(project);
  next.scene.blockout.opacity = clampFinite(opacity, 0, 1, next.scene.blockout.opacity ?? 1);
  return touch(next);
}

export function setBlockoutLayerVisible(project, visible) {
  const next = cloneProject(project);
  next.scene.blockout.visible = Boolean(visible);
  return touch(next);
}

export function setBlockoutLayerLocked(project, locked) {
  const next = cloneProject(project);
  next.scene.blockout.locked = Boolean(locked);
  return touch(next);
}

export function createBlockoutGroup(options = {}) {
  return {
    id: validID(options.id) ? options.id : createID(),
    name: cleanName(options.name, "空间锚点"),
    position: sanitizeBoundedVector(options.position, { x: 0, y: 0, z: 0 }),
    rotationY: normalizeAngle(Number(options.rotationY || 0)),
    scale: clampFinite(options.scale, 0.01, 1000, 1),
    opacity: clampFinite(options.opacity, 0, 1, 1),
    visible: options.visible !== false,
    locked: options.locked === true,
    
    semanticType: cleanSemanticType(options.semanticType, "landmark"),
    sourceReferenceID: validID(options.sourceReferenceID) ? options.sourceReferenceID : null,
    objects: Array.isArray(options.objects)
      ? options.objects.map((object, index) => createBlockoutObject({
          ...object,
          name: object?.name || `对象 ${index + 1}`,
        }))
      : [],
  };
}

export function normalizeBlockoutImage(input, projectID = input?.asset?.ref?.split("-assets/")[0]) {
  if (input == null) return null;
  const asset = normalizeReferenceImageAsset(input.asset, projectID);
  if (!asset) throw new Error("贴图必须引用本项目的 PNG、JPEG 或 WebP 图片");
  const x = clampFinite(input.crop?.x, 0, 0.9999, 0);
  const y = clampFinite(input.crop?.y, 0, 0.9999, 0);
  return { asset,
    position: sanitizeBoundedVector(input.position, { x: 0, y: 0.5, z: 0.002 }),
    rotation: sanitizeRotationVector(input.rotation, { x: 0, y: 0, z: 0 }),
    width: clampFinite(input.width, 0.001, 10000, 1),
    height: clampFinite(input.height, 0.001, 10000, 1),
    crop: { x, y, width: clampFinite(input.crop?.width, 0.0001, 1 - x, 1 - x), height: clampFinite(input.crop?.height, 0.0001, 1 - y, 1 - y) },
  };
}

export function createBlockoutObject(options = {}) {
  return {
    id: validID(options.id) ? options.id : createID(),
    name: cleanName(options.name, "布景对象"),
    image: normalizeBlockoutImage(options.image),
    position: sanitizeBoundedVector(options.position, { x: 0, y: 0, z: 0 }),
    rotationY: normalizeAngle(Number(options.rotationY || 0)),
    scale: clampFinite(options.scale, 0.01, 1000, 1),
    opacity: clampFinite(options.opacity, 0, 1, 1),
    visible: options.visible !== false,
    locked: options.locked === true,
    
    semanticType: cleanSemanticType(options.semanticType, "landmark"),
    confidence: clampFinite(options.confidence, 0, 1, 1),
    primitives: Array.isArray(options.primitives)
      ? options.primitives.map((primitive, index) => createBlockoutPrimitive({
          ...primitive,
          name: primitive?.name || `部件 ${index + 1}`,
        }))
      : [],
  };
}

export function createBlockoutPrimitive(options = {}) {
  const kind = blockoutPrimitiveKinds.includes(options.kind) ? options.kind : "box";
  const defaultRotation = kind === "plane"
    ? { x: -Math.PI / 2, y: 0, z: 0 }
    : { x: 0, y: 0, z: 0 };
  return {
    id: validID(options.id) ? options.id : createID(),
    name: cleanName(options.name, blockoutKindLabel(kind)),
    kind,
    position: sanitizeBoundedVector(options.position, { x: 0, y: kind === "plane" ? 0 : 0.5, z: 0 }),
    rotation: sanitizeRotationVector(options.rotation, defaultRotation),
    size: sanitizeSizeVector(options.size, defaultBlockoutPrimitiveSize(kind)),
    color: normalizeHexColor(options.color, "#8793a3"),
    opacity: clampFinite(options.opacity, 0, 1, 1),
    visible: options.visible !== false,
    locked: options.locked === true,
    
    semanticType: cleanSemanticType(options.semanticType, kind),
    confidence: clampFinite(options.confidence, 0, 1, 1),
  };
}

export function addBlockoutGroup(project, options = {}) {
  if (project.scene.blockout.locked === true) return project;
  const next = cloneProject(project);
  const group = createBlockoutGroup(options);
  const existingIDs = new Set(next.scene.blockout.groups.map((candidate) => candidate.id));
  if (existingIDs.has(group.id)) group.id = createID();
  group.name = uniqueEntityName(next.scene.blockout.groups, group.name);
  next.scene.blockout.groups.push(group);
  return touch(next);
}

export function updateBlockoutGroup(project, groupID, patch = {}) {
  const presentationOnly = Object.keys(patch).every((key) => ["visible", "locked"].includes(key));
  return updateBlockoutGroupInternal(project, groupID, (group) => ({
    ...group,
    name: Object.hasOwn(patch, "name") ? cleanName(patch.name, group.name) : group.name,
    position: Object.hasOwn(patch, "position")
      ? sanitizeBoundedVector(patch.position, group.position)
      : group.position,
    rotationY: Object.hasOwn(patch, "rotationY")
      ? normalizeAngle(Number(patch.rotationY))
      : group.rotationY,
    scale: Object.hasOwn(patch, "scale")
      ? clampFinite(patch.scale, 0.01, 1000, group.scale)
      : group.scale,
    opacity: Object.hasOwn(patch, "opacity")
      ? clampFinite(patch.opacity, 0, 1, group.opacity)
      : group.opacity,
    visible: Object.hasOwn(patch, "visible") ? Boolean(patch.visible) : group.visible,
    locked: Object.hasOwn(patch, "locked") ? Boolean(patch.locked) : group.locked,
    
    semanticType: Object.hasOwn(patch, "semanticType")
      ? cleanSemanticType(patch.semanticType, group.semanticType)
      : group.semanticType,
  }), { allowLocked: presentationOnly });
}

export function duplicateBlockoutGroup(project, groupID) {
  if (project.scene.blockout.locked === true) return project;
  const next = cloneProject(project);
  const source = next.scene.blockout.groups.find((group) => group.id === groupID);
  if (!source) return project;
  const duplicate = structuredClone(source);
  duplicate.id = createID();
  duplicate.name = uniqueEntityName(next.scene.blockout.groups, `${source.name} 副本`);
  duplicate.position = addVectors(source.position, { x: 0.5, y: 0, z: 0.5 });
  duplicate.locked = false;
  duplicate.objects = duplicate.objects.map((object) => ({
    ...object,
    id: createID(),
    locked: false,
    primitives: object.primitives.map((primitive) => ({
      ...primitive,
      id: createID(),
      locked: false,
    })),
  }));
  next.scene.blockout.groups.push(duplicate);
  return touch(next);
}

export function deleteBlockoutGroup(project, groupID) {
  if (project.scene.blockout.locked === true) return project;
  const next = cloneProject(project);
  const group = next.scene.blockout.groups.find((candidate) => candidate.id === groupID);
  if (!group || group.locked) return project;
  next.scene.blockout.groups = next.scene.blockout.groups.filter((candidate) => candidate.id !== groupID);
  return touch(next);
}

export function clearBlockout(project) {
  if (project.scene.blockout.locked === true) return project;
  const next = cloneProject(project);
  if (!next.scene.blockout.groups.length) return project;
  next.scene.blockout.groups = [];
  return touch(next);
}

export function addBlockoutObject(project, groupID, options = {}) {
  return updateBlockoutGroupInternal(project, groupID, (group) => {
    const object = createBlockoutObject({ ...options, image: normalizeBlockoutImage(options.image, project.id) });
    const existingIDs = new Set(group.objects.map((candidate) => candidate.id));
    if (existingIDs.has(object.id)) object.id = createID();
    object.name = uniqueEntityName(group.objects, object.name);
    return { ...group, objects: [...group.objects, object] };
  });
}

export function updateBlockoutObject(project, groupID, objectID, patch = {}) {
  const sourceGroup = project.scene.blockout.groups.find((group) => group.id === groupID);
  const sourceObject = sourceGroup?.objects.find((object) => object.id === objectID);
  const presentationOnly = Object.keys(patch).every((key) => ["visible", "locked"].includes(key));
  if (!sourceObject || (sourceObject.locked && !presentationOnly)) return project;
  return updateBlockoutGroupInternal(project, groupID, (group) => ({
    ...group,
    objects: group.objects.map((object) => {
      if (object.id !== objectID) return object;
      return {
        ...object,
        image: Object.hasOwn(patch, "image") ? normalizeBlockoutImage(patch.image, project.id) : object.image,
        name: Object.hasOwn(patch, "name") ? cleanName(patch.name, object.name) : object.name,
        position: Object.hasOwn(patch, "position")
          ? sanitizeBoundedVector(patch.position, object.position)
          : object.position,
        rotationY: Object.hasOwn(patch, "rotationY")
          ? normalizeAngle(Number(patch.rotationY))
          : object.rotationY,
        scale: Object.hasOwn(patch, "scale")
          ? clampFinite(patch.scale, 0.01, 1000, object.scale)
          : object.scale,
        opacity: Object.hasOwn(patch, "opacity")
          ? clampFinite(patch.opacity, 0, 1, object.opacity)
          : object.opacity,
        visible: Object.hasOwn(patch, "visible") ? Boolean(patch.visible) : object.visible,
        locked: Object.hasOwn(patch, "locked") ? Boolean(patch.locked) : object.locked,
        
        semanticType: Object.hasOwn(patch, "semanticType")
          ? cleanSemanticType(patch.semanticType, object.semanticType)
          : object.semanticType,
        confidence: Object.hasOwn(patch, "confidence")
          ? clampFinite(patch.confidence, 0, 1, object.confidence)
          : object.confidence,
      };
    }),
  }));
}

export function duplicateBlockoutObject(project, groupID, objectID) {
  return updateBlockoutGroupInternal(project, groupID, (group) => {
    const source = group.objects.find((object) => object.id === objectID);
    if (!source) return group;
    const duplicate = {
      ...structuredClone(source),
      id: createID(),
      name: uniqueEntityName(group.objects, `${source.name} 副本`),
      position: addVectors(source.position, { x: 0.25, y: 0, z: 0.25 }),
      locked: false,
      primitives: source.primitives.map((primitive) => ({
        ...structuredClone(primitive),
        id: createID(),
        locked: false,
      })),
    };
    return { ...group, objects: [...group.objects, duplicate] };
  });
}

export function deleteBlockoutObject(project, groupID, objectID) {
  return updateBlockoutGroupInternal(project, groupID, (group) => {
    const object = group.objects.find((candidate) => candidate.id === objectID);
    if (!object || object.locked) return group;
    return {
      ...group,
      objects: group.objects.filter((candidate) => candidate.id !== objectID),
    };
  });
}

// Primitive operations remain available for MCP geometry authoring, but primitives
// are implementation parts nested under one user-facing semantic object.
export function addBlockoutPrimitive(project, groupID, options = {}, objectID = null) {
  if (!objectID) {
    const primitive = createBlockoutPrimitive(options);
    const pivot = primitivePivot(primitive);
    return addBlockoutObject(project, groupID, {
      name: options.objectName || primitive.name,
      semanticType: options.objectSemanticType || primitive.semanticType,
      position: pivot.position,
      rotationY: pivot.rotationY,
      primitives: [primitiveRelativeToPivot(primitive, pivot)],
    });
  }
  return updateBlockoutObjectInternal(project, groupID, objectID, (object) => {
    const primitive = createBlockoutPrimitive(options);
    const existingIDs = new Set(object.primitives.map((candidate) => candidate.id));
    if (existingIDs.has(primitive.id)) primitive.id = createID();
    primitive.name = uniqueEntityName(object.primitives, primitive.name);
    return { ...object, primitives: [...object.primitives, primitive] };
  });
}

export function updateBlockoutPrimitive(project, groupID, primitiveID, patch = {}, objectID = null) {
  const match = findBlockoutPrimitive(project, groupID, primitiveID, objectID);
  if (!match) return project;
  const presentationOnly = Object.keys(patch).every((key) => ["visible", "locked"].includes(key));
  if (match.primitive.locked && !presentationOnly) return project;
  return updateBlockoutObjectInternal(project, groupID, match.object.id, (object) => ({
    ...object,
    primitives: object.primitives.map((primitive) => {
      if (primitive.id !== primitiveID) return primitive;
      const kind = blockoutPrimitiveKinds.includes(patch.kind) ? patch.kind : primitive.kind;
      return {
        ...primitive,
        name: Object.hasOwn(patch, "name") ? cleanName(patch.name, primitive.name) : primitive.name,
        kind,
        position: Object.hasOwn(patch, "position")
          ? sanitizeBoundedVector(patch.position, primitive.position)
          : primitive.position,
        rotation: Object.hasOwn(patch, "rotation")
          ? sanitizeRotationVector(patch.rotation, primitive.rotation)
          : primitive.rotation,
        size: Object.hasOwn(patch, "size")
          ? sanitizeSizeVector(patch.size, primitive.size)
          : primitive.size,
        color: Object.hasOwn(patch, "color")
          ? normalizeHexColor(patch.color, primitive.color)
          : primitive.color,
        opacity: Object.hasOwn(patch, "opacity")
          ? clampFinite(patch.opacity, 0, 1, primitive.opacity)
          : primitive.opacity,
        visible: Object.hasOwn(patch, "visible") ? Boolean(patch.visible) : primitive.visible,
        locked: Object.hasOwn(patch, "locked") ? Boolean(patch.locked) : primitive.locked,
        
        semanticType: Object.hasOwn(patch, "semanticType")
          ? cleanSemanticType(patch.semanticType, primitive.semanticType)
          : primitive.semanticType,
        confidence: Object.hasOwn(patch, "confidence")
          ? clampFinite(patch.confidence, 0, 1, primitive.confidence)
          : primitive.confidence,
      };
    }),
  }));
}

export function duplicateBlockoutPrimitive(project, groupID, primitiveID, objectID = null) {
  const match = findBlockoutPrimitive(project, groupID, primitiveID, objectID);
  if (!match) return project;
  return updateBlockoutObjectInternal(project, groupID, match.object.id, (object) => {
    const source = object.primitives.find((primitive) => primitive.id === primitiveID);
    if (!source) return object;
    const duplicate = {
      ...structuredClone(source),
      id: createID(),
      name: uniqueEntityName(object.primitives, `${source.name} 副本`),
      position: addVectors(source.position, { x: 0.25, y: 0, z: 0.25 }),
      locked: false,
    };
    return { ...object, primitives: [...object.primitives, duplicate] };
  });
}

export function deleteBlockoutPrimitive(project, groupID, primitiveID, objectID = null) {
  const match = findBlockoutPrimitive(project, groupID, primitiveID, objectID);
  if (!match) return project;
  return updateBlockoutObjectInternal(project, groupID, match.object.id, (object) => {
    const primitive = object.primitives.find((candidate) => candidate.id === primitiveID);
    if (!primitive || primitive.locked) return object;
    return {
      ...object,
      primitives: object.primitives.filter((candidate) => candidate.id !== primitiveID),
    };
  });
}

export function addBlockoutReferenceImage(project, assetInput, options = {}) {
  const next = cloneProject(project);
  const reference = normalizeBlockoutReferenceImage({
    id: options.id,
    name: options.name || assetInput?.sourceName,
    asset: assetInput,
    visible: options.visible,
    opacity: options.opacity,
    locked: options.locked,
    cameraPose: options.cameraPose,
  }, next.id, next.scene.blockout.referenceImages.length);
  if (!reference) return project;
  if (next.scene.blockout.referenceImages.some((candidate) => candidate.id === reference.id)) {
    reference.id = createID();
  }
  reference.name = uniqueEntityName(next.scene.blockout.referenceImages, reference.name);
  next.scene.blockout.referenceImages.push(reference);
  return touch(next);
}

export function updateBlockoutReferenceImage(project, referenceID, patch = {}) {
  const next = cloneProject(project);
  const index = next.scene.blockout.referenceImages.findIndex((reference) => reference.id === referenceID);
  if (index < 0) return project;
  const reference = next.scene.blockout.referenceImages[index];
  const presentationOnly = Object.keys(patch).every((key) => ["visible", "locked", "opacity"].includes(key));
  if (reference.locked && !presentationOnly) return project;
  next.scene.blockout.referenceImages[index] = {
    ...reference,
    name: Object.hasOwn(patch, "name") ? cleanName(patch.name, reference.name) : reference.name,
    visible: Object.hasOwn(patch, "visible") ? Boolean(patch.visible) : reference.visible,
    locked: Object.hasOwn(patch, "locked") ? Boolean(patch.locked) : reference.locked,
    opacity: Object.hasOwn(patch, "opacity")
      ? clampFinite(patch.opacity, 0.05, 1, reference.opacity)
      : reference.opacity,
    cameraPose: Object.hasOwn(patch, "cameraPose")
      ? normalizeOptionalCameraPose(patch.cameraPose)
      : reference.cameraPose,
  };
  return touch(next);
}

export function removeBlockoutReferenceImage(project, referenceID) {
  const next = cloneProject(project);
  const reference = next.scene.blockout.referenceImages.find((candidate) => candidate.id === referenceID);
  if (!reference || reference.locked) return project;
  next.scene.blockout.referenceImages = next.scene.blockout.referenceImages
    .filter((candidate) => candidate.id !== referenceID);
  for (const group of next.scene.blockout.groups) {
    if (group.sourceReferenceID === referenceID) group.sourceReferenceID = null;
  }
  return touch(next);
}

export function visualEnvironmentYawDegrees(visual) {
  return visualEnvironmentRotationDegrees(visual).yaw;
}

export function visualEnvironmentRotationDegrees(visual) {
  const quaternion = normalizeQuaternion(visual?.transform?.quaternion, identityQuaternion());
  const cosPitchHalf = Math.hypot(quaternion.w, quaternion.y);
  if (cosPitchHalf < 0.00000001) {
    return {
      pitch: 180,
      yaw: normalizeAngle(2 * Math.atan2(-quaternion.z, quaternion.x)) * 180 / Math.PI,
    };
  }
  const sinPitchHalf = (
    quaternion.w * quaternion.x - quaternion.y * quaternion.z
  ) / cosPitchHalf;
  return {
    pitch: normalizeAngle(2 * Math.atan2(sinPitchHalf, cosPitchHalf)) * 180 / Math.PI,
    yaw: normalizeAngle(2 * Math.atan2(quaternion.y, quaternion.w)) * 180 / Math.PI,
  };
}

export function visualEnvironmentQuaternionFromYawDegrees(degreesInput) {
  return visualEnvironmentQuaternionFromRotationDegrees({ yaw: degreesInput });
}

export function visualEnvironmentQuaternionFromRotationDegrees(rotationInput = {}) {
  const pitch = normalizeAngle(Number(rotationInput.pitch || 0) * Math.PI / 180);
  const yaw = normalizeAngle(Number(rotationInput.yaw || 0) * Math.PI / 180);
  const sinPitch = Math.sin(pitch / 2);
  const cosPitch = Math.cos(pitch / 2);
  const sinYaw = Math.sin(yaw / 2);
  const cosYaw = Math.cos(yaw / 2);
  return {
    x: cosYaw * sinPitch,
    y: sinYaw * cosPitch,
    z: -sinYaw * sinPitch,
    w: cosYaw * cosPitch,
  };
}

export function createCameraSetup(options = {}) {
  return {
    id: validID(options.id) ? options.id : createID(),
    name: cleanName(options.name, "机位 01"),
    pose: normalizeCameraPose(options.pose) || structuredClone(defaultDesktopCameraSetupPose),
    depthOfField: normalizeCameraDepthOfField(options.depthOfField),
    // 机位就是一次取景，取景不含画幅是不完整的：35mm 在 16:9 和 21:9 里不是同一个画。
    aspectRatio: normalizeAspectRatio(options.aspectRatio),
    
  };
}

export function addCameraSetup(project, options = {}) {
  const next = cloneProject(project);
  const setup = createCameraSetup({
    ...options,
    name: options.name
      ? uniqueEntityName(next.scene.cameraSetups, options.name)
      : nextSequentialCameraSetupName(next.scene.cameraSetups),
  });
  next.scene.cameraSetups.push(setup);
  return touch(next);
}

export function duplicateCameraSetup(project, cameraSetupID) {
  const next = cloneProject(project);
  const source = next.scene.cameraSetups.find((setup) => setup.id === cameraSetupID);
  if (!source) return project;
  next.scene.cameraSetups.push(createCameraSetup({
    ...structuredClone(source),
    id: createID(),
    name: uniqueEntityName(next.scene.cameraSetups, `${source.name} 副本`),
    
  }));
  return touch(next);
}

export function deleteCameraSetup(project, cameraSetupID) {
  if ((project?.scene?.cameraSetups?.length || 0) <= 1) return project;
  const next = cloneProject(project);
  const index = next.scene.cameraSetups.findIndex((setup) => setup.id === cameraSetupID);
  if (index < 0) return project;
  next.scene.cameraSetups.splice(index, 1);
  return touch(next);
}

export function renameCameraSetup(project, cameraSetupID, name) {
  return updateCameraSetup(project, cameraSetupID, (setup) => ({
    ...setup,
    name: cleanName(name, setup.name),
  }));
}

export function setCameraSetupPose(project, cameraSetupID, pose) {
  const normalizedPose = normalizeCameraPose(pose);
  if (!normalizedPose) return project;
  return updateCameraSetup(project, cameraSetupID, (setup) => ({
    ...setup,
    pose: normalizedPose,
  }));
}

export function setCameraSetupAspectRatio(project, cameraSetupID, aspectRatio) {
  return updateCameraSetup(project, cameraSetupID, (setup) => ({
    ...setup,
    aspectRatio: normalizeAspectRatio(aspectRatio, setup.aspectRatio),
  }));
}

export function setCameraSetupDepthOfField(project, cameraSetupID, depthOfFieldInput) {
  return updateCameraSetup(project, cameraSetupID, (setup) => ({
    ...setup,
    depthOfField: normalizeCameraDepthOfField(depthOfFieldInput),
  }));
}

export function findCameraSetup(project, cameraSetupID) {
  return project?.scene?.cameraSetups?.find((setup) => setup.id === cameraSetupID) || null;
}

export function createShot(options = {}) {
  const aspectRatio = normalizeAspectRatio(options.aspectRatio);
  const initialPose = normalizeCameraPose(options.cameraPose);
  return {
    id: options.id || createID(),
    name: cleanName(options.name, "Shot 01"),
    aspectRatio,
    takeDuration: normalizeTakeDuration(options.takeDuration),
    camera: {
      sensor: { ...desktopCameraSensor },
      depthOfField: normalizeCameraDepthOfField(options.depthOfField),
      modifiers: {
        handheld: normalizeCameraHandheld(options.handheld || defaultCameraHandheld),
      },
      
      track: createCameraTrack({
        interpolation: options.interpolation,
        keyframes: initialPose ? [{
          id: createID(),
          time: 0,
          ...initialPose,
          follow: normalizeCameraFollow(options.follow),
        }] : [],
      }),
    },
  };
}

export function addShot(project, options = {}) {
  const next = cloneProject(project);
  const shot = createShot({
    ...options,
    name: options.name ? uniqueShotName(next.scene.shots, options.name) : nextSequentialShotName(next.scene.shots),
    // 项目默认画幅说了算，不再沿用当前 Shot —— 否则第一个 Shot 之后这个设置
    // 就永远生效不了，「默认」形同虚设。显式传入的 aspectRatio 仍然最优先。
    aspectRatio: options.aspectRatio || next.output.defaultAspectRatio,
  });
  next.scene.shots.push(shot);
  next.scene.activeShotID = shot.id;
  return touch(next);
}

export function duplicateShot(project, shotID) {
  const next = cloneProject(project);
  const source = next.scene.shots.find((shot) => shot.id === shotID);
  if (!source) return project;
  const copy = structuredClone(source);
  copy.id = createID();
  copy.name = uniqueShotName(next.scene.shots, `${source.name} 副本`);
  const keyframeIDs = new Map(copy.camera.track.keyframes.map((keyframe) => [keyframe.id, createID()]));
  copy.camera.track = createCameraTrack({
    ...copy.camera.track,
    keyframes: copy.camera.track.keyframes.map((keyframe) => ({ ...keyframe, id: keyframeIDs.get(keyframe.id) })),
    segments: copy.camera.track.segments.map((segment) => ({
      ...segment,
      startKeyframeID: keyframeIDs.get(segment.startKeyframeID),
      endKeyframeID: keyframeIDs.get(segment.endKeyframeID),
    })),
  });
  const sourceIndex = next.scene.shots.findIndex((shot) => shot.id === shotID);
  next.scene.shots.splice(sourceIndex + 1, 0, copy);
  next.scene.activeShotID = copy.id;
  return touch(next);
}

export function deleteShot(project, shotID) {
  const next = cloneProject(project);
  const index = next.scene.shots.findIndex((shot) => shot.id === shotID);
  if (index < 0) return project;
  next.scene.shots.splice(index, 1);
  if (next.scene.activeShotID === shotID) {
    next.scene.activeShotID = next.scene.shots[Math.min(index, next.scene.shots.length - 1)]?.id || null;
  }
  return touch(next);
}

export function renameShot(project, shotID, name) {
  return updateShot(project, shotID, (shot) => ({ ...shot, name: cleanName(name, shot.name) }));
}

export function setActiveShot(project, shotID) {
  if (!project?.scene?.shots?.some((shot) => shot.id === shotID)) return project;
  const next = cloneProject(project);
  next.scene.activeShotID = shotID;
  return touch(next);
}

export function findShot(project, shotID = project?.scene?.activeShotID) {
  return project?.scene?.shots?.find((shot) => shot.id === shotID) || null;
}

// Schema v17: a Shot may store an explicit takeDuration output end (a live
// take's fixed length). Playback and every output path stop there; ordinary
// Shots keep the shared Scene End. The value is stored data, never inferred
// from track motion, because an intentionally static camera must not end a
// Shot.
function normalizeTakeDuration(input) {
  return Number.isFinite(input) && input > 0 ? Math.min(Number(input), 3600) : null;
}

export function shotOutputDuration(project, shot = findShot(project)) {
  const sceneSeconds = Math.max(Number(project?.scene?.duration?.seconds || 0), 0);
  const takeDuration = shot?.takeDuration;
  return Number.isFinite(takeDuration) && takeDuration > 0
    ? Math.min(sceneSeconds, takeDuration)
    : sceneSeconds;
}

export function setShotAspectRatio(project, shotID, aspectRatio) {
  return updateShot(project, shotID, (shot) => ({ ...shot, aspectRatio: normalizeAspectRatio(aspectRatio, shot.aspectRatio) }));
}

export function setShotCameraEndpoint(project, shotID, endpoint, pose, duration) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: recordCameraTrackEndpoint(shot.camera.track, endpoint, pose, duration),
    },
  }));
}

export function setShotCameraDuration(project, shotID, duration) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: { ...shot.camera, track: resizeCameraTrack(shot.camera.track, duration) },
  }));
}

export function setShotCameraInterpolation(project, shotID, interpolation) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: { ...shot.camera, track: setCameraTrackInterpolation(shot.camera.track, interpolation) },
  }));
}

export function setShotCameraSegmentInterpolation(project, shotID, startKeyframeID, interpolation) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: setCameraSegmentInterpolation(shot.camera.track, startKeyframeID, interpolation),
    },
  }));
}

export function setShotCameraTrack(project, shotID, trackInput) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: createCameraTrack({ ...trackInput, outTime: undefined }),
    },
  }));
}

export function setShotCameraHandheld(project, shotID, handheldInput) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      modifiers: {
        ...shot.camera.modifiers,
        handheld: normalizeCameraHandheld(handheldInput),
      },
    },
  }));
}

export function setShotCameraDepthOfField(project, shotID, depthOfFieldInput) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      depthOfField: normalizeCameraDepthOfField(depthOfFieldInput),
    },
  }));
}

export function normalizeCameraDepthOfField(input = {}) {
  return { enabled: input?.enabled === true };
}

export function recordShotCameraKeyframe(project, shotID, pose, time, frameRate = project?.output?.frameRate) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: recordCameraKeyframe(shot.camera.track, pose, time, frameRate),
    },
  }));
}

export function updateShotCameraKeyframe(project, shotID, keyframeID, pose) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: updateCameraKeyframe(shot.camera.track, keyframeID, pose),
    },
  }));
}

export function updateShotCameraKeyframeAim(project, shotID, keyframeID, aim) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: updateCameraKeyframeAim(shot.camera.track, keyframeID, aim),
    },
  }));
}

export function updateShotCameraKeyframeFollow(project, shotID, keyframeID, follow) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: updateCameraKeyframeFollow(shot.camera.track, keyframeID, follow),
    },
  }));
}

export function updateShotCameraKeyframeFocusTracking(
  project,
  shotID,
  keyframeID,
  focusTracking
) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: updateCameraKeyframeFocusTracking(
        shot.camera.track,
        keyframeID,
        focusTracking
      ),
    },
  }));
}

export function moveShotCameraKeyframe(project, shotID, keyframeID, time, frameRate = project?.output?.frameRate) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: moveCameraKeyframe(shot.camera.track, keyframeID, time, frameRate),
    },
  }));
}

export function deleteShotCameraKeyframe(project, shotID, keyframeID) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: deleteCameraKeyframe(shot.camera.track, keyframeID),
    },
  }));
}

export function moveShotCameraKeyframes(project, shotID, keyframeIDs, deltaTime, frameRate = project.output.frameRate) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: { ...shot.camera, track: moveCameraKeyframes(shot.camera.track, keyframeIDs, deltaTime, frameRate) },
  }));
}

export function deleteShotCameraKeyframes(project, shotID, keyframeIDs) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: { ...shot.camera, track: deleteCameraKeyframes(shot.camera.track, keyframeIDs) },
  }));
}

export function clearShotCameraTrack(project, shotID) {
  return updateShot(project, shotID, (shot) => ({
    ...shot,
    camera: { ...shot.camera, track: createCameraTrack() },
  }));
}

export function setProjectDefaultAspectRatio(project, aspectRatio) {
  const next = cloneProject(project);
  next.output.defaultAspectRatio = normalizeAspectRatio(aspectRatio, next.output.defaultAspectRatio);
  return touch(next);
}

export function setProjectFrameRate(project, frameRate) {
  const next = cloneProject(project);
  next.output.frameRate = normalizeFrameRate(frameRate, next.output.frameRate);
  return touch(next);
}

export function setExportResolution(project, resolution) {
  const next = cloneProject(project);
  next.output.resolution = normalizeResolution(resolution, next.output.resolution);
  return touch(next);
}

export function setProjectOutputFolder(project, folder) {
  const next = cloneProject(project);
  next.output.folder = normalizeOutputFolder(folder);
  return touch(next);
}

export function setManualSceneEnd(project, seconds) {
  const next = cloneProject(project);
  next.scene.duration = { mode: "manual", seconds: clampFinite(seconds, 0.2, 3600, next.scene.duration.seconds) };
  return touch(next);
}

export function retimeShotCameraTracks(project, secondsInput) {
  const seconds = clampFinite(secondsInput, 0.5, 3600, 0.5);
  const next = cloneProject(project);
  next.scene.shots = next.scene.shots.map((shot) => ({
    ...shot,
    camera: {
      ...shot.camera,
      track: cameraTrackDuration(shot.camera.track) > seconds
        ? resizeCameraTrack(shot.camera.track, seconds)
        : shot.camera.track,
    },
  }));
  return touch(next);
}

export function recordActorPoseKeyframe(project, actorID, time, pose, interpolation) {
  return updateActor(project, actorID, actor => {
    const poseTrack = recordActorPose(actor.poseTrack, time, pose, project.output.frameRate);
    if (interpolation) {
      const key = poseTrack.keyframes.find(key => Math.round(key.time * project.output.frameRate) === Math.round(time * project.output.frameRate));
      key.interpolation = interpolation;
    }
    return {...actor, poseTrack:createActorPoseTrack(poseTrack)};
  });
}
export function updateActorPoseKeyframe(project, actorID, keyframeID, pose) {
  return updateActor(project, actorID, actor => {
    const key=actor.poseTrack.keyframes.find(key=>key.id===keyframeID);
    if(!key)throw new Error("Actor keyframe not found: "+keyframeID);
    return {...actor,poseTrack:recordActorPose(actor.poseTrack,key.time,pose,project.output.frameRate)};
  });
}
export function moveActorPoseKeyframes(project, actorID, keyframeIDs, deltaTime) {
  return updateActor(project,actorID,actor=>({...actor,poseTrack:moveActorPoseFrames(actor.poseTrack,keyframeIDs,deltaTime,project.output.frameRate)}));
}
export function deleteActorPoseKeyframes(project,actorID,keyframeIDs) {
  const selected=new Set(keyframeIDs);
  return updateActor(project,actorID,actor=>({...actor,poseTrack:createActorPoseTrack({...actor.poseTrack,keyframes:actor.poseTrack.keyframes.filter(key=>!selected.has(key.id))})}));
}
export function setActorPoseInterpolation(project,actorID,interpolation) {
  return updateActor(project,actorID,actor=>({...actor,poseTrack:createActorPoseTrack({interpolation,keyframes:actor.poseTrack.keyframes.map(key=>({...key,interpolation}))})}));
}

export function sceneActorEnd(project) { return Math.max(0,...project.scene.actors.map(actorDuration)); }

export function sceneCameraEnd(project) {
  return Math.max(0, ...(project?.scene?.shots || []).map((shot) => cameraTrackDuration(shot.camera.track)));
}

export function findActor(project, actorID) {
  return project?.scene?.actors?.find((actor) => actor.id === actorID) || null;
}

export function cloneProject(project) {
  return structuredClone(normalizeDesktopProject(project));
}

export function createAnchorAction(position){return {id:createID(),kind:"hold",actionID:"idle",position:sanitizeVector(position,{x:0,y:0,z:0}),speed:defaultMoveSpeed,duration:0,facingY:null,locomotionGait:"walk",loopBehavior:"loop",...blockingPostureFields({kind:"hold"})};}

function createStayAction(position,options={}){return {id:createID(),kind:"hold",actionID:"idle",position:{...position},speed:defaultMoveSpeed,duration:clampFinite(options.duration,0,3600,1),facingY:Number.isFinite(options.facingY)?normalizeAngle(options.facingY):null,locomotionGait:"walk",loopBehavior:"loop",...blockingPostureFields({...options,kind:"hold"})};}

function normalizeActor(input, index, usedActorIDs, sourceVersion) {
  if ((sourceVersion ?? 0) < 66) input = {...input,poseTrack:migrateLegacyActorPoseTrack(input.poseTrack)};
  const legacyYawKeys = (sourceVersion ?? 0) < 68
    ? (input.poseTrack?.keyframes ?? []).filter(key => Object.hasOwn(key.pose,'rotationY')) : [];
  if (legacyYawKeys.length) {
    const initial = legacyYawKeys.find(key => key.time === 0);
    input = {...input, ...(initial ? {rotationY:initial.pose.rotationY} : {}),
      poseTrack:{...input.poseTrack,keyframes:input.poseTrack.keyframes.map(key=>{
        const {rotationY,...pose}=key.pose;
        return {...key,pose};
      }).filter(key=>Object.keys(key.pose).length)}};
  }
  const id = validID(input?.id) && !usedActorIDs.has(input.id) ? input.id : createID();
  usedActorIDs.add(id);
  const actor = createActor({ ...input, id, clothingColorIndex: input?.clothingColorIndex ?? index % clothingColors.length });
  const actions = Array.isArray(input?.motionActions) ? input.motionActions : [];
  const usedActionIDs = new Set();
  actor.motionActions = reflowMotionActions(blockingMotionActions(ensureAnchor(actions.map(action => normalizeAction(action, actor.position, usedActionIDs)), actor.position)), actor.position, actor.rotationY);
  if (legacyYawKeys.some(key=>key.time>0)) {
    const plan=compileBlockingPlayback(actor);
    for (const key of legacyYawKeys.filter(key=>key.time>0)) {
      const phase=plan.phases.find(phase=>key.time<phase.endTime);
      const yaw=phase?sampleBlockingPhase(phase,Math.max(0,key.time-phase.startTime)).rotationY:plan.finalRotationY;
      const pose={rotationYOffset:normalizeAngle(key.pose.rotationY-yaw)};
      const existing=actor.poseTrack.keyframes.find(frame=>frame.id===key.id);
      if(existing)Object.assign(existing.pose,pose);
      else actor.poseTrack.keyframes.push({...key,pose});
    }
    actor.poseTrack=createActorPoseTrack(actor.poseTrack);
  }
  if ((sourceVersion ?? 0) < 69) migrateSeatedFootAnchors(actor);
  return actor;
}

// Each path point uses its first seated Hold as the old placement reference.
// Subsequent Hold poses share that foot anchor, so standing clears the seat.
function migrateSeatedFootAnchors(actor) {
  const original=structuredClone(actor),plan=compileBlockingPlayback(original);
  let pointIndex=0;
  const migrated=new Set();
  for (const [index,action] of actor.motionActions.entries()) {
    if (action.kind==='move') pointIndex=index;
    if (action.kind!=='hold'||action.posture!=='sit'||action.duration<=0||migrated.has(pointIndex)) continue;
    const phase=plan.phases.find(phase=>phase.actionIndex===index);
    const sample=sampleActor(original,phase.startTime+Math.min(.25,phase.duration));
    const pose=sample.blockingPose,distance=.4*actor.scale;
    const localY=-distance*Math.sin(pose.rotationX),localZ=distance*Math.cos(pose.rotationX);
    const delta={x:localZ*Math.sin(pose.rotationY),y:localY,z:localZ*Math.cos(pose.rotationY)};
    const point=pointIndex===0?actor.position:actor.motionActions[pointIndex].position;
    for (const axis of ['x','y','z']) point[axis]+=delta[axis];
    // Preserve the seated heading when moving the incoming path endpoint changes its tangent.
    action.facingY=phase.endRotationY;
    migrated.add(pointIndex);
  }
  actor.motionActions=reflowMotionActions(actor.motionActions,actor.position,actor.rotationY);
}

function normalizeShot(input, index, usedShotIDs, fallbackAspectRatio) {
  const fallbackID = createID();
  const id = validID(input?.id) && !usedShotIDs.has(input.id) ? input.id : fallbackID;
  usedShotIDs.add(id);
  const legacyTrack = input?.camera?.track || input?.cameraTrack || {};
  const legacyKeyframes = Array.isArray(legacyTrack.keyframes)
    ? legacyTrack.keyframes
    : [
        legacyTrack.start ? { id: createID(), time: 0, ...legacyTrack.start } : null,
        legacyTrack.end ? { id: createID(), time: legacyTrack.duration || 4, ...legacyTrack.end } : null,
      ].filter(Boolean);
  const hasKeyframedFollow = legacyKeyframes.some((keyframe) => (
    keyframe && Object.hasOwn(keyframe, "follow")
  ));
  const hasKeyframedFocusTracking = legacyKeyframes.some((keyframe) => (
    keyframe && Object.hasOwn(keyframe, "focusTracking")
  ));
  const keyframes = legacyKeyframes.map((keyframe) => keyframe ? { ...keyframe } : keyframe);
  if (!hasKeyframedFollow) {
    const firstKeyframeIndex = keyframes.findIndex(Boolean);
    if (firstKeyframeIndex >= 0) {
      keyframes[firstKeyframeIndex].follow = normalizeCameraFollow(input?.camera?.follow);
    }
  }
  if (!hasKeyframedFocusTracking) {
    const firstKeyframeIndex = keyframes.findIndex(Boolean);
    if (firstKeyframeIndex >= 0) {
      keyframes[firstKeyframeIndex].focusTracking = normalizeCameraFocusTracking();
    }
  }
  return {
    id,
    name: cleanName(input?.name, `Shot ${String(index + 1).padStart(2, "0")}`),
    aspectRatio: normalizeAspectRatio(input?.aspectRatio, normalizeAspectRatio(fallbackAspectRatio)),
    takeDuration: normalizeTakeDuration(input?.takeDuration),
    camera: {
      sensor: { ...desktopCameraSensor },
      depthOfField: normalizeCameraDepthOfField(input?.camera?.depthOfField),
      modifiers: {
        handheld: normalizeCameraHandheld(
          input?.camera?.modifiers?.handheld ?? input?.camera?.handheld ?? defaultCameraHandheld
        ),
      },
      
      track: createCameraTrack({
        ...legacyTrack,
        outTime: undefined,
        interpolation: legacyTrack.interpolation || legacyTrack.easing,
        keyframes,
      }),
    },
  };
}

function normalizeCameraSetup(input, index, usedCameraSetupIDs, shots = []) {
  const fallbackID = `camera-setup-${String(index + 1).padStart(2, "0")}`;
  const id = validID(input?.id) && !usedCameraSetupIDs.has(input.id)
    ? input.id
    : usedCameraSetupIDs.has(fallbackID) ? createID() : fallbackID;
  usedCameraSetupIDs.add(id);
  
  return createCameraSetup({
    id,
    name: cleanName(input?.name, `机位 ${String(index + 1).padStart(2, "0")}`),
    pose: input?.pose,
    depthOfField: input?.depthOfField,
    // v28 及更早的机位没有画幅，normalizeAspectRatio 会落到 16:9。
    aspectRatio: input?.aspectRatio,
    
  });
}

function normalizeAction(input, fallbackPosition, usedActionIDs) {
  const kind = input?.kind === "move" ? "move" : "hold";
  const actionID = kind === "move" ? "walk" : "idle";
  if (input.actionID != null && input.actionID !== actionID) throw new Error("抽象人只支持移动和停留。");
  blockingMotionActions([{ ...input, kind, actionID, locomotionGait: input.locomotionGait ?? "walk", loopBehavior: input.loopBehavior ?? "loop" }]);
  const id = validID(input.id) && !usedActionIDs.has(input.id) ? input.id : createID();
  usedActionIDs.add(id);
  return { id, kind, actionID, position: sanitizeVector(input.position, fallbackPosition),
    speed: clampFinite(input.speed, minimumMoveSpeed, 20, defaultMoveSpeed),
    duration: kind === "hold" ? clampFinite(input.duration, 0, 3600, 0) : 0,
    facingY: Number.isFinite(input.facingY) ? normalizeAngle(input.facingY) : null,
    locomotionGait: "walk", loopBehavior: "loop", ...blockingPostureFields({ ...input, kind }) };
}

function ensureAnchor(actions, position) {
  const safeActions = Array.isArray(actions) ? actions.map((action) => ({ ...action, position: { ...action.position } })) : [];
  if (safeActions[0]?.kind !== "hold") safeActions.unshift(createAnchorAction(position));
  if (safeActions.length === 0) safeActions.push(createAnchorAction(position));
  safeActions[0] = {
    ...safeActions[0],
    kind: "hold",
    actionID: "idle",
    duration: 0,
    position: sanitizeVector(position, safeActions[0].position),
    loopBehavior: "loop",
  };
  delete safeActions[0].anchorSource;
  delete safeActions[0].sourceActionID;
  delete safeActions[0].intrinsicDisplacement;
  delete safeActions[0].incomingMovePhaseSync;
  delete safeActions[0].entryHeightY;
  return safeActions;
}

function reflowMotionActions(actionsInput, actorPosition, actorRotationY) {
  let position = { ...actorPosition };
  return ensureAnchor(actionsInput, actorPosition).map(action => {
    if (action.kind === "move") position = { ...action.position };
    return { ...action, position: { ...position } };
  });
}

function updateActor(project, actorID, updater, options = {}) {
  const next = cloneProject(project);
  const index = next.scene.actors.findIndex((actor) => actor.id === actorID);
  if (index < 0) return project;
  if (next.scene.actors[index].locked && options.allowLocked !== true) return project;
  const updated = updater(next.scene.actors[index]);
  if (!isBlockingActor(updated) && updated.motionActions.some((action) => action.posture != null || action.seatHeight != null)) {
    if (isBlockingActor(next.scene.actors[index]) && updated.motionActions.every((action) => action.posture == null || action.posture === "stand")) {
      updated.motionActions = updated.motionActions.map(({ posture, seatHeight, ...action }) => action);
    } else {
      throw new Error("停留姿势仅适用于抽象人，请先清除走位再切换角色。");
    }
  }
  if (isBlockingActor(updated)) {
    
    updated.motionActions = blockingMotionActions(updated.motionActions);
  }
  next.scene.actors[index] = {
    ...updated,
    motionActions: reflowMotionActions(
      updated.motionActions,
      updated.position,
      updated.rotationY
    ),
  };
  return touch(next);
}

function updateShot(project, shotID, updater) {
  const next = cloneProject(project);
  const index = next.scene.shots.findIndex((shot) => shot.id === shotID);
  if (index < 0) return project;
  next.scene.shots[index] = updater(next.scene.shots[index]);
  return touch(next);
}

function updateCameraSetup(project, cameraSetupID, updater) {
  const next = cloneProject(project);
  const index = next.scene.cameraSetups.findIndex((setup) => setup.id === cameraSetupID);
  if (index < 0) return project;
  next.scene.cameraSetups[index] = updater(next.scene.cameraSetups[index]);
  return touch(next);
}

function updateBlockoutGroupInternal(project, groupID, updater, options = {}) {
  if (project.scene.blockout.locked === true) return project;
  const next = cloneProject(project);
  const index = next.scene.blockout.groups.findIndex((group) => group.id === groupID);
  if (index < 0) return project;
  if (next.scene.blockout.groups[index].locked && options.allowLocked !== true) return project;
  next.scene.blockout.groups[index] = updater(next.scene.blockout.groups[index]);
  return touch(next);
}

function updateBlockoutObjectInternal(project, groupID, objectID, updater, options = {}) {
  return updateBlockoutGroupInternal(project, groupID, (group) => ({
    ...group,
    objects: group.objects.map((object) => {
      if (object.id !== objectID) return object;
      if (object.locked && options.allowLocked !== true) return object;
      return updater(object);
    }),
  }), options);
}

function findBlockoutPrimitive(project, groupID, primitiveID, objectID = null) {
  const group = project.scene.blockout.groups.find((candidate) => candidate.id === groupID);
  if (!group) return null;
  const object = objectID
    ? group.objects.find((candidate) => candidate.id === objectID)
    : group.objects.find((candidate) => (
        candidate.primitives.some((primitive) => primitive.id === primitiveID)
      ));
  const primitive = object?.primitives.find((candidate) => candidate.id === primitiveID);
  return object && primitive ? { group, object, primitive } : null;
}

function normalizeBlockoutLayer(input, projectID) {
  const referencesInput = Array.isArray(input?.referenceImages) ? input.referenceImages : [];
  const usedReferenceIDs = new Set();
  const referenceImages = referencesInput
    .map((reference, index) => normalizeBlockoutReferenceImage(reference, projectID, index, usedReferenceIDs))
    .filter(Boolean);
  const referenceIDs = new Set(referenceImages.map((reference) => reference.id));
  const usedGroupIDs = new Set();
  const groups = (Array.isArray(input?.groups) ? input.groups : [])
    .map((group, index) => normalizeBlockoutGroup(group, index, usedGroupIDs, referenceIDs, projectID));
  return {
    opacity: clampFinite(input?.opacity, 0, 1, 1),
    visible: input?.visible !== false,
    locked: input?.locked === true,
    referenceImages,
    groups,
  };
}

function normalizeBlockoutGroup(input, index, usedGroupIDs, referenceIDs, projectID) {
  let id = validID(input?.id) && !usedGroupIDs.has(input.id) ? input.id : createID();
  usedGroupIDs.add(id);
  const sourceObjects = Array.isArray(input?.objects)
    ? input.objects
    : migrateLegacyBlockoutObjects(input, id);
  const usedObjectIDs = new Set();
  const usedPrimitiveIDs = new Set();
  const objects = sourceObjects.map((object, objectIndex) => normalizeBlockoutObject(
    { ...object, image: normalizeBlockoutImage(object?.image, projectID) },
    objectIndex,
    usedObjectIDs,
    usedPrimitiveIDs,
    input
  ));
  return createBlockoutGroup({
    ...input,
    id,
    name: cleanName(input?.name, `空间锚点 ${index + 1}`),
    sourceReferenceID: referenceIDs.has(input?.sourceReferenceID) ? input.sourceReferenceID : null,
    objects,
  });
}

function normalizeBlockoutObject(input, index, usedObjectIDs, usedPrimitiveIDs, groupInput = null) {
  let id = validID(input?.id) && !usedObjectIDs.has(input.id) ? input.id : createID();
  usedObjectIDs.add(id);
  const primitives = (Array.isArray(input?.primitives) ? input.primitives : [])
    .map((primitive, primitiveIndex) => normalizeBlockoutPrimitive(
      primitive,
      primitiveIndex,
      usedPrimitiveIDs,
      groupInput
    ));
  return createBlockoutObject({
    ...input,
    id,
    name: cleanName(input?.name, `对象 ${index + 1}`),
    primitives,
  });
}

function normalizeBlockoutPrimitive(input, index, usedPrimitiveIDs, groupInput = null) {
  let id = validID(input?.id) && !usedPrimitiveIDs.has(input.id) ? input.id : createID();
  usedPrimitiveIDs.add(id);
  const groundLike = input?.kind === "plane" && [
    input?.semanticType,
    groupInput?.semanticType,
    input?.name,
    groupInput?.name,
  ].some((value) => /(^|[-_])(ground|floor)($|[-_])|地面|地板/i.test(String(value || "")));
  const position = groundLike
    ? { ...sanitizeBoundedVector(input?.position, { x: 0, y: 0, z: 0 }), y: 0 }
    : input?.position;
  return createBlockoutPrimitive({
    ...input,
    id,
    name: cleanName(input?.name, `几何体 ${index + 1}`),
    position,
  });
}

function migrateLegacyBlockoutObjects(groupInput, groupID) {
  const primitives = Array.isArray(groupInput?.primitives) ? groupInput.primitives : [];
  const buckets = new Map();
  for (const primitive of primitives) {
    const key = legacyBlockoutObjectKey(primitive);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(primitive);
  }
  const usedIDs = new Set();
  return [...buckets.entries()].map(([key, parts], index) => {
    const anchor = legacyBlockoutObjectAnchor(parts);
    const pivot = primitivePivot(anchor);
    let id = legacyBlockoutObjectID(groupID, key, index);
    while (usedIDs.has(id)) id = createID();
    usedIDs.add(id);
    return {
      id,
      name: legacyBlockoutObjectName(parts, index),
      position: pivot.position,
      rotationY: pivot.rotationY,
      scale: 1,
      opacity: 1,
      visible: parts.some((part) => part?.visible !== false),
      locked: parts.every((part) => part?.locked === true),
      
      semanticType: legacyBlockoutObjectSemanticType(parts),
      confidence: Math.max(...parts.map((part) => Number(part?.confidence ?? 1))),
      primitives: parts.map((part) => primitiveRelativeToPivot(part, pivot)),
    };
  });
}

function legacyBlockoutObjectKey(primitive) {
  const id = String(primitive?.id || "");
  const patterns = [
    ["banner", /^(banner-\d+)-(?:pole|cloth)$/i],
    ["tower", /^tower-(?:body|roof)-([a-z0-9]+)(?:-\d+)?$/i],
    ["brazier", /^(brazier-\d+)-(?:base|flame)$/i],
    ["smoke", /^(smoke-\d+)-(?:low|high)$/i],
  ];
  for (const [type, pattern] of patterns) {
    const match = pattern.exec(id);
    if (match) return `${type}:${match[1]}`;
  }
  return `primitive:${id || createID()}`;
}

function legacyBlockoutObjectAnchor(parts) {
  return parts.find((part) => /(?:pole|body|base|low)$/i.test(String(part?.id || "")))
    || parts[0]
    || {};
}

function legacyBlockoutObjectName(parts, index) {
  const name = cleanName(legacyBlockoutObjectAnchor(parts)?.name, `对象 ${index + 1}`);
  return name
    .replace(/\s*(旗杆|旗面|塔身|塔顶|下|上)$/, "")
    .trim() || name;
}

function legacyBlockoutObjectSemanticType(parts) {
  const values = parts.map((part) => String(part?.semanticType || ""));
  if (values.some((value) => value.startsWith("banner"))) return "banner";
  if (values.some((value) => value.startsWith("tower"))) return "tower";
  if (values.some((value) => ["brazier", "fire"].includes(value))) return "brazier";
  if (values.some((value) => value === "smoke")) return "smoke";
  return cleanSemanticType(values[0], "landmark");
}

function legacyBlockoutObjectID(groupID, key, index) {
  const suffix = key
    .replace(/^[^:]+:/, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || String(index + 1);
  return `${groupID}-${suffix}-object`.slice(0, 127);
}

function primitivePivot(primitive) {
  return {
    position: {
      x: Number(primitive?.position?.x || 0),
      y: 0,
      z: Number(primitive?.position?.z || 0),
    },
    rotationY: Number(primitive?.rotation?.y || 0),
  };
}

function primitiveRelativeToPivot(primitiveInput, pivot) {
  const primitive = createBlockoutPrimitive(primitiveInput);
  const dx = primitive.position.x - pivot.position.x;
  const dz = primitive.position.z - pivot.position.z;
  const cosine = Math.cos(-pivot.rotationY);
  const sine = Math.sin(-pivot.rotationY);
  return {
    ...primitive,
    position: {
      x: dx * cosine - dz * sine,
      y: primitive.position.y - pivot.position.y,
      z: dx * sine + dz * cosine,
    },
    rotation: {
      ...primitive.rotation,
      y: normalizeAngle(primitive.rotation.y - pivot.rotationY),
    },
  };
}

function normalizeBlockoutReferenceImage(input, projectID, index, usedReferenceIDs = new Set()) {
  if (!input || typeof input !== "object" || !validID(projectID)) return null;
  const asset = normalizeReferenceImageAsset(input.asset, projectID);
  if (!asset) return null;
  let id = validID(input.id) && !usedReferenceIDs.has(input.id) ? input.id : createID();
  usedReferenceIDs.add(id);
  return {
    id,
    name: cleanName(input.name, `参考图 ${index + 1}`),
    asset,
    visible: input.visible !== false,
    locked: input.locked === true,
    opacity: clampFinite(input.opacity, 0.05, 1, 0.55),
    cameraPose: normalizeOptionalCameraPose(input.cameraPose),
  };
}

function normalizeReferenceImageAsset(input, projectID) {
  if (!input || typeof input !== "object") return null;
  const expectedPrefix = `${projectID}-assets/`;
  const ref = typeof input.ref === "string" ? input.ref.trim() : "";
  if (!ref.startsWith(expectedPrefix)) return null;
  const fileName = ref.slice(expectedPrefix.length);
  if (!/^reference-[a-f0-9]{16}\.(?:png|jpe?g|webp)$/.test(fileName)) return null;
  const checksum = typeof input.checksum === "string" && /^[a-f0-9]{64}$/.test(input.checksum)
    ? input.checksum
    : null;
  return {
    ref,
    sourceName: cleanAssetSourceName(input.sourceName, "reference.png"),
    mimeType: ["image/png", "image/jpeg", "image/webp"].includes(input.mimeType)
      ? input.mimeType
      : fileName.endsWith(".png") ? "image/png" : fileName.endsWith(".webp") ? "image/webp" : "image/jpeg",
    width: clampInteger(input.width, 1, 32768, 1),
    height: clampInteger(input.height, 1, 32768, 1),
    sizeBytes: clampInteger(input.sizeBytes, 1, 32 * 1024 * 1024, 1),
    checksum,
  };
}

function normalizeOptionalCameraPose(input) {
  if (!input || typeof input !== "object") return null;
  return normalizeCameraPose({
    position: input.position,
    quaternion: input.quaternion,
    focalLength: input.focalLength,
  });
}

function normalizeVisualEnvironmentGroup(input, index, usedIDs) {
  let id = validID(input?.id) && !usedIDs.has(input.id) ? input.id : createID();
  while (usedIDs.has(id)) id = createID();
  usedIDs.add(id);
  return {
    id,
    name: cleanName(input?.name, `环境组 ${index + 1}`),
    visible: input?.visible !== false,
    locked: input?.locked === true,
    transform: normalizeVisualEnvironmentTransform(input?.transform),
  };
}

function normalizeVisualEnvironment(input, projectID, index, usedIDs, groupIDs = new Set()) {
  if (!input || typeof input !== "object") return null;
  const asset = normalizeEnvironmentAsset(input.asset, projectID);
  if (!asset) return null;
  let id = validID(input.id) && !usedIDs.has(input.id)
    ? input.id
    : legacyVisualEnvironmentID(asset, index);
  while (usedIDs.has(id)) id = createID();
  usedIDs.add(id);
  return {
    id,
    asset,
    name: cleanName(input.name, asset.sourceName),
    visible: input.visible !== false,
    locked: input.locked === true,
    appearance: normalizeVisualEnvironmentAppearance(input.appearance),
    transform: normalizeVisualEnvironmentTransform(input.transform),
    groupID: groupIDs.has(input.groupID) ? input.groupID : null,
  };
}

function legacyVisualEnvironmentID(asset, index) {
  const match = /(?:environment|gaussian)-([a-f0-9]{16})\.(?:glb|ply)$/.exec(
    asset.ref || asset.nodes?.[0]?.asset?.ref || ""
  );
  return `visual-${match?.[1] || String(index + 1).padStart(16, "0")}`;
}

function normalizeEnvironmentAsset(input, projectID) { return normalizeGlbEnvironmentAsset(input, projectID); }

function normalizeGlbEnvironmentAsset(input, projectID) {
  if (!input || typeof input !== "object" || !validID(projectID) || input.kind === "gaussian") return null;
  const expectedPrefix = `${projectID}-assets/`;
  const ref = typeof input.ref === "string" ? input.ref.trim() : "";
  if (!ref.startsWith(expectedPrefix)) return null;
  const fileName = ref.slice(expectedPrefix.length);
  if (!/^environment-[a-f0-9]{16}\.glb$/.test(fileName)) return null;
  const checksum = typeof input.checksum === "string" && /^[a-f0-9]{64}$/.test(input.checksum)
    ? input.checksum
    : null;
  const sourceName = cleanAssetSourceName(input.sourceName);
  return {
    ref,
    sourceName,
    sizeBytes: clampInteger(input.sizeBytes, 1, 256 * 1024 * 1024, 1),
    checksum,
  };
}

function normalizeVisualEnvironmentTransform(input, fallback = defaultVisualEnvironmentTransform()) {
  return {
    position: {
      x: clampFinite(input?.position?.x, -10000, 10000, fallback.position.x),
      y: clampFinite(input?.position?.y, -10000, 10000, fallback.position.y),
      z: clampFinite(input?.position?.z, -10000, 10000, fallback.position.z),
    },
    quaternion: normalizeQuaternion(input?.quaternion, fallback.quaternion),
    uniformScale: clampFinite(input?.uniformScale, 0.001, 1000, fallback.uniformScale),
  };
}

function composeVisualEnvironmentTransforms(parentInput, childInput) {
  const parent = normalizeVisualEnvironmentTransform(parentInput);
  const child = normalizeVisualEnvironmentTransform(childInput);
  const scaledPosition = {
    x: child.position.x * parent.uniformScale,
    y: child.position.y * parent.uniformScale,
    z: child.position.z * parent.uniformScale,
  };
  const rotatedPosition = rotateVector(parent.quaternion, scaledPosition);
  return {
    position: {
      x: parent.position.x + rotatedPosition.x,
      y: parent.position.y + rotatedPosition.y,
      z: parent.position.z + rotatedPosition.z,
    },
    quaternion: normalizeQuaternion(
      multiplyQuaternions(parent.quaternion, child.quaternion),
      identityQuaternion()
    ),
    uniformScale: parent.uniformScale * child.uniformScale,
  };
}

function visualEnvironmentLocalTransform(parentInput, worldInput) {
  const parent = normalizeVisualEnvironmentTransform(parentInput);
  const world = normalizeVisualEnvironmentTransform(worldInput);
  const inverse = inverseQuaternion(parent.quaternion);
  const delta = {
    x: world.position.x - parent.position.x,
    y: world.position.y - parent.position.y,
    z: world.position.z - parent.position.z,
  };
  const localPosition = rotateVector(inverse, delta);
  return normalizeVisualEnvironmentTransform({
    position: {
      x: localPosition.x / parent.uniformScale,
      y: localPosition.y / parent.uniformScale,
      z: localPosition.z / parent.uniformScale,
    },
    quaternion: multiplyQuaternions(inverse, world.quaternion),
    uniformScale: world.uniformScale / parent.uniformScale,
  });
}

function visualEnvironmentTransformsMatch(leftInput, rightInput, tolerance = 0.00001) {
  const left = normalizeVisualEnvironmentTransform(leftInput);
  const right = normalizeVisualEnvironmentTransform(rightInput);
  const positionMatches = ["x", "y", "z"].every(
    (axis) => Math.abs(left.position[axis] - right.position[axis]) <= tolerance
  );
  const quaternionDot = Math.abs(
    left.quaternion.x * right.quaternion.x
    + left.quaternion.y * right.quaternion.y
    + left.quaternion.z * right.quaternion.z
    + left.quaternion.w * right.quaternion.w
  );
  return positionMatches
    && Math.abs(left.uniformScale - right.uniformScale) <= tolerance
    && 1 - quaternionDot <= tolerance;
}

function setVisualEnvironmentTransformOnly(project, environmentID, transformInput) {
  const next = cloneProject(project);
  const visual = next.scene.environment.visuals.find((candidate) => candidate.id === environmentID);
  if (!visual || !visualEnvironmentEditable(project, visual)) return project;
  const transform = normalizeVisualEnvironmentTransform(transformInput, visual.transform);
  if (visualEnvironmentTransformsMatch(visual.transform, transform)) return project;
  visual.transform = transform;
  return touch(next);
}

function visualEnvironmentGroupLocked(project, visual) {
  return Boolean(visual?.groupID && project.scene.environment.groups.some(
    (group) => group.id === visual.groupID && group.locked
  ));
}

function visualEnvironmentEditable(project, visual) {
  return Boolean(visual && !visual.locked && !visualEnvironmentGroupLocked(project, visual));
}

function uniqueValidIDs(input) {
  return [...new Set((Array.isArray(input) ? input : []).filter(validID))];
}

function normalizeVisualEnvironmentAppearance(input, fallback = defaultVisualEnvironmentAppearance()) {
  
  return {
    opacity: clampFinite(input?.opacity, 0, 1, fallback.opacity),
    materialMode: input?.materialMode === "gray" ? "gray" : "material",
    
  };
}

function defaultVisualEnvironmentAppearance() {
  return {
    opacity: 1,
    materialMode: "material",
  };
}

function defaultVisualEnvironmentTransform() {
  return {
    position: { x: 0, y: 0, z: 0 },
    quaternion: identityQuaternion(),
    uniformScale: 1,
  };
}

function identityQuaternion() {
  return { x: 0, y: 0, z: 0, w: 1 };
}

function normalizeQuaternion(input, fallback) {
  const values = [input?.x, input?.y, input?.z, input?.w].map(Number);
  if (!values.every(Number.isFinite)) return { ...fallback };
  const length = Math.hypot(...values);
  if (length < 0.000001) return { ...fallback };
  // Preserve already-unit durable values exactly across V8 and JavaScriptCore.
  // Re-dividing them by an engine-specific last-bit Math.hypot result causes
  // false project changes when moving between Browser and native WKWebView.
  if (Math.abs(length - 1) <= 1e-12) {
    return { x: values[0], y: values[1], z: values[2], w: values[3] };
  }
  const normalized = values.map((value) => canonicalQuaternionComponent(value / length));
  return {
    x: normalized[0],
    y: normalized[1],
    z: normalized[2],
    w: normalized[3],
  };
}

function canonicalQuaternionComponent(value) {
  const rounded = Number(value.toPrecision(15));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function cleanAssetSourceName(value, fallback = "environment.glb") {
  if (typeof value !== "string") return fallback;
  const baseName = value.replaceAll("\\", "/").split("/").at(-1)?.trim() || fallback;
  return baseName.slice(0, 255) || fallback;
}

function touch(project) {
  project.modifiedAt = new Date().toISOString();
  return project;
}

function sanitizeVector(value, fallback) {
  return {
    x: Number.isFinite(Number(value?.x)) ? Number(value.x) : Number(fallback.x || 0),
    y: Number.isFinite(Number(value?.y)) ? Number(value.y) : Number(fallback.y || 0),
    z: Number.isFinite(Number(value?.z)) ? Number(value.z) : Number(fallback.z || 0),
  };
}

function sanitizeBoundedVector(value, fallback) {
  return {
    x: clampFinite(value?.x, -10000, 10000, fallback.x),
    y: clampFinite(value?.y, -10000, 10000, fallback.y),
    z: clampFinite(value?.z, -10000, 10000, fallback.z),
  };
}

function sanitizeRotationVector(value, fallback = { x: 0, y: 0, z: 0 }) {
  return {
    x: normalizeAngle(Number.isFinite(Number(value?.x)) ? Number(value.x) : fallback.x),
    y: normalizeAngle(Number.isFinite(Number(value?.y)) ? Number(value.y) : fallback.y),
    z: normalizeAngle(Number.isFinite(Number(value?.z)) ? Number(value.z) : fallback.z),
  };
}

function sanitizeSizeVector(value, fallback) {
  return {
    x: clampFinite(value?.x, 0.01, 10000, fallback.x),
    y: clampFinite(value?.y, 0.01, 10000, fallback.y),
    z: clampFinite(value?.z, 0.01, 10000, fallback.z),
  };
}

function defaultBlockoutPrimitiveSize(kind) {
  if (kind === "plane") return { x: 2, y: 2, z: 1 };
  if (kind === "wedge") return { x: 2, y: 1, z: 2 };
  return { x: 1, y: 1, z: 1 };
}

function blockoutKindLabel(kind) {
  return {
    box: "立方体",
    sphere: "球体",
    cylinder: "圆柱",
    cone: "圆锥",
    torus: "圆环",
    plane: "平面",
    wedge: "斜顶",
  }[kind] || "几何体";
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return /^#[a-fA-F0-9]{6}$/.test(color) ? color.toLowerCase() : fallback;
}

function cleanSemanticType(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 64);
  return normalized || fallback;
}

function addVectors(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtractVectors(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function clampFinite(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function normalizeIncomingMovePhaseSync(value) {
  const predecessorActionID = typeof value?.predecessorActionID === "string"
    ? value.predecessorActionID.trim()
    : "";
  const exitPhaseSeconds = Number(value?.exitPhaseSeconds);
  if (
    !isDesktopActionID(predecessorActionID)
    || !Number.isFinite(exitPhaseSeconds)
  ) {
    return null;
  }
  return {
    predecessorActionID,
    exitPhaseSeconds: Math.max(0, Math.min(3600, exitPhaseSeconds)),
  };
}

function cleanName(value, fallback) {
  const name = typeof value === "string" ? value.trim().slice(0, 80) : "";
  return name || fallback;
}

function normalizeAspectRatio(value, fallback = defaultDesktopAspectRatio) {
  return desktopAspectRatios.includes(value) ? value : fallback;
}

function normalizeFrameRate(value, fallback = defaultDesktopFrameRate) {
  const number = Number(value);
  return desktopFrameRates.includes(number) ? number : fallback;
}

function normalizeResolution(value, fallback = defaultDesktopResolution) {
  return {
    width: clampInteger(value?.width, 1, 16384, fallback.width),
    height: clampInteger(value?.height, 1, 16384, fallback.height),
  };
}

function normalizeOutputFolder(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.startsWith("/") && cleaned.length <= 4096 ? cleaned : null;
}

function uniqueShotName(shots, requestedName) {
  return uniqueEntityName(shots, requestedName);
}

function uniqueEntityName(items, requestedName) {
  const names = new Set(items.map((item) => item.name));
  if (!names.has(requestedName)) return requestedName;
  let suffix = 2;
  while (names.has(`${requestedName} ${suffix}`)) suffix += 1;
  return `${requestedName} ${suffix}`;
}

function nextSequentialCameraSetupName(setups) {
  const highest = setups.reduce((maximum, setup) => {
    const match = /^机位 (\d+)$/.exec(setup.name);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `机位 ${String(highest + 1).padStart(2, "0")}`;
}

function nextSequentialShotName(shots) {
  const highest = shots.reduce((maximum, shot) => {
    const match = /^Shot (\d+)$/.exec(shot.name);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `Shot ${String(highest + 1).padStart(2, "0")}`;
}

function validID(value) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]{5,127}$/.test(value);
}

function validDateString(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function migrateDesktopV1ColorIndex(value) {
  const legacyIndex = clampInteger(value, 0, 5, 0);
  return [2, 0, 1, 3, 4, 2][legacyIndex];
}

function nextMoveTarget(actions, startIndex, fromPosition) {
  for (let index = startIndex; index < actions.length; index += 1) {
    const action = actions[index];
    if (action.kind !== "move") continue;
    const dx = action.position.x - fromPosition.x;
    const dz = action.position.z - fromPosition.z;
    if (dx * dx + dz * dz > 0.000001) return action.position;
  }
  return null;
}

function headingBetween(from, to) {
  return normalizeAngle(Math.atan2(to.x - from.x, to.z - from.z));
}
