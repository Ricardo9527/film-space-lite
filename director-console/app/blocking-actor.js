import { legacyActorPose, blendActorPose, blockingPoseLandmarks, actionGestures, normalizeActionJoints } from "./actor-pose.js";
import { distanceXYZ, normalizeAngle } from "./scene-model.js";

export const blockingCharacterID = "blocking-figure";
export const isBlockingActor = (actor) => actor?.characterAssetID === blockingCharacterID;

export const blockingSeatHeight = 0.45;

export function blockingPostureFields(action) {
  if (action.kind !== "hold") {
    if (action.posture != null || action.seatHeight != null || action.gesture != null || action.joints != null || action.transitionSeconds != null) throw new Error("坐姿只适用于抽象人的停留。");
    return {};
  }
  const posture = action.posture ?? "stand";
  const seatHeight = action.seatHeight ?? blockingSeatHeight;
  if (!["stand", "sit"].includes(posture)) throw new Error("抽象人停留动作只支持站立或坐下。");
  if (!Number.isFinite(seatHeight) || seatHeight < 0 || seatHeight > 2) throw new Error("座位高度必须为 0–2 米。");
  const gesture=action.gesture ?? null;
  if(gesture!==null && !Object.hasOwn(actionGestures,gesture)) throw new Error("Unknown gesture: "+gesture);
  const joints=normalizeActionJoints(action.joints ?? {});
  const transitionSeconds=action.transitionSeconds ?? null;
  if(transitionSeconds!==null && (!Number.isFinite(transitionSeconds)||transitionSeconds<0||transitionSeconds>3600)) throw new Error("Invalid transitionSeconds");
  return { posture, seatHeight, ...(gesture!==null?{gesture}:{}),
    ...(Object.keys(joints).length?{joints}:{}), ...(transitionSeconds!==null?{transitionSeconds}:{}) };
}

export function moveFacingFields(action) {
  if (action.kind !== "move") {
    if (action.facingMode != null) throw new Error("移动面向模式只适用于 Move。");
    return {};
  }
  const facingMode = action.facingMode ?? "path";
  if (!["path", "inherit", "fixed"].includes(facingMode)) throw new Error("无效的移动面向模式。");
  if (facingMode === "fixed" && !Number.isFinite(action.facingY)) throw new Error("指定移动面向需要有效角度。");
  return {facingMode};
}

export function blockingHeadHeight(pose) {
  return blockingPoseLandmarks(pose?.blockingPose || legacyActorPose({}, pose)).head.y;
}

// Local XYZ tilt, then world Y facing, around the authored actor anchor.
export function blockingTargetPosition(actor, sample, heightFraction = 1) {
  const pose=sample.blockingPose || legacyActorPose(actor,sample);
  const head=blockingPoseLandmarks(pose).head,scale=heightFraction*actor.scale;
  const y=head.y*scale,z=head.z*scale;
  const localX=head.x*scale*Math.cos(pose.rotationZ)-y*Math.sin(pose.rotationZ);
  const beforeX=head.x*scale*Math.sin(pose.rotationZ)+y*Math.cos(pose.rotationZ);
  const localY=beforeX*Math.cos(pose.rotationX)-z*Math.sin(pose.rotationX);
  const localZ=beforeX*Math.sin(pose.rotationX)+z*Math.cos(pose.rotationX);
  return {
    x:sample.position.x+localX*Math.cos(pose.rotationY)+localZ*Math.sin(pose.rotationY),
    y:sample.position.y+localY,
    z:sample.position.z-localX*Math.sin(pose.rotationY)+localZ*Math.cos(pose.rotationY),
  };
}

// Desktop-only blocking uses the existing Action List wire shape, without clips.
export function blockingMotionActions(actions) {
  return actions.map((action) => {
    const actionID = action.kind === "move" ? "walk" : "idle";
    if (action.actionID !== actionID) {
      throw new Error("抽象人只支持移动和停留，请先清除人物动作。");
    }
    if (action.locomotionGait !== "walk" || action.loopBehavior !== "loop"
      || ["sourceInSeconds", "sourceOutSeconds", "entryHeightY", "intrinsicDisplacement",
        "incomingMovePhaseSync", "anchorSource"].some((key) => action[key] != null)) {
      throw new Error("抽象人只支持路径点、速度、停留时长和整体朝向，不支持动画参数。");
    }
    return {
      id: action.id, kind: action.kind, actionID,
      position: { ...action.position }, speed: action.speed,
      duration: action.duration, facingY: action.facingY,
      locomotionGait: "walk", loopBehavior: "loop",
      ...blockingPostureFields(action), ...moveFacingFields(action),
    };
  });
}

export function compileBlockingPlayback(actor) {
  const phases = [];
  const actionTimings = [];
  let time = 0;
  let position = { ...actor.position };
  let rotationY = actor.rotationY;
  let pathRotationY = actor.rotationY;
  let previousPose = legacyActorPose(actor);
  actor.motionActions.forEach((action, actionIndex) => {
    const moving = action.kind === "move";
    const distance = moving ? distanceXYZ(position, action.position) : 0;
    const duration = moving ? distance / action.speed : action.duration;
    const dx = action.position.x - position.x;
    const dz = action.position.z - position.z;
    const pathHeading = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : pathRotationY;
    const targetRotationY = moving
      ? action.facingMode === "inherit" ? rotationY
        : action.facingMode === "fixed" ? action.facingY : pathHeading
      : action.facingY ?? rotationY;
    const targetPathRotationY = moving ? pathHeading : targetRotationY;
    const endPosition = moving ? { ...action.position } : { ...position };
    actionTimings.push({ actionStartTime: time, totalDuration: duration, turnDuration: 0,
      holdDuration: moving ? 0 : duration, moveDuration: moving ? duration : 0,
      turnsInPlace: false });
    if (duration > 0) {
      const gestured=!moving && (action.gesture!=null || action.joints!=null);
      const endPose=gestured
        ? {...previousPose,...(action.gesture && action.gesture!=="hold"?{bodyHeight:1,legLength:action.gesture==="sit"?action.seatHeight+.175:.45}:{}),...actionGestures[action.gesture ?? 'hold'],...action.joints,rotationY:targetRotationY}
        : legacyActorPose(actor,{...action,posture:moving?"stand":action.posture,rotationY:targetRotationY});
      const startPose=phases.length || gestured?previousPose:endPose;
      previousPose=endPose;
      phases.push({ kind: action.kind, blocking: true, action, actionIndex,
        phaseKey: `${action.id}:${action.kind}`, startTime: time, endTime: time + duration,
        duration, startPosition: position, endPosition, startRotationY: rotationY,
        endRotationY: targetRotationY, startPathRotationY: pathRotationY,
        endPathRotationY: targetPathRotationY, startPose,endPose });
      rotationY = targetRotationY;
      pathRotationY = targetPathRotationY;
    }
    position = endPosition;
    time += duration;
  });
  return { duration: time, phases, actionTimings, finalPosition: position,
    finalRotationY: rotationY, finalActionIndex: phases.at(-1)?.actionIndex ?? 0,
    finalPersistentAction: null, finalPersistentPhase: null };
}

export function sampleBlockingPhase(phase, elapsed) {
  const progress = Math.min(1, elapsed / phase.duration);
  const turn = Math.min(1, elapsed / Math.min(0.25, phase.duration));
  const smoothTurn = turn * turn * (3 - 2 * turn);
  const poseDuration=Math.min(phase.action.transitionSeconds ?? .25,phase.duration);
  const poseProgress=poseDuration===0?1:Math.min(1,elapsed/poseDuration);
  const poseBlend=poseProgress*poseProgress*(3-2*poseProgress);
  return {
    basePose: blendActorPose(phase.startPose,phase.endPose,poseBlend),
    position: Object.fromEntries(["x", "y", "z"].map((axis) => [axis,
      phase.startPosition[axis] + (phase.endPosition[axis] - phase.startPosition[axis]) * progress])),
    rotationY: normalizeAngle(phase.startRotationY
      + normalizeAngle(phase.endRotationY - phase.startRotationY) * smoothTurn),
    pathRotationY: normalizeAngle(phase.startPathRotationY
      + normalizeAngle(phase.endPathRotationY - phase.startPathRotationY) * smoothTurn),
    actionID: phase.action.actionID, actionKind: phase.kind,
    posture: phase.kind === "hold" ? phase.action.posture ?? "stand" : "stand",
    seatHeight: phase.action.seatHeight ?? blockingSeatHeight,
    actionElapsed: elapsed, actionDuration: phase.duration, progress,
    speed: phase.kind === "move" ? phase.action.speed : 0,
    actionIndex: phase.actionIndex, phaseKey: phase.phaseKey,
    animationFrozen: true, animationTime: 0, animationTimeScale: 0,
    completed: false, continuesAfterCompletion: false,
  };
}
