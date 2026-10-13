import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createDesktopProject,normalizeDesktopProject,desktopAspectRatios,projectOutputResolution,addShot} from '../app/project-model.js';
import {applyFilmSpaceOperations} from '../app/project-command-service.js';
import {semanticPatchBetween,applySemanticProjectPatch,invertSemanticPatch} from '../app/semantic-project-patch.js';

const sizes={
 '16:9':{width:1920,height:1080}, '9:16':{width:1080,height:1920},
 '1:1':{width:1080,height:1080}, '4:3':{width:1440,height:1080},
 '21:9':{width:2560,height:1080},
};
test('project creation retains name, aspect, frame grid and duration on reopen',()=>{
 for(const aspectRatio of desktopAspectRatios){
  const project=createDesktopProject({id:'settings-project',name:'试镜项目',defaultAspectRatio:aspectRatio,frameRate:25,durationSeconds:7.5});
  const opened=normalizeDesktopProject(JSON.parse(JSON.stringify(project)));
  assert.equal(opened.name,'试镜项目');assert.equal(opened.output.defaultAspectRatio,aspectRatio);assert.equal(opened.output.frameRate,25);assert.equal(opened.scene.duration.seconds,7.5);
  assert.equal(opened.scene.cameraSetups[0].aspectRatio,aspectRatio);
  const withShot=addShot(opened);assert.equal(withShot.scene.shots[0].aspectRatio,aspectRatio);
  assert.deepEqual(projectOutputResolution(withShot),sizes[aspectRatio]);
 }
});
test('fixed short edge applies to projects saved with earlier resolution presets',()=>{
 for(const resolution of [{width:1280,height:720},{width:2560,height:1440},{width:3840,height:2160}]){
  const project=createDesktopProject();project.output.resolution=resolution;
  assert.deepEqual(projectOutputResolution(project,'9:16'),sizes['9:16']);
  const opened=normalizeDesktopProject(project);assert.deepEqual(opened.output.resolution,{width:1920,height:1080});
  assert.deepEqual(projectOutputResolution(opened,'16:9'),sizes['16:9']);
 }
});
test('MCP default aspect shares persistent semantics and undo while preserving existing Shots',()=>{
 const base=addShot(createDesktopProject({id:'settings-project'}));
 const next=applyFilmSpaceOperations(base,[{action:'set_project_aspect_ratio',aspectRatio:'9:16'}]).project;
 assert.equal(next.output.defaultAspectRatio,'9:16');assert.equal(next.scene.shots[0].aspectRatio,'16:9');
 assert.equal(addShot(next).scene.shots[1].aspectRatio,'9:16');
 assert.equal(applySemanticProjectPatch(base,semanticPatchBetween(base,next)).output.defaultAspectRatio,'9:16');
 assert.equal(applySemanticProjectPatch(next,invertSemanticPatch(base,next)).output.defaultAspectRatio,'16:9');
 assert.throws(()=>applyFilmSpaceOperations(base,[{action:'set_project_aspect_ratio',aspectRatio:'2:3'}]),/contract/);
 assert.throws(()=>applyFilmSpaceOperations(base,[{action:'set_resolution',resolution:{width:3840,height:2160}}]),/Unsupported/);
});
test('local project creation API preserves aspect settings and rejects invalid inputs',async t=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'film-space-lite-settings-'));
 const child=spawn(process.execPath,[new URL('../server.cjs',import.meta.url).pathname],{env:{...process.env,FILM_SPACE_LITE_DATA_DIR:data,PORT:'0'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{child.kill('SIGTERM');await once(child,'exit');fs.rmSync(data,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{if(String(chunk).includes('Film Space Lite:'))resolve();});child.on('error',reject);child.on('exit',code=>reject(new Error('Server exited '+code)));});
 const {port}=JSON.parse(fs.readFileSync(path.join(data,'director-service.json'),'utf8'));const root='http://127.0.0.1:'+port;
 const create=payload=>fetch(root+'/api/projects/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 const response=await create({name:'API 创建',aspectRatio:'9:16',frameRate:60,durationSeconds:4.5});assert.equal(response.status,201);const project=await response.json();
 const loaded=await(await fetch(root+'/api/projects/'+project.id)).json();assert.equal(loaded.name,'API 创建');assert.equal(loaded.output.frameRate,60);assert.equal(loaded.scene.duration.seconds,4.5);assert.equal(loaded.output.defaultAspectRatio,'9:16');assert.deepEqual(projectOutputResolution(loaded),sizes['9:16']);
 for(const patch of [{frameRate:29},{aspectRatio:'2:3'},{durationSeconds:0}])assert.equal((await create({name:'拒绝',durationSeconds:5,...patch})).status,400);
 const defaults=await(await create({name:'兼容默认',durationSeconds:5})).json();assert.equal(defaults.output.frameRate,30);assert.equal(defaults.output.defaultAspectRatio,'16:9');assert.deepEqual(projectOutputResolution(defaults),sizes['16:9']);
});
