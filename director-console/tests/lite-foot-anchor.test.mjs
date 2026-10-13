import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createDesktopProject,addActor,addMoveAction,addStayAction,normalizeDesktopProject} from '../app/project-model.js';
import {sampleActor,actorPlaybackPlan} from '../app/playback-engine.js';
import {createBlockingFigure,applyBlockingFigurePose} from '../app/blocking-figure.js';
import {blockingTargetPosition} from '../app/blocking-actor.js';
import {legacyActorPose,blendActorPose} from '../app/actor-pose.js';
import {applyFilmSpaceOperations} from '../app/project-command-service.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function rendered(actor,sample){
 const model=createBlockingFigure('#1a5ce0'),group=new THREE.Group();group.add(model);
 group.scale.setScalar(actor.scale);group.position.copy(sample.position);group.rotation.y=sample.rotationY;
 applyBlockingFigurePose(model,sample);group.updateMatrixWorld(true);return model;
}
test('sit/stand blends keep the lower-leg contact at the origin while hips clear the seat',()=>{
 const model=createBlockingFigure('#1a5ce0');
 for(const height of [0,.45,2])for(const alpha of [0,.2,.5,.8,1]){
  const pose=blendActorPose(legacyActorPose({}, {posture:'sit',seatHeight:height}),legacyActorPose(),alpha);
  applyBlockingFigurePose(model,{blockingPose:pose});model.updateMatrixWorld(true);
  const foot=model.getObjectByName('BodyBase').localToWorld(new THREE.Vector3(0,-.5,0));
  close(foot.x,0);close(foot.y,0);close(foot.z,0);
  close(model.getObjectByName('Body').position.z,-.4*Math.sin((1-alpha)*Math.PI/2));
  close(pose.torsoPitch,0);
 }
});
test('MCP seated Hold -> standing Hold -> Move preserves contact, time boundaries and deterministic seeks',()=>{
 const p=applyFilmSpaceOperations(createDesktopProject(),[
  {action:'add_actor',id:'foot-person',position:{x:1,y:3,z:2},rotationY:1,scale:1.4},
  {action:'add_stay',actorID:'foot-person',options:{posture:'sit',duration:1}},
  {action:'add_stay',actorID:'foot-person',options:{posture:'stand',duration:.25}},
  {action:'add_move',actorID:'foot-person',target:{x:1,y:3,z:4},options:{speed:1}},
 ]).project,a=p.scene.actors[0],before=JSON.stringify(a);
 for(const time of [0,.5,1,1.125,1.25,1.125]){
  const s=sampleActor(a,time),model=rendered(a,s);
  const foot=model.getObjectByName('BodyBase').localToWorld(new THREE.Vector3(0,-.5,0));
  for(const axis of ['x','y','z'])close(foot[axis],a.position[axis]);
  const head=model.getObjectByName('Head').getWorldPosition(new THREE.Vector3());
  const target=blockingTargetPosition(a,s);for(const axis of ['x','y','z'])close(target[axis],head[axis]);
 }
 close(sampleActor(a,1.75).position.z,2.5);assert.equal(JSON.stringify(a),before);
 assert.deepEqual(sampleActor(normalizeDesktopProject(p).scene.actors[0],1.125),sampleActor(a,1.125));
});
test('old seated start migrates exactly once with yaw, tilt, scale and offsets; standing destinations stay authored',()=>{
 for(const rotationY of [0,1,-2]){
  let p=addActor(createDesktopProject(),{id:'foot-person',position:{x:2,y:3,z:4},rotationY,rotationX:.3,rotationZ:.2,scale:1.3});
  p=addStayAction(p,'foot-person',{posture:'sit',duration:1});p=addStayAction(p,'foot-person',{posture:'stand',duration:.25});
  p=addMoveAction(p,'foot-person',{x:6,y:3,z:4},{speed:1});p.schemaVersion=68;
  const a=p.scene.actors[0];a.poseTrack.keyframes=[{id:'offset',time:0,interpolation:'smooth',pose:{offsetX:.2,offsetY:.1,offsetZ:.3,rotationYOffset:.4}}];
  const old=sampleActor(a,.5),oldModel=rendered(a,old);
  // Old geometry differs by +0.4 on the entire local Z axis.
  const expected=oldModel.localToWorld(new THREE.Vector3(0,oldModel.getObjectByName('Head').position.y,0));
  const loaded=normalizeDesktopProject(p),next=loaded.scene.actors[0];
  const head=rendered(next,sampleActor(next,.5)).getObjectByName('Head').getWorldPosition(new THREE.Vector3());
  for(const axis of ['x','y','z'])close(head[axis],expected[axis]);
  assert.deepEqual(next.motionActions.at(-1).position,a.motionActions.at(-1).position);
  assert.deepEqual(next.poseTrack,a.poseTrack);assert.deepEqual(normalizeDesktopProject(loaded),loaded);
 }
});
test('old arrival seat moves only its path point and keeps its inherited seated heading',()=>{
 let p=addActor(createDesktopProject(),{id:'foot-person'});p=addMoveAction(p,'foot-person',{x:2,y:0,z:0},{speed:1});
 p=addStayAction(p,'foot-person',{posture:'sit',duration:1});p=addStayAction(p,'foot-person',{posture:'stand',duration:.25});
 p=addMoveAction(p,'foot-person',{x:4,y:0,z:0},{speed:1});p.schemaVersion=68;
 const old=p.scene.actors[0],next=normalizeDesktopProject(p).scene.actors[0];
 assert.deepEqual(next.position,old.position);close(next.motionActions[1].position.x,2.4);
 close(next.motionActions.find(a=>a.posture==='sit').facingY,Math.PI/2);assert.deepEqual(next.motionActions.at(-1).position,old.motionActions.at(-1).position);
 const t=actorPlaybackPlan(next).actionTimings[next.motionActions.findIndex(a=>a.posture==='sit')].actionStartTime+.5;
 close(blockingTargetPosition(next,sampleActor(next,t)).x,2);
});
