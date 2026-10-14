import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopProject,normalizeDesktopProject,addActor,addMoveAction,addStayActionAtPoint,addShot,setActorProperty} from '../app/project-model.js';
import {sampleProject} from '../app/playback-engine.js';
import {applyFilmSpaceOperations,filmSpaceOperationContracts} from '../app/project-command-service.js';
import {semanticPatchBetween,applySemanticProjectPatch,invertSemanticPatch} from '../app/semantic-project-patch.js';
test('Lite accepts only its independent project and procedural actor model',()=>{const p=createDesktopProject({id:'lite-test'});assert.equal(p.edition,'lite');assert.throws(()=>normalizeDesktopProject({...p,edition:undefined}),/Lite/);assert.throws(()=>addActor(p,{characterAssetID:'xbot'}),/抽象人/);assert.throws(()=>normalizeDesktopProject({...p,scene:{...p.scene,pairedActions:[{}]}}),/不支持/);assert.ok(!('pairedActions' in p.scene));assert.ok(!('reconstructions' in p.scene.environment));});
test('procedural Move and sitting Hold survive arbitrary seeks, persistence and undo',()=>{let p=createDesktopProject({id:'lite-test',durationSeconds:4});p=addActor(p,{id:'actor-one',position:{x:0,y:0,z:0}});p=addMoveAction(p,'actor-one',{x:2,y:0,z:0},{speed:1});const point=p.scene.actors[0].motionActions.at(-1);p=addStayActionAtPoint(p,'actor-one',point.id,{duration:2,posture:'sit',seatHeight:.5});assert.equal(sampleProject(p,1).get('actor-one').position.x,1);assert.equal(sampleProject(p,3).get('actor-one').posture,'sit');assert.deepEqual(sampleProject(p,3),sampleProject(normalizeDesktopProject(JSON.parse(JSON.stringify(p))),3));const changed=setActorProperty(p,'actor-one','blockingColor','#aabbcc');assert.equal(applySemanticProjectPatch(p,semanticPatchBetween(p,changed)).scene.actors[0].blockingColor,'#aabbcc');assert.deepEqual(semanticPatchBetween(p,applySemanticProjectPatch(changed,invertSemanticPatch(p,changed))),[]);});
test('MCP uses core operations and rejects deleted features and duplicate durable IDs',()=>{const p=createDesktopProject({id:'lite-test'});const q=applyFilmSpaceOperations(p,[{action:'add_actor',id:'actor-one'}]).project;assert.equal(q.scene.actors[0].characterAssetID,'blocking-figure');assert.throws(()=>applyFilmSpaceOperations(q,[{action:'add_actor',id:'actor-one'}]),/already exists/);assert.throws(()=>applyFilmSpaceOperations(p,[{action:'add_paired_action'}]));for(const operation of Object.keys(filmSpaceOperationContracts))assert.doesNotMatch(operation,/paired|reconstruction/);});

test('Lite MCP records explicit direction boundaries with persistence and undo', () => {
  const pose = { position: { x: 0, y: 2, z: 6 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, focalLength: 35 };
  const initial = applyFilmSpaceOperations(createDesktopProject({durationSeconds: 5}), [
    { action: 'add_shot', id: 'shot-aim', cameraPose: pose },
    { action: 'record_camera_keyframe', shotID: 'shot-aim', time: 3, pose },
    { action: 'record_camera_keyframe', shotID: 'shot-aim', time: 5, pose },
  ]).project;
  const frames = initial.scene.shots[0].camera.track.keyframes;
  assert.deepEqual(frames.map(frame => frame.aim.mode), ['free', 'free', 'free']);
  const changed = applyFilmSpaceOperations(initial, [
    { action: 'update_camera_keyframe_aim', shotID: 'shot-aim', keyframeID: frames[2].id, aim: { mode: 'look-at', targetKind: 'world', worldPosition: { x: 2, y: 2, z: 0 } } },
    { action: 'update_camera_keyframe_aim', shotID: 'shot-aim', keyframeID: frames[1].id, aim: null },
  ]).project;
  const restored = normalizeDesktopProject(JSON.parse(JSON.stringify(changed)));
  assert.deepEqual(restored.scene.shots[0].camera.track, changed.scene.shots[0].camera.track);
  assert.deepEqual(applySemanticProjectPatch(changed, invertSemanticPatch(initial, changed)).scene.shots[0].camera.track, initial.scene.shots[0].camera.track);
});
