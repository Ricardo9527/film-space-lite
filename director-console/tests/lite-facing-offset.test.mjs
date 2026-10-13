import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopProject,addActor,addMoveAction,recordActorPoseKeyframe,normalizeDesktopProject,setActorTransform} from '../app/project-model.js';
import {sampleActor} from '../app/playback-engine.js';
import {actorFramePose} from '../app/actor-pose.js';
import {applyFilmSpaceOperations} from '../app/project-command-service.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const fixture=()=>addMoveAction(addMoveAction(addActor(createDesktopProject(),{id:'facing-actor',rotationY:-.7}),'facing-actor',{x:2,y:0,z:0},{speed:1}),'facing-actor',{x:2,y:0,z:2},{speed:1});
test('full pose recording at zero retains automatic turns; relative offset zero returns to moving heading',()=>{
 let p=fixture();
 p=recordActorPoseKeyframe(p,'facing-actor',0,actorFramePose(sampleActor(p.scene.actors[0],0).blockingPose));
 close(sampleActor(p.scene.actors[0],1).rotationY,Math.PI/2);close(sampleActor(p.scene.actors[0],3).rotationY,0);
 p=recordActorPoseKeyframe(p,'facing-actor',1,{rotationYOffset:.6});
 p=recordActorPoseKeyframe(p,'facing-actor',3,{rotationYOffset:0});
 close(sampleActor(p.scene.actors[0],1).rotationY,Math.PI/2+.6);close(sampleActor(p.scene.actors[0],3).rotationY,0);
 const moved=setActorTransform(p,'facing-actor',p.scene.actors[0].position,1);
 assert.deepEqual(moved.scene.actors[0].poseTrack,p.scene.actors[0].poseTrack);
 assert.deepEqual(moved.scene.actors[0].motionActions,p.scene.actors[0].motionActions);
});
test('legacy zero-time heading moves into initial facing and no longer suppresses Move; migration is idempotent',()=>{
 const p=fixture();p.schemaVersion=67;
 p.scene.actors[0].poseTrack={interpolation:'smooth',keyframes:[{id:'legacy-initial',time:0,pose:{rotationY:-.7086036763,rotationZ:.2},interpolation:'smooth'}]};
 const loaded=normalizeDesktopProject(p),a=loaded.scene.actors[0];
 close(a.rotationY,-.7086036763);assert.deepEqual(a.poseTrack.keyframes[0].pose,{rotationZ:.2});
 close(sampleActor(a,1).rotationY,Math.PI/2);close(sampleActor(a,3).rotationY,0);
 assert.deepEqual(normalizeDesktopProject(loaded),loaded);
 p.scene.actors[0].poseTrack.keyframes[0].pose={rotationY:-.7};
 assert.equal(normalizeDesktopProject(p).scene.actors[0].poseTrack.keyframes.length,0);
});
test('later absolute keys preserve heading at their times through relative migration; MCP rejects obsolete yaw fields',()=>{
 const p=fixture();p.schemaVersion=67;
 p.scene.actors[0].poseTrack={interpolation:'smooth',keyframes:[{id:'legacy-turn',time:1,pose:{rotationY:.4},interpolation:'smooth'}]};
 const loaded=normalizeDesktopProject(p);
 close(sampleActor(loaded.scene.actors[0],1).rotationY,.4);
 close(loaded.scene.actors[0].poseTrack.keyframes[0].pose.rotationYOffset,.4-Math.PI/2);
 const next=applyFilmSpaceOperations(loaded,[{action:'record_actor_pose_keyframe',actorID:'facing-actor',time:3,pose:{rotationYOffset:0}}]).project;
 close(sampleActor(next.scene.actors[0],3).rotationY,0);
 assert.throws(()=>applyFilmSpaceOperations(next,[{action:'record_actor_pose_keyframe',actorID:'facing-actor',time:3,pose:{rotationY:0}}]));
});
