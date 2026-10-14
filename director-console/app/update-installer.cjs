const fs = require('node:fs/promises');
const syncFS = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
async function startInstaller({runtime, target, dataRoot, projectRoot, serviceFile, port, candidate, onReady}) {
  const directory = await fs.mkdtemp(path.join(dataRoot, 'Updates', 'worker-'));
  const workerRuntime = path.join(directory, 'runtime');
  const files = ['scripts/apply-film-space-lite-update.cjs', 'director-console/app/update-package.cjs',
    'director-console/app/update-checker.cjs', 'native/lite/version.json', 'native/lite/update-public-key.json'];
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(workerRuntime, file)), {recursive: true});
    await fs.copyFile(path.join(runtime, file), path.join(workerRuntime, file));
  }
  const node = path.join(directory, process.platform === 'win32' ? 'node.exe' : 'node');
  await fs.copyFile(process.execPath, node);
  await fs.chmod(node, 0o700);
  const jobPath = path.join(directory, 'job.json');
  await fs.writeFile(jobPath, JSON.stringify({target, dataRoot, projectRoot, serviceFile, port,
    parentPID: process.pid, platform: process.platform, ...candidate}) + '\n', {mode: 0o600});
  const log = syncFS.openSync(path.join(dataRoot, 'Updates', 'install.log'), 'a');
  const child = spawn(node, [path.join(workerRuntime, 'scripts/apply-film-space-lite-update.cjs'), jobPath],
    {cwd: directory, detached: true, windowsHide: true, stdio: ['ignore', log, log, 'ipc']});
  syncFS.closeSync(log);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => {
      fs.writeFile(path.join(directory, 'worker.json'), JSON.stringify({pid: child.pid}) + '\n').catch(reject);
    });
    child.once('exit', (code) => reject(new Error(`更新准备程序退出（${code}）。`)));
    child.on('message', message => {
      if (message.type === 'error') reject(new Error(message.error));
      if (message.type === 'ready') {
        // The new package is fully verified and staged before the running service exits.
        child.send({type: 'commit'}, error => {
          if (error) { reject(error); return; }
          child.unref();
          resolve();
          onReady();
        });
      }
    });
  });
}
module.exports = {startInstaller};
