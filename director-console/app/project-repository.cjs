const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const projectFileSuffix = ".filmspace-lite.json";
const projectPackageMagic = Buffer.from("FILM-SPACE-LITE-PROJECT\n", "ascii");
const projectPackageFormat = "film-space-lite-project-package";
const projectPackageVersion = 1;
const maximumPackageHeaderBytes = 2 * 1024 * 1024;
const maximumPackageBytes = 512 * 1024 * 1024;
const maximumPackageEntries = 4096;

function createProjectRepository(directory) {
  const root = path.resolve(directory);

  function ensureDirectory() {
    fs.mkdirSync(root, { recursive: true });
  }

  function status() {
    const probePath = path.join(root, `.film-space-write-probe-${process.pid}`);
    try {
      ensureDirectory();
      fs.writeFileSync(probePath, "ok", { encoding: "utf8", mode: 0o600, flag: "wx" });
      fs.unlinkSync(probePath);
      return {
        root,
        readable: true,
        writable: true,
        errorCode: null,
      };
    } catch (error) {
      try {
        removeFileIfPresent(probePath);
      } catch {
        // The configured root itself may be invalid, such as a file in place
        // of the expected project directory.
      }
      let readable = false;
      try {
        readable = fs.existsSync(root) && fs.statSync(root).isDirectory();
        if (readable) fs.accessSync(root, fs.constants.R_OK);
      } catch {
        readable = false;
      }
      return {
        root,
        readable,
        writable: false,
        errorCode: typeof error?.code === "string" ? error.code : "UNKNOWN",
      };
    }
  }

  function list() {
    ensureDirectory();
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(projectFileSuffix))
      .map((entry) => {
        const filePath = path.join(root, entry.name);
        const id = entry.name.slice(0, -projectFileSuffix.length);
        try {
          const project = JSON.parse(fs.readFileSync(filePath, "utf8"));
          if (!isProjectDocument(project) || project.id !== id) {
            throw new Error("Invalid desktop project document");
          }
          return {
            id: project.id,
            name: project.name,
            modifiedAt: project.modifiedAt,
            actorCount: Array.isArray(project.scene?.actors) ? project.scene.actors.length : 0,
            revision: normalizeRevision(project.revision),
          };
        } catch (error) {
          return {
            id,
            name: id,
            modifiedAt: null,
            readError: error.message,
            filePath,
          };
        }
      })
      .sort((a, b) => {
        const errorDifference = Number(Boolean(a.readError)) - Number(Boolean(b.readError));
        if (errorDifference) return errorDifference;
        const timeDifference = Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt);
        return timeDifference || a.name.localeCompare(b.name);
      });
  }

  function load(id) {
    const filePath = projectPath(root, id);
    if (!fs.existsSync(filePath)) return null;
    const project = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isProjectDocument(project) || project.id !== id) {
      throw new Error("Invalid desktop project document");
    }
    return project;
  }

  function save(project) {
    if (!isProjectDocument(project)) throw new Error("Invalid desktop project document");
    ensureDirectory();
    const filePath = projectPath(root, project.id);
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(project, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
    return project;
  }

  function saveVersioned(project, expectedRevisionInput) {
    if (!isProjectDocument(project)) throw new Error("Invalid desktop project document");
    const stored = load(project.id);
    const actualRevision = normalizeRevision(stored?.revision);
    const expectedRevision = normalizeRevision(expectedRevisionInput);
    if (expectedRevision !== actualRevision) {
      const error = new Error(`Desktop project revision conflict: expected ${expectedRevision}, actual ${actualRevision}`);
      error.statusCode = 409;
      error.actualRevision = actualRevision;
      throw error;
    }
    const next = structuredClone(project);
    next.revision = actualRevision + 1;
    save(next);
    return next;
  }

  function duplicate(id) {
    const source = load(id);
    if (!source) throw notFoundError("Desktop project not found");
    ensureDirectory();
    const nextID = crypto.randomUUID();
    const next = cloneProjectForNewID(source, nextID, uniqueProjectName(list(), `${source.name}（副本）`));
    publishProjectClone(root, source.id, next);
    return next;
  }

  function remove(id) {
    const source = load(id);
    if (!source) throw notFoundError("Desktop project not found");
    ensureDirectory();
    const suffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.deleted`;
    const targets = [
      projectPath(root, id),
      path.join(root, `${id}-assets`),
    ].filter((target) => fs.existsSync(target));
    const moved = [];
    try {
      for (const target of targets) {
        const tombstone = path.join(root, `.${path.basename(target)}.${suffix}`);
        fs.renameSync(target, tombstone);
        moved.push({ target, tombstone });
      }
    } catch (error) {
      for (const entry of moved.reverse()) {
        try { fs.renameSync(entry.tombstone, entry.target); } catch {}
      }
      throw error;
    }
    for (const entry of moved) removeDirectoryIfPresent(entry.tombstone);
    return {
      id: source.id,
      name: source.name,
      modifiedAt: source.modifiedAt,
    };
  }

  function createPackage(id) {
    const project = load(id);
    if (!project) throw notFoundError("Desktop project not found");
    ensureDirectory();
    const entries = [packageEntry("project.json", projectPath(root, id))];
    collectPackageDirectory(entries, path.join(root, `${id}-assets`), "assets");
    
    if (entries.length > maximumPackageEntries) throw invalidPackageError("Project package has too many files");

    const header = Buffer.from(JSON.stringify({
      format: projectPackageFormat,
      packageVersion: projectPackageVersion,
      projectName: project.name,
      entries: entries.map(({ archivePath, sizeBytes, checksum }) => ({
        path: archivePath,
        sizeBytes,
        checksum,
      })),
    }), "utf8");
    if (header.length > maximumPackageHeaderBytes) throw invalidPackageError("Project package index is too large");
    const totalBytes = projectPackageMagic.length + 4 + header.length
      + entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    if (totalBytes > maximumPackageBytes) throw invalidPackageError("Project package exceeds 512 MB");

    const packagePath = path.join(root, `.project-export-${id}-${crypto.randomBytes(8).toString("hex")}.filmspace`);
    const output = fs.openSync(packagePath, "wx", 0o600);
    try {
      fs.writeSync(output, projectPackageMagic);
      const headerLength = Buffer.allocUnsafe(4);
      headerLength.writeUInt32LE(header.length);
      fs.writeSync(output, headerLength);
      fs.writeSync(output, header);
      for (const entry of entries) copyVerifiedFile(entry, output);
    } catch (error) {
      fs.closeSync(output);
      removeFileIfPresent(packagePath);
      throw error;
    }
    fs.closeSync(output);
    return {
      path: packagePath,
      fileName: `${safePackageFileName(project.name)}.filmspace`,
      sizeBytes: totalBytes,
    };
  }

  function importPackage(packagePath) {
    ensureDirectory();
    const parsed = readPackageIndex(packagePath);
    const projectEntry = parsed.entries.find((entry) => entry.path === "project.json");
    if (!projectEntry) {
      throw invalidPackageError("Project package is missing a valid project document");
    }
    const descriptor = fs.openSync(packagePath, "r");
    let source;
    try {
      const body = Buffer.alloc(projectEntry.sizeBytes);
      readExact(descriptor, body, projectEntry.offset);
      verifyPackagePayload(body, projectEntry);
      source = JSON.parse(body.toString("utf8"));
    } catch (error) {
      if (error?.statusCode) throw error;
      throw invalidPackageError("Project package document is invalid");
    } finally {
      fs.closeSync(descriptor);
    }
    if (!isProjectDocument(source)) throw invalidPackageError("Project package document is invalid");

    const nextID = crypto.randomUUID();
    const importedName = uniqueProjectName(list(), source.name, "（导入）");
    const next = cloneProjectForNewID(source, nextID, importedName);
    publishImportedProject(root, packagePath, parsed, next);
    return next;
  }

  

  // Live take samples are project-sidecar assets: the project JSON keeps only
  // a reference and checksum, so history clones and saves stay small no
  // matter how long a take ran. Files live beside the project as
  // <projectID>-live/<shotID>.json and are written atomically.
  

  

  function saveEnvironmentAsset(projectID, sourceName, bodyInput) {
    if (!validID(projectID)) throw new Error("Invalid environment project reference");
    if (!fs.existsSync(projectPath(root, projectID))) throw new Error("Desktop project not found");
    const body = Buffer.isBuffer(bodyInput) ? bodyInput : Buffer.from(bodyInput || []);
    validateGLB(body);
    const checksum = crypto.createHash("sha256").update(body).digest("hex");
    const fileName = `environment-${checksum.slice(0, 16)}.glb`;
    const assetDirectory = path.join(root, `${projectID}-assets`);
    const filePath = path.join(assetDirectory, fileName);
    ensureDirectory();
    fs.mkdirSync(assetDirectory, { recursive: true });
    if (fs.existsSync(filePath)) {
      const existingChecksum = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
      if (existingChecksum !== checksum) throw new Error("Environment asset hash collision");
    } else {
      const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
      try {
        fs.writeFileSync(temporaryPath, body, { mode: 0o600 });
        fs.renameSync(temporaryPath, filePath);
      } catch (error) {
        removeFileIfPresent(temporaryPath);
        throw error;
      }
    }
    return {
      ref: `${projectID}-assets/${fileName}`,
      sourceName: cleanSourceName(sourceName),
      sizeBytes: body.length,
      checksum,
    };
  }

  function loadEnvironmentAsset(projectID, fileName) {
    if (!validID(projectID) || !/^environment-[a-f0-9]{16}\.glb$/.test(fileName || "")) {
      throw new Error("Invalid environment asset reference");
    }
    const filePath = path.join(root, `${projectID}-assets`, fileName);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    return fs.readFileSync(filePath);
  }

  

  

  function saveReferenceImageAsset(projectID, sourceName, mimeTypeInput, bodyInput) {
    if (!validID(projectID)) throw new Error("Invalid reference-image project");
    if (!fs.existsSync(projectPath(root, projectID))) throw new Error("Desktop project not found");
    const body = Buffer.isBuffer(bodyInput) ? bodyInput : Buffer.from(bodyInput || []);
    const metadata = validateReferenceImage(body, mimeTypeInput);
    const checksum = crypto.createHash("sha256").update(body).digest("hex");
    const fileName = `reference-${checksum.slice(0, 16)}.${metadata.extension}`;
    const assetDirectory = path.join(root, `${projectID}-assets`);
    const filePath = path.join(assetDirectory, fileName);
    ensureDirectory();
    fs.mkdirSync(assetDirectory, { recursive: true });
    if (!fs.existsSync(filePath)) {
      const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
      try {
        fs.writeFileSync(temporaryPath, body, { mode: 0o600 });
        fs.renameSync(temporaryPath, filePath);
      } catch (error) {
        removeFileIfPresent(temporaryPath);
        throw error;
      }
    }
    return {
      ref: `${projectID}-assets/${fileName}`,
      sourceName: cleanSourceName(sourceName || `reference.${metadata.extension}`),
      mimeType: metadata.mimeType,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: body.length,
      checksum,
    };
  }

  function loadReferenceImageAsset(projectID, fileName) {
    if (!validID(projectID) || !/^reference-[a-f0-9]{16}\.(?:png|jpe?g|webp)$/.test(fileName || "")) {
      throw new Error("Invalid reference-image asset");
    }
    const filePath = path.join(root, `${projectID}-assets`, fileName);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    return fs.readFileSync(filePath);
  }

  

  

  

  

  return {
    root,
    status,
    list,
    load,
    save,
    saveVersioned,
    duplicate,
    remove,
    createPackage,
    importPackage,
    
    
    
    saveEnvironmentAsset,
    loadEnvironmentAsset,
    
    
    saveReferenceImageAsset,
    loadReferenceImageAsset,
    
    
    
    
  };
}

function cloneProjectForNewID(source, nextID, name) {
  const next = rewriteProjectReferences(structuredClone(source), source.id, nextID);
  next.id = nextID;
  next.name = name;
  // Only a current source result can carry its evidence across an asset namespace change.
  // The cloned records and poses are identical apart from project-local references.
  
  next.modifiedAt = new Date().toISOString();
  next.revision = 1;
  return next;
}

function rewriteProjectReferences(value, previousID, nextID) {
  if (typeof value === "string") {
    for (const suffix of ["-assets/"]) {
      const prefix = `${previousID}${suffix}`;
      if (value.startsWith(prefix)) return `${nextID}${suffix}${value.slice(prefix.length)}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => rewriteProjectReferences(entry, previousID, nextID));
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = rewriteProjectReferences(value[key], previousID, nextID);
  }
  return value;
}

function uniqueProjectName(summaries, preferred, collisionSuffix = "") {
  const names = new Set(summaries.map((entry) => String(entry.name).trim().toLocaleLowerCase("zh-Hans")));
  const base = String(preferred || "导入项目").trim() || "导入项目";
  if (!names.has(base.toLocaleLowerCase("zh-Hans"))) return base;
  const candidateBase = collisionSuffix && !base.endsWith(collisionSuffix) ? `${base}${collisionSuffix}` : base;
  if (!names.has(candidateBase.toLocaleLowerCase("zh-Hans"))) return candidateBase;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${candidateBase} ${index}`;
    if (!names.has(candidate.toLocaleLowerCase("zh-Hans"))) return candidate;
  }
  throw new Error("Unable to create a unique project name");
}

function publishProjectClone(root, sourceID, next) {
  const token = crypto.randomBytes(8).toString("hex");
  const projectTemporary = path.join(root, `.${next.id}.${token}.tmp`);
  const staged = [];
  const published = [];
  try {
    for (const kind of ["assets"]) {
      const sourceDirectory = path.join(root, `${sourceID}-${kind}`);
      if (!fs.existsSync(sourceDirectory)) continue;
      const temporary = path.join(root, `.${next.id}-${kind}.${token}.tmp`);
      const destination = path.join(root, `${next.id}-${kind}`);
      copyDirectoryStrict(sourceDirectory, temporary);
      staged.push({ temporary, destination });
    }
    fs.writeFileSync(projectTemporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    for (const entry of staged) {
      fs.renameSync(entry.temporary, entry.destination);
      published.push(entry.destination);
    }
    fs.renameSync(projectTemporary, projectPath(root, next.id));
  } catch (error) {
    removeFileIfPresent(projectTemporary);
    for (const entry of staged) removeDirectoryIfPresent(entry.temporary);
    for (const destination of published) removeDirectoryIfPresent(destination);
    throw error;
  }
}

function publishImportedProject(root, packagePath, parsed, next) {
  const token = crypto.randomBytes(8).toString("hex");
  const projectTemporary = path.join(root, `.${next.id}.${token}.tmp`);
  const stagedRoots = new Map();
  const published = [];
  const descriptor = fs.openSync(packagePath, "r");
  try {
    for (const entry of parsed.entries) {
      if (entry.path === "project.json") continue;
      const [kind, ...components] = entry.path.split("/");
      let stage = stagedRoots.get(kind);
      if (!stage) {
        stage = {
          temporary: path.join(root, `.${next.id}-${kind}.${token}.tmp`),
          destination: path.join(root, `${next.id}-${kind}`),
        };
        fs.mkdirSync(stage.temporary, { recursive: true });
        stagedRoots.set(kind, stage);
      }
      const destination = path.join(stage.temporary, ...components);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      copyPackageEntry(descriptor, entry, destination);
    }
    fs.writeFileSync(projectTemporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    for (const stage of stagedRoots.values()) {
      fs.renameSync(stage.temporary, stage.destination);
      published.push(stage.destination);
    }
    fs.renameSync(projectTemporary, projectPath(root, next.id));
  } catch (error) {
    removeFileIfPresent(projectTemporary);
    for (const stage of stagedRoots.values()) removeDirectoryIfPresent(stage.temporary);
    for (const destination of published) removeDirectoryIfPresent(destination);
    throw error;
  } finally {
    fs.closeSync(descriptor);
  }
}

function copyDirectoryStrict(source, destination) {
  const stat = fs.lstatSync(source);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalidPackageError("Project sidecars must be regular directories");
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectoryStrict(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    else throw invalidPackageError("Project sidecars cannot contain links or special files");
  }
}

function packageEntry(archivePath, sourcePath) {
  const stat = fs.lstatSync(sourcePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw invalidPackageError("Project package can contain only regular files");
  return {
    archivePath,
    sourcePath,
    sizeBytes: stat.size,
    checksum: fileChecksum(sourcePath),
  };
}

function collectPackageDirectory(entries, sourceRoot, archiveRoot, relative = "") {
  if (!fs.existsSync(sourceRoot)) return;
  const stat = fs.lstatSync(sourceRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalidPackageError("Project sidecars must be regular directories");
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
    const sourcePath = path.join(sourceRoot, entry.name);
    if (entry.isDirectory()) collectPackageDirectory(entries, sourcePath, archiveRoot, relativePath);
    else if (entry.isFile()) entries.push(packageEntry(`${archiveRoot}/${relativePath}`, sourcePath));
    else throw invalidPackageError("Project sidecars cannot contain links or special files");
  }
}

function fileChecksum(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function copyVerifiedFile(entry, outputDescriptor) {
  const input = fs.openSync(entry.sourcePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const hash = crypto.createHash("sha256");
  let copied = 0;
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(input, buffer, 0, buffer.length, null)) > 0) {
      const chunk = buffer.subarray(0, bytesRead);
      fs.writeSync(outputDescriptor, chunk);
      hash.update(chunk);
      copied += bytesRead;
    }
  } finally {
    fs.closeSync(input);
  }
  if (copied !== entry.sizeBytes || hash.digest("hex") !== entry.checksum) {
    throw invalidPackageError("Project changed while its package was being created");
  }
}

function readPackageIndex(packagePath) {
  let stat;
  try { stat = fs.lstatSync(packagePath); } catch { throw invalidPackageError("Project package could not be read"); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumPackageBytes) {
    throw invalidPackageError("Project package must be a regular file smaller than 512 MB");
  }
  const descriptor = fs.openSync(packagePath, "r");
  try {
    const prefix = Buffer.alloc(projectPackageMagic.length + 4);
    if (!tryReadExact(descriptor, prefix, 0)
      || !prefix.subarray(0, projectPackageMagic.length).equals(projectPackageMagic)) {
      throw invalidPackageError("File is not a Film Space project package");
    }
    const headerLength = prefix.readUInt32LE(projectPackageMagic.length);
    if (headerLength < 2 || headerLength > maximumPackageHeaderBytes) {
      throw invalidPackageError("Project package index is invalid");
    }
    const headerBuffer = Buffer.alloc(headerLength);
    const headerOffset = prefix.length;
    if (!tryReadExact(descriptor, headerBuffer, headerOffset)) {
      throw invalidPackageError("Project package index is incomplete");
    }
    let header;
    try { header = JSON.parse(headerBuffer.toString("utf8")); } catch { throw invalidPackageError("Project package index is invalid"); }
    if (header?.format !== projectPackageFormat || header?.packageVersion !== projectPackageVersion
      || !Array.isArray(header.entries) || header.entries.length > maximumPackageEntries) {
      throw invalidPackageError("Unsupported Film Space project package");
    }
    const seen = new Set();
    let offset = headerOffset + headerLength;
    const entries = header.entries.map((entry) => {
      if (!validPackagePath(entry?.path) || seen.has(entry.path)
        || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0
        || !/^[a-f0-9]{64}$/.test(entry.checksum || "")) {
        throw invalidPackageError("Project package contains an invalid file entry");
      }
      seen.add(entry.path);
      const normalized = { path: entry.path, sizeBytes: entry.sizeBytes, checksum: entry.checksum, offset };
      offset += entry.sizeBytes;
      return normalized;
    });
    if (offset !== stat.size || !seen.has("project.json")) {
      throw invalidPackageError("Project package payload size is invalid");
    }
    return { entries };
  } finally {
    fs.closeSync(descriptor);
  }
}

function validPackagePath(value) {
  if (value === "project.json") return true;
  if (typeof value !== "string") return false;
  const components = value.split("/");
  if (!["assets"].includes(components[0]) || components.length < 2) return false;
  return components.every((component) => component && component !== "." && component !== ".."
    && !component.includes("\\") && !component.includes("\0"));
}

function copyPackageEntry(inputDescriptor, entry, destination) {
  const output = fs.openSync(destination, "wx", 0o600);
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const hash = crypto.createHash("sha256");
  let remaining = entry.sizeBytes;
  let offset = entry.offset;
  try {
    while (remaining > 0) {
      const requested = Math.min(buffer.length, remaining);
      const bytesRead = fs.readSync(inputDescriptor, buffer, 0, requested, offset);
      if (bytesRead <= 0) throw invalidPackageError("Project package payload is incomplete");
      const chunk = buffer.subarray(0, bytesRead);
      fs.writeSync(output, chunk);
      hash.update(chunk);
      remaining -= bytesRead;
      offset += bytesRead;
    }
  } finally {
    fs.closeSync(output);
  }
  if (hash.digest("hex") !== entry.checksum) {
    removeFileIfPresent(destination);
    throw invalidPackageError("Project package checksum does not match");
  }
}

function verifyPackagePayload(body, entry) {
  if (crypto.createHash("sha256").update(body).digest("hex") !== entry.checksum) {
    throw invalidPackageError("Project package checksum does not match");
  }
}

function readExact(descriptor, buffer, position) {
  if (!tryReadExact(descriptor, buffer, position)) {
    throw invalidPackageError("Project package payload is incomplete");
  }
}

function tryReadExact(descriptor, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const bytesRead = fs.readSync(descriptor, buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead <= 0) return false;
    offset += bytesRead;
  }
  return true;
}

function safePackageFileName(value) {
  return String(value || "Film Space Project")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "Film Space Project";
}

function invalidPackageError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFoundError(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function removeDirectoryIfPresent(directory) {
  try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
}

function normalizeRevision(value) {
  const revision = Number.parseInt(value, 10);
  return Number.isFinite(revision) && revision >= 0 ? revision : 0;
}

function validateGLB(body) {
  if (!Buffer.isBuffer(body) || body.length < 20 || body.length > 256 * 1024 * 1024) {
    throw invalidAssetError("Environment GLB must be between 20 bytes and 256 MB");
  }
  if (body.toString("ascii", 0, 4) !== "glTF") throw invalidAssetError("Environment file is not a binary GLB");
  if (body.readUInt32LE(4) !== 2) throw invalidAssetError("Environment GLB must use glTF version 2");
  if (body.readUInt32LE(8) !== body.length) throw invalidAssetError("Environment GLB length is invalid");
}

function validateReferenceImage(body, mimeTypeInput) {
  if (!Buffer.isBuffer(body) || body.length < 12 || body.length > 32 * 1024 * 1024) {
    throw invalidAssetError("Reference image must be between 12 bytes and 32 MB");
  }
  const requested = String(mimeTypeInput || "").toLowerCase();
  if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (body.length < 24) throw invalidAssetError("Reference PNG header is incomplete");
    return {
      mimeType: "image/png",
      extension: "png",
      width: body.readUInt32BE(16),
      height: body.readUInt32BE(20),
    };
  }
  if (body[0] === 0xff && body[1] === 0xd8) {
    const dimensions = jpegDimensions(body);
    return { mimeType: "image/jpeg", extension: "jpg", ...dimensions };
  }
  if (body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") {
    const dimensions = webpDimensions(body);
    return { mimeType: "image/webp", extension: "webp", ...dimensions };
  }
  throw invalidAssetError(
    requested ? `Unsupported reference image type: ${requested}` : "Reference image must be PNG, JPEG, or WebP"
  );
}

function jpegDimensions(body) {
  let offset = 2;
  while (offset + 9 < body.length) {
    if (body[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = body[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > body.length) break;
    const length = body.readUInt16BE(offset);
    if (length < 2 || offset + length > body.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: body.readUInt16BE(offset + 3), width: body.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw invalidAssetError("Reference JPEG dimensions could not be read");
}

function webpDimensions(body) {
  const kind = body.toString("ascii", 12, 16);
  if (kind === "VP8X" && body.length >= 30) {
    return {
      width: 1 + body.readUIntLE(24, 3),
      height: 1 + body.readUIntLE(27, 3),
    };
  }
  if (kind === "VP8 " && body.length >= 30 && body[23] === 0x9d && body[24] === 0x01 && body[25] === 0x2a) {
    return {
      width: body.readUInt16LE(26) & 0x3fff,
      height: body.readUInt16LE(28) & 0x3fff,
    };
  }
  if (kind === "VP8L" && body.length >= 25 && body[20] === 0x2f) {
    const bits = body.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  throw invalidAssetError("Reference WebP dimensions could not be read");
}

function invalidAssetError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cleanSourceName(value) {
  if (typeof value !== "string") return "environment.glb";
  const name = value.replaceAll("\\", "/").split("/").pop().trim();
  return (name || "environment.glb").slice(0, 255);
}

function removeFileIfPresent(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function projectPath(root, id) {
  if (!validID(id)) throw new Error("Invalid project ID");
  return path.join(root, `${id}${projectFileSuffix}`);
}

function isProjectDocument(project) {
  if (project?.edition !== "lite") return false;
  return Boolean(
    project
    && typeof project === "object"
    && Number.isInteger(project.schemaVersion)
    && validID(project.id)
    && typeof project.name === "string"
    && project.name.trim().length > 0
    && typeof project.modifiedAt === "string"
    && Number.isFinite(Date.parse(project.modifiedAt))
    && project.scene
    && Array.isArray(project.scene.actors)
  );
}

function validID(value) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]{5,127}$/.test(value);
}

module.exports = {
  createProjectRepository,
  isProjectDocument,
  projectFileSuffix,
};
