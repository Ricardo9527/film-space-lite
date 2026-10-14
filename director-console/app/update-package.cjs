const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
const trustedKey = require('../../native/lite/update-public-key.json').publicKey;
const {versionParts, compareVersions} = require('./update-checker.cjs');
const REPOSITORY = 'Ricardo9527/film-space-lite';
const assetNames = {darwin: 'Film.Space.Lite.app.zip', win32: 'Film.Space.Lite.Windows.11.x64.zip'};
function releaseAssetURL(version, name) {
  return `https://github.com/${REPOSITORY}/releases/download/v${version}/${encodeURIComponent(name)}`;
}
function verifyManifest(envelope, {version, platform = process.platform, publicKey = trustedKey} = {}) {
  if (typeof envelope?.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error('更新签名清单无效。');
  const payload = Buffer.from(envelope.payload, 'base64');
  if (!crypto.verify(null, payload, publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('更新签名验证失败。');
  const manifest = JSON.parse(payload.toString('utf8'));
  if (manifest.product !== 'film-space-lite' || !versionParts(manifest.version)
      || manifest.version !== version || !Number.isInteger(manifest.build) || manifest.build < 1) throw new Error('更新版本与签名清单不符。');
  const asset = manifest.platforms?.[platform];
  if (!asset || asset.name !== assetNames[platform] || !Number.isSafeInteger(asset.size) || asset.size < 1
      || asset.size > 1024 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('更新平台包清单无效。');
  return {manifest, asset, url: releaseAssetURL(version, asset.name)};
}
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function verifyArchive(file, asset) {
  if ((await fs.stat(file)).size !== asset.size || await sha256(file) !== asset.sha256) throw new Error('缓存更新包校验失败，请重新下载。');
}
function runtimeIn(installation, platform = process.platform) {
  return platform === 'darwin' ? path.join(installation, 'Contents/Resources/runtime') : installation;
}
async function installationFromRuntime(runtime, platform = process.platform) {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(runtime, 'runtime-build.json'), 'utf8'));
    if (manifest.format !== 'film-space-lite-runtime' || manifest.edition !== 'lite' || manifest.platform !== platform) return null;
    if (platform === 'darwin' && runtime.endsWith('.app/Contents/Resources/runtime')) return path.resolve(runtime, '../../..');
    if (platform === 'win32') { await fs.access(path.join(runtime, 'Film Space Lite.exe')); return runtime; }
    return null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
async function validateInstallation(installation, {version, build, platform = process.platform} = {}) {
  const runtime = runtimeIn(installation, platform);
  const manifest = JSON.parse(await fs.readFile(path.join(runtime, 'runtime-build.json'), 'utf8'));
  const metadata = JSON.parse(await fs.readFile(path.join(runtime, 'native/lite/version.json'), 'utf8'));
  if (manifest.format !== 'film-space-lite-runtime' || manifest.edition !== 'lite' || manifest.platform !== platform
      || metadata.version !== version || metadata.build !== build || manifest.version !== version || manifest.build !== build) throw new Error('解包后的版本或平台不匹配。');
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.resolve(runtime, relative);
    if (!file.startsWith(runtime + path.sep) || await sha256(file) !== expected) throw new Error('安装文件校验失败：' + relative);
  }
  if (platform === 'darwin') {
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', installation]);
    const {stdout} = await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(installation, 'Contents/Info.plist')]);
    if (stdout.trim() !== 'com.filmspace.lite') throw new Error('安装包标识不匹配。');
  }
  return runtime;
}
async function unpackArchive(archive, destination, platform = process.platform) {
  await fs.mkdir(destination, {recursive: true});
  if (platform === 'darwin') await run('/usr/bin/ditto', ['-x', '-k', archive, destination]);
  else await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Expand-Archive -LiteralPath $env:LITE_UPDATE_ARCHIVE -DestinationPath $env:LITE_UPDATE_DESTINATION -Force'],
    {env: {...process.env, LITE_UPDATE_ARCHIVE: archive, LITE_UPDATE_DESTINATION: destination}, windowsHide: true});
  return path.join(destination, platform === 'darwin' ? 'Film Space Lite.app' : 'Film Space Lite');
}
async function archiveInstallation(installation, archive, platform = process.platform) {
  if (platform === 'darwin') await run('/usr/bin/ditto', ['-c', '-k', '--zlibCompressionLevel', '0', '--sequesterRsrc', '--keepParent', installation, archive]);
  else await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Compress-Archive -LiteralPath $env:LITE_UPDATE_SOURCE -DestinationPath $env:LITE_UPDATE_BACKUP -CompressionLevel Fastest -Force'],
    {env: {...process.env, LITE_UPDATE_SOURCE: installation, LITE_UPDATE_BACKUP: archive}, windowsHide: true});
}
module.exports = {verifyManifest, verifyArchive, sha256, runtimeIn, installationFromRuntime, validateInstallation,
  unpackArchive, archiveInstallation, releaseAssetURL, assetNames, versionParts, compareVersions};
