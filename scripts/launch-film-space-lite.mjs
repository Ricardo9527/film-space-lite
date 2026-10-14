#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);
const {litePaths}=require('../director-console/app/lite-runtime.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const paths=litePaths();
const noOpen=process.argv.includes('--no-open');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function running(){
 try {const d=JSON.parse(fs.readFileSync(paths.service,'utf8'));if(d.service!=='film-space-lite')return null;const r=await fetch('http://127.0.0.1:'+d.port+'/health',{signal:AbortSignal.timeout(1000)});if(!r.ok)return null;const h=await r.json();return h.service===d.service&&h.pid===d.pid?{...d,url:'http://127.0.0.1:'+d.port}:null;}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError||error instanceof TypeError||error.name==='TimeoutError')return null;throw error;}
}
function openBrowser(url){const command=process.platform==='darwin'?'/usr/bin/open':path.join(root,'Film Space Lite.exe');const args=process.platform==='darwin'?[url]:['--open-url',url];const child=spawn(command,args,{stdio:'ignore',detached:true,windowsHide:true});child.on('error',error=>{console.error(error);process.exitCode=1;});child.unref();}
function configureMCP(){
 const source=path.join(root,'plugins','film-space-lite');const destination=path.join(paths.root,'MCP','film-space-lite');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.cpSync(source,destination,{recursive:true});
 const node=process.platform==='win32'?path.join(root,'node','node.exe'):path.join(root,'node','bin','node');
 fs.writeFileSync(path.join(destination,'.mcp.json'),JSON.stringify({mcpServers:{film_space_lite_mcp:{command:fs.existsSync(node)?node:process.execPath,args:[path.join(destination,'scripts','start-mcp.mjs')],cwd:destination,env:{FILM_SPACE_LITE_RUNTIME_ROOT:root,FILM_SPACE_SERVICE_FILE:paths.service}}}},null,2)+'\n');
 // Also provide a ready-to-use standalone MCP config for clients accepting JSON.
 fs.copyFileSync(path.join(destination,'.mcp.json'),path.join(paths.root,'MCP','mcp-config.json'));
}
async function main(){
 fs.mkdirSync(paths.root,{recursive:true});fs.mkdirSync(path.dirname(paths.log),{recursive:true});
 const updateLock=path.join(paths.root,'Updates','install-lock.json');
 if(process.env.FILM_SPACE_UPDATE_START!=='1'){
  for(let i=0;fs.existsSync(updateLock);i++){
   const lock=JSON.parse(fs.readFileSync(updateLock,'utf8'));
   try{process.kill(lock.pid,0);}catch(error){if(error.code==='ESRCH')throw new Error('更新意外中断，请查看 '+path.join(paths.root,'Updates','install.log'));throw error;}
   if(i>=120)throw new Error('软件仍在更新，请稍后重新打开。');
   await sleep(1000);
  }
 }
 let service=await running();const lock=path.join(paths.root,'startup.lock');let ownsLock=false;
 if(!service){
  for(let i=0;i<100&&!service&&!ownsLock;i++){
   try{fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));ownsLock=true;}
   catch(error){if(error.code!=='EEXIST')throw error;const owner=path.join(lock,'owner.json');if(fs.existsSync(owner)){const pid=JSON.parse(fs.readFileSync(owner,'utf8')).pid;try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')fs.rmSync(lock,{recursive:true});else throw error;}}await sleep(100);service=await running();}
  }
  if(!ownsLock&&!service)throw new Error('Another launcher did not finish. See '+paths.log);
  try{
   if(ownsLock&&!service){
    const log=fs.openSync(paths.log,'a');const ffmpeg=process.platform==='win32'?path.join(root,'ffmpeg','bin','ffmpeg.exe'):path.join(root,'ffmpeg','bin','ffmpeg');
    const child=spawn(process.execPath,[path.join(root,'director-console','server.cjs')],{cwd:root,detached:true,stdio:['ignore',log,log],windowsHide:true,env:{...process.env,PORT:process.env.FILM_SPACE_RESTART_PORT||'0',FILM_SPACE_LITE_HELPER:path.join(root,'Film Space Lite.exe'),...(fs.existsSync(ffmpeg)?{FILM_SPACE_FFMPEG:ffmpeg}:{})}});fs.closeSync(log);
    let spawnError=null;child.on('error',error=>{spawnError=error;});child.unref();
    for(let i=0;i<100&&!service;i++){if(spawnError)throw spawnError;await sleep(100);service=await running();}
    if(!service)throw new Error('Film Space Lite failed to start. See '+paths.log);
   }
  }finally{if(ownsLock)fs.rmSync(lock,{recursive:true});}
 }
 configureMCP();
 if(!noOpen)openBrowser(service.url);
 console.log(service.url);
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
