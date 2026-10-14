import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PlaybackController} from '../app/playback-engine.js';
import {createCameraTrack,recordCameraKeyframe,updateCameraKeyframeAim} from '../app/camera-track.js';
import {describeCameraAimTransition} from '../app/camera-aim.js';

const app=readFileSync(new URL('../app/director-app.js',import.meta.url),'utf8');
const start=app.indexOf('  const selectedAimTransition =');
const end=app.indexOf('  const liveAimState =',start);
assert.ok(start>=0 && end>start);
const inspector=new vm.Script(app.slice(start,end)+'\nselectedAimTransitionStart;');
const pose={position:{x:0,y:2,z:6},quaternion:{x:0,y:0,z:0,w:1},focalLength:35};
let track=recordCameraKeyframe(createCameraTrack(),pose,0);
track=recordCameraKeyframe(track,pose,3);
track=recordCameraKeyframe(track,pose,5);
track=updateCameraKeyframeAim(track,track.keyframes[2].id,{mode:'look-at',targetKind:'world',worldPosition:{x:2,y:2,z:0}});
function render(selectedKeyframe,selectedAimInherited=false){
 return inspector.runInNewContext({track,selectedKeyframe,selectedAimInherited,describeCameraAimTransition});
}

test('camera inspector handles between-keyframe, free, inherited and lock selections',()=>{
 assert.equal(render(null),null);
 assert.equal(render(undefined),null);
 assert.equal(render(track.keyframes[0]),null);
 assert.equal(render(track.keyframes[1],true),null);
 assert.equal(render(track.keyframes[2]).id,track.keyframes[1].id);
});

test('playing between keys schedules frames and reaches completion with inspector updates',()=>{
 let now=0,callback=null;
 const states=[];
 const player=new PlaybackController({now:()=>now,requestFrame:fn=>{callback=fn;return 1;},cancelFrame:()=>{callback=null;},onChange:state=>{render(null);states.push({...state});}});
 player.setDuration(5);
 player.seek(1.25);
 player.play();
 assert.equal(typeof callback,'function');
 now=1000;callback();assert.equal(player.elapsed,2.25);assert.equal(player.status,'playing');
 now=4000;callback();assert.equal(player.elapsed,5);assert.equal(player.status,'completed');
 assert.deepEqual(states.map(s=>s.status),['paused','playing','playing','completed']);
});
