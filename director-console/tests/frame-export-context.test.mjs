import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createDesktopProject,addShot,findShot,setActiveShot} from '../app/project-model.js';

const source=fs.readFileSync(new URL('../app/director-app.js',import.meta.url),'utf8');
function method(name,next){const start=source.indexOf(`async function ${name}(`);const end=source.indexOf(`\nasync function ${next}(`,start);const syncEnd=source.indexOf(`\nfunction ${next}(`,start);assert.ok(start>=0&&(end>=0||syncEnd>=0));return source.slice(start,end>=0?end:syncEnd);}
const make=id=>addShot(createDesktopProject({id,name:id,outputFolder:'/tmp'}),{id:id+'-shot',name:id+'-Shot'});
async function exportCase(duringNaming,{folder='/tmp',duringFolder=()=>{},confirmation='frame'}={}){
 let confirm;const emitted=[],messages=[];
 const ctx=vm.createContext({structuredClone,project:make('A'),viewportMode:'camera',viewportModes:{camera:'camera'},exportState:{status:'idle'},playback:{status:'paused',elapsed:1,pause(){}},persistActorPoseDraft(){},isExporting:()=>false,findShot,cameraTrackReady:()=>true,showToast(message){messages.push(message);},requestFrameName:()=>new Promise(resolve=>confirm=resolve),selectedShotOutputResolution:()=>({width:1920,height:1080}),renderCameraWorkspace(){},syncRenderer(){},projectAPI:{},directorRenderer:{},chooseProjectOutputFolder:async()=>{duringFolder(ctx);return '/selected';},renderShotFrame:async spec=>{emitted.push(spec);return {fileName:spec.fileName};}});
 ctx.project.output.folder=folder;
 vm.runInContext(method('exportCurrentShotFrame','exportSelectedShotMP4'),ctx);
 const pending=ctx.exportCurrentShotFrame();duringNaming(ctx);confirm(confirmation);await pending;
 return {emitted,messages};
}

test('PNG naming cancels when project or active Shot changes',async()=>{
 for(const change of [c=>{c.project=make('B');},c=>{c.project=setActiveShot(addShot(c.project,{id:'other'}),'other');}]){
  const result=await exportCase(change);assert.equal(result.emitted.length,0);assert.match(result.messages[0],/已切换/);
 }
});
test('PNG freezes source content, dimensions, folder and time before naming',async()=>{
 const {emitted}=await exportCase(c=>{c.project.name='changed';c.project.output.folder='/different';c.project.output.frameRate=60;c.playback.elapsed=3;c.selectedShotOutputResolution=()=>({width:1080,height:1920});});
 assert.equal(emitted.length,1);const spec=emitted[0];
 assert.equal(spec.snapshot.name,'A');assert.equal(spec.snapshot.output.folder,'/tmp');assert.equal(spec.snapshot.output.frameRate,30);assert.equal(spec.time,1);assert.equal(spec.resolution.width,1920);assert.equal(spec.resolution.height,1080);
});
test('PNG cancels context changes during folder selection and respects explicit cancellation',async()=>{
 assert.equal((await exportCase(()=>{},{folder:'',duringFolder:c=>{c.project=make('B');}})).emitted.length,0);
 assert.equal((await exportCase(()=>{},{confirmation:null})).emitted.length,0);
 const {emitted}=await exportCase(()=>{},{folder:''});assert.equal(emitted[0].snapshot.output.folder,'/selected');
});
test('folder picker does not write its result into a newly selected project',async()=>{
 let select;const messages=[];
 const ctx=vm.createContext({project:make('A'),isExporting:()=>false,elements:{chooseOutputFolder:{disabled:false}},projectAPI:{chooseOutputFolder:()=>new Promise(resolve=>select=resolve)},commitProject:async operation=>{ctx.project=operation(ctx.project);},setProjectOutputFolder:(project,folder)=>({...project,output:{...project.output,folder}}),showToast:message=>messages.push(message),renderCameraWorkspace(){}});
 vm.runInContext(method('chooseProjectOutputFolder','revealCurrentOutput'),ctx);
 const pending=ctx.chooseProjectOutputFolder();ctx.project=make('B');select({folder:'/selected'});
 assert.equal(await pending,null);assert.equal(ctx.project.output.folder,'/tmp');assert.match(messages[0],/已切换/);
});

test('active output prevents native menu project switching and creation',async()=>{
 const messages=[];const project=make('A');
 const ctx=vm.createContext({project,persistActorPoseDraft(){},isExporting:()=>true,showToast:message=>messages.push(message)});
 vm.runInContext(method('createNewProject','loadProject'),ctx);
 vm.runInContext(method('loadProject','selectActor'),ctx);
 await ctx.loadProject('B');await ctx.createNewProject();
 assert.equal(ctx.project,project);assert.equal(messages.length,2);for(const message of messages)assert.match(message,/当前输出/);
});
