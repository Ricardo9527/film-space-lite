export function startUpdateUI({readActivity, saveBeforeUpdate, setLocked, currentProjectID}) {
  const banner = document.getElementById('updateNotice');
  const message = document.getElementById('updateMessage');
  const download = document.getElementById('updateDownload');
  const version = document.getElementById('appVersion');
  const status = document.getElementById('updateStatus');
  const details = document.getElementById('updateDetails');
  const notes = document.getElementById('updateNotes');
  const helpDownload = document.getElementById('helpUpdateDownload');
  const checkButton = document.getElementById('checkUpdates');
  const installButtons = [document.getElementById('installUpdate'), document.getElementById('helpInstallUpdate')];
  const dialog = document.getElementById('updateProgressDialog');
  const clientID = crypto.randomUUID();
  let lastInputAt = Date.now(), latestState, source, stopped = false, checking = false, locked = false;
  let snoozedUntil = 0, snoozedVersion, recoveryTimer, expectedVersion;
  async function request(endpoint, body = {}) {
    const response = await fetch(endpoint, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }
  function activity() { return {...readActivity(), lastInputAt}; }
  function lock() {
    if (locked) return;
    locked = true;
    document.getElementById('shortcutsDialog').close();
    setLocked(true);
    dialog.showModal();
  }
  function unlock() {
    locked = false;
    setLocked(false);
    dialog.close();
  }
  function render(state) {
    latestState = state;
    version.textContent = `Film Space Lite ${state.currentVersion}`;
    const ready = state.phase === 'ready';
    const available = state.status === 'available' || ready || state.phase === 'downloading';
    let text = state.status === 'current' ? '已是当前发布版本。' : state.status === 'error'
      ? `暂时无法检查更新：${state.error}` : '自动检查更新。';
    if (available) text = `发现新版本 ${state.readyVersion || state.release.version}。`;
    if (state.phase === 'downloading') text = state.downloadTotal
      ? `正在后台下载更新：${Math.floor(state.downloadBytes / state.downloadTotal * 100)}%` : '正在验证更新清单…';
    if (ready) text = `新版已下载，空闲时自动安装。${state.blockedReason || ''}`;
    if (['preparing', 'installing'].includes(state.phase)) text = '正在准备更新，请稍候…';
    if (state.updateError) text = `更新暂未完成：${state.updateError}`;
    if (state.lastResult?.status === 'error' && !state.updateError && !available) text = `上次更新未完成：${state.lastResult.message}`;
    status.textContent = text;
    message.textContent = text;
    details.hidden = !state.release || !available;
    banner.hidden = !available || (snoozedVersion === (state.readyVersion || state.release?.version) && Date.now() < snoozedUntil);
    for (const button of installButtons) { button.hidden = !ready; button.disabled = checking || locked; }
    if (state.release) {
      download.href = helpDownload.href = state.release.url;
      notes.textContent = state.release.notes || '此版本未附更新说明。';
    }
    if (!state.automaticInstall && available) status.textContent += ' 当前运行位置请使用发布页手动安装。';
    if (state.phase === 'installing') { expectedVersion = state.readyVersion; lock(); monitorRestart(); }
    else if (locked && !['preparing', 'installing'].includes(state.phase)) unlock();
  }
  async function report() { if (!stopped && source?.readyState === EventSource.OPEN) await request('/api/app/update/activity', {clientID, ...activity()}); }
  function connect() {
    source = new EventSource(`/api/app/update/events?clientID=${clientID}`);
    source.addEventListener('open', () => { void report().catch(showError); });
    source.addEventListener('state', event => render(JSON.parse(event.data)));
    source.addEventListener('prepare', async event => {
      const {token} = JSON.parse(event.data);
      const state = activity();
      if (!state.busy) lock();
      try { await request('/api/app/update/ack', {clientID, token, ...state}); }
      catch (error) { unlock(); showError(error); }
    });
    source.addEventListener('resume', event => {
      unlock(); clearTimeout(recoveryTimer); recoveryTimer = null;
      showError(new Error(JSON.parse(event.data).error));
    });
    source.addEventListener('restarting', event => { expectedVersion = JSON.parse(event.data).version; lock(); monitorRestart(); });
  }
  function monitorRestart() {
    if (recoveryTimer || stopped) return;
    const poll = async () => {
      if (stopped || !locked) { recoveryTimer = null; return; }
      try {
        const response = await fetch('/health', {signal: AbortSignal.timeout(2500)});
        const health = await response.json();
        if (response.ok && health.appVersion === expectedVersion) {
          stop();
          const url = new URL(location.href);
          url.searchParams.set('project', currentProjectID());
          location.replace(url);
          return;
        }
        const stateResponse = await fetch('/api/app/update', {signal: AbortSignal.timeout(2500)});
        if (stateResponse.ok) {
          const state = await stateResponse.json();
          if (state.lastResult?.status === 'error' && !['preparing', 'installing'].includes(state.phase)) {
            unlock(); render(state); recoveryTimer = null; return;
          }
        }
      } catch (error) {
        // During replacement the loopback service is briefly unavailable; keep the updating screen.
        if (error.name !== 'TimeoutError' && !(error instanceof TypeError)) showError(error);
      }
      recoveryTimer = setTimeout(poll, 1500);
    };
    recoveryTimer = setTimeout(poll, 1500);
  }
  function showError(error) { status.textContent = `更新状态：${error.message}`; }
  async function check() {
    if (checking || locked) return;
    checking = true; checkButton.disabled = true; snoozedUntil = 0;
    status.textContent = '正在检查更新…';
    try { render(await request('/api/app/update?force=1')); }
    catch (error) { showError(error); }
    finally { checking = false; checkButton.disabled = false; for (const button of installButtons) button.disabled = locked; }
  }
  async function installNow() {
    if (checking || locked) return;
    checking = true;
    try {
      await saveBeforeUpdate();
      await report();
      render(await request('/api/app/update/install', {clientID}));
    } catch (error) { showError(error); }
    finally { checking = false; }
  }
  function input(event) {
    if (event.isTrusted && !locked) lastInputAt = Date.now();
  }
  for (const event of ['pointerdown', 'keydown', 'wheel', 'input']) document.addEventListener(event, input, {capture: true, passive: true});
  checkButton.addEventListener('click', check);
  for (const button of installButtons) button.addEventListener('click', installNow);
  document.getElementById('snoozeUpdate').addEventListener('click', () => {
    snoozedVersion = latestState.readyVersion || latestState.release?.version;
    snoozedUntil = Date.now() + 3600000; banner.hidden = true;
  });
  dialog.addEventListener('cancel', event => event.preventDefault());
  const heartbeat = setInterval(() => { void report().catch(showError); }, 5000);
  window.addEventListener('beforeunload', event => {
    if (!locked && readActivity().unsaved) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', event => {
    source?.close();
    if (!event.persisted) navigator.sendBeacon('/api/app/update/release', new Blob([JSON.stringify({clientID})], {type: 'application/json'}));
  });
  window.addEventListener('pageshow', event => { if (event.persisted && !stopped) connect(); });
  function stop() { stopped = true; clearInterval(heartbeat); clearTimeout(recoveryTimer); source?.close(); }
  connect();
  return {stop};
}
