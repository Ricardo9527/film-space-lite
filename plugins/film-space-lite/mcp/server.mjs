import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";

import path from "node:path";
import readline from "node:readline";
import { discoverDirectorService } from "./service-discovery.mjs";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const operationSnapshot = JSON.parse(
  readFileSync(path.join(pluginRoot, "assets", "operation-contracts.json"), "utf8")
);

let startingService = null;

const tools = [
  tool(
    "get_film_space_capabilities",
    "Get Film Space capabilities, coordinate rules, action catalog, operation domains, concise contracts, and safety boundaries.",
    objectSchema({}),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "get_film_space_operation_schema",
    "Get the complete machine-readable input schema, description, domain, and example for one stable Film Space operation before using it.",
    objectSchema({
      action: {
        type: "string",
        enum: operationSnapshot.actions,
        description: "Stable Film Space operation name.",
      },
    }, ["action"]),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "get_film_space_service_status",
    "Check whether the Film Space service and durable project store are readable and writable, with an actionable recovery hint.",
    objectSchema({}),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "open_film_space",
    "Start the local Film Space service if needed and open its Director Console. A project ID may be supplied.",
    objectSchema({
      projectID: stringSchema("Existing Film Space project ID."),
    }),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "list_film_space_projects",
    "List local Film Space Lite projects, newest first, including their current revisions.",
    objectSchema({}),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "create_film_space_project",
    "Create a Film Space Lite project with name, aspect ratio, frame rate and duration. Output uses a fixed 1080-pixel short edge.",
    objectSchema({
      name: stringSchema("Project name."),
      frameRate: {type:"integer",enum:[24,25,30,60]},
      aspectRatio: operationSnapshot.definitions.set_project_aspect_ratio.inputSchema.properties.aspectRatio,
      durationSeconds: { type: "number", minimum: 0.2, maximum: 3600 },
    }, ["name", "durationSeconds"]),
    { destructiveHint: true, idempotentHint: false }
  ),
  tool(
    "get_film_space_project_state",
    "Read the complete normalized Film Space Lite project. Omit projectID to read the newest project.",
    objectSchema({
      projectID: stringSchema("Film Space project ID."),
    }),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "get_film_space_project_revision",
    "Read only the current project revision and modification time.",
    objectSchema({
      projectID: stringSchema("Film Space project ID."),
    }, ["projectID"]),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "apply_film_space_operations",
    `Apply an atomic batch of stable semantic operations to the authoritative project. Read state first and pass its exact revision. ${operationSnapshot.blockoutSurfaceAuthoringGuidance}`,
    objectSchema({
      projectID: stringSchema("Film Space project ID."),
      expectedRevision: {
        type: "integer",
        minimum: 0,
        description: "Exact revision returned by the latest project read.",
      },
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 200,
        items: {
          type: "object",
          required: ["action"],
          properties: {
            action: {
              type: "string",
              enum: operationSnapshot.actions,
              description: "Stable Film Space operation name from get_film_space_capabilities.",
            },
          },
          additionalProperties: true,
        },
      },
    }, ["projectID", "expectedRevision", "operations"]),
    { destructiveHint: true, idempotentHint: false }
  ),
  ...domainOperationTools(),
  tool(
    "get_film_space_selection",
    "Read the current ephemeral Film Space operator selection.",
    objectSchema({
      projectID: stringSchema("Film Space project ID."),
    }, ["projectID"]),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "set_film_space_selection",
    "Select exactly one existing actor, camera setup, Shot, visual environment, Blockout layer, group, semantic object, or internal primitive in the open Film Space UI.",
    objectSchema({
      projectID: stringSchema("Film Space project ID."),
      kind: {
        type: ["string", "null"],
        enum: ["actor", "cameraSetup", "shot", "environment", "environmentGroup", "blockoutLayer", "blockoutGroup", "blockoutObject", "blockoutPrimitive", null],
        description: "Discriminated selection kind. Supply the matching ID fields; blockoutLayer needs no entity ID.",
      },
      actorID: nullableStringSchema("Actor ID or null."),
      cameraSetupID: nullableStringSchema("Camera setup ID or null."),
      shotID: nullableStringSchema("Shot ID or null."),
      environmentID: nullableStringSchema("Visual-environment instance ID or null."),
      environmentGroupID: nullableStringSchema("Visual-environment group ID or null."),
      blockoutGroupID: nullableStringSchema("Blockout group ID or null."),
      blockoutObjectID: nullableStringSchema("Semantic object ID within blockoutGroupID or null."),
      blockoutPrimitiveID: nullableStringSchema("Internal primitive ID within blockoutObjectID or null."),
    }, ["projectID"]),
    { idempotentHint: true }
  ),
  tool(
    "import_film_space_reference_image",
    "Import a local PNG, JPEG, or WebP into a project and attach it as durable Blockout provenance.",
    objectSchema({
      projectID: stringSchema("Film Space project ID."),
      expectedRevision: { type: "integer", minimum: 0 },
      sourcePath: stringSchema("Absolute local path to the reference image."),
      name: stringSchema("Optional display name."),
      opacity: { type: "number", minimum: 0.05, maximum: 1 },
    }, ["projectID", "expectedRevision", "sourcePath"]),
    { idempotentHint: false }
  ),
  tool(
    "import_film_space_environment_glb",
    "Import a local GLB as a new visual-environment instance, or replace one addressed instance while preserving its authored state.",
    objectSchema({
      projectID: stringSchema("Film Space project ID."),
      expectedRevision: { type: "integer", minimum: 0 },
      sourcePath: stringSchema("Absolute local path to a GLB file."),
      id: stringSchema("Optional stable ID for the new visual-environment instance."),
      environmentID: stringSchema("Optional existing visual-environment instance ID to replace."),
    }, ["projectID", "expectedRevision", "sourcePath"]),
    { idempotentHint: false }
  ),
  
  tool(
    "control_film_space_session",
    "Drive reversible operator UI state: workspace, edit view, sidebar, inspector, transport, view framing, or save.",
    objectSchema({
      action: {
        type: "string",
        enum: ["set_workspace", "set_edit_view", "set_sidebar", "set_inspector", "transport", "view", "save"],
      },
      workspace: { type: "string", enum: ["edit", "camera"] },
      view: { type: "string", enum: ["scene", "shot", "top", "orbit", "actor", "environment"] },
      sidebar: { type: "string", enum: ["actors", "setups", "shots"] },
      panel: { type: "string", enum: ["actor", "motion", "camera", "scene"] },
      command: { type: "string", enum: ["play", "pause", "reset"] },
    }, ["action"]),
    { idempotentHint: false }
  ),
  tool(
    "set_film_space_playhead",
    "Pause and precisely seek the open project's active Shot playhead by seconds or by authored frame, with a UI-applied acknowledgement.",
    {
      type: "object",
      properties: {
        projectID: stringSchema("Film Space project ID currently open in the UI."),
        time: {
          type: "number",
          minimum: 0,
          maximum: 3600,
          description: "Target elapsed time in seconds.",
        },
        frame: {
          type: "integer",
          minimum: 0,
          description: "Target frame on the project's authored frame-rate grid.",
        },
      },
      required: ["projectID"],
      oneOf: [
        { required: ["time"], not: { required: ["frame"] } },
        { required: ["frame"], not: { required: ["time"] } },
      ],
      additionalProperties: false,
    },
    { idempotentHint: true }
  ),
  tool(
    "capture_film_space_view",
    "Capture the currently open viewport for visual feedback. The Film Space UI must be open on this project.",
    objectSchema({
      projectID: stringSchema("Film Space project ID."),
      mode: { type: "string", enum: ["visible", "camera"], default: "visible" },
    }, ["projectID"]),
    { readOnlyHint: true, idempotentHint: true }
  ),
  tool(
    "capture_film_space_shot_frames",
    "Capture 1–8 recording-safe camera frames at exact Shot times or authored frame numbers. Film Space waits for each seek to render and restores the original playhead afterward.",
    {
      type: "object",
      properties: {
        projectID: stringSchema("Film Space project ID currently open in the UI."),
        times: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "number", minimum: 0, maximum: 3600 },
          description: "Shot sample times in seconds, in desired output order.",
        },
        frames: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "integer", minimum: 0 },
          description: "Shot sample frames on the project's authored frame-rate grid.",
        },
      },
      required: ["projectID"],
      oneOf: [
        { required: ["times"], not: { required: ["frames"] } },
        { required: ["frames"], not: { required: ["times"] } },
      ],
      additionalProperties: false,
    },
    { readOnlyHint: true, idempotentHint: true }
  ),
];

const handlers = {
  async get_film_space_capabilities() {
    await ensureDirectorService();
    return textResult(
      "Film Space MCP capabilities.",
      { ...await api("/api/mcp/capabilities"), blockoutSurfaceAuthoringGuidance: operationSnapshot.blockoutSurfaceAuthoringGuidance }
    );
  },

  async get_film_space_operation_schema(input) {
    const action = requireString(input.action, "action");
    await ensureDirectorService();
    const { definition } = await api(`/api/mcp/operations/${encodeURIComponent(action)}`);
    return textResult(`Loaded the complete ${action} operation schema.`, { definition });
  },

  async get_film_space_service_status() {
    await ensureDirectorService();
    const status = await api("/api/mcp/status");
    return textResult(
      status.projectStorage?.writable
        ? "Film Space service and project storage are writable."
        : "Film Space project storage is not writable.",
      status
    );
  },

  async open_film_space(input) {
    await ensureDirectorService();
    const service = await requireDirectorService();
    const url = new URL(service.baseURL);
    if (input.projectID) url.searchParams.set("project", input.projectID);
    launchURL(url.href);
    return textResult("Film Space Director Console opened.", {
      url: url.href,
      projectID: input.projectID || null,
      runtimeBoundary: "The same loopback API can be reused by a future native macOS or Windows shell.",
    });
  },

  async list_film_space_projects() {
    await ensureDirectorService();
    const projects = await api("/api/projects");
    return textResult(`Found ${projects.length} Film Space project(s).`, { projects });
  },

  async create_film_space_project(input) {
    await ensureDirectorService();
    const project = await api("/api/projects/create", {
      method: "POST",
      json: { name: input.name, aspectRatio: input.aspectRatio, frameRate: input.frameRate, durationSeconds: input.durationSeconds, source: "mcp" },
    });
    return textResult(`Created Film Space project “${project.name}”.`, { project });
  },

  async get_film_space_project_state(input) {
    await ensureDirectorService();
    const projectID = await resolveProjectID(input.projectID);
    const project = await api(`/api/projects/${encodeURIComponent(projectID)}`);
    return textResult(`Read Film Space project “${project.name}” at revision ${project.revision || 0}.`, {
      project,
    });
  },

  async get_film_space_project_revision(input) {
    await ensureDirectorService();
    const revision = await api(`/api/projects/${encodeURIComponent(requireString(input.projectID, "projectID"))}/revision`);
    return textResult(`Film Space project revision is ${revision.revision}.`, revision);
  },

  

  async apply_film_space_operations(input) {
    return applyOperationBatch(input);
  },

  async get_film_space_selection(input) {
    await ensureDirectorService();
    const projectID = requireString(input.projectID, "projectID");
    const selection = await api(`/api/projects/${encodeURIComponent(projectID)}/selection`);
    return textResult("Read Film Space operator selection.", { selection });
  },

  async set_film_space_selection(input) {
    await ensureDirectorService();
    const projectID = requireString(input.projectID, "projectID");
    const selection = await api(`/api/projects/${encodeURIComponent(projectID)}/selection`, {
      method: "POST",
      json: {
        kind: input.kind ?? null,
        actorID: input.actorID ?? null,
        cameraSetupID: input.cameraSetupID ?? null,
        shotID: input.shotID ?? null,
        environmentID: input.environmentID ?? null,
        environmentGroupID: input.environmentGroupID ?? null,
        blockoutGroupID: input.blockoutGroupID ?? null,
        blockoutObjectID: input.blockoutObjectID ?? null,
        blockoutPrimitiveID: input.blockoutPrimitiveID ?? null,
      },
    });
    return textResult("Updated Film Space operator selection.", { selection });
  },

  async import_film_space_reference_image(input) {
    await ensureDirectorService();
    const projectID = requireString(input.projectID, "projectID");
    const sourcePath = await requireLocalFile(input.sourcePath, [".png", ".jpg", ".jpeg", ".webp"], 32 * 1024 * 1024);
    const bytes = await readFile(sourcePath);
    const asset = await api(`/api/projects/${encodeURIComponent(projectID)}/reference-assets`, {
      method: "POST",
      body: bytes,
      headers: {
        "content-type": imageMimeType(sourcePath),
        "x-file-name": encodeURIComponent(path.basename(sourcePath)),
      },
    });
    const result = await api(`/api/projects/${encodeURIComponent(projectID)}/operations`, {
      method: "POST",
      json: {
        expectedRevision: requireRevision(input.expectedRevision),
        source: "mcp-reference-import",
        operations: [{
          action: "attach_reference_image",
          asset,
          options: {
            name: input.name || path.basename(sourcePath),
            opacity: input.opacity,
          },
        }],
      },
    });
    return textResult(
      `Imported ${path.basename(sourcePath)} and attached it to Film Space Blockout provenance.`,
      { asset, project: result.project, results: result.results }
    );
  },

  async import_film_space_environment_glb(input) {
    await ensureDirectorService();
    const projectID = requireString(input.projectID, "projectID");
    if (input.id && input.environmentID) {
      throw new Error("Provide id for a new environment or environmentID for replacement, not both.");
    }
    const sourcePath = await requireLocalFile(input.sourcePath, [".glb"], 256 * 1024 * 1024);
    const bytes = await readFile(sourcePath);
    const asset = await api(`/api/projects/${encodeURIComponent(projectID)}/environment-assets`, {
      method: "POST",
      body: bytes,
      headers: {
        "content-type": "model/gltf-binary",
        "x-file-name": encodeURIComponent(path.basename(sourcePath)),
      },
    });
    const result = await api(`/api/projects/${encodeURIComponent(projectID)}/operations`, {
      method: "POST",
      json: {
        expectedRevision: requireRevision(input.expectedRevision),
        source: "mcp-environment-import",
        operations: [input.environmentID
          ? {
              action: "replace_visual_environment_asset",
              environmentID: input.environmentID,
              asset,
            }
          : {
              action: "set_visual_environment_asset",
              id: input.id,
              asset,
            }],
      },
    });
    return textResult(
      input.environmentID
        ? `Imported ${path.basename(sourcePath)} and replaced visual environment ${input.environmentID}.`
        : `Imported ${path.basename(sourcePath)} as a new Film Space visual environment.`,
      { asset, project: result.project, results: result.results }
    );
  },

  async control_film_space_session(input) {
    await ensureDirectorService();
    const action = requireString(input.action, "action");
    const accepted = await api("/api/operator/command", {
      method: "POST",
      json: {
        action,
        workspace: input.workspace,
        view: input.view,
        sidebar: input.sidebar,
        panel: input.panel,
        command: input.command,
        source: "mcp",
      },
    });
    return textResult(`Sent Film Space operator command: ${action}.`, accepted);
  },

  async set_film_space_playhead(input) {
    await ensureDirectorService();
    const projectID = requireString(input.projectID, "projectID");
    const project = await api(`/api/projects/${encodeURIComponent(projectID)}`);
    const { times, source } = resolveRequestedTimes(input, project, false);
    const playhead = await api("/api/operator/playhead", {
      method: "POST",
      json: { projectID, time: times[0] },
      timeoutMs: 15000,
    });
    return textResult(
      `Film Space playhead is at ${playhead.time.toFixed(3)}s (frame ${playhead.frame} at ${playhead.frameRate} fps).`,
      {
        ...playhead,
        requestedAs: source,
        durableProjectChanged: false,
      }
    );
  },

  async capture_film_space_view(input) {
    await ensureDirectorService();
    const projectID = requireString(input.projectID, "projectID");
    const capture = await api("/api/operator/capture", {
      method: "POST",
      json: { projectID, mode: input.mode || "visible" },
      timeoutMs: 15000,
    });
    const data = capture.dataURL.slice(capture.dataURL.indexOf(",") + 1);
    return {
      content: [
        { type: "text", text: `Captured Film Space ${input.mode || "visible"} viewport.` },
        { type: "image", data, mimeType: "image/png" },
      ],
      structuredContent: {
        projectID,
        mode: input.mode || "visible",
        mimeType: "image/png",
        byteLength: Buffer.byteLength(data, "base64"),
      },
    };
  },

  async capture_film_space_shot_frames(input) {
    await ensureDirectorService();
    const projectID = requireString(input.projectID, "projectID");
    const project = await api(`/api/projects/${encodeURIComponent(projectID)}`);
    const { times, source, frameRate, duration } = resolveRequestedTimes(input, project, true);
    const capture = await api("/api/operator/capture", {
      method: "POST",
      json: {
        projectID,
        mode: "camera",
        times,
        preservePlayhead: true,
      },
      timeoutMs: 30000,
    });
    const content = [{
      type: "text",
      text:
        `Captured ${capture.frames.length} recording-safe Film Space Shot frame(s) ` +
        `at ${capture.frames.map((frame) => `${frame.time.toFixed(3)}s`).join(", ")}.`,
    }];
    const frames = capture.frames.map((frame, index) => {
      const data = frame.dataURL.slice(frame.dataURL.indexOf(",") + 1);
      content.push({
        type: "text",
        text: `Sample ${index + 1}: ${frame.time.toFixed(3)}s · frame ${frame.frame}`,
      });
      content.push({ type: "image", data, mimeType: "image/png" });
      return {
        index,
        requestedTime: frame.requestedTime,
        time: frame.time,
        frame: frame.frame,
        byteLength: Buffer.byteLength(data, "base64"),
      };
    });
    return {
      content,
      structuredContent: {
        projectID,
        requestedAs: source,
        frameRate,
        duration,
        mode: "camera",
        mimeType: "image/png",
        restoredPlayhead: capture.restoredPlayhead,
        durableProjectChanged: false,
        frames,
      },
    };
  },
};

for (const domain of Object.keys(operationSnapshot.domains)) {
  handlers[domainToolName(domain)] = async (input) => applyOperationBatch(input, domain);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  void handleMessage(line);
});

async function handleMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (!Object.hasOwn(message, "id")) return;
  try {
    const result = await dispatch(message.method, message.params || {});
    write({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    write({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: error.code || -32603,
        message: error?.message || String(error),
        ...(error.data ? { data: error.data } : {}),
      },
    });
  }
}

async function dispatch(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: params.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "film-space", version: "0.1.0" },
      instructions:
        "Read the current versioned project before changing it. Prefer semantic operation batches. " +
        "After material Blockout changes, inspect the rendered viewport for obvious visual failures. " +
        "For camera-motion review, seek with set_film_space_playhead or inspect up to eight exact " +
        "recording-safe samples with capture_film_space_shot_frames.",
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") return { tools };
  if (method === "tools/call") {
    const handler = handlers[params.name];
    if (!handler) throw rpcError(-32602, `Unknown Film Space tool: ${params.name}`);
    try {
      return await handler(params.arguments || {});
    } catch (error) {
      return {
        content: [{ type: "text", text: error?.message || String(error) }],
        isError: true,
      };
    }
  }
  throw rpcError(-32601, `Method not found: ${method}`);
}

function tool(name, description, inputSchema, annotations = {}) {
  return {
    name,
    title: name.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
    description,
    inputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      ...annotations,
    },
  };
}

function domainOperationTools() {
  const labels = {
    project: "project settings and Scene End",
    actors: "actor lifecycle, transforms, visibility, locks, and semantic placement",
    motion: "Move, Stay / Perform, path points, and action ordering",
    cameras: "Camera Setups, Shots, camera keyframes, Look At, Follow, and Handheld",
    scene: "ground, visual environment, reference images, and geometric Blockout",
  };
  return Object.keys(operationSnapshot.domains).map((domain) => tool(
    domainToolName(domain),
    `Apply an atomic, revision-checked batch of ${labels[domain]} operations. Read state first and call get_film_space_operation_schema for any unfamiliar action.${domain === "scene" ? " " + operationSnapshot.blockoutSurfaceAuthoringGuidance : ""}`,
    operationBatchInputSchema(domain),
    { destructiveHint: true, idempotentHint: false }
  ));
}

function domainToolName(domain) {
  const toolDomains = {
    project: "project",
    actors: "actor",
    motion: "motion",
    cameras: "camera",
    scene: "scene",
  };
  return `apply_film_space_${toolDomains[domain]}_operations`;
}

function operationBatchInputSchema(domain) {
  const actions = operationSnapshot.domains[domain];
  return objectSchema({
    projectID: stringSchema("Film Space project ID."),
    expectedRevision: {
      type: "integer",
      minimum: 0,
      description: "Exact revision returned by the latest project read.",
    },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: actions,
            description: "Operation for this Film Space domain.",
          },
        },
        additionalProperties: true,
      },
    },
  }, ["projectID", "expectedRevision", "operations"]);
}

async function applyOperationBatch(input, domain = null) {
  await ensureDirectorService();
  const projectID = requireString(input.projectID, "projectID");
  const expectedRevision = requireRevision(input.expectedRevision);
  if (!Array.isArray(input.operations) || !input.operations.length) {
    throw new Error("operations must not be empty");
  }
  const allowedActions = domain ? operationSnapshot.domains[domain] : operationSnapshot.actions;
  const unsupported = input.operations.find((operation) => !allowedActions.includes(operation?.action));
  if (unsupported) {
    throw new Error(
      `${unsupported?.action || "(missing action)"} is not a ${domain || "Film Space"} operation. ` +
      "Use the matching domain tool or the cross-domain apply_film_space_operations tool."
    );
  }
  const result = await api(`/api/projects/${encodeURIComponent(projectID)}/operations`, {
    method: "POST",
    json: {
      expectedRevision,
      operations: input.operations,
      source: domain ? `mcp-${domain}` : "mcp",
    },
  });
  const warnings = result.results.filter((entry) => entry.warning).map((entry) => ({
    index: entry.index,
    action: entry.action,
    warning: entry.warning,
  }));
  return textResult(
    `Applied ${result.results.length} Film Space operation(s); project revision is now ${result.project.revision}.` +
    (warnings.length ? ` ${warnings.length} operation(s) reported no durable change.` : ""),
    { ...result, warnings }
  );
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function stringSchema(description) {
  return { type: "string", minLength: 1, description };
}

function nullableStringSchema(description) {
  return { type: ["string", "null"], description };
}

function resolveRequestedTimes(input, project, multiple) {
  const hasTime = Object.hasOwn(input, multiple ? "times" : "time");
  const hasFrame = Object.hasOwn(input, multiple ? "frames" : "frame");
  if (hasTime === hasFrame) {
    throw new Error(
      multiple
        ? "Provide exactly one of times or frames."
        : "Provide exactly one of time or frame."
    );
  }
  const activeShot = project?.scene?.shots?.find((shot) => shot.id === project?.scene?.activeShotID);
  if (!activeShot) throw new Error("The project has no active Shot to inspect.");
  const frameRate = Math.max(Number(project?.output?.frameRate || 30), 1);
  const sceneDuration = Math.max(Number(project?.scene?.duration?.seconds || 0), 0);
  const duration = Number.isFinite(activeShot.takeDuration) && activeShot.takeDuration > 0
    ? Math.min(sceneDuration, activeShot.takeDuration)
    : sceneDuration;
  const values = multiple
    ? input[hasTime ? "times" : "frames"]
    : [input[hasTime ? "time" : "frame"]];
  if (!Array.isArray(values) || !values.length || values.length > (multiple ? 8 : 1)) {
    throw new Error(multiple ? "Provide between 1 and 8 sample points." : "Provide one playhead target.");
  }
  const times = values.map((value, index) => {
    const number = value;
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`Sample ${index + 1} must be a finite non-negative number.`);
    }
    if (!hasTime && !Number.isInteger(number)) {
      throw new Error(`Frame ${index + 1} must be a non-negative integer.`);
    }
    const time = hasTime ? number : number / frameRate;
    if (time > duration + 0.000001) {
      throw new Error(
        `Sample ${index + 1} (${time.toFixed(3)}s) exceeds the active Shot duration of ` +
        `${duration.toFixed(3)}s.`
      );
    }
    return time;
  });
  return {
    times,
    source: hasTime ? "time" : "frame",
    frameRate,
    duration,
  };
}

function textResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

async function ensureDirectorService() {
  const initialStatus = await serviceStatus();
  if (initialStatus?.status === 'updating') throw new Error('Film Space Lite is installing an update. Retry after it restarts.');
  if (initialStatus?.status === 'ok' && initialStatus.projectWritable === true) return;
  if (startingService) return startingService;
  startingService = (async () => {
    const directorRoot = resolveDirectorRoot();
    const child = launchDirectorService(directorRoot);
    child.unref();
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      await delay(120);
      if (await serviceHealthy()) return;
    }
    const status = await serviceStatus();
    const detail = status && status.projectWritable === false
      ? ` Project storage remains read-only (${status.projectStorageErrorCode || "permission denied"}).`
      : "";
    throw new Error(
      `Film Space service did not become writable.${detail} ` +
      "The self-contained Film Space Lite app could not start; inspect its Director service log and retry."
    );
  })().finally(() => {
    startingService = null;
  });
  return startingService;
}

function launchDirectorService(directorRoot){return spawn(process.execPath,[path.join(path.dirname(directorRoot),'scripts','launch-film-space-lite.mjs'),'--no-open'],{cwd:path.dirname(directorRoot),detached:true,stdio:'ignore',env:{...process.env}});}

function resolveDirectorRoot(){const runtime=process.env.FILM_SPACE_LITE_RUNTIME_ROOT || path.resolve(pluginRoot,'..','..');const direct=path.join(runtime,'director-console');if(!existsSync(path.join(direct,'server.cjs')))throw new Error('Film Space Lite runtime is missing; reinstall its launch package.');return direct;}

async function serviceHealthy() {
  const status = await serviceStatus();
  return status?.status === "ok" && status.projectWritable === true;
}

async function serviceStatus() {
  return (await discoverDirectorService())?.health ?? null;
}

async function requireDirectorService() {
  const service = await discoverDirectorService();
  if (!service) throw new Error("Film Space service is unavailable or its identity changed. Reopen Film Space and retry.");
  return service;
}

async function api(route, options = {}) {
  const { baseURL } = await requireDirectorService();
  const response = await fetch(`${baseURL}${route}`, {
    method: options.method || "GET",
    headers: {
      ...(options.json ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.json ? JSON.stringify(options.json) : options.body,
    signal: AbortSignal.timeout(options.timeoutMs || 12000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const recovery = payload?.recovery ? ` Recovery: ${payload.recovery}` : "";
    const error = new Error(`${payload?.error || text || `Film Space request failed (${response.status})`}${recovery}`);
    error.code = payload?.code || "FILM_SPACE_REQUEST_FAILED";
    error.data = { status: response.status, payload };
    throw error;
  }
  return payload;
}

async function resolveProjectID(projectID) {
  if (projectID) return requireString(projectID, "projectID");
  const projects = await api("/api/projects");
  if (!projects.length) throw new Error("No Film Space project exists; create one first");
  return projects[0].id;
}

async function requireLocalFile(inputPath, extensions, maximumBytes) {
  const resolved = path.resolve(requireString(inputPath, "sourcePath"));
  if (!path.isAbsolute(inputPath)) throw new Error("sourcePath must be an absolute local path");
  if (!extensions.includes(path.extname(resolved).toLowerCase())) {
    throw new Error(`sourcePath must end in ${extensions.join(", ")}`);
  }
  const metadata = await stat(resolved);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > maximumBytes) {
    throw new Error(`sourcePath must be a non-empty file no larger than ${maximumBytes} bytes`);
  }
  return resolved;
}

function imageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function launchURL(url) {
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "/usr/bin/open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function requireRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) throw new Error("expectedRevision must be a non-negative integer");
  return revision;
}

function rpcError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
