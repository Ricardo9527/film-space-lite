import { normalizeAngle } from './scene-model.js';
import { snapCameraTime } from './camera-track.js';

export const actorPoseParameters = Object.freeze({
  offsetX: {label:'左右偏移',min:-1000,max:1000,unit:'meters'},
  offsetY: {label:'上下偏移',min:-1000,max:1000,unit:'meters'},
  offsetZ: {label:'前后偏移',min:-1000,max:1000,unit:'meters'},
  rotationYOffset: {label:'朝向偏移',min:-2*Math.PI,max:2*Math.PI,unit:'angle'},
  rotationX: {label:'前后倾斜',min:-2*Math.PI,max:2*Math.PI,unit:'angle'},
  rotationZ: {label:'左右倾斜',min:-2*Math.PI,max:2*Math.PI,unit:'angle'},
  torsoPitch: {label:'上身前倾',min:-Math.PI,max:Math.PI,unit:'angle'},
  headPitch: {label:'头部俯仰',min:-Math.PI/2,max:Math.PI/2,unit:'angle'},
});
const actionPoseParameters = Object.freeze({
  hipBend: {label:'髋部折叠',min:0,max:Math.PI/2,unit:'angle'},
  kneeBend: {label:'膝部折叠',min:0,max:Math.PI,unit:'angle'},
  bodyHeight: {label:'下身高度比例',min:0.2,max:1.5,unit:'ratio'},
  legLength: {label:'下段长度',min:0.05,max:2.175,unit:'meters'},
});
export const actorPoseInterpolations = ['linear','ease-in-out','smooth'];
export function legacyActorPose(actor = {}, sample = {}) {
  const sitting = sample.posture === 'sit';
  return {rotationYOffset:0,offsetX:0,offsetY:0,offsetZ:0,rotationY:sample.rotationY ?? actor.rotationY ?? 0,
    rotationX:actor.rotationX ?? 0,rotationZ:actor.rotationZ ?? 0,
    torsoPitch:0,headPitch:0,hipBend:sitting?Math.PI/2:0,kneeBend:sitting?Math.PI/2:0,
    bodyHeight:1,legLength:sitting?(sample.seatHeight ?? 0.45)+0.175:0.45};
}
// Recording excludes action-owned leg geometry, even when the input is a rendered pose.
export function actorFramePose(pose) {
  return Object.fromEntries(Object.entries(pose).filter(([key])=>Object.hasOwn(actorPoseParameters,key)));
}
export function migrateLegacyActorPoseTrack(track) {
  if (!track) return track;
  return {...track,keyframes:(track.keyframes ?? []).map(key=>({...key,
    pose:Object.fromEntries(Object.entries(key.pose).filter(([name])=>!Object.hasOwn(actionPoseParameters,name))),
  })).filter(key=>Object.keys(key.pose).length)};
}
export function normalizeActorPose(pose = {}) {
  if (!pose || typeof pose !== 'object' || Array.isArray(pose)) throw new Error('Actor pose must be an object');
  const result={};
  for(const [key,value] of Object.entries(pose)) {
    const spec=actorPoseParameters[key];
    if(!spec)throw new Error('Unknown actor pose parameter: '+key);
    if(!Number.isFinite(value)||value<spec.min||value>spec.max)throw new Error(key+' must be '+spec.min+'–'+spec.max);
    result[key]=value;
  }
  return result;
}
export function blendActorPose(from,to,alpha) {
  return Object.fromEntries(['rotationY',...Object.keys(actorPoseParameters),...Object.keys(actionPoseParameters)].map(key=>[key,
    key==='rotationY'?normalizeAngle(from[key]+normalizeAngle(to[key]-from[key])*alpha)
      :from[key]+(to[key]-from[key])*alpha]));
}
export function actorPoseEase(alpha,kind='smooth') {
  const t=Math.max(0,Math.min(1,alpha));
  if(kind==='linear')return t;
  return kind==='ease-in-out'?(t<0.5?2*t*t:1-(-2*t+2)**2/2):t*t*(3-2*t);
}
export function createActorPoseTrack(input = {}) {
  const interpolation=input.interpolation ?? 'smooth';
  if(!actorPoseInterpolations.includes(interpolation))throw new Error('Invalid actor pose interpolation');
  const ids=new Set(),times=new Set();
  const keyframes=(input.keyframes ?? []).map(key=>{
    if(!Number.isFinite(key.time)||key.time<0||key.time>3600)throw new Error('Actor frame time must be 0–3600 seconds');
    const id=key.id ?? globalThis.crypto.randomUUID();
    if(typeof id!=='string'||!id||ids.has(id))throw new Error('Duplicate or invalid actor frame ID');
    if(times.has(key.time))throw new Error('Duplicate actor frame time');
    ids.add(id);times.add(key.time);
    const ease=key.interpolation ?? interpolation;
    if(!actorPoseInterpolations.includes(ease))throw new Error('Invalid actor frame interpolation');
    const pose=normalizeActorPose(key.pose);
    if (!Object.keys(pose).length) throw new Error('An actor frame needs pose parameters');
    return {id,time:key.time,pose,interpolation:ease};
  }).sort((a,b)=>a.time-b.time);
  return {interpolation,keyframes};
}
export function actorPoseKeyframeAtTime(track,time,frameRate=30) {
  const frame=Math.round(time*frameRate);
  return track.keyframes.find(key=>Math.round(key.time*frameRate)===frame) ?? null;
}
export function recordActorPose(track,time,pose,frameRate=30) {
  const normalized=createActorPoseTrack(track),snapped=snapCameraTime(time,frameRate);
  const patch=normalizeActorPose(pose);
  if(!Object.keys(patch).length)throw new Error('An actor frame needs pose parameters');
  const existing=actorPoseKeyframeAtTime(normalized,snapped,frameRate);
  const key={id:existing?.id ?? globalThis.crypto.randomUUID(),time:existing?.time ?? snapped,
    pose:{...existing?.pose,...patch},interpolation:existing?.interpolation ?? normalized.interpolation};
  return createActorPoseTrack({...normalized,keyframes:existing
    ?normalized.keyframes.map(old=>old.id===existing.id?key:old):[...normalized.keyframes,key]});
}
export function sampleActorPose(track,time,base,initial=base) {
  const result={...base};
  for(const parameter of Object.keys(actorPoseParameters)) {
    const keys=track.keyframes.filter(key=>Object.hasOwn(key.pose,parameter));
    if(!keys.length)continue;
    let previous={time:0,pose:initial,interpolation:track.interpolation};
    for(const next of keys) {
      if(time<next.time) {
        const alpha=actorPoseEase((time-previous.time)/(next.time-previous.time),previous.interpolation);
        const from=previous.pose[parameter],to=next.pose[parameter];
        result[parameter]=parameter==='rotationY'?normalizeAngle(from+normalizeAngle(to-from)*alpha):from+(to-from)*alpha;
        break;
      }
      previous=next;result[parameter]=next.pose[parameter];
    }
  }
  return result;
}
export function moveActorPoseFrames(track,ids,deltaTime,frameRate=30) {
  const normalized=createActorPoseTrack(track),selected=new Set(ids),frame=1/frameRate;
  const movable=key=>selected.has(key.id);
  let minimum=-3600,maximum=3600;
  for(const [i,key] of normalized.keyframes.entries()) {
    if(!movable(key))continue;
    minimum=Math.max(minimum,-key.time);maximum=Math.min(maximum,3600-key.time);
    const previous=normalized.keyframes[i-1],next=normalized.keyframes[i+1];
    if(previous&&!movable(previous))minimum=Math.max(minimum,previous.time+Math.min(frame,key.time-previous.time)-key.time);
    if(next&&!movable(next))maximum=Math.min(maximum,next.time-Math.min(frame,next.time-key.time)-key.time);
  }
  const frames=Math.max(Math.ceil(minimum*frameRate-1e-8),Math.min(Math.floor(maximum*frameRate+1e-8),Math.round(deltaTime*frameRate)));
  return createActorPoseTrack({...normalized,keyframes:normalized.keyframes.map(key=>movable(key)?{...key,time:key.time+frames/frameRate}:key)});
}
export function blockingPoseLandmarks(pose) {
  const thigh=0.4*pose.bodyHeight,shin=pose.legLength*pose.bodyHeight;
  const hip=pose.hipBend,lower=hip-pose.kneeBend,torso=pose.torsoPitch,headAngle=torso+pose.headPitch;
  let hipY=thigh*Math.cos(hip)+shin*Math.cos(lower);
  const kneeY=hipY-thigh*Math.cos(hip);
  const lift=Math.max(0,0.175*Math.abs(Math.sin(hip))-Math.min(hipY,kneeY),
    0.175*Math.abs(Math.sin(lower))-Math.min(kneeY,0));
  hipY+=lift;
  // Ground anchor is the lower-leg endpoint for every blended pose.
  const hipZ=-thigh*Math.sin(hip)-shin*Math.sin(lower);
  const knee={x:0,y:hipY-thigh*Math.cos(hip),z:hipZ+thigh*Math.sin(hip)};
  const head={x:0,y:hipY+0.54*Math.cos(torso)+0.23*Math.cos(headAngle),
    z:hipZ+0.54*Math.sin(torso)+0.23*Math.sin(headAngle)};
  return {head,headAngle,hipY,hipZ,thigh,shin,
    body:{x:0,y:hipY+0.27*Math.cos(torso),z:hipZ+0.27*Math.sin(torso)},
    bend:{x:0,y:hipY-thigh*Math.cos(hip)/2,z:hipZ+thigh*Math.sin(hip)/2},
    base:{x:0,y:knee.y-shin*Math.cos(lower)/2,z:knee.z+shin*Math.sin(lower)/2},
    nose:{x:0,y:head.y-0.265*Math.sin(headAngle),z:head.z+0.265*Math.cos(headAngle)},
    hipAngle:-hip,lowerAngle:-lower};
}
