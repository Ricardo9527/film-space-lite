import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDesktopProject,normalizeDesktopProject,addActor,addMoveAction,updateMotionAction,duplicateActor,recordActorPoseKeyframe} from '../app/project-model.js';
import {sampleActor,actorPlaybackPlan} from '../app/playback-engine.js';
import {applyFilmSpaceOperations} from '../app/project-command-service.js';
import {semanticPatchBetween,applySemanticProjectPatch,invertSemanticPatch} from '../app/semantic-project-patch.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const actor=p=>p.scene.actors[0];
const moves=p=>actor(p).motionActions.filter(a=>a.kind==='move');
const make=()=>applyFilmSpaceOperations(createDesktopProject(),[
 {action:'add_actor',id:'person',position:{x:0,y:0,z:0},rotationY:Math.PI/2},
 {action:'add_move',actorID:'person',target:{x:2,y:0,z:0},options:{speed:2}},
 {action:'add_move',actorID:'person',target:{x:0,y:1,z:0},options:{speed:Math.sqrt(5),facingMode:'inherit'}},
 {action:'add_move',actorID:'person',target:{x:0,y:0,z:2},options:{speed:Math.sqrt(5),facingMode:'inherit'}},
]).project;
test('charge then knockback and bent flight retain entering facing at every boundary',()=>{
 const p=make(),a=actor(p);const authored=structuredClone(a.motionActions);
 for(const t of [0,.25,.999,1,1.001,1.125,1.5,1.999,2,2.125,2.75,3,10,.5]) close(sampleActor(a,t).rotationY,Math.PI/2);
 assert.deepEqual(sampleActor(a,1.5).pathPosition,{x:1,y:.5,z:0});
 assert.deepEqual(sampleActor(a,3).pathPosition,{x:0,y:0,z:2});
 assert.deepEqual(a.motionActions,authored);
 const changed=applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:'person',actionID:moves(p)[2].id,patch:{facingMode:'path'}}]).project;
 close(sampleActor(actor(changed),2.5).rotationY,0);
});
test('fixed world angle uses existing entry turn, pose yaw remains additive and path offsets independent',()=>{
 let p=make();const id=moves(p)[1].id;
 p=applyFilmSpaceOperations(p,[{action:'update_motion_action',actorID:'person',actionID:id,patch:{facingMode:'fixed',facingY:0}}]).project;
 close(sampleActor(actor(p),1).rotationY,Math.PI/2);close(sampleActor(actor(p),1.125).rotationY,Math.PI/4);close(sampleActor(actor(p),1.25).rotationY,0);
 p=recordActorPoseKeyframe(p,'person',0,{rotationYOffset:.4,offsetZ:1,offsetY:.5});
 const s=sampleActor(actor(p),1.5);close(s.rotationY,.4);close(s.position.x,0);close(s.position.y,1);close(s.position.z,0);
 const modified=updateMotionAction(p,'person',id,{facingY:-1});const m=sampleActor(actor(modified),1.5);
 assert.deepEqual(m.position,s.position);close(m.rotationY,-.6);
 const path=updateMotionAction(p,'person',id,{position:{x:0,y:1,z:2}});close(sampleActor(actor(path),1.5).rotationY,.4);
});
test('save/reopen, duplicate, semantic edit and undo preserve facing; old moves keep path following',()=>{
 const p=make(),loaded=normalizeDesktopProject(JSON.parse(JSON.stringify(p)));
 assert.deepEqual(normalizeDesktopProject(loaded),loaded);
 for(const t of [0,1.125,2.5,10]) assert.deepEqual(sampleActor(actor(p),t),sampleActor(actor(loaded),t));
 const clone=duplicateActor(p,'person').scene.actors[1];assert.deepEqual(clone.motionActions.map(({id,position,...a})=>a),actor(p).motionActions.map(({id,position,...a})=>a));
 const changed=updateMotionAction(p,'person',moves(p)[1].id,{facingMode:'fixed',facingY:.8});
 assert.deepEqual(semanticPatchBetween(changed,applySemanticProjectPatch(p,semanticPatchBetween(p,changed))),[]);
 assert.deepEqual(semanticPatchBetween(p,applySemanticProjectPatch(changed,invertSemanticPatch(p,changed))),[]);
 const old=structuredClone(p);old.schemaVersion=70;for(const a of actor(old).motionActions){delete a.facingMode;if(a.kind==='move')a.facingY=.9;}
 const migrated=normalizeDesktopProject(old);close(sampleActor(actor(migrated),1.5).rotationY,-Math.PI/2);assert(moves(migrated).every(a=>a.facingMode==='path'));
});
test('invalid modes and fixed angles reject at model and MCP boundaries; discovery agrees',()=>{
 const p=make(),id=moves(p)[1].id;
 for(const patch of [{facingMode:'unknown'},{facingMode:'fixed'},{facingMode:'fixed',facingY:NaN}])assert.throws(()=>updateMotionAction(p,'person',id,patch));
 assert.throws(()=>updateMotionAction(p,'person',actor(p).motionActions[0].id,{facingMode:'inherit'}));
 for(const options of [{facingMode:'fixed'},{facingMode:'bad'},{facingMode:'fixed',facingY:9}])assert.throws(()=>applyFilmSpaceOperations(p,[{action:'add_move',actorID:'person',target:{x:4,y:0,z:0},options}]));
 const snapshot=JSON.parse(readFileSync(new URL('../../plugins/film-space-lite/assets/operation-contracts.json',import.meta.url)));
 const definition=snapshot.definitions.add_move;assert(definition);
 assert.match(JSON.stringify(definition),/facingMode/);
});
test('vertical and zero-length segments remain finite and do not create unexpected turns',()=>{
 let p=addActor(createDesktopProject(),{id:'vertical-person',rotationY:.7});
 p=addMoveAction(p,'vertical-person',{x:0,y:0,z:0},{facingMode:'fixed',facingY:-1});
 p=addMoveAction(p,'vertical-person',{x:0,y:3,z:0},{facingMode:'inherit',speed:1});
 for(const t of [0,1,3])close(sampleActor(actor(p),t).rotationY,.7);
 close(actorPlaybackPlan(actor(p)).duration,3);
});
