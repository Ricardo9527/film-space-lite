const https = require('node:https');
const {version: currentVersion} = require('../../native/lite/version.json');
const REPOSITORY = 'Ricardo9527/film-space-lite';
const HOUR = 60 * 60 * 1000;
const agent = new https.Agent({proxyEnv: process.env});
function requestReleases(etag) {
  return new Promise((resolve, reject) => {
    const request = https.get(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`, {
      agent,
      headers: {'User-Agent': 'Film-Space-Lite', Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', ...(etag ? {'If-None-Match': etag} : {})},
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => resolve({status: response.statusCode, etag: response.headers.etag, body}));
    });
    const deadline = setTimeout(() => request.destroy(new Error('连接 GitHub 超时，请稍后重试。')), 8000);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', reject);
  });
}
function versionParts(tag) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}
function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function selectRelease(releases, platform) {
  const asset = platform === 'win32' ? 'Film.Space.Lite.Windows.11.x64.zip' : 'Film.Space.Lite.app.zip';
  return releases.filter(release => !release.draft && versionParts(release.tag_name)
    && release.assets?.some(item => item.name === asset)
    && release.assets.some(item => item.name === 'SHA256SUMS.txt'))
    .sort((a, b) => compareVersions(versionParts(b.tag_name), versionParts(a.tag_name)))[0];
}
function createUpdateChecker({request = requestReleases, now = Date.now, platform = process.platform, version = currentVersion} = {}) {
  let state = {currentVersion: version, status: 'unchecked', checkedAt: null, release: null, error: null};
  let etag, releases, pending, lastAttempt = -Infinity;
  async function perform() {
    lastAttempt = now();
    try {
      const response = await request(etag);
      if (response.status === 304 && releases) {
        // Reuse the last successful GitHub response.
      } else if (response.status === 200) {
        releases = JSON.parse(response.body);
        if (!Array.isArray(releases)) throw new Error('GitHub 返回的版本列表无效。');
        etag = response.etag;
      } else {
        throw new Error(`GitHub 检查失败（HTTP ${response.status}），请稍后重试。`);
      }
      const latest = selectRelease(releases, platform);
      if (!latest) throw new Error('暂未找到适用于本机的完整发布包。');
      const release = {version: latest.tag_name.replace(/^v/, ''),
        url: `https://github.com/${REPOSITORY}/releases/tag/${encodeURIComponent(latest.tag_name)}`,
        notes: typeof latest.body === 'string' ? latest.body : '', prerelease: !!latest.prerelease};
      state = {...state, status: compareVersions(versionParts(release.version), versionParts(version)) > 0 ? 'available' : 'current',
        checkedAt: now(), release, error: null};
    } catch (error) {
      state = {...state, status: 'error', error: error.message};
    }
    return {...state};
  }
  return {
    snapshot: () => ({...state}),
    check({force = false} = {}) {
      if (pending) return pending;
      // A short manual cooldown also prevents rapid clicks from exhausting GitHub's public quota.
      if (now() - lastAttempt < (force ? 10000 : HOUR)) return Promise.resolve({...state});
      pending = perform().finally(() => { pending = null; });
      return pending;
    },
  };
}
module.exports = {createUpdateChecker, selectRelease, compareVersions, versionParts};
