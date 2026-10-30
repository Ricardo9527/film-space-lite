import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDesktopProject,normalizeDesktopProject,updateMotionAction,duplicateActor,recordActorPoseKeyframe,addShot,findShot,updateShotCameraKeyframeBodycam} from '../app/project-model.js';
import {sampleActor,actorPlaybackPlan} from '../app/playback-engine.js';
import {applyFilmSpaceOperations,validateFilmSpaceOperation} from '../app/project-command-service.js';
import {sampleShotCamera} from '../app/camera-aim.js';
import {semanticPatchBetween,applySemanticProjectPatch,invertSemanticPatch} from '../app/semantic-project-patch.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const actor=p=>p.scene.actors[0];
function fixture(turnSeconds=1){return applyFilmSpaceOperations(createDesktopProject(),[
 {action:'add_actor',id:'person'},
 {action:'add_move',actorID:'person',target:{x:2,y:0,z:0},options:{speed:1,turnSeconds}},
 {action:'add_stay',actorID:'person',options:{duration:2,facingY:0,turnSeconds}},
]).project;}
const move=p=>actor(p).motionActions.find(a=>a.kind==='move');
const hold=p=>actor(p).motionActions.find(a=>a.kind==='hold'&&a.duration>0);
test('Move and Hold turn from entry for configured time without extending movement',()=>{
 const p=fixture(),a=actor(p);close(actorPlaybackPlan(a).duration,4);
 close(sampleActor(a,0).rotationY,0);close(sampleActor(a,.5).rotationY,Math.PI/4);close(sampleActor(a,1).rotationY,Math.PI/2);
 close(sampleActor(a,2).rotationY,Math.PI/2);close(sampleActor(a,2.5).rotationY,Math.PI/4);close(sampleActor(a,3).rotationY,0);
 close(sampleActor(a,.5).position.x,.5);close(sampleActor(a,2.5).position.x,2);
});
test('zero is immediate, oversized time caps to segment, old projects keep .25 and holding inherits',()=>{
 let p=fixture(0);close(sampleActor(actor(p),0).rotationY,Math.PI/2);close(sampleActor(actor(p),2).rotationY,0);
 p=fixture(20);close(sampleActor(actor(p),1).rotationY,Math.PI/4);close(sampleActor(actor(p),2).rotationY,Math.PI/2);close(sampleActor(actor(p),4).rotationY,0);
 p=fixture();for(const a of actor(p).motionActions)delete a.turnSeconds;p=normalizeDesktopProject(p);close(sampleActor(actor(p),.125).rotationY,Math.PI/4);
 p=updateMotionAction(p,'person',move(p).id,{facingMode:'inherit',turnSeconds:1});close(sampleActor(actor(p),1).rotationY,0);
});
test('duration edit preserves path offsets and additive pose facing, independent of Hold pose duration',()=>{
 let p=recordActorPoseKeyframe(fixture(),'person',0,{offsetZ:1,rotationYOffset:.3});
 const changed=updateMotionAction(p,'person',move(p).id,{turnSeconds:2});
 assert.deepEqual(sampleActor(actor(changed),.5).position,sampleActor(actor(p),.5).position);
 close(sampleActor(actor(p),.5).rotationY,Math.PI/4+.3);
 const holdChanged=applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:'person',actionID:hold(p).id,patch:{transitionSeconds:.1,turnSeconds:2}}]).project;
 close(sampleActor(actor(holdChanged),3).rotationY,Math.PI/4+.3);
});
test('MCP creation/edit, persistence, duplication and undo retain entry turn timing',()=>{
 const p=fixture(1.2),a=actor(p);assert.equal(move(p).turnSeconds,1.2);assert.equal(hold(p).turnSeconds,1.2);
 const changed=applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:a.id,actionID:move(p).id,patch:{turnSeconds:.7}}]).project;
 const loaded=normalizeDesktopProject(JSON.parse(JSON.stringify(changed)));assert.equal(move(loaded).turnSeconds,.7);
 assert.equal(duplicateActor(loaded,a.id).scene.actors[1].motionActions.find(a=>a.kind==='move').turnSeconds,.7);
 assert.deepEqual(semanticPatchBetween(changed,applySemanticProjectPatch(p,semanticPatchBetween(p,changed))),[]);
 assert.deepEqual(semanticPatchBetween(p,applySemanticProjectPatch(changed,invertSemanticPatch(p,changed))),[]);
 for(const value of [-1,Infinity,NaN,3601,null])assert.throws(()=>updateMotionAction(p,a.id,move(p).id,{turnSeconds:value}));
 assert.throws(()=>validateFilmSpaceOperation({action:'add_move',actorID:a.id,target:{x:1,y:0,z:0},options:{turnSeconds:-1}}));
 const snapshot=JSON.parse(readFileSync(new URL('../../plugins/film-space-lite/assets/operation-contracts.json',import.meta.url)));
 for(const name of ['add_move','add_stay','insert_stay_before','update_motion_action'])assert.match(JSON.stringify(snapshot.definitions[name]),/turnSeconds/);
});
test('Bodycam inherits timed body turn and random-access samples are deterministic',()=>{
 let p=addShot(fixture(2),{cameraPose:{position:{x:0,y:2,z:5},quaternion:{x:0,y:0,z:0,w:1},focalLength:35}});
 const s=findShot(p);p=updateShotCameraKeyframeBodycam(p,s.id,s.camera.track.keyframes[0].id,{enabled:true,targetActorID:'person'},'chest');
 const middle=sampleShotCamera(p,findShot(p),1);close(middle.quaternion.y,Math.sin(Math.PI/8));
 sampleShotCamera(p,findShot(p),3);assert.deepEqual(sampleShotCamera(p,findShot(p),1),middle);
});
