import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createObjectJobs} from '../app/codex-object-jobs.cjs';

const projectID='retry-project',objectID='retry-object',threadID='original-thread';
async function until(check){
 for(let i=0;i<300;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}
 throw new Error('Timed out waiting for fixture state');
}
function fixture(t,initialMode='complete'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lite-object-jobs-'));
 const modeFile=path.join(root,'mode'),logFile=path.join(root,'rpc.jsonl'),binary=path.join(root,'codex');
 fs.writeFileSync(modeFile,initialMode);
 const script=`#!${process.execPath}
const fs=require('node:fs');
const modeFile=${JSON.stringify(modeFile)},logFile=${JSON.stringify(logFile)};
const log=value=>fs.appendFileSync(logFile,JSON.stringify(value)+'\\n');
const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
process.on('SIGTERM',()=>{log({event:'exit',pid:process.pid});process.exit(0);});
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);log(m);const mode=fs.readFileSync(modeFile,'utf8');let result={};
 if(m.method==='config/read'){if(mode==='starting')return;result={config:{}};}
 if(m.method==='thread/start')result={thread:{id:'${threadID}',status:{type:'idle'}}};
 if(m.method==='thread/resume')result={thread:{id:m.params.threadId,status:{type:mode==='remote-active'?'active':'idle'}}};
 if(m.method==='mcpServerStatus/list')result={data:[{runtimeStatus:'connected'}]};
 if(m.method==='turn/start'){
  if(mode==='auth'){send({id:m.id,error:{code:-32000,message:'Authentication token expired'}});return;}
  result={turn:{id:'fixture-turn'}};
  if(mode==='complete')setTimeout(()=>send({method:'turn/completed',params:{turn:{id:'fixture-turn',status:'completed'}}}),20);
 }
 if(m.method==='turn/interrupt'){
  if(mode==='interrupt-error'){send({id:m.id,error:{code:-32000,message:'interrupt request rejected'}});return;}
  if(mode==='interrupt-timeout')return;
 }
 send({id:m.id,result});
});
`;
 fs.writeFileSync(binary,script,{mode:0o700});
 const originalBinary=process.env.FILM_SPACE_CODEX_BINARY;process.env.FILM_SPACE_CODEX_BINARY=binary;
 const object={name:'木船',description:'蓝色船身和白色船帆',primitives:[{kind:'box'}]};
 const bindings=[],managers=[];
 const make=()=>{const manager=createObjectJobs({dataRoot:root,runtime:root,serviceFile:path.join(root,'service.json'),readProject:()=>({scene:{actors:[{id:objectID,movableObject:object}]}}),bindThread:async(p,o,id)=>{bindings.push(id);object.codex={projectID:p,threadID:id};}});managers.push(manager);return manager;};
 t.after(async()=>{
  for(const manager of managers)manager.close();
  if(originalBinary===undefined)delete process.env.FILM_SPACE_CODEX_BINARY;else process.env.FILM_SPACE_CODEX_BINARY=originalBinary;
  await new Promise(resolve=>setTimeout(resolve,30));fs.rmSync(root,{recursive:true,force:true});
 });
 const calls=()=>fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
 return {object,bindings,make,calls,mode:value=>fs.writeFileSync(modeFile,value),start:manager=>manager.start(projectID,objectID,object.description),state:manager=>manager.get(projectID,objectID),phase:async(manager,value)=>until(()=>manager.get(projectID,objectID)?.phase===value),turnReady:async()=>until(()=>calls().some(c=>c.method==='turn/start'))};
}

test('failed first request retries in the original chat, including after service restart',async t=>{
 const f=fixture(t,'auth');let jobs=f.make();f.start(jobs);await f.phase(jobs,'error');
 assert.match(f.state(jobs).message,/Authentication token expired/);assert.equal(f.object.codex.threadID,threadID);
 f.mode('complete');f.start(jobs);await f.phase(jobs,'completed');
 jobs.close();jobs=f.make();f.start(jobs);await f.phase(jobs,'completed');
 assert.equal(f.calls().filter(c=>c.method==='thread/start').length,1);
 assert.equal(f.calls().filter(c=>c.method==='thread/resume').length,2);
 assert.deepEqual(f.bindings,[threadID]);
 for(const call of f.calls().filter(c=>c.method==='turn/start')){assert.equal(call.params.threadId,threadID);assert.ok(call.params.input[0].text.includes(f.object.description));}
});

test('an active local job rejects duplicate submissions',async t=>{
 const f=fixture(t,'running'),jobs=f.make();f.start(jobs);await f.phase(jobs,'running');await f.turnReady();
 assert.throws(()=>f.start(jobs),/正在制作/);assert.equal(f.calls().filter(c=>c.method==='thread/start').length,1);
 await jobs.cancel(projectID,objectID);assert.equal(jobs.activeCount(),0);assert.equal(f.state(jobs).phase,'cancelled');
});

test('resume refuses to send a new request while the original chat is active',async t=>{
 const f=fixture(t,'remote-active');f.object.codex={projectID,threadID};const jobs=f.make();f.start(jobs);await f.phase(jobs,'error');
 assert.match(f.state(jobs).message,/原 Codex 聊天正在生成/);
 assert.equal(f.calls().filter(c=>c.method==='thread/start'||c.method==='turn/start').length,0);assert.equal(jobs.activeCount(),0);
});

test('interrupt RPC errors release the local busy lock and retain the error for polling and retry',async t=>{
 const f=fixture(t,'interrupt-error'),jobs=f.make();f.start(jobs);await f.phase(jobs,'running');await f.turnReady();
 await assert.rejects(jobs.cancel(projectID,objectID),/interrupt request rejected/);
 assert.equal(jobs.activeCount(),0);assert.equal(f.state(jobs).phase,'error');assert.match(f.state(jobs).message,/本地连接已关闭/);assert.doesNotMatch(f.state(jobs).message,/已停止/);
 await until(()=>f.calls().some(c=>c.event==='exit'));
 f.mode('complete');f.start(jobs);await f.phase(jobs,'completed');assert.equal(f.calls().filter(c=>c.method==='thread/start').length,1);
});

test('interrupt timeout also releases the job without claiming confirmed remote cancellation',async t=>{
 const f=fixture(t,'interrupt-timeout'),jobs=f.make();f.start(jobs);await f.phase(jobs,'running');await f.turnReady();
 // Wait until the turn/start response has supplied the interrupt target.
 await new Promise(resolve=>setTimeout(resolve,20));
 t.mock.timers.enable({apis:['setTimeout']});
 const result=assert.rejects(jobs.cancel(projectID,objectID),/turn\/interrupt 响应超时/);
 assert.equal(f.state(jobs).phase,'stopping');assert.throws(()=>f.start(jobs),/正在制作或停止/);
 t.mock.timers.tick(45000);await result;t.mock.timers.reset();
 assert.equal(jobs.activeCount(),0);assert.equal(f.state(jobs).phase,'error');assert.match(f.state(jobs).message,/请在原 Codex 聊天确认/);
});

test('cancelling during startup closes pending RPCs and permits a fresh attempt',async t=>{
 const f=fixture(t,'starting'),jobs=f.make();f.start(jobs);await until(()=>f.calls().some(c=>c.method==='config/read'));
 await jobs.cancel(projectID,objectID);assert.equal(jobs.activeCount(),0);assert.equal(f.state(jobs).phase,'cancelled');
 f.mode('complete');f.start(jobs);await f.phase(jobs,'completed');assert.equal(f.calls().filter(c=>c.method==='thread/start').length,1);
});
