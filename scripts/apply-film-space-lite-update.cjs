#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {verifyManifest, verifyArchive, validateInstallation, unpackArchive, archiveInstallation, runtimeIn} = require('../director-console/app/update-package.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
async function waitForExit(pid) {
  for (let i = 0; i < 150; i++) { if (!processExists(pid)) return; await sleep(200); }
  throw new Error('旧服务没有退出，已取消替换。');
}
async function launchAndCheck(job, expectedVersion) {
  const runtime = runtimeIn(job.target, job.platform);
  const node = path.join(runtime, job.platform === 'win32' ? 'node/node.exe' : 'node/bin/node');
  const child = spawn(node, [path.join(runtime, 'scripts/launch-film-space-lite.mjs'), '--no-open'], {
    cwd: runtime, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    env: {...process.env, FILM_SPACE_LITE_DATA_DIR: job.dataRoot, FILM_SPACE_PROJECT_DIR: job.projectRoot,
      FILM_SPACE_SERVICE_FILE: job.serviceFile, FILM_SPACE_RESTART_PORT: String(job.port), FILM_SPACE_UPDATE_START: '1'},
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('更新后启动失败：' + errors)));
  });
  const response = await fetch(`http://127.0.0.1:${job.port}/health`, {signal: AbortSignal.timeout(5000)});
  const health = await response.json();
  if (!response.ok || health.service !== 'film-space-lite' || (expectedVersion && health.appVersion !== expectedVersion)) throw new Error('更新后服务版本检查失败。');
  return health;
}
async function stopNewService(job) {
  try {
    const descriptor = JSON.parse(await fs.readFile(job.serviceFile, 'utf8'));
    if (descriptor.port !== job.port) return;
    const response = await fetch(`http://127.0.0.1:${job.port}/api/service/shutdown`, {method: 'POST', signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('新版服务未能退出，保留恢复文件。');
    await waitForExit(descriptor.pid);
  } catch (error) {
    if (error.code === 'ENOENT' || (error instanceof TypeError && error.cause?.code === 'ECONNREFUSED')) return;
    throw error;
  }
}
async function applyUpdate(job, {ready, wait = waitForExit, launch = launchAndCheck, stop = stopNewService,
  verify = validateInstallation, verifyEnvelope = verifyManifest, unpack = unpackArchive, backupArchive = archiveInstallation} = {}) {
  const updates = path.join(job.dataRoot, 'Updates');
  const resultPath = path.join(updates, 'result.json');
  const lockPath = path.join(updates, 'install-lock.json');
  const parent = path.dirname(job.target);
  const stageRoot = await fs.mkdtemp(path.join(parent, '.film-space-lite-update-'));
  const stage = path.join(stageRoot, path.basename(job.target));
  const backup = path.join(stageRoot, 'previous', path.basename(job.target));
  let movedOld = false, movedNew = false, committed = false, ownsLock = false, healthy = false, restored = false;
  const result = async value => fs.writeFile(resultPath, JSON.stringify({...value, version: job.version, at: new Date().toISOString()}) + '\n', {mode: 0o600});
  try {
    await fs.writeFile(lockPath, JSON.stringify({pid: process.pid, stageRoot, target: job.target}) + '\n', {mode: 0o600, flag: 'wx'});
    ownsLock = true;
    const envelope = JSON.parse(await fs.readFile(job.manifestPath, 'utf8'));
    const {manifest, asset} = verifyEnvelope(envelope, {version: job.version, platform: job.platform});
    await verifyArchive(job.archivePath, asset);
    const extracted = await unpack(job.archivePath, path.join(stageRoot, 'unpack.noindex'), job.platform);
    await verify(extracted, {version: manifest.version, build: manifest.build, platform: job.platform});
    await fs.rename(extracted, stage);
    await fs.mkdir(path.dirname(backup), {recursive: true});
    await backupArchive(job.target, path.join(updates, 'previous-version.zip'), job.platform);
    // The existing install remains in place until preflight and the parent handshake finish.
    await ready();
    await wait(job.parentPID);
    committed = true;
    await fs.rename(job.target, backup); movedOld = true;
    await fs.rename(stage, job.target); movedNew = true;
    await launch(job, manifest.version); healthy = true;
    await result({status: 'updated', message: `已自动更新到 ${job.version}。`});
    // Keep one compressed recovery copy, never a second discoverable app bundle.
    await fs.rm(backup, {recursive: true}); movedOld = false;
    await fs.rm(path.join(updates, 'pending.json'), {force: true});
    await fs.rm(job.archivePath, {force: true});
    await fs.rm(job.manifestPath, {force: true});
  } catch (error) {
    console.error('[update]', error.message);
    if (healthy) {
      await result({status: 'updated', message: `已更新到 ${job.version}，恢复文件清理待完成：${error.message}`, recoveryPath: backup});
      return;
    }
    if (movedOld) {
      try {
        if (movedNew) { await stop(job); await fs.rm(job.target, {recursive: true}); }
        await fs.rename(backup, job.target); movedOld = false;
        await result({status: 'error', message: error.message});
        if (committed) await launch(job);
        restored = true;
      } catch (rollbackError) {
        await result({status: 'error', message: `${error.message} 恢复失败：${rollbackError.message}`, recoveryPath: backup});
        throw rollbackError;
      }
    }
    await result({status: 'error', message: error.message});
    if (committed && !movedNew && !restored) await launch(job);
    throw error;
  } finally {
    // A rollback error keeps its recovery directory for a later manual repair.
    if (!movedOld) await fs.rm(stageRoot, {recursive: true, force: true});
    if (ownsLock) await fs.rm(lockPath, {force: true});
  }
}
if (require.main === module) {
  (async () => {
    const job = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
    await applyUpdate(job, {ready: () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('更新确认超时。')), 30000);
      process.on('message', message => { if (message.type === 'commit') { clearTimeout(timeout); resolve(); } });
      process.send({type: 'ready'});
    })});
  })().then(() => process.exit(0), error => { if (process.connected) process.send({type: 'error', error: error.message}); console.error(error); process.exit(1); });
}
module.exports = {applyUpdate, launchAndCheck, waitForExit};
