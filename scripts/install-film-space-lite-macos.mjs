#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {unpackMacOSApp} from './lib/film-space-macos-app-artifacts.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const product=path.join(root,'Builds.noindex/Film-Space-Lite/Film Space Lite.app');
const target='/Applications/Film Space Lite.app';
const staging='/Applications/.Film Space Lite.app.install-'+process.pid;
const previous='/Applications/.Film Space Lite.app.previous-'+process.pid;
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8'});if(result.status!==0)throw new Error(command+': '+(result.stderr||result.stdout));return result.stdout.trim();}
function bundleID(app){return run('/usr/bin/plutil',['-extract','CFBundleIdentifier','raw','-o','-',path.join(app,'Contents/Info.plist')]);}
async function exists(file){try{await fs.access(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function validate(app){
 if(bundleID(app)!=='com.filmspace.lite')throw new Error('Refusing an unexpected app identity: '+app);
 run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
 const runtime=path.join(app,'Contents/Resources/runtime');
 const manifest=JSON.parse(await fs.readFile(path.join(runtime,'runtime-build.json'),'utf8'));
 if(manifest.format!=='film-space-lite-runtime'||manifest.edition!=='lite')throw new Error('Invalid Lite runtime manifest');
 for(const [file,expected] of Object.entries(manifest.files)){
  const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(runtime,file))).digest('hex');
  if(actual!==expected)throw new Error('Runtime checksum mismatch: '+file);
 }
 return manifest;
}
const source=await unpackMacOSApp(product);
await validate(source);
if(await exists(target)&&bundleID(target)!=='com.filmspace.lite')throw new Error('Refusing to replace an unknown app: '+target);
try{
 await fs.cp(source,staging,{recursive:true});
 await validate(staging);
 if(await exists(target))await fs.rename(target,previous);
 try{
  await fs.rename(staging,target);
  const manifest=await validate(target);
  await fs.rm(previous,{recursive:true,force:true});
  console.log(JSON.stringify({installed:target,builtAt:manifest.builtAt,verifiedFiles:Object.keys(manifest.files).length}));
 }catch(error){
  await fs.rm(target,{recursive:true,force:true});
  if(await exists(previous))await fs.rename(previous,target);
  throw error;
 }
}finally{await fs.rm(staging,{recursive:true,force:true});}
