const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {verifyManifest, verifyArchive, installationFromRuntime, releaseAssetURL, versionParts, compareVersions} = require('./update-package.cjs');
const {downloadBuffer, downloadArchive} = require('./update-transport.cjs');
const {startInstaller} = require('./update-installer.cjs');
const HOUR = 3600000, PAGE_IDLE = 5 * 60000, QUIET = 30000;
function createUpdateManager({checker, runtime, dataRoot, projectRoot, serviceFile, getPort, busyReason,
  onCommit, now = Date.now, fetchManifest = downloadBuffer, fetchArchive = downloadArchive,
  findInstallation = installationFromRuntime, install = startInstaller, verify = verifyManifest, platform = process.platform,
  startupGrace = QUIET, pageIdle = PAGE_IDLE, quiet = QUIET} = {}) {
  const clients = new Map();
  const updates = path.join(dataRoot, 'Updates');
  const startedAt = now();
  let target, candidate, checkPending, installing = false, lastWorkAt = now(), failedVersion;
  let phase = 'idle', error = null, bytes = 0, total = 0, result = null, preparation = null;
  let stopped = false, interval, hourly, lastProgress = 0, lastBlockedReason;
  function snapshot() {
    const state = checker.snapshot();
    return {...state, phase, downloadBytes: bytes, downloadTotal: total, updateError: error,
      readyVersion: candidate?.version || null, automaticInstall: Boolean(target),
      blockedReason: phase === 'ready' ? reason() : null, lastResult: result};
  }
  function write(client, event, data) {
    if (client.response && !client.response.destroyed) client.response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function broadcast(event, data) { for (const client of clients.values()) write(client, event, data); }
  function changed() { broadcast('state', snapshot()); }
  function reason(requester = null) {
    if (!target) return '当前运行位置请使用发布页手动安装。';
    if (now() - startedAt < startupGrace && !requester) return '等待启动与页面重连。';
    const busy = busyReason();
    if (busy) return busy;
    if (!requester && now() - lastWorkAt < quiet) return '等待后台操作结束。';
    for (const [id, client] of clients) {
      if (!client.response) return '等待断开页面重新连接或确认关闭。';
      if (!client.activity) return '正在确认页面状态。';
      if (client.activity.busy) return client.activity.reason || '页面有未完成工作。';
      if (id !== requester && now() - client.activity.lastInputAt < pageIdle) return '等待页面空闲。';
    }
    return null;
  }
  function abortPreparation(message) {
    if (!preparation) return;
    clearTimeout(preparation.timeout);
    preparation.reject(new Error(message));
    preparation = null;
  }
  function attach(id, response) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('更新页面标识无效。');
    if (preparation) abortPreparation('有页面重新连接，稍后再更新。');
    let client = clients.get(id);
    if (!client) { client = {activity: null, response: null}; clients.set(id, client); }
    if (client.response) client.response.end();
    client.response = response;
    response.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'});
    write(client, 'state', snapshot());
    const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15000);
    heartbeat.unref();
    response.on('close', () => {
      clearInterval(heartbeat);
      if (client.response === response) {
        client.response = null;
        if (preparation) abortPreparation('页面连接中断，暂缓更新。');
      }
    });
  }
  function report(id, activity) {
    const client = clients.get(id);
    if (!client) return;
    if (typeof activity.busy !== 'boolean' || !Number.isFinite(activity.lastInputAt)) throw new Error('更新页面状态无效。');
    client.activity = {busy: activity.busy, reason: typeof activity.reason === 'string' ? activity.reason : '',
      lastInputAt: Math.min(now(), activity.lastInputAt)};
  }
  function release(id) {
    const client = clients.get(id);
    if (client) { clients.delete(id); client.response?.end(); lastWorkAt = now(); }
    if (preparation) abortPreparation('页面正在离开，稍后再更新。');
  }
  function ack(id, token, activity) {
    report(id, activity);
    if (!preparation || preparation.token !== token || !preparation.waiting.has(id)) return;
    if (activity.busy) { abortPreparation(activity.reason || '页面有未完成工作。'); return; }
    if (id !== preparation.requester && now() - activity.lastInputAt < pageIdle) { abortPreparation('页面恢复操作，暂缓更新。'); return; }
    preparation.waiting.delete(id);
    if (!preparation.waiting.size) { clearTimeout(preparation.timeout); preparation.resolve(); preparation = null; }
  }
  async function prepare(requester) {
    const blocked = reason(requester);
    if (blocked) throw new Error(blocked);
    if (!clients.size) return;
    await new Promise((resolve, reject) => {
      const token = crypto.randomUUID();
      preparation = {token, requester, waiting: new Set(clients.keys()), resolve, reject,
        timeout: setTimeout(() => abortPreparation('页面未及时确认，暂缓更新。'), 10000)};
      broadcast('prepare', {token});
    });
    if (busyReason()) throw new Error(busyReason());
  }
  async function begin(requester = null) {
    if (phase !== 'ready' || installing) return;
    const blocked = reason(requester);
    if (blocked) { if (requester) throw new Error(blocked); if (blocked !== lastBlockedReason) { lastBlockedReason = blocked; changed(); } return; }
    installing = true;
    phase = 'preparing'; changed();
    try {
      await prepare(requester);
      phase = 'installing'; changed();
      await install({runtime, target, dataRoot, projectRoot, serviceFile, port: getPort(), candidate,
        onReady: () => { broadcast('restarting', {version: candidate.version}); onCommit(); }});
    } catch (failure) {
      error = failure.message;
      // Preparation failures are temporary; installer failures need an explicit retry.
      if (phase === 'installing') {
        phase = 'error'; failedVersion = candidate.version;
        result = {status: 'error', version: candidate.version, message: error, at: new Date().toISOString()};
        try { await fs.writeFile(path.join(updates, 'result.json'), JSON.stringify(result) + '\n', {mode: 0o600}); }
        catch (persistError) { error += ` 更新结果保存失败：${persistError.message}`; }
      }
      else { phase = 'ready'; lastWorkAt = now(); }
      installing = false;
      broadcast('resume', {error}); changed();
    }
  }
  async function acquire(release) {
    phase = 'downloading'; error = null; bytes = 0; total = 0; changed();
    const envelope = JSON.parse((await fetchManifest(releaseAssetURL(release.version, 'update-manifest.json'))).toString('utf8'));
    const {asset, url} = verify(envelope, {version: release.version, platform});
    const archivePath = path.join(updates, `${release.version}-${platform}.zip`);
    const manifestPath = path.join(updates, `${release.version}-manifest.json`);
    total = asset.size;
    await fs.writeFile(manifestPath, JSON.stringify(envelope) + '\n', {mode: 0o600});
    await fetchArchive(url, archivePath, asset, (received, size) => {
      bytes = received; total = size;
      if (now() - lastProgress > 1000) { lastProgress = now(); changed(); }
    });
    candidate = {version: release.version, archivePath, manifestPath};
    await fs.writeFile(path.join(updates, 'pending.json'), JSON.stringify(candidate) + '\n', {mode: 0o600});
    phase = 'ready'; bytes = total; changed();
  }
  async function check(force = false) {
    if (checkPending) return checkPending;
    if (installing) return snapshot();
    checkPending = (async () => {
      if (force) { failedVersion = null; error = null; }
      const state = await checker.check({force});
      if (state.status === 'available' && target && state.release.version !== failedVersion
          && candidate?.version !== state.release.version) {
        try { await acquire(state.release); }
        catch (failure) { error = failure.message; phase = 'error'; failedVersion = state.release.version; changed(); }
      } else if (candidate && failedVersion !== candidate.version) phase = 'ready';
      changed();
      return snapshot();
    })().finally(() => { checkPending = null; });
    return checkPending;
  }
  async function cleanWorkers() {
    for (const entry of await fs.readdir(updates, {withFileTypes: true})) {
      if (!entry.isDirectory() || !/^worker-[A-Za-z0-9]+$/.test(entry.name)) continue;
      const directory = path.join(updates, entry.name);
      let info;
      try { info = JSON.parse(await fs.readFile(path.join(directory, 'worker.json'), 'utf8')); }
      catch (failure) { if (failure.code === 'ENOENT') continue; throw failure; }
      try { process.kill(info.pid, 0); }
      catch (failure) { if (failure.code === 'ESRCH') await fs.rm(directory, {recursive: true}); else throw failure; }
    }
  }
  async function start() {
    await fs.mkdir(updates, {recursive: true});
    await cleanWorkers();
    target = await findInstallation(runtime, platform);
    try { result = JSON.parse(await fs.readFile(path.join(updates, 'result.json'), 'utf8')); if (result.status === 'error') failedVersion = result.version; }
    catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
    try {
      const pending = JSON.parse(await fs.readFile(path.join(updates, 'pending.json'), 'utf8'));
      if (!versionParts(pending.version)) throw new Error('缓存更新版本无效。');
      const saved = {version: pending.version, archivePath: path.join(updates, `${pending.version}-${platform}.zip`),
        manifestPath: path.join(updates, `${pending.version}-manifest.json`)};
      if (compareVersions(versionParts(saved.version), versionParts(checker.snapshot().currentVersion)) > 0) {
        const {asset} = verify(JSON.parse(await fs.readFile(saved.manifestPath, 'utf8')), {version: saved.version, platform});
        await verifyArchive(saved.archivePath, asset);
        candidate = saved; bytes = total = asset.size; phase = failedVersion === saved.version ? 'error' : 'ready';
      } else await fs.rm(path.join(updates, 'pending.json'), {force: true});
    } catch (failure) { if (failure.code !== 'ENOENT') { error = failure.message; phase = 'error'; } }
    interval = setInterval(() => { if (!stopped) void begin(); }, 5000); interval.unref();
    hourly = setInterval(() => { if (!stopped) { void check(); void cleanWorkers().catch(failure => { error = failure.message; changed(); }); } }, HOUR); hourly.unref();
    void check();
  }
  return {snapshot, start, check, attach, report, release, ack,
    activity: () => { lastWorkAt = now(); },
    isGated: () => installing,
    async installNow(clientID) {
      if (!clients.get(clientID)?.response) throw new Error('请从已连接的页面更新。');
      if (phase !== 'ready') throw new Error('完整更新包尚未准备好。');
      const blocked = reason(clientID); if (blocked) throw new Error(blocked);
      void begin(clientID);
      return snapshot();
    },
    tick: () => begin(),
    stop() { stopped = true; clearInterval(interval); clearInterval(hourly); for (const client of clients.values()) client.response?.end(); },
  };
}
module.exports = {createUpdateManager};
