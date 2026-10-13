import { legacyActorPose, blendActorPose, blockingPoseLandmarks } from "./actor-pose.js";
import { distanceXYZ, normalizeAngle } from "./scene-model.js";

export const blockingCharacterID = "blocking-figure";
export const isBlockingActor = (actor) => actor?.characterAssetID === blockingCharacterID;

export const blockingSeatHeight = 0.45;

export function blockingPostureFields(action) {
  if (action.kind !== "hold") {
    if (action.posture != null || action.seatHeight != null) throw new Error("坐姿只适用于抽象人的停留。");
    return {};
  }
  const posture = action.posture ?? "stand";
  const seatHeight = action.seatHeight ?? blockingSeatHeight;
  if (!["stand", "sit"].includes(posture)) throw new Error("抽象人停留动作只支持站立或坐下。");
  if (!Number.isFinite(seatHeight) || seatHeight < 0 || seatHeight > 2) throw new Error("座位高度必须为 0–2 米。");
  return { posture, seatHeight };
}

export function blockingHeadHeight(pose) {
  return blockingPoseLandmarks(pose?.blockingPose || legacyActorPose({}, pose)).head.y;
}

// Local XYZ tilt, then world Y facing, around the authored actor anchor.
export function blockingTargetPosition(actor, sample, heightFraction = 1) {
  const pose=sample.blockingPose || legacyActorPose(actor,sample);
  const head=blockingPoseLandmarks(pose).head,scale=heightFraction*actor.scale;
  const y=head.y*scale,z=head.z*scale;
  const localX=-y*Math.sin(pose.rotationZ);
  const beforeX=y*Math.cos(pose.rotationZ);
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
      ...blockingPostureFields(action),
    };
  });
}

export function compileBlockingPlayback(actor) {
  const phases = [];
  const actionTimings = [];
  let time = 0;
  let position = { ...actor.position };
  let rotationY = actor.rotationY;
  let previousPose = legacyActorPose(actor);
  actor.motionActions.forEach((action, actionIndex) => {
    const moving = action.kind === "move";
    const distance = moving ? distanceXYZ(position, action.position) : 0;
    const duration = moving ? distance / action.speed : action.duration;
    const dx = action.position.x - position.x;
    const dz = action.position.z - position.z;
    const targetRotationY = moving
      ? Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : rotationY
      : action.facingY ?? rotationY;
    const endPosition = moving ? { ...action.position } : { ...position };
    actionTimings.push({ actionStartTime: time, totalDuration: duration, turnDuration: 0,
      holdDuration: moving ? 0 : duration, moveDuration: moving ? duration : 0,
      turnsInPlace: false });
    if (duration > 0) {
      const endPose=legacyActorPose(actor,{...action,posture:moving?"stand":action.posture,rotationY:targetRotationY});
      const startPose=phases.length?previousPose:endPose;
      previousPose=endPose;
      phases.push({ kind: action.kind, blocking: true, action, actionIndex,
        phaseKey: `${action.id}:${action.kind}`, startTime: time, endTime: time + duration,
        duration, startPosition: position, endPosition, startRotationY: rotationY,
        endRotationY: targetRotationY,startPose,endPose });
      rotationY = targetRotationY;
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
  return {
    basePose: blendActorPose(phase.startPose,phase.endPose,smoothTurn),
    position: Object.fromEntries(["x", "y", "z"].map((axis) => [axis,
      phase.startPosition[axis] + (phase.endPosition[axis] - phase.startPosition[axis]) * progress])),
    rotationY: normalizeAngle(phase.startRotationY
      + normalizeAngle(phase.endRotationY - phase.startRotationY) * smoothTurn),
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
