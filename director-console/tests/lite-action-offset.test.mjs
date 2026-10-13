import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/three.module.js';
import {createDesktopProject,addActor,addMoveAction,recordActorPoseKeyframe,setActorTransform,normalizeDesktopProject} from '../app/project-model.js';
import {sampleActor,initialActorSample} from '../app/playback-engine.js';
import {blockingTargetPosition} from '../app/blocking-actor.js';
import {createBlockingFigure,applyBlockingFigurePose} from '../app/blocking-figure.js';
import {applyFilmSpaceOperations} from '../app/project-command-service.js';
import {semanticPatchBetween,applySemanticProjectPatch,invertSemanticPatch} from '../app/semantic-project-patch.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const person=p=>p.scene.actors[0];
const fixture=()=>addActor(createDesktopProject(),{id:'offset-actor',characterAssetID:'blocking-figure',position:{x:0,y:6,z:0},rotationY:Math.PI/2,scale:2});

test('jump offsets blend back onto the moving path, independent of pose yaw and actor scale',()=>{
 let p=addMoveAction(fixture(),'offset-actor',{x:8,y:6,z:0},{speed:2});
 const path=structuredClone(person(p).motionActions);
 for(const [time,offsetX,offsetY,offsetZ] of [[0,0,0,0],[1,1,2,3],[3,0,0,0]])
   p=recordActorPoseKeyframe(p,'offset-actor',time,{offsetX,offsetY,offsetZ,rotationYOffset:-Math.PI/2,rotationZ:time===1?Math.PI/2:0});
 const peak=sampleActor(person(p),1),mid=sampleActor(person(p),2),landed=sampleActor(person(p),3);
 assert.deepEqual(peak.pathPosition,{x:2,y:6,z:0});close(peak.position.x,5);close(peak.position.y,8);close(peak.position.z,-1);
 close(mid.position.x,5.5);close(mid.position.y,7);close(mid.position.z,-.5);
 assert.deepEqual(landed.position,landed.pathPosition);close(landed.position.x,6);
 assert.deepEqual(person(p).motionActions,path);
 const moved=setActorTransform(p,'offset-actor',{x:10,y:9,z:20},Math.PI/2);
 const movedPeak=sampleActor(person(moved),1);close(movedPeak.position.x,15);close(movedPeak.position.y,11);close(movedPeak.position.z,19);
 assert.deepEqual(person(moved).poseTrack,person(p).poseTrack);
 const loaded=normalizeDesktopProject(JSON.parse(JSON.stringify(p)));
 for(const time of [4,0,2,1,3,1]) assert.deepEqual(sampleActor(person(p),time),sampleActor(person(loaded),time));
});

test('initial/reset sampling, camera targeting and MCP all consume the same displaced actor',()=>{
 const before=fixture();
 const p=applyFilmSpaceOperations(before,[{action:'record_actor_pose_keyframe',actorID:'offset-actor',time:0,pose:{offsetX:1,offsetY:2,offsetZ:3,rotationX:.2,rotationZ:.3}}]).project;
 const actor=person(p),sample=initialActorSample(actor);
 assert.deepEqual(sample.position,sampleActor(actor,0).position);
 const root=new THREE.Group(),model=createBlockingFigure('#dddddd');
 root.position.set(sample.position.x,sample.position.y,sample.position.z);root.rotation.y=sample.rotationY;root.scale.setScalar(actor.scale);
 root.add(model);applyBlockingFigurePose(model,sample);root.updateMatrixWorld(true);
 const head=model.getObjectByName('Head').getWorldPosition(new THREE.Vector3()),target=blockingTargetPosition(actor,sample);
 for(const axis of ['x','y','z'])close(head[axis],target[axis]);
 assert.deepEqual(semanticPatchBetween(before,applySemanticProjectPatch(p,invertSemanticPatch(before,p))),[]);
 for(const pose of [{offsetX:Infinity},{offsetY:1001},{offsetZ:'2'}])assert.throws(()=>applyFilmSpaceOperations(p,[{action:'record_actor_pose_keyframe',actorID:actor.id,time:1,pose}]));
});

test('return button records zeros at the playhead; optional upright preserves other draft channels',()=>{
 const source=readFileSync(new URL('../app/director-app.js',import.meta.url),'utf8');
 const start=source.indexOf('function returnActorToPath()');
 const code=source.slice(start,source.indexOf('\nfunction ',start+1));
 const context=vm.createContext({actorPoseTarget:()=>({id:'offset-actor'}),canAuthor:()=>true,actorReturnUpright:false,
   actorPoseDraft:{pose:{rotationYOffset:1,headPitch:.3,offsetY:2}},project:{id:'offset-project'},playback:{elapsed:3},persistActorPoseDraft(){}});
 vm.runInContext(code,context);context.returnActorToPath();
 assert.deepEqual(JSON.parse(JSON.stringify(context.actorPoseDraft)),{projectID:'offset-project',actorID:'offset-actor',time:3,pose:{rotationYOffset:0,headPitch:.3,offsetX:0,offsetY:0,offsetZ:0}});
 context.actorReturnUpright=true;context.returnActorToPath();
 assert.equal(context.actorPoseDraft.pose.rotationX,0);assert.equal(context.actorPoseDraft.pose.rotationZ,0);assert.equal(context.actorPoseDraft.pose.rotationYOffset,0);
});
