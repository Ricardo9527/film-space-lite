const banner = document.getElementById('updateNotice');
const message = document.getElementById('updateMessage');
const download = document.getElementById('updateDownload');
const version = document.getElementById('appVersion');
const status = document.getElementById('updateStatus');
const details = document.getElementById('updateDetails');
const notes = document.getElementById('updateNotes');
const helpDownload = document.getElementById('helpUpdateDownload');
const checkButton = document.getElementById('checkUpdates');
let checking = false;
let latestState;
let snoozedVersion;
let snoozedUntil = 0;
function render(state) {
  latestState = state;
  version.textContent = `Film Space Lite ${state.currentVersion}`;
  status.textContent = state.status === 'available' ? `发现新版本 ${state.release.version}`
    : state.status === 'current' ? '已是当前发布版本。'
    : state.status === 'error' ? `暂时无法检查更新：${state.error}` : '尚未检查更新。';
  details.hidden = state.status !== 'available';
  const available = state.status === 'available';
  banner.hidden = !available || (snoozedVersion === state.release.version && Date.now() < snoozedUntil);
  if (available) {
    message.textContent = `Film Space Lite ${state.release.version} 已发布${state.release.prerelease ? '（预览版）' : ''}`;
    download.href = helpDownload.href = state.release.url;
    notes.textContent = state.release.notes || '此版本未附更新说明。';
  }
}
async function check(force = false) {
  if (checking) return;
  checking = true;
  checkButton.disabled = true;
  status.textContent = '正在检查更新…';
  if (force) snoozedUntil = 0;
  try {
    const response = await fetch(`/api/app/update${force ? '?force=1' : ''}`, {method: 'POST'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    status.textContent = `暂时无法检查更新：${error.message}`;
  } finally {
    checking = false;
    checkButton.disabled = false;
  }
}
document.getElementById('snoozeUpdate').addEventListener('click', () => {
  snoozedVersion = latestState.release.version;
  snoozedUntil = Date.now() + 3600000;
  banner.hidden = true;
});
checkButton.addEventListener('click', () => check(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
setInterval(() => { if (!document.hidden) check(); }, 3600000);
// Read the installed version immediately, independently of the network check.
fetch('/api/app/update').then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(render).catch(error => { status.textContent = `版本信息读取失败：${error.message}`; }).finally(() => check());
