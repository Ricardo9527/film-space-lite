#!/usr/bin/env node
const crypto=require('node:crypto'),http=require('node:http'),os=require('node:os'),path=require('node:path'),fs=require('node:fs');
const {spawn}=require('node:child_process');
const {litePaths}=require('./app/lite-runtime.cjs');
const {createProjectRepository}=require('./app/project-repository.cjs');
const {createExportManager}=require('./app/export-manager.cjs');
const paths=litePaths();
const PROJECT_ROOT=process.env.FILM_SPACE_PROJECT_DIR||paths.projects;
const INDEX=path.join(__dirname,'index.html'),VENDOR_ROOT=path.join(__dirname,'vendor'),ASSETS_ROOT=path.join(__dirname,'assets'),APP_ROOT=path.join(__dirname,'app');
const HOST='127.0.0.1',PORT=Number(process.env.PORT||0),RUNTIME_MODE='lite';
const projectRepository=createProjectRepository(PROJECT_ROOT),projectStorageStatus=projectRepository.status(),exportManager=createExportManager();
const operatorEventClients=new Set(),operatorSelections=new Map(),pendingViewportCaptures=new Map(),pendingPlayheadRequests=new Map();
let projectCommandServicePromise=null,projectModelPromise=null;
const exportTouches=new Map();
const server=http.createServer((req,res)=>handleHTTPRequest(req,res).catch(error=>handleHTTPRequestError(req,res,error)));
async function handleHTTPRequest(req,res){
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/health'){sendJSON(res,200,{service:'film-space-lite',edition:'lite',status:'ok',port:server.address().port,pid:process.pid,runtimeMode:RUNTIME_MODE,projectWritable:projectStorageStatus.writable,projectStorageErrorCode:projectStorageStatus.errorCode});return;}
 if(pathname==='/api/service/shutdown'&&req.method==='POST'){
  requireLocalOutputRequest(req);
  if(exportManager.activeCount()){const error=new Error('请先完成或取消 MP4 导出。');error.statusCode=409;throw error;}
  sendJSON(res,200,{stopping:true});setImmediate(()=>shutdownDirector());return;
 }
 if(await handleOutputAPI(req,res,pathname)||await handleProjectAPI(req,res,pathname))return;
 if(pathname==='/'||pathname==='/index.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(fs.readFileSync(INDEX));return;}
 for(const [prefix,root] of [['/vendor/',VENDOR_ROOT],['/assets/',ASSETS_ROOT],['/app/',APP_ROOT]])if(pathname.startsWith(prefix)){serveStatic(req,res,prefix,root);return;}
 sendJSON(res,404,{error:'Not found'});
}
function handleHTTPRequestError(req,res,error){
 console.error('[http]',req.method,req.url,error);
 if(res.destroyed||res.writableEnded)return;
 if(res.headersSent){res.destroy();return;}
 sendJSON(res,error.statusCode||500,{error:error.message,code:error.code||'ERR_HTTP_REQUEST',...(error.actualRevision==null?{}:{actualRevision:error.actualRevision})});
}

function serveStatic(req, res, urlPrefix, root) {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const relativePath = pathname.slice(urlPrefix.length);
  const filePath = path.normalize(path.join(root, relativePath));

  if (!filePath.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "content-type": contentTypeFor(filePath),
    "cache-control": "no-store",
  });
  res.end(body);
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath)) {
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json; charset=utf-8";
    case ".txt":
    case "":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function handleProjectAPI(req, res, pathname) {
  if (pathname === "/api/mcp/status" && req.method === "GET") {
    requireLocalOutputRequest(req);
    sendJSON(res, 200, {
      service: "film-space-lite",
      projectStorage: projectStorageStatus,
      runtimeOwner: projectStorageStatus.writable ? "external-or-authorized-service" : "restricted-process",
      recovery: projectStorageStatus.writable
        ? null
        : "Start the self-contained Film Space Desktop app, then retry after /health reports projectWritable=true.",
    });
    return true;
  }

  if(pathname==='/api/mcp/capabilities'&&req.method==='GET'){
  requireLocalOutputRequest(req);const commands=await projectCommandService();const model=await projectModel();
  sendJSON(res,200,{service:'film-space-lite-mcp',edition:'lite',projectSchemaVersion:model.desktopProjectSchemaVersion,operationDomains:commands.filmSpaceOperationDomains,operations:commands.filmSpaceOperationContracts,coordinateContract:{units:'meters',upAxis:'+Y',actorRotation:'rotationY in radians',cameraOrientation:'normalized XYZW quaternion',cameraLens:'focalLength in millimeters'},operatorControls:{transientOnly:true,precisePlayhead:true,recordingSafeCameraCapture:true,batchCameraCaptureLimit:8},guardedOutsideMCP:['mp4-export','filesystem-reveal','project-import-export','project-duplicate-delete']});return true;
 }

  const operationSchemaMatch = pathname.match(/^\/api\/mcp\/operations\/([a-z0-9_-]+)$/);
  if (operationSchemaMatch && req.method === "GET") {
    requireLocalOutputRequest(req);
    const commands = await projectCommandService();
    const definition = commands.filmSpaceOperationDefinitions[operationSchemaMatch[1]];
    if (!definition) {
      const error = new Error(`Unknown Film Space operation: ${operationSchemaMatch[1]}`);
      error.statusCode = 404;
      error.code = "FILM_SPACE_OPERATION_NOT_FOUND";
      throw error;
    }
    sendJSON(res, 200, { definition });
    return true;
  }

  if (pathname === "/api/operator/events" && req.method === "GET") {
    requireLocalOutputRequest(req);
    openOperatorEventStream(req, res);
    return true;
  }

  if (pathname === "/api/operator/command" && req.method === "POST") {
    requireLocalOutputRequest(req);
    const payload = JSON.parse(await readRequestBody(req));
    if (!payload || typeof payload.action !== "string" || !payload.action.trim()) {
      const error = new Error("Operator command requires an action");
      error.statusCode = 400;
      throw error;
    }
    publishOperatorEvent("operatorCommand", {
      commandID: crypto.randomUUID(),
      ...payload,
    });
    sendJSON(res, 202, { accepted: true });
    return true;
  }

  if (pathname === "/api/operator/capture" && req.method === "POST") {
    requireLocalOutputRequest(req);
    const payload = JSON.parse(await readRequestBody(req));
    sendJSON(res, 200, await requestViewportCapture(payload));
    return true;
  }

  const captureResponseMatch = pathname.match(/^\/api\/operator\/captures\/([a-f0-9-]+)$/);
  if (captureResponseMatch && req.method === "POST") {
    requireLocalOutputRequest(req);
    const payload = JSON.parse((await readRequestBuffer(req, 96 * 1024 * 1024)).toString("utf8"));
    resolveViewportCapture(captureResponseMatch[1], payload);
    sendJSON(res, 200, { accepted: true });
    return true;
  }

  if (pathname === "/api/operator/playhead" && req.method === "POST") {
    requireLocalOutputRequest(req);
    const payload = JSON.parse(await readRequestBody(req));
    sendJSON(res, 200, await requestPlayheadChange(payload));
    return true;
  }

  const playheadResponseMatch = pathname.match(/^\/api\/operator\/playheads\/([a-f0-9-]+)$/);
  if (playheadResponseMatch && req.method === "POST") {
    requireLocalOutputRequest(req);
    const payload = JSON.parse(await readRequestBody(req));
    resolvePlayheadChange(playheadResponseMatch[1], payload);
    sendJSON(res, 200, { accepted: true });
    return true;
  }

  if (pathname === "/api/projects" && req.method === "GET") {
    sendJSON(res, 200, projectRepository.list());
    return true;
  }

  if (pathname === "/api/projects/create" && req.method === "POST") {
    requireLocalOutputRequest(req);
    const payload = JSON.parse(await readRequestBody(req));
    const model = await projectModel();
    if (!Number.isFinite(payload.durationSeconds) || payload.durationSeconds < 0.2 || payload.durationSeconds > 3600) {
      const error = new Error("场景时长必须为 0.2–3600 秒。");
      error.statusCode = 400;
      throw error;
    }
    const commands = await projectCommandService();
    if (payload.frameRate !== undefined) commands.validateFilmSpaceOperation({action:"set_frame_rate",frameRate:payload.frameRate});
    if (payload.aspectRatio !== undefined) commands.validateFilmSpaceOperation({action:"set_project_aspect_ratio",aspectRatio:payload.aspectRatio});
    const project = model.createDesktopProject({
      frameRate: payload.frameRate,
      defaultAspectRatio: payload.aspectRatio,
      name: typeof payload?.name === "string" ? payload.name : undefined,
      durationSeconds: payload.durationSeconds,
    });
    const saved = projectRepository.saveVersioned(project, 0);
    publishProjectChange(saved, payload?.source || "project-create");
    sendJSON(res, 201, saved);
    return true;
  }

  if (pathname === "/api/projects" && req.method === "POST") {
    requireLocalOutputRequest(req);
    const input=JSON.parse(await readRequestBody(req));
    const model=await projectModel();
    let project;try{project=model.normalizeDesktopProject(input);}catch(error){error.statusCode=400;throw error;}
    const expectedRevisionHeader = req.headers["x-film-space-revision"];
    const saved = expectedRevisionHeader === undefined
      ? (projectRepository.save(project), project)
      : projectRepository.saveVersioned(project, expectedRevisionHeader);
    publishProjectChange(saved, String(req.headers["x-film-space-source"] || "project-save"));
    sendJSON(res, 200, saved);
    return true;
  }

  if (pathname === "/api/project-imports" && req.method === "POST") {
    requireLocalOutputRequest(req);
    const temporaryPath = await readRequestToTemporaryFile(req, maximumProjectPackageBytes());
    try {
      const imported = projectRepository.importPackage(temporaryPath);
      publishProjectChange(imported, "project-import");
      sendJSON(res, 201, imported);
    } finally {
      try { fs.unlinkSync(temporaryPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return true;
  }

  const projectDuplicateMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/duplicate$/);
  if (projectDuplicateMatch && req.method === "POST") {
    requireLocalOutputRequest(req);
    const duplicated = projectRepository.duplicate(projectDuplicateMatch[1]);
    publishProjectChange(duplicated, "project-duplicate");
    sendJSON(res, 201, duplicated);
    return true;
  }

  const projectPackageMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/package$/);
  if (projectPackageMatch && req.method === "GET") {
    requireLocalOutputRequest(req);
    const packageFile = projectRepository.createPackage(projectPackageMatch[1]);
    res.writeHead(200, {
      "content-type": "application/x-film-space-project",
      "content-length": packageFile.sizeBytes,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(packageFile.fileName)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    const stream = fs.createReadStream(packageFile.path);
    const cleanup = () => {
      try { fs.unlinkSync(packageFile.path); } catch (error) { if (error.code !== "ENOENT") console.error(error); }
    };
    stream.on("error", () => res.destroy());
    stream.on("close", cleanup);
    res.on("close", () => {
      stream.destroy();
      cleanup();
    });
    stream.pipe(res);
    return true;
  }

  const projectDeleteMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)$/);
  if (projectDeleteMatch && req.method === "DELETE") {
    requireLocalOutputRequest(req);
    const deleted = projectRepository.remove(projectDeleteMatch[1]);
    publishOperatorEvent("projectDeleted", {
      projectID: deleted.id,
      source: String(req.headers["x-film-space-source"] || "project-delete"),
    });
    sendJSON(res, 200, deleted);
    return true;
  }

  const revisionMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/revision$/);
  if (revisionMatch && req.method === "GET") {
    const project = requireProject(revisionMatch[1]);
    sendJSON(res, 200, {
      projectID: project.id,
      revision: normalizeRevision(project.revision),
      modifiedAt: project.modifiedAt,
    });
    return true;
  }

  const operationsMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/operations$/);
  if (operationsMatch && req.method === "POST") {
    requireLocalOutputRequest(req);
    const payload = JSON.parse(await readRequestBody(req));
    const stored = requireProject(operationsMatch[1]);
    const commands = await projectCommandService();
    const result = commands.applyFilmSpaceOperations(stored, payload?.operations);
    const saved = projectRepository.saveVersioned(result.project, payload?.expectedRevision);
    publishProjectChange(saved, payload?.source || "operations");
    sendJSON(res, 200, {
      project: saved,
      results: result.results,
    });
    return true;
  }

  const selectionMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/selection$/);
  if (selectionMatch && req.method === "GET") {
    requireProject(selectionMatch[1]);
    sendJSON(res, 200, operatorSelections.get(selectionMatch[1]) || emptyOperatorSelection(selectionMatch[1]));
    return true;
  }
  if (selectionMatch && req.method === "POST") {
    requireLocalOutputRequest(req);
    const project = requireProject(selectionMatch[1]);
    const selection = normalizeOperatorSelection(
      project,
      JSON.parse(await readRequestBody(req)),
      req.headers["x-film-space-source"]
    );
    operatorSelections.set(project.id, selection);
    publishOperatorEvent("selectionChanged", selection);
    sendJSON(res, 200, selection);
    return true;
  }

  
  

  
  
  

  const environmentCollectionMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/environment-assets$/);
  if (environmentCollectionMatch && req.method === "POST") {
    requireLocalOutputRequest(req);
    let sourceName = "environment.glb";
    try {
      sourceName = decodeURIComponent(String(req.headers["x-file-name"] || sourceName));
    } catch {
      const error = new Error("Environment source filename is invalid");
      error.statusCode = 400;
      throw error;
    }
    const body = await readRequestBuffer(req, 256 * 1024 * 1024);
    sendJSON(
      res,
      201,
      projectRepository.saveEnvironmentAsset(environmentCollectionMatch[1], sourceName, body)
    );
    return true;
  }

  
  

  const referenceCollectionMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/reference-assets$/);
  if (referenceCollectionMatch && req.method === "POST") {
    requireLocalOutputRequest(req);
    let sourceName = "reference.png";
    try {
      sourceName = decodeURIComponent(String(req.headers["x-file-name"] || sourceName));
    } catch {
      const error = new Error("Reference-image source filename is invalid");
      error.statusCode = 400;
      throw error;
    }
    const body = await readRequestBuffer(req, 32 * 1024 * 1024);
    sendJSON(
      res,
      201,
      projectRepository.saveReferenceImageAsset(
        referenceCollectionMatch[1],
        sourceName,
        req.headers["content-type"],
        body
      )
    );
    return true;
  }

  const environmentAssetMatch = pathname.match(
    /^\/api\/projects\/([a-zA-Z0-9-]+)\/environment-assets\/(environment-[a-f0-9]{16}\.glb)$/
  );
  if (environmentAssetMatch && req.method === "GET") {
    const body = projectRepository.loadEnvironmentAsset(environmentAssetMatch[1], environmentAssetMatch[2]);
    if (!body) {
      const error = new Error("Environment asset not found");
      error.statusCode = 404;
      throw error;
    }
    res.writeHead(200, {
      "content-type": "model/gltf-binary",
      "content-length": body.length,
      "cache-control": "no-store",
    });
    res.end(body);
    return true;
  }

  
  

  const referenceAssetMatch = pathname.match(
    /^\/api\/projects\/([a-zA-Z0-9-]+)\/reference-assets\/(reference-[a-f0-9]{16}\.(?:png|jpe?g|webp))$/
  );
  if (referenceAssetMatch && req.method === "GET") {
    const body = projectRepository.loadReferenceImageAsset(referenceAssetMatch[1], referenceAssetMatch[2]);
    if (!body) {
      const error = new Error("Reference image asset not found");
      error.statusCode = 404;
      throw error;
    }
    res.writeHead(200, {
      "content-type": imageContentType(referenceAssetMatch[2]),
      "content-length": body.length,
      "cache-control": "no-store",
    });
    res.end(body);
    return true;
  }

  const match = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)$/);
  if (match && req.method === "GET") {
    const storedProject = projectRepository.load(match[1]);
    if (!storedProject) {
      const error = new Error("Desktop project not found");
      error.statusCode = 404;
      throw error;
    }
    const model = await projectModel();
    const project = model.normalizeDesktopProject(storedProject);
    sendJSON(res, 200, project);
    return true;
  }

  if (pathname.startsWith("/api/")) {
    const error = new Error("API route not found");
    error.statusCode = 404;
    throw error;
  }

  return false;
}

function projectCommandService(){return projectCommandServicePromise ||= import('./app/project-command-service.js');}

function projectModel(){return projectModelPromise ||= import('./app/project-model.js');}

function requireProject(projectID) {
  const project = projectRepository.load(projectID);
  if (project) return project;
  const error = new Error("Desktop project not found");
  error.statusCode = 404;
  throw error;
}

function normalizeRevision(value) {
  const revision = Number.parseInt(value, 10);
  return Number.isFinite(revision) && revision >= 0 ? revision : 0;
}

function emptyOperatorSelection(projectID) {
  return {
    projectID,
    kind: null,
    actorID: null,
    cameraSetupID: null,
    shotID: null,
    environmentID: null,
    environmentGroupID: null,
    blockoutGroupID: null,
    blockoutObjectID: null,
    blockoutPrimitiveID: null,
    source: null,
    updatedAt: null,
  };
}

function normalizeOperatorSelection(project, input, sourceInput = null) {
  const actorID = project.scene?.actors?.some((actor) => actor.id === input?.actorID)
    ? input.actorID
    : null;
  const cameraSetupID = project.scene?.cameraSetups?.some((setup) => setup.id === input?.cameraSetupID)
    ? input.cameraSetupID
    : null;
  const shotID = project.scene?.shots?.some((shot) => shot.id === input?.shotID)
    ? input.shotID
    : null;
  const environmentID = project.scene?.environment?.visuals?.some(
    (visual) => visual.id === input?.environmentID
  ) ? input.environmentID : null;
  const environmentGroupID = project.scene?.environment?.groups?.some(
    (group) => group.id === input?.environmentGroupID
  ) ? input.environmentGroupID : null;
  const group = project.scene?.blockout?.groups?.find((candidate) => candidate.id === input?.blockoutGroupID);
  const blockoutObject = group?.objects?.find((object) => object.id === input?.blockoutObjectID)
    || group?.objects?.find((object) => (
      object.primitives?.some((primitive) => primitive.id === input?.blockoutPrimitiveID)
    ));
  const blockoutObjectID = blockoutObject?.id || null;
  const blockoutPrimitiveID = blockoutObject?.primitives?.some((primitive) => primitive.id === input?.blockoutPrimitiveID)
    ? input.blockoutPrimitiveID
    : null;
  const requestedKind = [
    "actor",
    "cameraSetup",
    "shot",
    "blockoutGroup",
    "blockoutObject",
    "blockoutPrimitive",
    "blockoutLayer",
    "environment",
    "environmentGroup",
  ].includes(input?.kind) ? input.kind : null;
  const inferredKind = actorID
    ? "actor"
    : blockoutPrimitiveID
      ? "blockoutPrimitive"
      : blockoutObjectID
        ? "blockoutObject"
      : group
        ? "blockoutGroup"
        : cameraSetupID
          ? "cameraSetup"
          : shotID
            ? "shot"
            : input?.kind === "environment" && environmentID
              ? "environment"
              : input?.kind === "environmentGroup" && environmentGroupID
                ? "environmentGroup"
              : null;
  const kindIsValid = {
    actor: Boolean(actorID),
    cameraSetup: Boolean(cameraSetupID),
    shot: Boolean(shotID),
    blockoutGroup: Boolean(group),
    blockoutObject: Boolean(blockoutObjectID),
    blockoutPrimitive: Boolean(blockoutPrimitiveID),
    blockoutLayer: true,
    environment: Boolean(environmentID),
    environmentGroup: Boolean(environmentGroupID),
  }[requestedKind] === true;
  const kind = kindIsValid ? requestedKind : inferredKind;
  const source = typeof sourceInput === "string" && sourceInput.length <= 160
    ? sourceInput
    : null;
  return {
    projectID: project.id,
    kind,
    actorID: kind === "actor" ? actorID : null,
    cameraSetupID: kind === "cameraSetup" ? cameraSetupID : null,
    shotID: kind === "shot" ? shotID : null,
    environmentID: kind === "environment" ? environmentID : null,
    environmentGroupID: kind === "environmentGroup" ? environmentGroupID : null,
    blockoutGroupID: ["blockoutGroup", "blockoutObject", "blockoutPrimitive"].includes(kind) ? group?.id || null : null,
    blockoutObjectID: ["blockoutObject", "blockoutPrimitive"].includes(kind) ? blockoutObjectID : null,
    blockoutPrimitiveID: kind === "blockoutPrimitive" ? blockoutPrimitiveID : null,
    source,
    updatedAt: new Date().toISOString(),
  };
}

function openOperatorEventStream(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ service: "film-space-operator" })}\n\n`);
  operatorEventClients.add(res);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  const close = () => {
    clearInterval(heartbeat);
    operatorEventClients.delete(res);
  };
  req.on("close", close);
  req.on("error", close);
}

function publishProjectChange(project, source) {
  publishOperatorEvent("projectChanged", {
    projectID: project.id,
    revision: normalizeRevision(project.revision),
    modifiedAt: project.modifiedAt,
    source,
  });
}

function publishOperatorEvent(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...operatorEventClients]) {
    try {
      client.write(message);
    } catch {
      operatorEventClients.delete(client);
    }
  }
}

function requestViewportCapture(input) {
  const projectID = String(input?.projectID || "");
  requireProject(projectID);
  const times = normalizeCaptureTimes(input?.times);
  const requestID = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingViewportCaptures.delete(requestID);
      const error = new Error("Film Space UI did not answer the viewport capture request");
      error.statusCode = 504;
      reject(error);
    }, 12000);
    pendingViewportCaptures.set(requestID, { resolve, reject, timeout, projectID });
    publishOperatorEvent("captureRequested", {
      requestID,
      projectID,
      mode: ["visible", "camera"].includes(input?.mode) ? input.mode : "visible",
      ...(times ? { times, preservePlayhead: input?.preservePlayhead !== false } : {}),
    });
  });
}

function resolveViewportCapture(requestID, payload) {
  const pending = pendingViewportCaptures.get(requestID);
  if (!pending) {
    const error = new Error("Viewport capture request is no longer active");
    error.statusCode = 404;
    throw error;
  }
  pendingViewportCaptures.delete(requestID);
  clearTimeout(pending.timeout);
  if (payload?.error) {
    const error = new Error(String(payload.error));
    error.statusCode = 500;
    pending.reject(error);
    return;
  }
  if (Array.isArray(payload?.frames)) {
    if (!payload.frames.length || payload.frames.length > 8) {
      const error = new Error("Viewport capture sequence must contain between 1 and 8 frames");
      error.statusCode = 400;
      pending.reject(error);
      return;
    }
    let frames;
    try {
      frames = payload.frames.map((frame, index) => ({
        requestedTime: finiteNonNegative(frame?.requestedTime, `frames[${index}].requestedTime`),
        time: finiteNonNegative(frame?.time, `frames[${index}].time`),
        frame: finiteNonNegativeInteger(frame?.frame, `frames[${index}].frame`),
        dataURL: validViewportDataURL(frame?.dataURL),
      }));
    } catch (error) {
      pending.reject(error);
      return;
    }
    pending.resolve({
      projectID: pending.projectID,
      mimeType: "image/png",
      frames,
      restoredPlayhead: payload?.restoredPlayhead === true,
    });
    return;
  }
  let dataURL;
  try {
    dataURL = validViewportDataURL(payload?.dataURL);
  } catch (error) {
    pending.reject(error);
    return;
  }
  pending.resolve({
    projectID: pending.projectID,
    mimeType: "image/png",
    dataURL,
  });
}

function requestPlayheadChange(input) {
  const projectID = String(input?.projectID || "");
  requireProject(projectID);
  const time = finiteNonNegative(input?.time, "time");
  const requestID = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingPlayheadRequests.delete(requestID);
      const error = new Error("Film Space UI did not answer the playhead request");
      error.statusCode = 504;
      reject(error);
    }, 12000);
    pendingPlayheadRequests.set(requestID, { resolve, reject, timeout, projectID, time });
    publishOperatorEvent("playheadRequested", { requestID, projectID, time });
  });
}

function resolvePlayheadChange(requestID, payload) {
  const pending = pendingPlayheadRequests.get(requestID);
  if (!pending) {
    const error = new Error("Playhead request is no longer active");
    error.statusCode = 404;
    throw error;
  }
  pendingPlayheadRequests.delete(requestID);
  clearTimeout(pending.timeout);
  if (payload?.error) {
    const error = new Error(String(payload.error));
    error.statusCode = 500;
    pending.reject(error);
    return;
  }
  try {
    pending.resolve({
      projectID: pending.projectID,
      requestedTime: pending.time,
      time: finiteNonNegative(payload?.time, "time"),
      frame: finiteNonNegativeInteger(payload?.frame, "frame"),
      frameRate: finitePositiveInteger(payload?.frameRate, "frameRate"),
      duration: finiteNonNegative(payload?.duration, "duration"),
      status: ["idle", "paused", "completed"].includes(payload?.status) ? payload.status : "paused",
    });
  } catch (error) {
    pending.reject(error);
  }
}

function normalizeCaptureTimes(input) {
  if (input === undefined) return null;
  if (!Array.isArray(input) || !input.length || input.length > 8) {
    const error = new Error("times must contain between 1 and 8 time values");
    error.statusCode = 400;
    throw error;
  }
  return input.map((time, index) => finiteNonNegative(time, `times[${index}]`));
}

function validViewportDataURL(input) {
  const dataURL = String(input || "");
  if (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(dataURL) || dataURL.length > 12 * 1024 * 1024) {
    const error = new Error("Viewport capture payload is invalid");
    error.statusCode = 400;
    throw error;
  }
  return dataURL;
}

function finiteNonNegative(input, field) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) {
    const error = new Error(`${field} must be a finite non-negative number`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function finiteNonNegativeInteger(input, field) {
  const value = finiteNonNegative(input, field);
  if (!Number.isInteger(value)) {
    const error = new Error(`${field} must be an integer`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function finitePositiveInteger(input, field) {
  const value = finiteNonNegativeInteger(input, field);
  if (value < 1) {
    const error = new Error(`${field} must be greater than zero`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function imageContentType(fileName) {
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function handleOutputAPI(req, res, pathname) {
  if (pathname.startsWith("/api/output/") || pathname.startsWith("/api/exports")) {
    requireLocalOutputRequest(req);
  }
  if (pathname === "/api/output/select-folder" && req.method === "POST") {
    const folder = await chooseOutputFolder();
    sendJSON(res, 200, { folder });
    return true;
  }

  if (pathname === "/api/output/reveal" && req.method === "POST") {
    const payload = JSON.parse(await readRequestBody(req));
    revealInFinder(payload.path);
    sendJSON(res, 200, { revealed: true });
    return true;
  }

  

  if (pathname === "/api/exports" && req.method === "POST") {
    const payload = JSON.parse(await readRequestBody(req));
    const task=exportManager.start(payload);exportTouches.set(task.id,{touched:Date.now(),encoding:false});sendJSON(res,201,task);
    return true;
  }

  const frameMatch = pathname.match(/^\/api\/exports\/([a-f0-9-]+)\/frames\/(\d+)$/);
  if (frameMatch && req.method === "PUT") {
    const buffer = await readRequestBuffer(req, 32 * 1024 * 1024);
    if(exportTouches.has(frameMatch[1]))exportTouches.get(frameMatch[1]).touched=Date.now();
    sendJSON(res, 200, exportManager.writeFrame(frameMatch[1], frameMatch[2], buffer));
    return true;
  }

  const completeMatch = pathname.match(/^\/api\/exports\/([a-f0-9-]+)\/complete$/);
  if (completeMatch && req.method === "POST") {
    if(exportTouches.has(completeMatch[1]))exportTouches.get(completeMatch[1]).encoding=true;
    try { sendJSON(res,200,await exportManager.complete(completeMatch[1])); } finally { exportTouches.delete(completeMatch[1]); }
    return true;
  }

  const cancelMatch = pathname.match(/^\/api\/exports\/([a-f0-9-]+)$/);
  if (cancelMatch && ["DELETE","POST"].includes(req.method)) {
    exportTouches.delete(cancelMatch[1]);
    sendJSON(res, 200, exportManager.cancel(cancelMatch[1]));
    return true;
  }

  return false;
}

function requireLocalOutputRequest(req) {
  const remoteAddress = req.socket.remoteAddress || "";
  const loopback = remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1";
  let localOrigin = true;
  if (req.headers.origin) {
    try {
      const hostname = new URL(req.headers.origin).hostname;
      localOrigin = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    } catch {
      localOrigin = false;
    }
  }
  if (!loopback || !localOrigin) {
    const error = new Error("Output APIs are available only on this computer");
    error.statusCode = 403;
    throw error;
  }
}

function readRequestBody(req) {
  return readRequestBuffer(req, 2 * 1024 * 1024).then((buffer) => buffer.toString("utf8"));
}

function readRequestBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > limit) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function maximumProjectPackageBytes() {
  return 512 * 1024 * 1024;
}

function readRequestToTemporaryFile(req, limit) {
  const temporaryPath = path.join(
    PROJECT_ROOT,
    `.project-import-${process.pid}-${crypto.randomBytes(8).toString("hex")}.filmspace`
  );
  fs.mkdirSync(PROJECT_ROOT, { recursive: true });
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 });
    let length = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      output.destroy();
      try { fs.unlinkSync(temporaryPath); } catch (unlinkError) { if (unlinkError.code !== "ENOENT") console.error(unlinkError); }
      reject(error);
    };
    output.on("error", fail);
    req.on("error", fail);
    req.on("aborted", () => fail(new Error("Project package upload was interrupted")));
    req.on("data", (chunk) => {
      if (settled) return;
      length += chunk.length;
      if (length > limit) {
        const error = new Error("Project package is too large");
        error.statusCode = 413;
        fail(error);
        req.destroy();
        return;
      }
      if (!output.write(chunk)) req.pause();
    });
    output.on("drain", () => req.resume());
    req.on("end", () => {
      if (settled) return;
      output.end(() => {
        if (settled) return;
        settled = true;
        resolve(temporaryPath);
      });
    });
  });
}

function chooseOutputFolder() {
  if(process.platform==='win32')return new Promise((resolve,reject)=>{
    const child=spawn(process.env.FILM_SPACE_LITE_HELPER,['--select-folder'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>{if(code===0&&output.trim())resolve(path.resolve(output.trim()));else{const failure=new Error(error.trim()||'已取消选择输出文件夹');failure.statusCode=409;reject(failure);}});
  });
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "选择 Film Space 输出文件夹")',
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && stdout.trim()) resolve(path.resolve(stdout.trim()));
      else {
        const error = new Error(code === 1 ? "已取消选择输出文件夹" : (stderr.trim() || "无法选择输出文件夹"));
        error.statusCode = code === 1 ? 409 : 500;
        reject(error);
      }
    });
  });
}

function revealInFinder(inputPath){if(typeof inputPath!=='string'||!path.isAbsolute(inputPath)||!fs.existsSync(inputPath)){const error=new Error('文件路径不存在');error.statusCode=400;throw error;}const command=process.platform==='darwin'?'/usr/bin/open':'explorer.exe';const args=process.platform==='darwin'?['-R',inputPath]:[fs.statSync(inputPath).isDirectory()?inputPath:'/select,'+inputPath];const child=spawn(command,args,{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',error=>console.error(error));child.unref();}

function sendJSON(res, statusCode, value) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function shutdownDirector(){
 clearInterval(exportExpiry);
 for(const response of operatorEventClients)response.end();
 server.close(()=>{const descriptor=process.env.FILM_SPACE_SERVICE_FILE||paths.service;try{const data=JSON.parse(fs.readFileSync(descriptor,'utf8'));if(data.pid===process.pid)fs.unlinkSync(descriptor);}catch(error){if(error.code!=='ENOENT')console.error(error);}process.exit(0);});
 server.closeIdleConnections();
}
const exportExpiry=setInterval(()=>{for(const [id,state] of exportTouches){if(!state.encoding&&Date.now()-state.touched>30000){try{exportManager.cancel(id);}catch(error){console.error(error);}exportTouches.delete(id);}}},5000);
exportExpiry.unref();
server.listen(PORT,HOST,()=>{
 const descriptor=process.env.FILM_SPACE_SERVICE_FILE||paths.service;
 fs.mkdirSync(path.dirname(descriptor),{recursive:true});
 const temporary=descriptor+'.'+process.pid+'.tmp';
 fs.writeFileSync(temporary,JSON.stringify({version:1,service:'film-space-lite',runtimeMode:RUNTIME_MODE,port:server.address().port,pid:process.pid})+'\n',{mode:0o600});fs.renameSync(temporary,descriptor);
 console.log('Film Space Lite: http://127.0.0.1:'+server.address().port);
});
process.on('SIGTERM',shutdownDirector);process.on('SIGINT',shutdownDirector);
