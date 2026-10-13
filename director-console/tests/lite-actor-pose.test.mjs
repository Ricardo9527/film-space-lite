import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createDesktopProject,addActor,addMoveAction,addStayActionAtPoint,recordActorPoseKeyframe,duplicateActor,normalizeDesktopProject,setActorLocked} from '../app/project-model.js';
import {createActorPoseTrack,recordActorPose,sampleActorPose,moveActorPoseFrames,legacyActorPose,blockingPoseLandmarks,actorFramePose} from '../app/actor-pose.js';
import {sampleActor} from '../app/playback-engine.js';
import {createBlockingFigure,applyBlockingFigurePose} from '../app/blocking-figure.js';
import {blockingTargetPosition} from '../app/blocking-actor.js';
import {applyFilmSpaceOperations} from '../app/project-command-service.js';
import {semanticPatchBetween,applySemanticProjectPatch,invertSemanticPatch} from '../app/semantic-project-patch.js';
import {wireTimelineKeyframeMarker} from '../app/camera-keyframe-interaction.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const project=()=>addActor(createDesktopProject({id:'pose-project',durationSeconds:8}),{id:'person'});
const actor=p=>p.scene.actors.find(a=>a.id==='person');

test('pose recording snaps to frames, merges channels and preserves identity; invalid import fails clearly',()=>{
  let track=recordActorPose(createActorPoseTrack(),.51,{torsoPitch:.4},24);
  const key=track.keyframes[0]; close(key.time,12/24);
  track=recordActorPose(track,.502,{headPitch:.3},24);
  assert.equal(track.keyframes.length,1);assert.equal(track.keyframes[0].id,key.id);
  assert.deepEqual(track.keyframes[0].pose,{torsoPitch:.4,headPitch:.3});
  for(const pose of [{},[],null,{headPitch:2},{torsoPitch:NaN},{extra:1}])
    assert.throws(()=>createActorPoseTrack({keyframes:[{time:0,pose}]}));
  const seated=legacyActorPose({}, {posture:'sit',seatHeight:2});
  assert.throws(()=>recordActorPose(createActorPoseTrack(),0,seated),/Unknown actor pose parameter/);
  assert.doesNotThrow(()=>recordActorPose(createActorPoseTrack(),0,actorFramePose(seated)));
});

test('sparse bow frames combine with Move and automatic facing; seeks and persistence remain deterministic',()=>{
  let p=addMoveAction(project(),'person',{x:4,y:2,z:0},{speed:Math.sqrt(20)/4});
  p=recordActorPoseKeyframe(p,'person',0,{torsoPitch:0,headPitch:0});
  p=recordActorPoseKeyframe(p,'person',2,{torsoPitch:1,headPitch:.3});
  p=recordActorPoseKeyframe(p,'person',4,{torsoPitch:0,headPitch:0});
  const mid=sampleActor(actor(p),1);close(mid.position.x,1);close(mid.position.y,.5);
  close(mid.rotationY,Math.PI/2);close(mid.blockingPose.torsoPitch,.5);
  const reloaded=normalizeDesktopProject(JSON.parse(JSON.stringify(p)));
  for(const time of [4,0,3,1,2,1])assert.deepEqual(sampleActor(actor(p),time),sampleActor(actor(reloaded),time));
  const aimed=recordActorPoseKeyframe(p,'person',2,{rotationYOffset:-Math.PI/2});
  close(sampleActor(actor(aimed),2).rotationY,0);
  const short=createActorPoseTrack({keyframes:[{time:0,pose:{rotationYOffset:170*Math.PI/180}},{time:2,pose:{rotationYOffset:-170*Math.PI/180}}]});
  close(sampleActorPose(short,1,legacyActorPose()).rotationYOffset,0);
});

test('legacy stand/sit holds blend continuously without changing initial pose or Move position',()=>{
  let p=addMoveAction(project(),'person',{x:1,y:0,z:0},{speed:1});
  const point=actor(p).motionActions.at(-1);
  p=addStayActionAtPoint(p,'person',point.id,{duration:1,posture:'sit',seatHeight:.45});
  close(sampleActor(actor(p),1).blockingPose.hipBend,0);
  close(sampleActor(actor(p),1.125).blockingPose.hipBend,Math.PI/4);
  close(sampleActor(actor(p),1.25).blockingPose.hipBend,Math.PI/2);
  close(sampleActor(actor(p),1.125).position.x,1);
  close(blockingPoseLandmarks(legacyActorPose()).head.y,1.62);
  close(blockingPoseLandmarks(legacyActorPose({}, {posture:'sit',seatHeight:.45})).head.y,1.395);
});

test('all actor frames including zero move together; neighbors constrain groups without changing spacing',()=>{
  const track=createActorPoseTrack({keyframes:[0,1,2,3].map(time=>({id:`p${time}`,time,pose:{headPitch:time*.1}}))});
  const all=moveActorPoseFrames(track,track.keyframes.map(k=>k.id),.5,30);
  assert.deepEqual(all.keyframes.map(k=>k.time),[.5,1.5,2.5,3.5]);
  const bounded=moveActorPoseFrames(track,['p1','p2'],5,30);
  close(bounded.keyframes[1].time,2-1/30);close(bounded.keyframes[2].time,3-1/30);
  assert.deepEqual(moveActorPoseFrames(all,all.keyframes.map(k=>k.id),-5).keyframes.map(k=>k.time),[0,1,2,3]);
});

test('shared marker drag supports a zero-time actor frame and previews every selected frame before one commit',()=>{
  const track=createActorPoseTrack({keyframes:[0,1].map(time=>({id:`p${time}`,time,pose:{headPitch:0}}))});
  const markers=track.keyframes.map(k=>({dataset:{actorPoseKeyframeId:k.id},style:{},handlers:{},classList:{toggle(){}},setAttribute(){},addEventListener(n,f){this.handlers[n]=f;},closest(){return rail;},focus(){},setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){}}));
  const rail={querySelectorAll(){return markers;},getBoundingClientRect(){return {width:1000+9*Math.SQRT2};}};
  const commits=[],selected=new Set(['p0','p1']);
  wireTimelineKeyframeMarker(markers[0],{canEdit:()=>true,getTrack:()=>track,getSelection:()=>selected,select(){},commit:(...args)=>commits.push(args),frameRate:30,span:10,offset:x=>x,moveTrack:moveActorPoseFrames,idProperty:'actorPoseKeyframeId',railSelector:'actor',markerSelector:'actor',fixedZero:false});
  const fire=(n,x)=>markers[0].handlers[n]({pointerId:1,button:0,clientX:x,preventDefault(){}});
  fire('pointerdown',0);fire('pointermove',100);assert.equal(commits.length,0);
  close(markers[0].style.left,.1);close(markers[1].style.left,.2);fire('pointerup',100);
  assert.deepEqual(commits,[[['p0','p1'],1,'p0']]);
});

test('MCP edits one durable pose track; lock, ownership, validation and undo share UI semantics',()=>{
  let p=project();const before=structuredClone(p);
  const result=applyFilmSpaceOperations(p,[{action:'record_actor_pose_keyframe',actorID:'person',time:2,pose:{rotationX:.2,torsoPitch:.3,headPitch:.4}}]);
  p=result.project;const key=actor(p).poseTrack.keyframes[0];
  assert.ok(Object.values(result.results[0].created).flat().includes(key.id));
  p=applyFilmSpaceOperations(p,[{action:'update_actor_pose_keyframe',actorID:'person',keyframeID:key.id,pose:{headPitch:.2}},{action:'move_actor_pose_keyframes',actorID:'person',keyframeIDs:[key.id],deltaTime:1},{action:'set_actor_pose_interpolation',actorID:'person',interpolation:'linear'}]).project;
  close(actor(p).poseTrack.keyframes[0].time,3);close(actor(p).poseTrack.keyframes[0].pose.headPitch,.2);
  const clone=duplicateActor(p,'person').scene.actors[1];assert.notEqual(clone.poseTrack.keyframes[0].id,key.id);
  assert.throws(()=>applyFilmSpaceOperations(p,[{action:'delete_actor_pose_keyframes',actorID:'person',keyframeIDs:['wrong-owner']}]),/not found|belong/i);
  assert.throws(()=>applyFilmSpaceOperations(setActorLocked(p,'person',true),[{action:'record_actor_pose_keyframe',actorID:'person',time:0,pose:{headPitch:0}}]),/locked/i);
  assert.throws(()=>applyFilmSpaceOperations(p,[{action:'record_actor_pose_keyframe',actorID:'person',time:0,pose:{headPitch:2}}]));
  assert.deepEqual(semanticPatchBetween(before,applySemanticProjectPatch(p,invertSemanticPatch(before,p))),[]);
  assert.deepEqual(semanticPatchBetween(p,applySemanticProjectPatch(before,semanticPatchBetween(before,p))),[]);
  p=applyFilmSpaceOperations(p,[{action:'delete_actor_pose_keyframes',actorID:'person',keyframeIDs:[key.id]}]).project;
  assert.equal(actor(p).poseTrack.keyframes.length,0);
  const old=structuredClone(before);delete old.scene.actors[0].poseTrack;
  assert.deepEqual(actor(normalizeDesktopProject(old)).poseTrack,createActorPoseTrack());
});

test('camera actor target exactly matches rendered head through pose, scale, yaw and local tilt',()=>{
  const a={...actor(project()),scale:1.4,rotationX:.3,rotationZ:.2};
  const pose={...legacyActorPose(a),rotationY:.7,torsoPitch:.8,headPitch:.4,hipBend:.3,kneeBend:Math.PI/2,bodyHeight:.8};
  const sample={position:{x:2,y:1,z:-3},rotationY:.7,blockingPose:pose};
  const figure=createBlockingFigure('#dddddd');applyBlockingFigurePose(figure,sample);
  const root=new THREE.Group();root.position.set(2,1,-3);root.rotation.y=pose.rotationY;root.scale.setScalar(a.scale);root.add(figure);root.updateMatrixWorld(true);
  const head=figure.getObjectByName('Head').getWorldPosition(new THREE.Vector3()),target=blockingTargetPosition(a,sample);
  for(const k of ['x','y','z'])close(head[k],target[k]);
  assert.ok(blockingPoseLandmarks(pose).head.y<1.62);
});


test('recording a seated frame cannot lock stand/sit or alter Move position',()=>{
  let p=project();
  const anchor=actor(p).motionActions[0];
  p=addStayActionAtPoint(p,'person',anchor.id,{duration:3,posture:'sit',seatHeight:.45});
  const sit=actor(p).motionActions.at(-1);
  p=addStayActionAtPoint(p,'person',anchor.id,{duration:1,posture:'stand'});
  const seated=sampleActor(actor(p),1).blockingPose;
  const frame=actorFramePose({...seated,rotationYOffset:1,rotationX:.1,headPitch:.2});
  p=recordActorPoseKeyframe(p,'person',1,frame);
  close(sampleActor(actor(p),2).blockingPose.hipBend,Math.PI/2);
  close(sampleActor(actor(p),3.125).blockingPose.hipBend,Math.PI/4);
  for (const t of [3.6,4,20]) {
    const s=sampleActor(actor(p),t);
    close(s.blockingPose.hipBend,0);close(s.blockingPose.kneeBend,0);
    close(s.rotationY,1);close(s.blockingPose.rotationX,.1);close(s.blockingPose.headPitch,.2);
    assert.deepEqual(s.position,actor(p).position);
  }
  const old=structuredClone(p);old.schemaVersion=65;
  old.scene.actors[0].poseTrack.keyframes[0].pose={...seated,rotationY:1,rotationX:.1,headPitch:.2};
  old.scene.actors[0].poseTrack.keyframes.push({id:'legacy-leg-only',time:2,interpolation:'smooth',pose:{hipBend:Math.PI/2}});
  const migrated=normalizeDesktopProject(old);
  assert.deepEqual(actor(migrated).poseTrack,actor(p).poseTrack);
  const actionShape=a=>a.motionActions.map(({position,facingY,...action})=>action);
  assert.deepEqual(actionShape(actor(migrated)),actionShape(actor(p)));
  assert.deepEqual(sampleActor(actor(migrated),3.6).blockingPose,sampleActor(actor(p),3.6).blockingPose);
  assert.deepEqual(normalizeDesktopProject(migrated),migrated);
  for (const name of ['hipBend','kneeBend','bodyHeight','legLength','position']) {
    assert.throws(()=>applyFilmSpaceOperations(p,[{action:'record_actor_pose_keyframe',actorID:'person',time:2,pose:{[name]:.5}}]));
  }
});
