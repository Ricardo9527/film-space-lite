import { recordActorPoseKeyframe, updateActorPoseKeyframe, moveActorPoseKeyframes, deleteActorPoseKeyframes, setActorPoseInterpolation } from "./project-model.js";
import { isBlockingActor } from "./blocking-actor.js";
import { setProjectDefaultAspectRatio } from "./project-model.js";
import { addActor, addBlockoutGroup, addBlockoutObject, addBlockoutPrimitive, addBlockoutReferenceImage, addCameraSetup, addMoveAction, addShot, addStayAction, clearMotion, clearBlockout, canInsertStayActionBefore, createVisualEnvironmentGroup, deleteActor, deleteBlockoutGroup, deleteBlockoutObject, deleteBlockoutPrimitive, deleteCameraSetup, deleteShot, deleteShotCameraKeyframe, deleteShotCameraKeyframes, desktopActions, duplicateActor, duplicateBlockoutGroup, duplicateBlockoutObject, duplicateBlockoutPrimitive, duplicateCameraSetup, duplicateShot, faceActionTowardNextTarget, faceActorTowardNextTarget, findActor, insertStayActionBefore, movePerformanceWithinPoint, moveShotCameraKeyframe, moveShotCameraKeyframes, normalizeDesktopProject, recordShotCameraKeyframe, removeBlockoutReferenceImage, removeMotionAction, removeVisualEnvironment, assignVisualEnvironmentsToGroup, dissolveVisualEnvironmentGroup, renameCameraSetup, renameProject, renameShot, retimeShotCameraTracks, setActiveShot, setActorLocked, setActorOrPairedRoleTransform, setActorProperty, setActorVisible, setBlockoutLayerLocked, setBlockoutLayerOpacity, setBlockoutLayerVisible, setCameraSetupAspectRatio, setCameraSetupDepthOfField, setCameraSetupPose, setManualSceneEnd, setPathPointPosition, setProjectFrameRate, setProjectOutputFolder, setSceneGroundVisible, setShotAspectRatio, setShotCameraDuration, setShotCameraDepthOfField, setShotCameraHandheld, setShotCameraInterpolation, setShotCameraSegmentInterpolation, setVisualEnvironmentAsset, setVisualEnvironmentLocked, setVisualEnvironmentMaterialMode, setVisualEnvironmentOpacity, setVisualEnvironmentTransform, setVisualEnvironmentVisible, renameVisualEnvironment, updateBlockoutGroup, updateBlockoutObject, updateBlockoutPrimitive, updateBlockoutReferenceImage, updateMotionAction, updateVisualEnvironmentGroup, updateShotCameraKeyframe, updateShotCameraKeyframeAim, updateShotCameraKeyframeFollow, updateShotCameraKeyframeFocusTracking } from "./project-model.js";
import { normalizeAngle } from "./scene-model.js";
import { actionSourceRange, minimumActionSourceSpan } from "./action-trim.js";
import { applySemanticProjectPatch } from "./semantic-project-patch.js";
import {
  filmSpaceOperationActions,
  filmSpaceEditorOperationActions,
  filmSpaceOperationContracts,
  filmSpaceOperationDefinitions,
  filmSpaceOperationDomains,
  filmSpaceOperationBatchSchema,
  validateFilmSpaceOperation,
} from "./project-command-contracts.js";

export {
  filmSpaceOperationActions,
  filmSpaceEditorOperationActions,
  filmSpaceOperationContracts,
  filmSpaceOperationDefinitions,
  filmSpaceOperationDomains,
  filmSpaceOperationBatchSchema,
  validateFilmSpaceOperation,
};

export function applyFilmSpaceOperations(projectInput, operationsInput) {
  const operations = Array.isArray(operationsInput) ? operationsInput : [];
  if (!operations.length) throw commandError("At least one Film Space operation is required");
  if (operations.length > 200) throw commandError("A Film Space operation batch may contain at most 200 operations");

  let project = normalizeDesktopProject(projectInput);
  const results = [];
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (!operation || typeof operation !== "object") {
      throw commandError(`Operation ${index + 1} must be an object`);
    }
    const action = String(operation.action || "");
    const supportedActions = [...filmSpaceOperationActions, ...filmSpaceEditorOperationActions];
    if (!supportedActions.includes(action)) {
      throw commandError(`Unsupported Film Space operation: ${action || "(missing)"}`);
    }
    const definition = validateFilmSpaceOperation(operation, supportedActions);
    validateOperationSemantics(project, operation);
    const before = project;
    const beforeIDs = entityIDSets(before);
    project = applyOne(project, operation);
    const normalized = normalizeDesktopProject(project);
    const changed = normalized !== before && JSON.stringify(normalized) !== JSON.stringify(before);
    project = normalized;
    results.push({
      index,
      action,
      domain: definition.domain,
      changed,
      created: createdIDs(beforeIDs, entityIDSets(project)),
      ...(!changed ? {
        warning: "No durable value changed. Re-read the target; it may already match, be locked, or no longer exist.",
      } : {}),
    });
  }
  return { project, results };
}

function applyOne(project, operation) {
  switch (operation.action) {
    case "patch_project_fields":
      return applySemanticProjectPatch(project, operation.changes);
    case "rename_project":
      return renameProject(project, operation.name);
    case "set_frame_rate":
      return setProjectFrameRate(project, operation.frameRate);
    case "set_project_aspect_ratio":
      return setProjectDefaultAspectRatio(project, operation.aspectRatio);
    case "set_output_folder":
      return setProjectOutputFolder(project, operation.folder);
    case "set_scene_end":
      return setManualSceneEnd(project, operation.seconds);
    case "retime_camera_to_scene_end":
      return retimeShotCameraTracks(project, operation.seconds);
    case "record_actor_pose_keyframe":
      return recordActorPoseKeyframe(project,operation.actorID,operation.time,operation.pose,operation.interpolation);
    case "update_actor_pose_keyframe":
      return updateActorPoseKeyframe(project,operation.actorID,operation.keyframeID,operation.pose);
    case "move_actor_pose_keyframes":
      return moveActorPoseKeyframes(project,operation.actorID,operation.keyframeIDs,operation.deltaTime);
    case "delete_actor_pose_keyframes":
      return deleteActorPoseKeyframes(project,operation.actorID,operation.keyframeIDs);
    case "set_actor_pose_interpolation":
      return setActorPoseInterpolation(project,operation.actorID,operation.interpolation);
    case "add_actor":
      return addActor(project, operation.value || operation);
    case "duplicate_actor":
      return duplicateActor(project, requiredID(operation, "id"));
    case "delete_actor":
      return deleteActor(project, requiredID(operation, "id"));
    case "set_actor_visible":
      return setActorVisible(project, requiredID(operation, "id"), operation.visible);
    case "set_actor_locked":
      return setActorLocked(project, requiredID(operation, "id"), operation.locked);
    case "set_actor_transform":
      return setActorOrPairedRoleTransform(
        project,
        requiredID(operation, "id"),
        operation.position,
        operation.rotationY
      );
    case "set_actor_property":
      return setActorProperty(project, requiredID(operation, "id"), operation.key, operation.value);
    case "place_actor_relative":
      return placeActorRelative(project, operation);
    case "arrange_actors":
      return arrangeActors(project, operation);
    case "orient_actor_toward":
      return orientActorToward(project, operation);
    case "face_actor_to_next_move":
      return faceActorTowardNextTarget(project, requiredID(operation, "id"));
    case "add_move":
      return addMoveAction(project, requiredID(operation, "actorID"), operation.target, operation.options);
    case "add_stay":
      return addStayAction(project, requiredID(operation, "actorID"), operation.options);
    case "insert_stay_before":
      return insertStayActionBefore(
        project,
        requiredID(operation, "actorID"),
        requiredID(operation, "targetActionID"),
        operation.options
      );
    
    
    
    
    case "update_motion_action":
      return applyMotionActionPatch(project, operation);
    case "remove_motion_action":
      return removeMotionAction(project, requiredID(operation, "actorID"), requiredID(operation, "actionID"));
    case "clear_motion":
      return clearMotion(project, requiredID(operation, "actorID"));
    case "move_performance":
      return movePerformanceWithinPoint(
        project,
        requiredID(operation, "actorID"),
        requiredID(operation, "actionID"),
        operation.direction
      );
    case "set_path_point":
      return setPathPointPosition(
        project,
        requiredID(operation, "actorID"),
        requiredID(operation, "pointID"),
        operation.position
      );
    case "face_action_to_next_move":
      return faceActionTowardNextTarget(
        project,
        requiredID(operation, "actorID"),
        requiredID(operation, "actionID")
      );
    case "add_camera_setup":
      return addCameraSetup(project, operation.value || operation);
    case "duplicate_camera_setup":
      return duplicateCameraSetup(project, requiredID(operation, "id"));
    case "delete_camera_setup":
      return deleteCameraSetup(project, requiredID(operation, "id"));
    case "rename_camera_setup":
      return renameCameraSetup(project, requiredID(operation, "id"), operation.name);
    case "set_camera_setup_pose":
      return setCameraSetupPose(project, requiredID(operation, "id"), operation.pose);
    case "set_camera_setup_aspect":
      return setCameraSetupAspectRatio(
        project,
        requiredID(operation, "id"),
        operation.aspectRatio
      );
    case "set_camera_setup_depth_of_field":
      return setCameraSetupDepthOfField(
        project,
        requiredID(operation, "id"),
        operation.depthOfField
      );
    case "add_shot":
      return addShot(project, operation.value || operation);
    case "duplicate_shot":
      return duplicateShot(project, requiredID(operation, "id"));
    case "delete_shot":
      return deleteShot(project, requiredID(operation, "id"));
    case "rename_shot":
      return renameShot(project, requiredID(operation, "id"), operation.name);
    case "set_active_shot":
      return setActiveShot(project, requiredID(operation, "id"));
    case "set_shot_aspect":
      return setShotAspectRatio(project, requiredID(operation, "id"), operation.aspectRatio);
    case "set_shot_duration":
      return setShotCameraDuration(project, requiredID(operation, "id"), operation.duration);
    case "set_shot_interpolation":
      return setShotCameraInterpolation(project, requiredID(operation, "id"), operation.interpolation);
    case "set_shot_segment_interpolation":
      return setShotCameraSegmentInterpolation(
        project,
        requiredID(operation, "id"),
        requiredID(operation, "keyframeID"),
        operation.interpolation
      );
    case "set_shot_handheld":
      return setShotCameraHandheld(project, requiredID(operation, "id"), operation.handheld);
    case "set_shot_depth_of_field":
      return setShotCameraDepthOfField(project, requiredID(operation, "id"), operation.depthOfField);
    case "record_camera_keyframe":
      return recordShotCameraKeyframe(
        project,
        requiredID(operation, "shotID"),
        operation.pose,
        operation.time,
        operation.frameRate
      );
    case "update_camera_keyframe":
      return updateShotCameraKeyframe(
        project,
        requiredID(operation, "shotID"),
        requiredID(operation, "keyframeID"),
        operation.pose
      );
    case "update_camera_keyframe_aim":
      return updateShotCameraKeyframeAim(
        project,
        requiredID(operation, "shotID"),
        requiredID(operation, "keyframeID"),
        operation.aim
      );
    case "update_camera_keyframe_follow":
      return updateShotCameraKeyframeFollow(
        project,
        requiredID(operation, "shotID"),
        requiredID(operation, "keyframeID"),
        operation.follow
      );
    case "update_camera_keyframe_focus_tracking":
      return updateShotCameraKeyframeFocusTracking(
        project,
        requiredID(operation, "shotID"),
        requiredID(operation, "keyframeID"),
        operation.focusTracking
      );
    case "move_camera_keyframe":
      return moveShotCameraKeyframe(
        project,
        requiredID(operation, "shotID"),
        requiredID(operation, "keyframeID"),
        operation.time,
        operation.frameRate
      );
    case "move_camera_keyframes":
      return moveShotCameraKeyframes(project, operation.shotID, operation.keyframeIDs, operation.deltaTime, operation.frameRate);
    case "delete_camera_keyframes":
      return deleteShotCameraKeyframes(project, operation.shotID, operation.keyframeIDs);
    case "delete_camera_keyframe":
      return deleteShotCameraKeyframe(
        project,
        requiredID(operation, "shotID"),
        requiredID(operation, "keyframeID")
      );
    case "set_ground_visible":
      return setSceneGroundVisible(project, operation.visible);
    case "set_blockout_layer_visible":
      return setBlockoutLayerVisible(project, operation.visible);
    case "set_blockout_layer_locked":
      return setBlockoutLayerLocked(project, operation.locked);
    case "set_blockout_layer_opacity":
      return setBlockoutLayerOpacity(project, operation.opacity);
    case "clear_blockout":
      return clearBlockout(project);
    case "set_visual_environment_asset":
      return setVisualEnvironmentAsset(project, operation.asset, { id: operation.id });
    case "replace_visual_environment_asset":
      return setVisualEnvironmentAsset(project, operation.asset, {
        environmentID: requiredID(operation, "environmentID"),
      });
    case "set_visual_environment_visible":
      return setVisualEnvironmentVisible(project, requiredID(operation, "environmentID"), operation.visible);
    case "rename_visual_environment":
      return renameVisualEnvironment(project, requiredID(operation, "environmentID"), operation.name);
    case "set_visual_environment_locked":
      return setVisualEnvironmentLocked(project, requiredID(operation, "environmentID"), operation.locked);
    case "set_visual_environment_opacity":
      return setVisualEnvironmentOpacity(project, requiredID(operation, "environmentID"), operation.opacity);
    case "set_visual_environment_material_mode":
      return setVisualEnvironmentMaterialMode(project, requiredID(operation, "environmentID"), operation.materialMode);
    case "set_visual_environment_transform":
      return setVisualEnvironmentTransform(project, requiredID(operation, "environmentID"), operation.transform);
    case "remove_visual_environment":
      return removeVisualEnvironment(project, requiredID(operation, "environmentID"));
    case "add_visual_environment_group":
      return createVisualEnvironmentGroup(project, operation.environmentIDs, {
        id: operation.id,
        name: operation.name,
      });
    case "update_visual_environment_group":
      return updateVisualEnvironmentGroup(
        project,
        requiredID(operation, "groupID"),
        operation.patch
      );
    case "assign_visual_environments_to_group":
      return assignVisualEnvironmentsToGroup(
        project,
        operation.environmentIDs,
        operation.groupID
      );
    case "dissolve_visual_environment_group":
      return dissolveVisualEnvironmentGroup(project, requiredID(operation, "groupID"));
    
    
    
    
    
    
    case "attach_reference_image":
      return addBlockoutReferenceImage(project, operation.asset, operation.options);
    case "update_reference_image":
      return updateBlockoutReferenceImage(project, requiredID(operation, "id"), operation.patch);
    case "remove_reference_image":
      return removeBlockoutReferenceImage(project, requiredID(operation, "id"));
    case "add_blockout_group":
      return addBlockoutGroup(project, operation.value || operation);
    case "update_blockout_group":
      return updateBlockoutGroup(project, requiredID(operation, "id"), operation.patch);
    case "duplicate_blockout_group":
      return duplicateBlockoutGroup(project, requiredID(operation, "id"));
    case "delete_blockout_group":
      return deleteBlockoutGroup(project, requiredID(operation, "id"));
    case "add_blockout_object":
      return addBlockoutObject(project, requiredID(operation, "groupID"), operation.value || operation);
    case "update_blockout_object":
      return updateBlockoutObject(
        project,
        requiredID(operation, "groupID"),
        requiredID(operation, "objectID"),
        operation.patch
      );
    case "duplicate_blockout_object":
      return duplicateBlockoutObject(
        project,
        requiredID(operation, "groupID"),
        requiredID(operation, "objectID")
      );
    case "delete_blockout_object":
      return deleteBlockoutObject(
        project,
        requiredID(operation, "groupID"),
        requiredID(operation, "objectID")
      );
    case "add_blockout_primitive":
      return addBlockoutPrimitive(
        project,
        requiredID(operation, "groupID"),
        operation.value || operation,
        optionalID(operation, "objectID")
      );
    case "update_blockout_primitive":
      return updateBlockoutPrimitive(
        project,
        requiredID(operation, "groupID"),
        requiredID(operation, "primitiveID"),
        operation.patch,
        optionalID(operation, "objectID")
      );
    case "duplicate_blockout_primitive":
      return duplicateBlockoutPrimitive(
        project,
        requiredID(operation, "groupID"),
        requiredID(operation, "primitiveID"),
        optionalID(operation, "objectID")
      );
    case "delete_blockout_primitive":
      return deleteBlockoutPrimitive(
        project,
        requiredID(operation, "groupID"),
        requiredID(operation, "primitiveID"),
        optionalID(operation, "objectID")
      );
    case "place_blockout_relative":
      return placeBlockoutRelative(project, operation);
    case "arrange_blockout_groups":
      return arrangeBlockoutGroups(project, operation);
    default:
      throw commandError(`Unsupported Film Space operation: ${operation.action}`);
  }
}

function applyMotionActionPatch(project, operation) {
  const actorID = requiredID(operation, "actorID");
  const actionID = requiredID(operation, "actionID");
  const patch = operation.patch || {};
  const { actionID: catalogActionID, ...explicitOverrides } = patch;
  let next = project;
  if (catalogActionID !== undefined) {
    next = updateMotionAction(next, actorID, actionID, { actionID: catalogActionID });
  }
  if (Object.keys(explicitOverrides).length) {
    next = updateMotionAction(next, actorID, actionID, explicitOverrides);
  }
  return next;
}

function validateOperationSemantics(project, operation) {
  if(operation.action.includes("actor_pose")) {
    const actor=findActor(project,operation.actorID);
    if(!actor)throw semanticError("Actor not found: "+operation.actorID);
    if(actor.locked)throw semanticError("Actor is locked: "+operation.actorID);
    const ids=new Set(actor.poseTrack.keyframes.map(key=>key.id));
    const missing=(operation.keyframeIDs || (operation.keyframeID?[operation.keyframeID]:[])).find(id=>!ids.has(id));
    if(missing)throw semanticError("Actor frame not found: "+missing);
  }
  if (["move_camera_keyframes", "delete_camera_keyframes"].includes(operation.action)) {
    const shot = project.scene.shots.find((shot) => shot.id === operation.shotID);
    if (!shot) throw semanticError(`${operation.action}: Shot not found: ${operation.shotID}`);
    const ids = new Set(shot.camera.track.keyframes.map((key) => key.id));
    const missing = operation.keyframeIDs.find((id) => !ids.has(id));
    if (missing) throw semanticError(`${operation.action}: camera keyframe not found in Shot: ${missing}`);
  }
  const blockingActor = findActor(project, operation.actorID || operation.id);
  const postureFields = operation.action === "update_motion_action" ? operation.patch : operation.options;
  if (postureFields && ["posture","seatHeight","gesture","joints","transitionSeconds"].some(key=>Object.hasOwn(postureFields,key))) {
    if(blockingActor?.locked) throw semanticError("Actor is locked: "+blockingActor.id);
    const targetIndex = blockingActor?.motionActions.findIndex((action) => action.id === operation.actionID);
    if (!isBlockingActor(blockingActor)
      || (operation.action === "update_motion_action" && (targetIndex <= 0 || blockingActor.motionActions[targetIndex]?.kind !== "hold"))) {
      throw semanticError("停留姿势只适用于抽象人的非起点 Hold。");
    }
  }

  if (isBlockingActor(blockingActor)) {
    const fields = operation.action === "update_motion_action" ? operation.patch : operation.options;
    const target = blockingActor.motionActions.find((action) => action.id === operation.actionID);
    const kind = operation.action === "add_move" ? "move" : target?.kind || "hold";
    if (fields?.actionID && fields.actionID !== (kind === "move" ? "walk" : "idle")) {
      throw semanticError("抽象人只支持移动和停留，不支持人物动作。");
    }
  }
  const existingIDs = durableEntityIDs(project);
  const newIDs = explicitNewEntityIDs(operation);
  const duplicateNewID = newIDs.find((id, index) => newIDs.indexOf(id) !== index);
  if (duplicateNewID) {
    throw semanticError(`${operation.action}: duplicate new entity ID ${duplicateNewID}`);
  }
  const collidingID = newIDs.find((id) => existingIDs.has(id));
  if (collidingID) {
    throw semanticError(`${operation.action}: entity ID already exists: ${collidingID}`);
  }

  if ([
    "replace_visual_environment_asset",
    "rename_visual_environment",
    "set_visual_environment_visible",
    "set_visual_environment_locked",
    "set_visual_environment_opacity",
    "set_visual_environment_material_mode",
    "set_visual_environment_transform",
    "remove_visual_environment",
  ].includes(operation.action)) {
    const environmentID = operation.environmentID;
    if (!project.scene.environment.visuals.some((visual) => visual.id === environmentID)) {
      throw semanticError(`${operation.action}: visual environment not found: ${environmentID}`);
    }
  }
  if (["update_visual_environment_group", "dissolve_visual_environment_group"].includes(operation.action)) {
    if (!project.scene.environment.groups.some((group) => group.id === operation.groupID)) {
      throw semanticError(`${operation.action}: visual-environment group not found: ${operation.groupID}`);
    }
  }
  if (["add_visual_environment_group", "assign_visual_environments_to_group"].includes(operation.action)) {
    for (const environmentID of operation.environmentIDs || []) {
      if (!project.scene.environment.visuals.some((visual) => visual.id === environmentID)) {
        throw semanticError(`${operation.action}: visual environment not found: ${environmentID}`);
      }
    }
  }
  if (
    operation.action === "assign_visual_environments_to_group"
    && operation.groupID !== null
    && !project.scene.environment.groups.some((group) => group.id === operation.groupID)
  ) {
    throw semanticError(`${operation.action}: visual-environment group not found: ${operation.groupID}`);
  }
  

  
  
  if (operation.action === "insert_stay_before") {
    const actor = findActor(project, operation.actorID);
    if (!actor) {
      throw semanticError(
        `insert_stay_before: actor not found: ${operation.actorID}`
      );
    }
    if (!canInsertStayActionBefore(actor, operation.targetActionID)) {
      throw semanticError(
        "insert_stay_before: the target must be the only positive-duration Stay / Perform after its incoming Move"
      );
    }
    if (
      operation.options?.actionID
      && desktopActions[operation.options.actionID]?.kind !== "hold"
    ) {
      throw semanticError(
        `insert_stay_before: catalog action ${operation.options.actionID} is not a hold action`
      );
    }
    return;
  }
  if (operation.action !== "update_motion_action") return;
  const actor = findActor(project, operation.actorID);
  if (!actor) throw semanticError(`update_motion_action: actor not found: ${operation.actorID}`);
  const actionIndex = actor.motionActions.findIndex((action) => action.id === operation.actionID);
  const motionAction = actor.motionActions[actionIndex];
  if (!motionAction) {
    throw semanticError(`update_motion_action: motion action not found: ${operation.actionID}`);
  }
  const patch = operation.patch || {};
  const incompatibleFields = motionAction.kind === "move"
    ? ["duration", "loopBehavior", "facingY", "sourceInSeconds", "sourceOutSeconds"]
    : ["speed", "locomotionGait"];
  const incompatibleField = incompatibleFields.find((field) => Object.hasOwn(patch, field));
  if (incompatibleField) {
    throw semanticError(
      `update_motion_action: ${incompatibleField} is not valid for a ${motionAction.kind} action`
    );
  }
  if (actionIndex === 0 && Object.hasOwn(patch, "duration")) {
    throw semanticError("update_motion_action: the structural start anchor cannot have duration");
  }
  if (actionIndex === 0 && Object.hasOwn(patch, "entryHeightY")) {
    throw semanticError("update_motion_action: the structural start anchor cannot have an entry height override");
  }
  if (
    actionIndex === 0
    && (Object.hasOwn(patch, "sourceInSeconds") || Object.hasOwn(patch, "sourceOutSeconds"))
  ) {
    throw semanticError("update_motion_action: the structural start anchor cannot be trimmed");
  }
  if (Object.hasOwn(patch, "actionID") && desktopActions[patch.actionID]?.kind !== motionAction.kind) {
    throw semanticError(
      `update_motion_action: catalog action ${patch.actionID} is not a ${motionAction.kind} action`
    );
  }
  if (
    motionAction.kind === "hold"
    && (Object.hasOwn(patch, "sourceInSeconds") || Object.hasOwn(patch, "sourceOutSeconds"))
  ) {
    const actionID = patch.actionID || motionAction.actionID;
    const fullRange = actionSourceRange({ actionID });
    const sourceIn = Object.hasOwn(patch, "sourceInSeconds")
      ? patch.sourceInSeconds == null ? 0 : Number(patch.sourceInSeconds)
      : actionSourceRange(motionAction).sourceIn;
    const sourceOut = Object.hasOwn(patch, "sourceOutSeconds")
      ? patch.sourceOutSeconds == null ? fullRange.naturalDuration : Number(patch.sourceOutSeconds)
      : actionSourceRange(motionAction).sourceOut;
    if (
      sourceIn < 0
      || sourceOut > fullRange.naturalDuration + 0.000001
      || sourceOut - sourceIn < minimumActionSourceSpan
    ) {
      throw semanticError(
        "update_motion_action: Stay source trim must remain inside the source clip with a positive span"
      );
    }
    if (
      (motionAction.intrinsicDisplacement || desktopActions[actionID]?.intrinsicDisplacement)
      && !desktopActions[actionID]?.intrinsicMotion
    ) {
      throw semanticError(
        "update_motion_action: this intrinsic action has no sampled trajectory and cannot be trimmed safely"
      );
    }
  }
}

function explicitNewEntityIDs(operation) {
  const ids = [];
  if (["add_actor", "add_camera_setup", "add_shot", "add_blockout_group", "add_blockout_object", "add_blockout_primitive", "set_visual_environment_asset", "add_visual_environment_group"].includes(operation.action) && typeof operation.id === "string") ids.push(operation.id);
  const include = (value) => {
    if (typeof value === "string") ids.push(value);
  };
  
  if (operation.action === "attach_reference_image") include(operation.options?.id);
  if (operation.action === "add_blockout_group") {
    for (const object of operation.objects || []) {
      include(object?.id);
      for (const primitive of object?.primitives || []) include(primitive?.id);
    }
  }
  if (operation.action === "add_blockout_object") {
    for (const primitive of operation.primitives || []) include(primitive?.id);
  }
  return ids;
}

function durableEntityIDs(project) {
  const ids = new Set([project.id]);
  for (const actor of project.scene.actors) {
    ids.add(actor.id);
    for (const action of actor.motionActions) ids.add(action.id);
    for (const keyframe of actor.poseTrack.keyframes) ids.add(keyframe.id);
  }
  
  for (const visual of project.scene.environment.visuals || []) ids.add(visual.id);
  for (const group of project.scene.environment.groups || []) ids.add(group.id);
  
  for (const setup of project.scene.cameraSetups) ids.add(setup.id);
  for (const shot of project.scene.shots) {
    ids.add(shot.id);
    for (const keyframe of shot.camera.track.keyframes) ids.add(keyframe.id);
  }
  for (const reference of project.scene.blockout.referenceImages) ids.add(reference.id);
  for (const group of project.scene.blockout.groups) {
    ids.add(group.id);
    for (const object of group.objects) {
      ids.add(object.id);
      for (const primitive of object.primitives) ids.add(primitive.id);
    }
  }
  return ids;
}

function placeActorRelative(project, operation) {
  const actor = requireActor(project, requiredID(operation, "id"));
  const anchor = requireActor(project, requiredID(operation, "targetID"));
  const basis = horizontalBasis(operation.reference === "target" ? anchor.rotationY : 0);
  const position = relativePosition(anchor.position, basis, operation);
  let rotationY = actor.rotationY;
  if (operation.orient === "target") rotationY = headingBetween(position, anchor.position);
  else if (operation.orient === "same_direction") rotationY = anchor.rotationY;
  else if (operation.orient === "reference_forward") rotationY = basis.heading;
  return setActorOrPairedRoleTransform(project, actor.id, position, rotationY);
}

function arrangeActors(projectInput, operation) {
  const ids = requiredIDs(operation);
  const center = finiteVector(operation.center, { x: 0, y: 0, z: 0 });
  const spacing = positive(operation.spacing, 1.2);
  const layout = operation.layout || "line";
  let project = projectInput;
  for (let index = 0; index < ids.length; index += 1) {
    const actor = requireActor(project, ids[index]);
    const position = arrangementPosition(layout, index, ids.length, center, spacing, operation);
    let rotationY = actor.rotationY;
    if (operation.facing === "center") rotationY = headingBetween(position, center);
    else if (operation.facing === "outward") rotationY = normalizeAngle(headingBetween(position, center) + Math.PI);
    else if (operation.facing === "same_direction") rotationY = Number(operation.heading) || 0;
    if (operation.targetID) {
      const target = requireActor(project, operation.targetID);
      rotationY = headingBetween(position, target.position);
    }
    project = setActorOrPairedRoleTransform(project, actor.id, position, rotationY);
  }
  return project;
}

function orientActorToward(project, operation) {
  const actor = requireActor(project, requiredID(operation, "id"));
  const target = operation.targetID
    ? requireActor(project, operation.targetID).position
    : finiteVector(operation.targetPosition, null);
  if (!target) throw commandError("orient_actor_toward requires targetID or targetPosition");
  return setActorOrPairedRoleTransform(
    project,
    actor.id,
    actor.position,
    headingBetween(actor.position, target)
  );
}

function placeBlockoutRelative(project, operation) {
  const group = requireBlockoutGroup(project, requiredID(operation, "id"));
  const anchor = requireBlockoutGroup(project, requiredID(operation, "targetID"));
  const basis = horizontalBasis(operation.reference === "target" ? anchor.rotationY : 0);
  return updateBlockoutGroup(project, group.id, {
    position: relativePosition(anchor.position, basis, operation),
    rotationY: operation.orient === "target"
      ? headingBetween(relativePosition(anchor.position, basis, operation), anchor.position)
      : operation.orient === "same_direction" ? anchor.rotationY : group.rotationY,
  });
}

function arrangeBlockoutGroups(projectInput, operation) {
  const ids = requiredIDs(operation);
  const center = finiteVector(operation.center, { x: 0, y: 0, z: 0 });
  const spacing = positive(operation.spacing, 2);
  let project = projectInput;
  for (let index = 0; index < ids.length; index += 1) {
    const group = requireBlockoutGroup(project, ids[index]);
    const position = arrangementPosition(operation.layout || "line", index, ids.length, center, spacing, operation);
    const rotationY = operation.facing === "center"
      ? headingBetween(position, center)
      : operation.facing === "outward"
        ? normalizeAngle(headingBetween(position, center) + Math.PI)
        : group.rotationY;
    project = updateBlockoutGroup(project, group.id, { position, rotationY });
  }
  return project;
}

function relativePosition(anchor, basis, operation) {
  const distance = positive(operation.distance, 1);
  const relation = operation.relation || "right";
  const sign = relation === "left" || relation === "behind" || relation === "foreground" ? -1 : 1;
  const alongRight = relation === "left" || relation === "right";
  const direction = alongRight ? basis.right : basis.forward;
  const offset = finiteVector(operation.offset, { x: 0, y: 0, z: 0 });
  return {
    x: anchor.x + direction.x * distance * sign + basis.right.x * offset.x + basis.forward.x * offset.z,
    y: anchor.y + offset.y,
    z: anchor.z + direction.z * distance * sign + basis.right.z * offset.x + basis.forward.z * offset.z,
  };
}

function arrangementPosition(layout, index, count, center, spacing, operation) {
  if (layout === "circle" || layout === "arc") {
    const radius = positive(operation.radius, Math.max(spacing, count * spacing / (Math.PI * 2)));
    const arc = layout === "circle" ? Math.PI * 2 : Math.max(0.01, Math.min(Math.PI * 2, Number(operation.arcDegrees || 180) * Math.PI / 180));
    const alpha = count <= 1 ? 0.5 : index / (layout === "circle" ? count : count - 1);
    const angle = Number(operation.heading || 0) - arc / 2 + alpha * arc;
    return { x: center.x + Math.sin(angle) * radius, y: center.y, z: center.z + Math.cos(angle) * radius };
  }
  if (layout === "grid") {
    const columns = Math.max(1, Math.min(count, Math.floor(Number(operation.columns) || Math.ceil(Math.sqrt(count)))));
    const rows = Math.ceil(count / columns);
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: center.x + (column - (columns - 1) / 2) * spacing,
      y: center.y,
      z: center.z + (row - (rows - 1) / 2) * spacing,
    };
  }
  return {
    x: center.x + (index - (count - 1) / 2) * spacing,
    y: center.y,
    z: center.z,
  };
}

function horizontalBasis(heading) {
  const normalizedHeading = normalizeAngle(Number(heading) || 0);
  return {
    heading: normalizedHeading,
    forward: { x: Math.sin(normalizedHeading), z: Math.cos(normalizedHeading) },
    right: { x: Math.cos(normalizedHeading), z: -Math.sin(normalizedHeading) },
  };
}

function headingBetween(from, to) {
  return normalizeAngle(Math.atan2(to.x - from.x, to.z - from.z));
}

function requireActor(project, id) {
  const actor = findActor(project, id);
  if (!actor) throw commandError(`Actor not found: ${id}`);
  return actor;
}

function requireBlockoutGroup(project, id) {
  const group = project.scene.blockout.groups.find((candidate) => candidate.id === id);
  if (!group) throw commandError(`Blockout group not found: ${id}`);
  return group;
}

function requiredID(operation, key) {
  const value = operation[key];
  if (typeof value !== "string" || !value.trim()) throw commandError(`${operation.action} requires ${key}`);
  return value.trim();
}

function optionalID(operation, key) {
  const value = operation[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredIDs(operation) {
  if (!Array.isArray(operation.ids) || operation.ids.length < 2) {
    throw commandError(`${operation.action} requires at least two ids`);
  }
  return operation.ids.map((value) => String(value));
}

function finiteVector(input, fallback) {
  if (!input || typeof input !== "object") return fallback;
  const values = [Number(input.x), Number(input.y), Number(input.z)];
  if (!values.every(Number.isFinite)) return fallback;
  return { x: values[0], y: values[1], z: values[2] };
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function entityIDSets(project) {
  return {
    actors: new Set(project.scene.actors.map((actor) => actor.id)),
    actorPoseKeyframes:new Set(project.scene.actors.flatMap(actor=>actor.poseTrack.keyframes.map(key=>key.id))),
    
    visualEnvironments: new Set((project.scene.environment.visuals || []).map((visual) => visual.id)),
    cameraSetups: new Set(project.scene.cameraSetups.map((setup) => setup.id)),
    shots: new Set(project.scene.shots.map((shot) => shot.id)),
    references: new Set(project.scene.blockout.referenceImages.map((reference) => reference.id)),
    blockoutGroups: new Set(project.scene.blockout.groups.map((group) => group.id)),
    blockoutObjects: new Set(project.scene.blockout.groups.flatMap((group) => group.objects.map((object) => object.id))),
    blockoutPrimitives: new Set(project.scene.blockout.groups.flatMap((group) => (
      group.objects.flatMap((object) => object.primitives.map((primitive) => primitive.id))
    ))),
  };
}

function createdIDs(before, after) {
  return Object.fromEntries(Object.entries(after).map(([category, ids]) => [
    category,
    [...ids].filter((id) => !before[category].has(id)),
  ]).filter(([, ids]) => ids.length));
}

function commandError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function semanticError(message) {
  const error = commandError(`Invalid Film Space operation semantics: ${message}`);
  error.code = "FILM_SPACE_OPERATION_SEMANTIC";
  error.recovery = "Read the current project state and the operation schema, then retry with valid existing references and action-specific fields.";
  return error;
}
