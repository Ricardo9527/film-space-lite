import { normalizeDesktopProject } from "./project-model.js";

export class ProjectAPI {
  constructor() {
    this.sourceID = `ui:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  }

  async list() {
    return requestJSON("/api/projects");
  }

  async load(id) {
    return normalizeDesktopProject(await requestJSON(`/api/projects/${encodeURIComponent(id)}`));
  }

  async duplicate(id) {
    return normalizeDesktopProject(await requestJSON(`/api/projects/${encodeURIComponent(id)}/duplicate`, {
      method: "POST",
    }));
  }

  async remove(id) {
    return requestJSON(`/api/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-film-space-source": this.sourceID },
    });
  }

  async importPackage(file) {
    if (!(file instanceof Blob)) throw new Error("请选择一份 .filmspace 项目文件");
    return normalizeDesktopProject(await requestJSON("/api/project-imports", {
      method: "POST",
      headers: { "content-type": "application/x-film-space-project" },
      body: file,
    }));
  }

  packageURL(id) {
    return `/api/projects/${encodeURIComponent(id)}/package`;
  }

  async save(project) {
    const normalized = normalizeDesktopProject(project);
    return normalizeDesktopProject(await requestJSON("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-film-space-revision": String(normalized.revision || 0),
        "x-film-space-source": this.sourceID,
      },
      body: JSON.stringify(normalized),
    }));
  }

  async revision(projectID) {
    return requestJSON(`/api/projects/${encodeURIComponent(projectID)}/revision`);
  }

  async applyOperations(projectID, expectedRevision, operations, source = this.sourceID) {
    const result = await requestJSON(`/api/projects/${encodeURIComponent(projectID)}/operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision, operations, source }),
    });
    return {
      ...result,
      project: normalizeDesktopProject(result.project),
    };
  }

  async selection(projectID) {
    return requestJSON(`/api/projects/${encodeURIComponent(projectID)}/selection`);
  }

  async setSelection(projectID, selection) {
    return requestJSON(`/api/projects/${encodeURIComponent(projectID)}/selection`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-film-space-source": this.sourceID,
      },
      body: JSON.stringify(selection),
    });
  }

  subscribe(handlers = {}) {
    const source = new EventSource("/api/operator/events");
    source.addEventListener("open", () => handlers.open?.());
    for (const event of [
      "projectChanged",
      "projectDeleted",
      "selectionChanged",
      "operatorCommand",
      "captureRequested",
      "playheadRequested",
    ]) {
      source.addEventListener(event, (message) => {
        try {
          handlers[event]?.(JSON.parse(message.data));
        } catch (error) {
          handlers.error?.(error);
        }
      });
    }
    source.addEventListener("error", (error) => handlers.error?.(error));
    return () => source.close();
  }

  async answerViewportCapture(requestID, payload) {
    return requestJSON(`/api/operator/captures/${encodeURIComponent(requestID)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async answerPlayheadRequest(requestID, payload) {
    return requestJSON(`/api/operator/playheads/${encodeURIComponent(requestID)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  

  

  async importEnvironmentGLB(projectID, file) {
    if (!(file instanceof Blob)) throw new Error("请选择一份 GLB 文件");
    return requestJSON(`/api/projects/${encodeURIComponent(projectID)}/environment-assets`, {
      method: "POST",
      headers: {
        "content-type": "model/gltf-binary",
        "x-file-name": encodeURIComponent(file.name || "environment.glb"),
      },
      body: file,
    });
  }

  

  async importReferenceImage(projectID, file) {
    if (!(file instanceof Blob)) throw new Error("请选择 PNG、JPEG 或 WebP 参考图");
    return requestJSON(`/api/projects/${encodeURIComponent(projectID)}/reference-assets`, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name || "reference.png"),
      },
      body: file,
    });
  }

  

  

  

  

  async chooseOutputFolder() {
    return requestJSON("/api/output/select-folder", { method: "POST" });
  }

  async revealOutput(path) {
    return requestJSON("/api/output/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
  }

  async startExport(specification) {
    return requestJSON("/api/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(specification),
    });
  }

  async exportBlend(specification) {
    return requestJSON("/api/exports/blend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(specification),
    });
  }

  async uploadExportFrame(exportID, frameIndex, pngBlob) {
    return requestJSON(`/api/exports/${encodeURIComponent(exportID)}/frames/${frameIndex}`, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: pngBlob,
    });
  }

  async completeExport(exportID) {
    return requestJSON(`/api/exports/${encodeURIComponent(exportID)}/complete`, { method: "POST" });
  }

  async cancelExport(exportID) {
    return requestJSON(`/api/exports/${encodeURIComponent(exportID)}`, { method: "DELETE" });
  }
}

export function environmentAssetURL(projectID, assetRef) {
  if (typeof assetRef !== "string") return null;
  const prefix = `${projectID}-assets/`;
  if (!assetRef.startsWith(prefix)) return null;
  const fileName = assetRef.slice(prefix.length);
  if (!/^environment-[a-f0-9]{16}\.glb$/.test(fileName)) return null;
  return `/api/projects/${encodeURIComponent(projectID)}/environment-assets/${encodeURIComponent(fileName)}`;
}

export function referenceImageAssetURL(projectID, assetRef) {
  if (typeof assetRef !== "string") return null;
  const prefix = `${projectID}-assets/`;
  if (!assetRef.startsWith(prefix)) return null;
  const fileName = assetRef.slice(prefix.length);
  if (!/^reference-[a-f0-9]{16}\.(?:png|jpe?g|webp)$/.test(fileName)) return null;
  return `/api/projects/${encodeURIComponent(projectID)}/reference-assets/${encodeURIComponent(fileName)}`;
}

async function requestJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    let payload = null;
    try {
      payload = JSON.parse(body);
      message = payload.error || body;
    } catch {
      // Keep the plain response body.
    }
    const error = new Error(message || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return response.json();
}
