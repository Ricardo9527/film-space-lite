import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createDesktopProject,normalizeDesktopProject,setActorLocked,duplicateActor} from '../app/project-model.js';
import {applyFilmSpaceOperations} from '../app/project-command-service.js';
import {sampleActor} from '../app/playback-engine.js';
import {blockingTargetPosition} from '../app/blocking-actor.js';
import {blockingPoseLandmarks,actorFramePose} from '../app/actor-pose.js';
import {createBlockingFigure,applyBlockingFigurePose} from '../app/blocking-figure.js';
import {semanticPatchBetween,applySemanticProjectPatch,invertSemanticPatch} from '../app/semantic-project-patch.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const actor=p=>p.scene.actors[0];
const make=()=>applyFilmSpaceOperations(createDesktopProject({durationSeconds:8}),[
 {action:'add_actor',id:'person'},
 {action:'add_stay',actorID:'person',options:{gesture:'kneel',duration:3,transitionSeconds:2}},
 {action:'add_stay',actorID:'person',options:{gesture:'hold',joints:{headPitch:-.4},duration:2,transitionSeconds:1}},
 {action:'add_stay',actorID:'person',options:{gesture:'hold',joints:{headYaw:1,torsoYaw:.3,torsoRoll:.15},duration:2,transitionSeconds:1}},
]).project;
test('MCP kneel -> raise head -> turn left preserves joints and explicit timing, including initial action',()=>{
 const p=make(),a=actor(p);
 close(sampleActor(a,0).blockingPose.kneeBend,0);
 close(sampleActor(a,1).blockingPose.kneeBend,Math.PI/4);
 close(sampleActor(a,2).blockingPose.kneeBend,Math.PI/2);
 close(sampleActor(a,3.5).blockingPose.headPitch,-.2);
 for(const t of [2,3,4,5,6,7,8]) close(sampleActor(a,t).blockingPose.kneeBend,Math.PI/2);
 close(sampleActor(a,5.5).blockingPose.headYaw,.5);
 close(sampleActor(a,6).blockingPose.headPitch,-.4);
 close(sampleActor(a,6).blockingPose.headYaw,1);
 const loaded=normalizeDesktopProject(JSON.parse(JSON.stringify(p)));
 for(const t of [6,0,1,3.5,5.5,7,1])assert.deepEqual(sampleActor(actor(loaded),t),sampleActor(a,t));
 const cloned=duplicateActor(p,a.id).scene.actors[1];
 assert.deepEqual(cloned.motionActions.map(({id,position,...rest})=>rest),a.motionActions.map(({id,position,...rest})=>rest));
 assert.deepEqual(applySemanticProjectPatch(p,invertSemanticPatch(p,loaded)),p);
 const changed=applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:a.id,actionID:a.motionActions[1].id,patch:{joints:{torsoPitch:.5},transitionSeconds:1}}]).project;
 assert.deepEqual(semanticPatchBetween(p,applySemanticProjectPatch(changed,invertSemanticPatch(p,changed))),[]);
 assert.deepEqual(semanticPatchBetween(changed,applySemanticProjectPatch(p,semanticPatchBetween(p,changed))),[]);
});
test('joint hierarchy matches rendered head/aim and keeps knees distinguishable from crouch',()=>{
 const p=make(),a={...actor(p),scale:1.3},s=sampleActor(a,6),model=createBlockingFigure('#aaaaaa');
 const root=new THREE.Group();root.position.copy(s.position);root.rotation.y=s.rotationY;root.scale.setScalar(a.scale);root.add(model);
 applyBlockingFigurePose(model,s);root.updateMatrixWorld(true);
 const head=model.getObjectByName('Head').getWorldPosition(new THREE.Vector3()),target=blockingTargetPosition(a,s);
 for(const axis of ['x','y','z'])close(head[axis],target[axis]);
 const nose=model.getObjectByName('Nose').getWorldPosition(new THREE.Vector3());assert.ok(nose.x>head.x);
 const points=blockingPoseLandmarks(s.blockingPose);assert.ok(points.base.y<.2 && points.bend.y>points.base.y);
 const crouch=applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:a.id,actionID:a.motionActions[1].id,patch:{gesture:'crouch'}}]).project;
 assert.ok(blockingPoseLandmarks(sampleActor(actor(crouch),2).blockingPose).hipZ < points.hipZ);
 assert.equal(Object.hasOwn(actorFramePose(s.blockingPose),'kneeBend'),false);
 assert.equal(Object.hasOwn(actorFramePose(s.blockingPose),'headYaw'),false);
});
test('invalid joints and Move/anchor ownership fail; clearing overrides and plain stand preserve old semantics',()=>{
 const p=make(),a=actor(p);
 for(const options of [{joints:{headYaw:2}},{joints:{kneeBend:-1}},{joints:{elbow:1}},{joints:[]},{gesture:'fly'},{transitionSeconds:-1}])
  assert.throws(()=>applyFilmSpaceOperations(p,[{action:'add_stay',actorID:a.id,options}]));
 assert.throws(()=>applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:a.id,actionID:a.motionActions[0].id,patch:{joints:{headYaw:1}}}]));
 assert.throws(()=>applyFilmSpaceOperations(setActorLocked(p,a.id,true),[{action:'add_stay',actorID:a.id,options:{gesture:'kneel'}}]));
 const cleared=applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:a.id,actionID:a.motionActions[3].id,patch:{joints:{}}}]).project;
 assert.equal(actor(cleared).motionActions[3].joints,undefined);
 const stand=applyFilmSpaceOperations(p,[{action:'add_stay',actorID:a.id,options:{posture:'stand',duration:1}}]).project;
 close(sampleActor(actor(stand),7.25).blockingPose.kneeBend,0);
 close(sampleActor(actor(stand),7.25).blockingPose.headYaw,0);
 const immediate=applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:a.id,actionID:a.motionActions[1].id,patch:{transitionSeconds:0}}]).project;
 close(sampleActor(actor(immediate),0).blockingPose.kneeBend,Math.PI/2);
});
test('new project resets displaced/top scene view without changing authored shot camera',()=>{
 const source=readFileSync(new URL('../app/director-renderer.js',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('  resetSceneView() {'),source.indexOf('  moveCameraToOrbitView() {'));
 const renderer={camera:new THREE.PerspectiveCamera(),shotCamera:new THREE.PerspectiveCamera(),cameraKeys:new Set(['w']),cameraPrecisionKeys:new Set(['shift']),cameraPlanarVelocity:new THREE.Vector2(1,1),orbit:{target:new THREE.Vector3(20,5,10),update(){}},releaseTopViewLock(){this.topViewLock=null;},configureEditorCameraRange(){},topViewLock:{},cameraFocusTransition:{}};
 renderer.camera.position.set(20,30,40);renderer.shotCamera.position.set(1,2,3);
 vm.runInNewContext('({'+method+'})',{ }).resetSceneView.call(renderer);
 assert.deepEqual(renderer.camera.position.toArray(),[4.8,4.2,6.6]);assert.deepEqual(renderer.orbit.target.toArray(),[0,.85,0]);
 assert.equal(renderer.topViewLock,null);assert.equal(renderer.cameraKeys.size,0);assert.equal(renderer.cameraFocusTransition,null);
 assert.deepEqual(renderer.shotCamera.position.toArray(),[1,2,3]);
 const app=readFileSync(new URL('../app/director-app.js',import.meta.url),'utf8');
 assert.match(app.slice(app.indexOf('async function createNewProject'),app.indexOf('async function loadProject')),/directorRenderer.resetSceneView\(\)/);
 assert.doesNotMatch(app.slice(app.indexOf('async function loadProject'),app.indexOf('async function loadProject')+3000),/resetSceneView/);
});
