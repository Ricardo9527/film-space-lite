import { compileBlockingPlayback, sampleBlockingPhase } from "./blocking-actor.js";
import { legacyActorPose, sampleActorPose } from "./actor-pose.js";
import { normalizeAngle } from "./scene-model.js";
const playbackPlanCache = new WeakMap();
export function actorDuration(actor) { return Math.max(actorPlaybackPlan(actor).duration,actor.poseTrack?.keyframes.at(-1)?.time ?? 0); }
export function actorPlaybackPlan(actor) {
  const cached = playbackPlanCache.get(actor);
  if (cached) return cached;
  const plan = compileBlockingPlayback(actor);
  playbackPlanCache.set(actor, plan);
  return plan;
}
export function projectDuration(project) { return Math.max(0, ...project.scene.actors.map(actorDuration)); }
export function adjacentFrameTime(elapsedInput, directionInput, frameRateInput, durationInput) {
  const frameRate = Math.max(Number(frameRateInput || 30), 1);
  const duration = Math.max(Number(durationInput || 0), 0);
  const elapsed = clamp(Number(elapsedInput || 0), 0, duration);
  const framePosition = elapsed * frameRate;
  const nearestFrame = Math.round(framePosition);
  const isOnFrame = Math.abs(framePosition - nearestFrame) < 0.000001;
  const targetFrame = Number(directionInput) < 0
    ? isOnFrame ? nearestFrame - 1 : Math.floor(framePosition)
    : isOnFrame ? nearestFrame + 1 : Math.ceil(framePosition);
  return clamp(targetFrame / frameRate, 0, duration);
}
export function sampleProject(project, elapsed) {
  const time = Math.min(Math.max(Number(elapsed || 0), 0), (project.scene.duration?.seconds ?? Infinity));
  return new Map(project.scene.actors.map(actor => [actor.id, sampleActor(actor, time)]));
}
export function sampleInitialProject(project) { return new Map(project.scene.actors.map(actor => [actor.id, initialActorSample(actor)])); }
export function initialActorSample(actor) {
  const plan = actorPlaybackPlan(actor);
  if (plan.phases.length > 0) {
    return {
      ...sampleActor(actor, 0),
      animationFrozen: true,
      preposed: true,
    };
  }
  return {
    ...sampleActor(actor,0),
    actionID: "idle",
    actionKind: "hold",
    actionElapsed: 0,
    animationTime: 0,
    animationTimeScale: 1,
    animationLoopBehavior: "loop",
    actionDuration: 0,
    progress: 0,
    speed: 0,
    completed: false,
    actionIndex: 0,
    phaseKey: "authored:default",
    preposed: false,
  };
}
export function sampleActionInspection(actor, actionID, elapsedInput = 0) {
  const plan = actorPlaybackPlan(actor);
  const actionIndex = actor?.motionActions?.findIndex((action) => action.id === actionID) ?? -1;
  const timing = actionIndex >= 0 ? plan.actionTimings[actionIndex] : null;
  const duration = Math.max(Number(timing?.totalDuration || 0), 0);
  if (actionIndex < 0 || !timing || duration <= 0) {
    return { sample: initialActorSample(actor), duration: 0, completed: true };
  }
  const elapsed = Math.max(Number(elapsedInput || 0), 0);
  const localElapsed = Math.min(elapsed, Math.max(duration - 0.000001, 0));
  return {
    sample: sampleActor(actor, timing.actionStartTime + localElapsed),
    duration,
    completed: elapsed >= duration,
  };
}
export function sampleActor(actor, elapsedInput) {
  const elapsed = Math.max(Number(elapsedInput || 0), 0);
  const plan = actorPlaybackPlan(actor);
  const phase = plan.phases.find(candidate => elapsed < candidate.endTime);
  if (phase) return withActorPose(actor,elapsed,sampleBlockingPhase(phase, Math.max(0, Math.min(elapsed - phase.startTime, phase.duration))));
  const last = plan.phases.at(-1);
  return withActorPose(actor,elapsed,{ ...(last ? sampleBlockingPhase(last, last.duration) : {}),
    position: { ...plan.finalPosition }, rotationY: plan.finalRotationY,
    actionID: "idle", actionKind: "hold", actionIndex: plan.finalActionIndex,
    actionElapsed: 0, actionDuration: 0, animationTime: 0, animationFrozen: true,
    phaseKey: last?.phaseKey || "blocking:default", progress: 1, speed: 0,
    completed: true, continuesAfterCompletion: false });
}
function withActorPose(actor,time,sample) {
  const base={...(sample.basePose || legacyActorPose(actor,sample)),rotationY:sample.rotationY};
  const blockingPose=sampleActorPose(actor.poseTrack || {interpolation:"smooth",keyframes:[]},time,base,legacyActorPose(actor));
  blockingPose.rotationY=normalizeAngle(sample.rotationY+blockingPose.rotationYOffset);
  // Offsets use the path/Hold heading before authored pose yaw and stay in meters.
  const cosine=Math.cos(sample.rotationY),sine=Math.sin(sample.rotationY);
  const position={
    x:sample.position.x+blockingPose.offsetX*cosine+blockingPose.offsetZ*sine,
    y:sample.position.y+blockingPose.offsetY,
    z:sample.position.z-blockingPose.offsetX*sine+blockingPose.offsetZ*cosine,
  };
  return {...sample,pathPosition:{...sample.position},position,blockingPose,rotationY:blockingPose.rotationY};
}
export class PlaybackController {
  constructor(options = {}) {
    this.now = options.now || (() => performance.now());
    this.requestFrame = options.requestFrame || ((callback) => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame || ((id) => cancelAnimationFrame(id));
    this.onChange = options.onChange || (() => {});
    this.duration = 0;
    this.elapsed = 0;
    this.status = "idle";
    this.startedAt = 0;
    this.frame = null;
  }

  setDuration(duration) {
    this.duration = Math.max(Number(duration || 0), 0);
    if (this.elapsed > this.duration) this.elapsed = this.duration;
  }

  play() {
    if (this.duration <= 0 || this.status === "playing") return;
    if (this.status === "completed") this.elapsed = 0;
    this.status = "playing";
    this.startedAt = this.now() - this.elapsed * 1000;
    this.emit();
    this.schedule();
  }

  pause() {
    if (this.status !== "playing") return;
    this.updateElapsed();
    this.status = "paused";
    this.stopFrame();
    this.emit();
  }

  seek(elapsedInput, options = {}) {
    this.stopFrame();
    this.elapsed = Math.min(Math.max(Number(elapsedInput || 0), 0), this.duration);
    this.status = options.status || (this.elapsed <= 0 ? "idle" : "paused");
    if (!["idle", "paused", "completed"].includes(this.status)) this.status = "paused";
    this.emit({ seeking: true });
  }

  reset() {
    this.stopFrame();
    this.elapsed = 0;
    this.status = "idle";
    this.emit();
  }

  schedule() {
    this.stopFrame();
    this.frame = this.requestFrame(() => {
      this.frame = null;
      if (this.status !== "playing") return;
      this.updateElapsed();
      if (this.elapsed >= this.duration) {
        this.elapsed = this.duration;
        this.status = "completed";
        this.emit();
        return;
      }
      this.emit();
      this.schedule();
    });
  }

  updateElapsed() {
    this.elapsed = Math.min(Math.max((this.now() - this.startedAt) / 1000, 0), this.duration);
  }

  stopFrame() {
    if (this.frame == null) return;
    this.cancelFrame(this.frame);
    this.frame = null;
  }

  emit(details = {}) {
    this.onChange({ status: this.status, elapsed: this.elapsed, duration: this.duration, ...details });
  }
}
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
