import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
const require = createRequire(import.meta.url);
const {verifyManifest, verifyArchive, assetNames} = require('../app/update-package.cjs');
const {createUpdateManager} = require('../app/update-manager.cjs');
const {applyUpdate} = require('../../scripts/apply-film-space-lite-update.cjs');
const keys = crypto.generateKeyPairSync('ed25519');
const bytes = Buffer.from('small signed update fixture');
function signed(version = '0.1.11') {
  const payload = Buffer.from(JSON.stringify({product: 'film-space-lite', version, build: 12,
    platforms: Object.fromEntries(Object.entries(assetNames).map(([platform, name]) => [platform, {
      name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }]))}));
  return {payload: payload.toString('base64'), signature: crypto.sign(null, payload, keys.privateKey).toString('base64')};
}
const verify = (envelope, options) => verifyManifest(envelope, {...options, publicKey: keys.publicKey});
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lite-update-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  let clock = 0, busy = null, installed = 0, downloads = 0;
  const state = {currentVersion: '0.1.10', status: 'available', release: {version: '0.1.11', url: 'https://github.com/Ricardo9527/film-space-lite/releases/tag/v0.1.11'}};
  const options = {runtime: root, dataRoot: root, projectRoot: path.join(root, 'Projects'), serviceFile: path.join(root, 'service.json'),
    checker: {snapshot: () => state, check: async () => state}, now: () => clock, busyReason: () => busy,
    findInstallation: async () => root, getPort: () => 12345, onCommit() {}, platform: 'darwin', verify,
    fetchManifest: async () => Buffer.from(JSON.stringify(signed())),
    fetchArchive: async (url, file) => { downloads++; await fs.writeFile(file, bytes); },
    install: async () => { installed++; }, ...overrides};
  const manager = createUpdateManager(options);
  t.after(() => manager.stop());
  await manager.start(); await manager.check();
  return {manager, options, root, state, setTime: v => clock = v, setBusy: v => busy = v,
    get installed() { return installed; }, get downloads() { return downloads; }};
}
function page(manager, activity, onPrepare) {
  const id = crypto.randomUUID();
  const response = new EventEmitter();
  response.destroyed = false;
  response.writeHead = () => {};
  response.write = text => {
    if (text.startsWith('event: prepare')) {
      const data = JSON.parse(text.split('data: ')[1].trim());
      queueMicrotask(() => onPrepare ? onPrepare(id, data.token) : manager.ack(id, data.token, activity));
    }
  };
  response.end = () => response.emit('close');
  manager.attach(id, response); manager.report(id, activity);
  return {id, response};
}
test('signed manifest binds product, version, platform, size and hash', () => {
  const envelope = signed();
  assert.equal(verify(envelope, {version: '0.1.11', platform: 'darwin'}).asset.name, assetNames.darwin);
  assert.equal(verify(envelope, {version: '0.1.11', platform: 'win32'}).asset.name, assetNames.win32);
  assert.throws(() => verify(envelope, {version: '0.1.12', platform: 'darwin'}), /版本/);
  assert.throws(() => verify({...envelope, payload: Buffer.from('{}').toString('base64')}, {version: '0.1.11'}), /签名/);
  assert.throws(() => verifyManifest(envelope, {version: '0.1.11', publicKey: crypto.generateKeyPairSync('ed25519').publicKey}), /签名/);
  assert.throws(() => verify(envelope, {version: '0.1.11', platform: 'linux'}), /平台/);
});
test('cached archive rejects changed bytes', async t => {
  const f = await fixture(t); const {asset} = verify(signed(), {version: '0.1.11', platform: 'darwin'});
  const archive = path.join(f.root, 'Updates/0.1.11-darwin.zip');
  await verifyArchive(archive, asset); await fs.writeFile(archive, 'corrupt');
  await assert.rejects(verifyArchive(archive, asset), /校验/);
});
test('closed pages, quiet backend and startup grace are required for unattended install', async t => {
  const f = await fixture(t); assert.equal(f.manager.snapshot().phase, 'ready');
  await f.manager.tick(); assert.equal(f.installed, 0);
  f.setTime(31000); f.setBusy('MCP 操作'); await f.manager.tick(); assert.equal(f.installed, 0);
  f.setBusy('MP4 导出'); await f.manager.tick(); assert.equal(f.installed, 0);
  f.setBusy(null); f.manager.activity(); await f.manager.tick(); assert.equal(f.installed, 0);
  f.setTime(62000); await f.manager.tick(); assert.equal(f.installed, 1); assert.equal(f.manager.isGated(), true);
});
test('unsaved, recently active and disconnected pages all block update', async t => {
  const f = await fixture(t); f.setTime(400000);
  const p = page(f.manager, {busy: true, reason: '未保存机位', lastInputAt: 0});
  await f.manager.tick(); assert.equal(f.installed, 0);
  f.manager.report(p.id, {busy: false, lastInputAt: 400000}); await f.manager.tick(); assert.equal(f.installed, 0);
  f.manager.report(p.id, {busy: false, lastInputAt: 0}); p.response.end(); await f.manager.tick(); assert.equal(f.installed, 0);
  f.manager.release(p.id); f.setTime(431000); await f.manager.tick(); assert.equal(f.installed, 1);
});
test('idle open page must acknowledge a fresh clean state before installation', async t => {
  const f = await fixture(t); f.setTime(400000);
  page(f.manager, {busy: false, lastInputAt: 0}, (id, token) => {
    assert.equal(f.manager.isGated(), true); assert.equal(f.installed, 0);
    f.manager.ack(id, token, {busy: false, lastInputAt: 0});
  });
  await f.manager.tick(); assert.equal(f.installed, 1);
});
test('new draft during prepare cancels and unlocks the app', async t => {
  const f = await fixture(t); f.setTime(400000);
  page(f.manager, {busy: false, lastInputAt: 0}, (id, token) => f.manager.ack(id, token, {busy: true, reason: '机位草稿', lastInputAt: 400000}));
  await f.manager.tick(); assert.equal(f.installed, 0); assert.equal(f.manager.isGated(), false); assert.match(f.manager.snapshot().updateError, /草稿/);
});
test('immediate update bypasses only the requesting page inactivity timer', async t => {
  const f = await fixture(t); f.setTime(31000);
  const a = page(f.manager, {busy: false, lastInputAt: 31000});
  const b = page(f.manager, {busy: false, lastInputAt: 31000});
  await assert.rejects(f.manager.installNow(a.id), /空闲/);
  f.manager.release(b.id);
  await f.manager.installNow(a.id); await flush(); assert.equal(f.installed, 1);
});
test('verified downloads survive restart without another transfer', async t => {
  const f = await fixture(t); f.manager.stop();
  const second = createUpdateManager(f.options); t.after(() => second.stop());
  await second.start(); await second.check(); assert.equal(second.snapshot().phase, 'ready'); assert.equal(f.downloads, 1);
});
test('failed installation is visible and does not loop without explicit retry', async t => {
  let attempts = 0;
  const f = await fixture(t, {install: async () => { attempts++; throw new Error('安装目录不可写'); }}); f.setTime(400000);
  await f.manager.tick(); await f.manager.tick(); await f.manager.check(); await f.manager.tick();
  assert.equal(attempts, 1); assert.equal(f.manager.isGated(), false); assert.equal(f.manager.snapshot().phase, 'error');
  await f.manager.check(true); await f.manager.tick(); assert.equal(attempts, 2);
});
test('bad signature never downloads executable payload', async t => {
  const f = await fixture(t, {fetchManifest: async () => Buffer.from(JSON.stringify({...signed(), signature: Buffer.alloc(64).toString('base64')}))});
  assert.equal(f.downloads, 0); assert.equal(f.manager.snapshot().phase, 'error'); assert.match(f.manager.snapshot().updateError, /签名/);
});
async function installFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lite-install-test-')); t.after(() => fs.rm(root, {recursive: true, force: true}));
  const updates = path.join(root, 'data/Updates'); await fs.mkdir(updates, {recursive: true});
  const target = path.join(root, 'Film Space Lite.app'); await fs.mkdir(target); await fs.writeFile(path.join(target, 'version'), 'old');
  const archivePath = path.join(updates, 'test.zip'), manifestPath = path.join(updates, 'manifest.json');
  await fs.writeFile(archivePath, bytes); await fs.writeFile(manifestPath, JSON.stringify(signed()));
  const job = {target, dataRoot: path.join(root, 'data'), platform: 'darwin', version: '0.1.11', parentPID: 123, archivePath, manifestPath};
  let launched = [], stopped = 0, ready = 0;
  const dependencies = {verifyEnvelope: verify,
    verify: async dir => assert.equal(await fs.readFile(path.join(dir, 'version'), 'utf8'), 'new'),
    unpack: async (_, dir) => { const result = path.join(dir, 'Film Space Lite.app'); await fs.mkdir(result, {recursive: true}); await fs.writeFile(path.join(result, 'version'), 'new'); return result; },
    backupArchive: async (_, file) => fs.writeFile(file, 'backup'), ready: async () => ready++, wait: async () => {},
    launch: async (_, version) => launched.push(version || 'old'), stop: async () => stopped++,
  };
  return {job, dependencies, launched, get stopped() {return stopped;}, get ready() {return ready;}};
}
test('installer verifies and stages before stopping, replaces whole install and keeps ZIP recovery', async t => {
  const f = await installFixture(t); await applyUpdate(f.job, f.dependencies);
  assert.equal(f.ready, 1); assert.deepEqual(f.launched, ['0.1.11']);
  assert.equal(await fs.readFile(path.join(f.job.target, 'version'), 'utf8'), 'new');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.job.dataRoot, 'Updates/result.json'))).status, 'updated');
  assert.equal(await fs.readFile(path.join(f.job.dataRoot, 'Updates/previous-version.zip'), 'utf8'), 'backup');
});
test('new service startup failure restores and restarts the old installation', async t => {
  const f = await installFixture(t);
  f.dependencies.launch = async (_, version) => { f.launched.push(version || 'old'); if (version) throw new Error('new startup failed'); };
  await assert.rejects(applyUpdate(f.job, f.dependencies), /new startup failed/);
  assert.equal(await fs.readFile(path.join(f.job.target, 'version'), 'utf8'), 'old');
  assert.deepEqual(f.launched, ['0.1.11', 'old']); assert.equal(f.stopped, 1);
});
test('invalid archive never stops or changes the installed app', async t => {
  const f = await installFixture(t); await fs.writeFile(f.job.archivePath, 'bad');
  await assert.rejects(applyUpdate(f.job, f.dependencies), /校验/); assert.equal(f.ready, 0); assert.deepEqual(f.launched, []);
  assert.equal(await fs.readFile(path.join(f.job.target, 'version'), 'utf8'), 'old');
});


test('fresh user input during prepare prevents idle installation', async t => {
  const f = await fixture(t); f.setTime(400000);
  page(f.manager, {busy: false, lastInputAt: 0}, (id, token) => f.manager.ack(id, token, {busy: false, lastInputAt: 400000}));
  await f.manager.tick(); assert.equal(f.installed, 0); assert.equal(f.manager.isGated(), false);
  assert.match(f.manager.snapshot().updateError, /恢复操作/);
});
test('failed installation remains blocked across a service restart', async t => {
  let attempts = 0;
  const f = await fixture(t, {install: async () => { attempts++; throw new Error('permission denied'); }}); f.setTime(400000);
  await f.manager.tick(); f.manager.stop();
  const second = createUpdateManager(f.options); t.after(() => second.stop()); await second.start(); await second.check();
  f.setTime(800000); await second.tick(); assert.equal(attempts, 1); assert.equal(second.snapshot().phase, 'error');
});
