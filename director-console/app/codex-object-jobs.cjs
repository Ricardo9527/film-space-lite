const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const readline=require('node:readline');

// The create button authorizes this single object's shape. Each write is checked;
// no session-wide or persistent approval is granted.
function isAuthorizedObjectWrite(message,scope){
 const p=message.params,meta=p?._meta,args=meta?.tool_params;
 return Boolean(scope && message.method==='mcpServer/elicitation/request' && p.serverName==='film_space_lite_mcp' && p.mode==='form' && meta?.codex_approval_kind==='mcp_tool_call'
  && args?.projectID===scope.projectID && Array.isArray(args.operations) && args.operations.length>0
  && args.operations.every(op=>op.action==='update_movable_object' && op.id===scope.objectID && op.patch && Object.keys(op).every(key=>['action','id','patch'].includes(key)) && Object.keys(op.patch).every(key=>['name','description','primitives'].includes(key))));
}
class CodexConnection {
 constructor(binary,cwd,scope=null){this.scope=scope;this.binary=binary;this.cwd=cwd;this.pending=new Map();this.sequence=0;this.onEvent=()=>{};this.stderr='';}
 async start(){
  this.process=spawn(this.binary,['app-server','--stdio'],{cwd:this.cwd,stdio:['pipe','pipe','pipe']});
  this.process.stdin.on('error',error=>this.fail(error));
  this.process.stderr.on('data',data=>{this.stderr=(this.stderr+data).slice(-4000);});
  this.process.on('error',error=>this.fail(error));
  this.process.on('exit',(code,signal)=>this.fail(new Error(`Codex 连接结束（${code ?? signal}）。`)));
  this.lines=readline.createInterface({input:this.process.stdout});
  this.lines.on('line',line=>{try{this.receive(JSON.parse(line));}catch(error){this.fail(error);}});
  await this.call('initialize',{clientInfo:{name:'film_space_lite',title:'Film Space Lite',version:require('../../native/lite/version.json').version}});
 }
 receive(message){
  if(message.method){
   if(message.id!=null){
    const authorized=isAuthorizedObjectWrite(message,this.scope);
    const response=message.method==='mcpServer/elicitation/request'
      ? {id:message.id,result:{action:authorized?'accept':'decline'}}
      : {id:message.id,error:{code:-32000,message:'请在 Codex 聊天中继续并处理此请求。'}};
    this.process.stdin.write(JSON.stringify(response)+'\n');
    if(!authorized)this.onEvent({method:'bridge/attention',params:{message:'有超出本物体外形范围的请求，请在 Codex 聊天中继续。'}});
   }else this.onEvent(message);
   return;
  }
  const item=this.pending.get(message.id);if(!item)return;
  clearTimeout(item.timer);this.pending.delete(message.id);
  if(message.error)item.reject(new Error(message.error.message));else item.resolve(message.result);
 }
 call(method,params){return new Promise((resolve,reject)=>{
  const id=++this.sequence;
  const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Codex ${method} 响应超时。`));},45000);
  this.pending.set(id,{resolve,reject,timer});
  this.process.stdin.write(JSON.stringify({id,method,params})+'\n');
 });}
 fail(error){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}this.pending.clear();this.onEvent({method:'bridge/error',params:{message:error.message}});}
 close(){this.onEvent=()=>{};this.fail(new Error('Codex 连接已关闭。'));this.lines?.close();this.process?.kill();}
}

function codexBinary(){
 const candidates=[process.env.FILM_SPACE_CODEX_BINARY,'/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex','/Applications/Codex.app/Contents/Resources/codex',...String(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,'codex'))].filter(Boolean);
 const binary=candidates.find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}});
 if(!binary)throw new Error('未找到 Codex。请先安装并登录 Codex 桌面应用。');return binary;
}

function createObjectJobs({dataRoot,runtime,serviceFile,readProject,bindThread}){
 const jobs=new Map();
 const cwd=path.join(dataRoot,'ObjectWorkspace');fs.mkdirSync(cwd,{recursive:true});
 const activePhases=['starting','running','attention','stopping'];
 function snapshot(job){return {projectID:job.projectID,objectID:job.objectID,threadID:job.threadID,phase:job.phase,message:job.message};}
 function finish(job,phase,message){job.phase=phase;job.message=message;job.connection?.close();job.connection=null;}
 async function run(job,description){
  try{
   const connection=new CodexConnection(codexBinary(),cwd,{projectID:job.projectID,objectID:job.objectID});job.connection=connection;await connection.start();
   if(job.phase==='cancelled'){connection.close();return;}
   connection.onEvent=event=>{
    if(job.phase==='stopping')return;
    if(event.method==='turn/completed'){
     const turn=event.params.turn;
     const object=readProject(job.projectID).scene.actors.find(actor=>actor.id===job.objectID)?.movableObject;
     const success=turn.status==='completed' && object?.primitives.length>0 && job.phase!=='attention';
     finish(job,success?'completed':'error',turn.error?.message || (success?'外形已更新，可继续在 Codex 修改。':job.phase==='attention'?job.message:'尚未生成外形，请在 Codex 聊天中继续。'));
    } else if(event.method==='item/completed' && event.params.item.type==='agentMessage' && event.params.item.phase==='commentary'){job.message=event.params.item.text;}
    else if(event.method==='bridge/error')finish(job,'error',event.params.message);
    else if(event.method==='bridge/attention'){job.phase='attention';job.message=event.params.message;}
   };
   const read=await connection.call('config/read',{includeLayers:false});
   const config={};
   for(const name of Object.keys(read.config?.mcp_servers||{})) if(name!=='film_space_lite_mcp') config[`mcp_servers.${name}.enabled`]=false;
   config['mcp_servers.film_space_lite_mcp']={enabled:true,command:process.execPath,args:[path.join(runtime,'plugins/film-space-lite/mcp/server.mjs')],env:{FILM_SPACE_SERVICE_FILE:serviceFile}};
   const instructions=`你负责 Film Space Lite 中一个可移动物体的外形。项目 ID：${job.projectID}；物体 ID：${job.objectID}。每次修改先用 film_space_lite_mcp 读取这个指定项目，禁止使用默认项目。通过 update_movable_object 修改原物体，保留原 ID、运动、帧、位置和聊天绑定。只有用户明确要求时才改这些运动数据。基础部件局部坐标为米、Y 向上、+Z 正前方，整体绕局部原点运动。复用已有几何类型。无骨骼或自身动画。本任务只操作该项目的该物体，不修改源码，不执行发布。完成后检查场景；无法截图时明确反馈。继续此聊天仍修改上述原物体。`;
   const newThread=!job.threadID;
   if(job.threadID){
    const resumed=await connection.call('thread/resume',{threadId:job.threadID,cwd,config,developerInstructions:instructions,excludeTurns:true});
    if(resumed.thread.status.type==='active')throw new Error('原 Codex 聊天正在生成，请稍后再试。');
   }else{
    const result=await connection.call('thread/start',{cwd,ephemeral:false,config,developerInstructions:instructions});
    job.threadID=result.thread.id;
   }
   const binding=readProject(job.projectID).scene.actors.find(a=>a.id===job.objectID).movableObject.codex;
   if(binding?.threadID!==job.threadID || binding.projectID!==job.projectID)await bindThread(job.projectID,job.objectID,job.threadID);
   if(newThread)await connection.call('thread/name/set',{threadId:job.threadID,name:`Lite 物体 · ${readProject(job.projectID).scene.actors.find(a=>a.id===job.objectID).movableObject.name}`});
   const status=await connection.call('mcpServerStatus/list',{threadId:job.threadID,serverName:'film_space_lite_mcp'});
   if(status.data?.[0]?.runtimeStatus!=='connected')throw new Error('Lite MCP 未连接：'+(status.data?.[0]?.toolsError || status.data?.[0]?.runtimeStatus || '无服务'));
   if(job.phase==='cancelled'){connection.close();return;}
   job.phase='running';job.message='Codex 正在制作外形…';
   job.turnRequested=true;
   const turn=await connection.call('turn/start',{threadId:job.threadID,input:[{type:'text',text:`请制作这个物体：\n${description}\n\n${instructions}\n请直接完成 MCP 操作。`,text_elements:[]}]});
   job.turnID=turn.turn.id;
  }catch(error){if(['starting','running','attention'].includes(job.phase))finish(job,'error',error.message);}
 }
 return {
  activeCount:()=>[...jobs.values()].filter(j=>activePhases.includes(j.phase)).length,
  get(projectID,objectID){const job=jobs.get(`${projectID}/${objectID}`);return job?snapshot(job):null;},
  start(projectID,objectID,description){
   const key=`${projectID}/${objectID}`,existing=jobs.get(key);
   if(activePhases.includes(existing?.phase))throw Object.assign(new Error('此物体正在制作或停止，请等待当前任务结束。'),{statusCode:409});
   const binding=readProject(projectID).scene.actors.find(a=>a.id===objectID).movableObject.codex;
   const threadID=binding?.projectID===projectID?binding.threadID:existing?.threadID || null;
   const job={projectID,objectID,threadID,phase:'starting',message:threadID?'正在继续原 Codex 聊天…':'正在连接 Codex…'};jobs.set(key,job);void run(job,description);return snapshot(job);
  },
  async cancel(projectID,objectID){
   const job=jobs.get(`${projectID}/${objectID}`);if(!job || !activePhases.includes(job.phase) || job.phase==='stopping')return;
   job.phase='stopping';job.message='正在停止…';
   let failure;
   try{if(job.turnID)await job.connection.call('turn/interrupt',{threadId:job.threadID,turnId:job.turnID});}
   catch(error){failure=error;}
   finally{
    const message=failure?`停止请求失败：${failure.message}。本地连接已关闭，请在原 Codex 聊天确认任务状态。`
     :job.turnRequested&&!job.turnID?'本地连接已关闭，请在原 Codex 聊天确认任务是否停止。':'已停止，可继续原聊天或重试制作。';
    finish(job,failure?'error':'cancelled',message);
   }
   if(failure)throw new Error(job.message,{cause:failure});
  },
  close(){for(const job of jobs.values())job.connection?.close();},
 };
}
function openCodexThread(threadID){
 if(!/^[a-zA-Z0-9-]{6,128}$/.test(threadID))throw new Error('聊天 ID 无效。');
 const command=process.platform==='darwin'?'open':process.platform==='win32'?'explorer.exe':'xdg-open';
 return new Promise((resolve,reject)=>{const child=spawn(command,[`codex://threads/${threadID}`],{stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('无法打开 Codex 聊天。')));});
}
module.exports={CodexConnection,createObjectJobs,openCodexThread,isAuthorizedObjectWrite};
