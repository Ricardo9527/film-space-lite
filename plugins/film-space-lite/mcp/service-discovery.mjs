import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {litePaths}=require(path.join(process.env.FILM_SPACE_LITE_RUNTIME_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..','..'),'director-console/app/lite-runtime.cjs'));
export const defaultServiceFile=litePaths().service;
export async function discoverDirectorService({serviceFile=process.env.FILM_SPACE_SERVICE_FILE||defaultServiceFile}={}){
 let endpoint;try{endpoint=JSON.parse(await readFile(serviceFile,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(endpoint.service!=='film-space-lite'||!Number.isInteger(endpoint.port)||endpoint.port<1||endpoint.port>65535||!Number.isInteger(endpoint.pid))throw new Error('Invalid Film Space Lite service descriptor: '+serviceFile);
 const baseURL='http://127.0.0.1:'+endpoint.port;
 let health;try{const response=await fetch(baseURL+'/health',{signal:AbortSignal.timeout(1000)});if(!response.ok)return null;health=await response.json();}catch(error){if(error.name==='TypeError'||error.name==='TimeoutError')return null;throw error;}
 if(health.service!=='film-space-lite'||health.pid!==endpoint.pid||health.port!==endpoint.port||health.status!=='ok')return null;
 return {baseURL,health};
}
