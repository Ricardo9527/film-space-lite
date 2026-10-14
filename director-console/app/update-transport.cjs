const https = require('node:https');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const {Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const agent = new https.Agent({proxyEnv: process.env});
const hosts = new Set(['github.com', 'api.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
function openResponse(url, redirects = 0) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname) || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    return Promise.reject(new Error('更新下载地址不受信任。'));
  }
  return new Promise((resolve, reject) => {
    const request = https.get(parsed, {agent, headers: {'User-Agent': 'Film-Space-Lite'}}, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirects >= 5 || !response.headers.location) reject(new Error('更新下载重定向失败。'));
        else resolve(openResponse(new URL(response.headers.location, parsed), redirects + 1));
      } else if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`更新下载失败（HTTP ${response.statusCode}）。`));
      } else resolve(response);
    });
    request.setTimeout(30000, () => request.destroy(new Error('更新下载连接超时。')));
    request.on('error', reject);
  });
}
async function downloadBuffer(url, limit = 1024 * 1024) {
  const response = await openResponse(url);
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > limit) { response.destroy(); throw new Error('更新清单超过大小限制。'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function downloadArchive(url, destination, asset, onProgress = () => {}) {
  const partial = destination + '.partial';
  const hash = crypto.createHash('sha256');
  let size = 0;
  try {
    const response = await openResponse(url);
    await pipeline(response, new Transform({transform(chunk, encoding, callback) {
      size += chunk.length;
      if (size > asset.size) return callback(new Error('更新包大小与签名清单不符。'));
      hash.update(chunk);
      onProgress(size, asset.size);
      callback(null, chunk);
    }}), fs.createWriteStream(partial, {mode: 0o600}));
    if (size !== asset.size || hash.digest('hex') !== asset.sha256) throw new Error('更新包完整性校验失败。');
    await fsp.rename(partial, destination);
  } catch (error) {
    await fsp.rm(partial, {force: true});
    throw error;
  }
}
module.exports = {downloadBuffer, downloadArchive};
