import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '../vendor/three/three.module.js';
import { createDesktopProject, addActor, addShot, findShot, updateShotCameraKeyframeBodycam, updateShotCameraKeyframe, recordShotCameraKeyframe, normalizeDesktopProject, recordActorPoseKeyframe, moveShotCameraKeyframe, duplicateShot } from '../app/project-model.js';
import { sampleShotCamera } from '../app/camera-aim.js';
import { effectiveCameraBodycam, bodycamActorFrame } from '../app/camera-bodycam.js';
import { applyFilmSpaceOperations, validateFilmSpaceOperation } from '../app/project-command-service.js';
import { applyCameraHandheld } from '../app/camera-handheld.js';
const pose = {position:{x:2,y:1.7,z:5},quaternion:{x:0,y:0,z:0,w:1},focalLength:35};
function fixture(){let p=addActor(createDesktopProject());return addShot(p,{cameraPose:pose});}
const key=p=>findShot(p).camera.track.keyframes[0];
const localKey=(id,time,targetActorID,x,enabled=true)=>({id,time,...pose,bodycam:{enabled,targetActorID,localPosition:{x,y:0,z:1},localQuaternion:{x:0,y:0,z:0,w:1}}});

test('Bodycam interpolation isolates other wearers and disabled intervals',()=>{
 for(const interpolation of ['smooth','linear','ease-in-out']){
  for(const foreignX of [100,-100]){
   const previous={interpolation,outTime:2,keyframes:[localKey('foreign',0,'B',foreignX),localKey('a',1,'A',0),localKey('b',2,'A',1)]};
   near(effectiveCameraBodycam(previous,1.5).localPosition,{x:.5,y:0,z:1});
   const disabled={interpolation,outTime:2,keyframes:[localKey('a',0,'A',0),localKey('b',1,'A',1),localKey('off',2,'A',foreignX,false)]};
   near(effectiveCameraBodycam(disabled,.5).localPosition,{x:.5,y:0,z:1});
   assert.equal(effectiveCameraBodycam(disabled,2).enabled,false);
  }
 }
});

test('continuous Bodycam bindings preserve their spline and inherit ordinary keys',()=>{
 const keys=[localKey('a',0,'A',0),localKey('b',1,'A',1),localKey('c',2,'A',1.2)];
 const track={interpolation:'smooth',outTime:2,keyframes:keys};
 const original=effectiveCameraBodycam(track,.5);
 const inherited=effectiveCameraBodycam({...track,keyframes:[keys[0],{id:'ordinary',time:.25,...pose},...keys.slice(1)]},.5);
 near(inherited.localPosition,original.localPosition);
 assert.notEqual(original.localPosition.x,.5,'same-wearer neighbouring keys still determine the smooth tangent');
});
function bind(p,placement='preserve'){return updateShotCameraKeyframeBodycam(p,findShot(p).id,key(p).id,{enabled:true,targetActorID:p.scene.actors[0].id},placement);}
const sample=(p,t=0)=>sampleShotCamera(p,findShot(p),t);
function near(a,b){for(const k of Object.keys(b))assert.ok(Math.abs(a[k]-b[k])<1e-6,`${k}: ${a[k]} != ${b[k]}`);}
function nearPose(a,b){near(a.position,b.position);assert.ok(Math.abs(Object.keys(b.quaternion).reduce((s,k)=>s+a.quaternion[k]*b.quaternion[k],0))>1-1e-6);}
test('enable preserves visible pose, bypasses Follow/Aim and off restores original',()=>{
 let p=fixture();key(p).follow={enabled:true,targetActorID:p.scene.actors[0].id,referenceTime:0};key(p).aim={mode:'look-at',targetKind:'actor',targetActorID:p.scene.actors[0].id,trackingResponse:.6};
 const before=sample(p),original=structuredClone(key(p));p=bind(p);nearPose(sample(p),before);assert.deepEqual(key(p).follow,original.follow);assert.equal(key(p).aim.trackingResponse,.6);assert.equal(sample(p).aimEvaluation,undefined);
 p=updateShotCameraKeyframeBodycam(p,findShot(p).id,key(p).id,{enabled:false});nearPose(sample(p),before);near(key(p).position,original.position);
});
test('chest follows translation, scale, three-axis tilt and torso but excludes head',()=>{
 let p=fixture();p.scene.actors[0].scale=1.6;p=bind(p,'chest');const first=sample(p),actor=p.scene.actors[0];actor.position={x:3,y:2,z:-1};actor.rotationY=.8;
 p=recordActorPoseKeyframe(p,actor.id,0,{rotationX:.3,rotationZ:-.2,torsoPitch:.4,headPitch:.5});
 const frame=bodycamActorFrame(p,actor.id,0),expected=new Vector3(0,.35,1.5).multiplyScalar(frame.scale).applyQuaternion(frame.quaternion).add(frame.position);
 near(sample(p).position,{x:expected.x,y:expected.y,z:expected.z});assert.notDeepEqual(sample(p).position,first.position);
 const q=frame.quaternion.clone().multiply(new Quaternion(0,0,0,1));near(sample(p).quaternion,{x:q.x,y:q.y,z:q.z,w:q.w});
 const before=sample(p);p=recordActorPoseKeyframe(p,actor.id,0,{rotationX:.3,rotationZ:-.2,torsoPitch:.4,headPitch:-.6});nearPose(sample(p),before);
});
test('world edit and later record round-trip, interpolate, persist, retime and duplicate',()=>{
 let p=bind(fixture(),'chest');const sid=findShot(p).id,base=structuredClone(key(p));let desired={...sample(p),position:{x:1,y:2,z:3},quaternion:pose.quaternion};
 p=updateShotCameraKeyframe(p,sid,key(p).id,desired);nearPose(sample(p),desired);near(key(p).position,base.position);
 desired={...sample(p,2),position:{x:3,y:2,z:3}};p=recordShotCameraKeyframe(p,sid,desired,2);nearPose(sample(p,2),desired);near(sample(p,1).position,{x:2,y:2,z:3});
 p=normalizeDesktopProject(JSON.parse(JSON.stringify(p)));nearPose(sample(p,2),desired);
 p=moveShotCameraKeyframe(p,sid,findShot(p).camera.track.keyframes.at(-1).id,3);nearPose(sample(p,3),desired);
 const clone=duplicateShot(p,sid);assert.deepEqual(clone.scene.shots.at(-1).camera.track.keyframes[0].bodycam,key(p).bodycam);
});
test('ordinary inherited keys keep binding; off and missing targets are explicit',()=>{
 let p=fixture();p=recordShotCameraKeyframe(p,findShot(p).id,{...pose,position:{x:9,y:3,z:1}},2);p=bind(p,'chest');nearPose(sample(p),sample(p,1));
 p=updateShotCameraKeyframeBodycam(p,findShot(p).id,findShot(p).camera.track.keyframes.at(-1).id,{enabled:false});assert.equal(sample(p,1).bodycamEvaluation.enabled,true);assert.equal(sample(p,2).bodycamEvaluation,undefined);
 p.scene.actors=[];assert.match(sample(p).bodycamEvaluation.warning,/不存在/);assert.throws(()=>updateShotCameraKeyframe(p,findShot(p).id,key(p).id,pose),/不存在/);
});
test('MCP shares binding authoring; handheld is applied afterwards',()=>{
 let p=fixture();const op={action:'update_camera_keyframe_bodycam',shotID:findShot(p).id,keyframeID:key(p).id,bodycam:{enabled:true,targetActorID:p.scene.actors[0].id},placement:'chest'};
 validateFilmSpaceOperation(op);p=applyFilmSpaceOperations(p,[op]).project;nearPose(sample(p),sample(bind(fixture(),'chest')));
 const plain=sample(p,.3);findShot(p).camera.modifiers.handheld={enabled:true,intensity:.8,frequency:1.2,seed:23};nearPose(sample(p,.3),applyCameraHandheld(findShot(p),plain,.3));
 assert.throws(()=>applyFilmSpaceOperations(p,[{...op,bodycam:{enabled:true,targetActorID:'missing'}}]),/人物/);
});

 test('chest reset faces its wearer and preserves previously saved installations until reset',()=>{
  let p=fixture();p=bind(p,'chest');const camera=sample(p),actor=p.scene.actors[0];
  const forward=new Vector3(0,0,-1).applyQuaternion(new Quaternion(camera.quaternion.x,camera.quaternion.y,camera.quaternion.z,camera.quaternion.w));
  const towardTorso=bodycamActorFrame(p,actor.id,0).position.clone().sub(new Vector3(camera.position.x,camera.position.y,camera.position.z)).normalize();
  assert.ok(forward.dot(towardTorso)>.95,'camera must face back at its own wearer');
  near(camera.position,{x:0,y:1.47,z:1.5});
  const saved={enabled:true,targetActorID:actor.id,localPosition:{x:0,y:0,z:.27},localQuaternion:{x:0,y:1,z:0,w:0}};
  key(p).bodycam=saved;p=normalizeDesktopProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(key(p).bodycam,saved);
  p=bind(p,'chest');assert.ok(sample(p).quaternion.w>.99);
 });
