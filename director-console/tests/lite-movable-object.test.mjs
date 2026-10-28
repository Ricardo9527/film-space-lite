import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopProject,addMovableObject,updateMovableObject,addMoveAction,recordActorPoseKeyframe,duplicateActor,normalizeDesktopProject,setActorProperty} from '../app/project-model.js';
import {applyFilmSpaceOperations} from '../app/project-command-service.js';
import {sampleProject} from '../app/playback-engine.js';
import {blockingTargetPosition} from '../app/blocking-actor.js';
import {movableObjectBounds} from '../app/movable-object.js';
import {semanticPatchBetween,invertSemanticPatch,applySemanticProjectPatch} from '../app/semantic-project-patch.js';
import {isAuthorizedObjectWrite} from '../app/codex-object-jobs.cjs';
import {createProjectRepository} from '../app/project-repository.cjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as THREE from '../vendor/three/three.module.js';
const shape=[{id:'boat-hull',kind:'box',position:{x:0,y:.25,z:0},size:{x:1,y:.5,z:3},color:'#884422'}];
const fixture=()=>addMovableObject(createDesktopProject({id:'object-project',durationSeconds:4}),{id:'object-boat',name:'小船',primitives:shape});
test('shape replacement retains authored path, sparse pose frames, transform and persistent conversation; undo and reload agree',()=>{
 let p=fixture();p=addMoveAction(p,'object-boat',{x:0,y:2,z:3},{speed:1,facingMode:'fixed',facingY:.7});
 p=recordActorPoseKeyframe(p,'object-boat',0,{rotationZ:.2});p=recordActorPoseKeyframe(p,'object-boat',2,{rotationZ:.7,offsetY:.3});
 p=setActorProperty(p,'object-boat','scale',1.5);p=updateMovableObject(p,'object-boat',{codex:{projectID:p.id,threadID:'thread-original'}});
 const before=p.scene.actors[0],changed=applyFilmSpaceOperations(p,[{action:'update_movable_object',id:before.id,patch:{name:'白帆船',primitives:[...shape,{kind:'box',position:{x:0,y:2,z:0},size:{x:.1,y:2,z:1},color:'#ffffff'}]}}]).project;
 const after=changed.scene.actors[0];assert.deepEqual({...after,movableObject:before.movableObject},before);assert.deepEqual(after.movableObject.codex,before.movableObject.codex);
 assert.deepEqual(normalizeDesktopProject(JSON.parse(JSON.stringify(changed))),changed);
 assert.deepEqual(sampleProject(p,1.3),sampleProject(changed,1.3));
 assert.deepEqual(semanticPatchBetween(p,applySemanticProjectPatch(changed,invertSemanticPatch(p,changed))),[]);
 assert.equal(duplicateActor(changed,before.id).scene.actors.at(-1).movableObject.codex,undefined);
});
test('object camera targets use geometry bounds and match Three.js scale, tilt and world yaw',()=>{
 let p=fixture();p=recordActorPoseKeyframe(p,'object-boat',0,{rotationX:.3,rotationZ:.5,rotationYOffset:.8,offsetY:2});p=setActorProperty(p,'object-boat','scale',1.4);
 const actor=p.scene.actors[0],sample=sampleProject(p,0).get(actor.id),bounds=movableObjectBounds(actor.movableObject);
 assert.deepEqual(bounds,{min:{x:-.5,y:0,z:-1.5},max:{x:.5,y:.5,z:1.5}});
 const local=new THREE.Vector3(0,.5*0.6,0).multiplyScalar(actor.scale).applyEuler(new THREE.Euler(sample.blockingPose.rotationX,0,sample.blockingPose.rotationZ)).applyEuler(new THREE.Euler(0,sample.rotationY,0)).add(new THREE.Vector3(sample.position.x,sample.position.y,sample.position.z));
 const actual=blockingTargetPosition(actor,sample,.6);for(const key of ['x','y','z'])assert.ok(Math.abs(actual[key]-local[key])<1e-10);
});
test('object contract rejects invalid shapes, duplicate identities, human performance and locked edits',()=>{
 const p=fixture();assert.throws(()=>applyFilmSpaceOperations(p,[{action:'add_movable_object',id:'object-boat',name:'duplicate',primitives:shape}]),/already exists/);
 assert.throws(()=>updateMovableObject(p,'object-boat',{primitives:[{kind:'bad'}]}),/类型/);
 assert.throws(()=>updateMovableObject(p,'object-boat',{primitives:[{kind:'box',size:{x:0,y:1,z:1}}]}),/尺寸/);
 assert.throws(()=>applyFilmSpaceOperations(p,[{action:'add_stay',actorID:'object-boat',options:{posture:'sit',duration:1}}]),/物体/);
 assert.throws(()=>applyFilmSpaceOperations(p,[{action:'record_actor_pose_keyframe',actorID:'object-boat',time:0,pose:{headPitch:.2}}]),/物体/);
 const locked=structuredClone(p);locked.scene.actors[0].locked=true;assert.throws(()=>updateMovableObject(locked,'object-boat',{name:'x'}),/锁定/);
 assert.throws(()=>applyFilmSpaceOperations(p,[{action:'update_movable_object',id:'object-boat',patch:{codex:{projectID:'other-project',threadID:'other-thread'}}}]),/contract/);
});
test('duplicated and imported project gets independent conversation binding',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'lite-object-copy-'));try{
  const repo=createProjectRepository(root);let p=fixture();p=updateMovableObject(p,'object-boat',{codex:{projectID:p.id,threadID:'thread-original'}});repo.saveVersioned(p,0);
  const clone=repo.duplicate(p.id);assert.equal(clone.scene.actors[0].movableObject.codex,undefined);assert.deepEqual(clone.scene.actors[0].movableObject.primitives,p.scene.actors[0].movableObject.primitives);assert.ok(repo.load(p.id).scene.actors[0].movableObject.codex);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('creation authorization is restricted to exact project/object shape, never other tools, model metadata or motion',()=>{
 const scope={projectID:'object-project',objectID:'object-boat'};
 const request={method:'mcpServer/elicitation/request',params:{serverName:'film_space_lite_mcp',mode:'form',_meta:{codex_approval_kind:'mcp_tool_call',tool_params:{projectID:scope.projectID,expectedRevision:2,operations:[{action:'update_movable_object',id:scope.objectID,patch:{primitives:shape}}]}}}};
 assert.equal(isAuthorizedObjectWrite(request,scope),true);
 for(const edit of [r=>r.params._meta.tool_params.projectID='other-project',r=>r.params._meta.tool_params.operations[0].id='other-object',r=>r.params._meta.tool_params.operations[0].action='delete_actor',r=>r.params._meta.tool_params.operations[0].patch={codex:{}},r=>r.params.serverName='other-server',r=>r.method='item/commandExecution/requestApproval']){const changed=structuredClone(request);edit(changed);assert.equal(isAuthorizedObjectWrite(changed,scope),false);}
 assert.equal(isAuthorizedObjectWrite(request,null),false);
});
