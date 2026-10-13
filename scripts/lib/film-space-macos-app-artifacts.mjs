import { existsSync, rmSync } from "node:fs";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout}`);
}

export async function archiveMacOSApp(appPath, archive = `${appPath}.zip`) {
  const temporary = `${archive}.pending-${process.pid}`;
  try {
    run("/usr/bin/ditto", ["-c", "-k", "--zlibCompressionLevel", "0", "--sequesterRsrc", "--keepParent", appPath, temporary]);
    run("/usr/bin/unzip", ["-tq", temporary]);
    await rename(temporary, archive);
    await rm(appPath, { recursive: true });
  } finally {
    await rm(temporary, { force: true });
  }
  return archive;
}

// Each consumer owns its extracted copy; the stored product stays compressed.
export async function unpackMacOSApp(appPath, { cleanup = true } = {}) {
  if (existsSync(appPath)) await archiveMacOSApp(appPath);
  const directory = await mkdtemp(path.join(os.tmpdir(), "film-space-app-"));
  if (cleanup) process.once("exit", () => rmSync(directory, { recursive: true, force: true }));
  run("/usr/bin/ditto", ["-x", "-k", `${appPath}.zip`, directory]);
  return path.join(directory, path.basename(appPath));
}

export function removeTemporaryAppOnExit(appPath) {
  process.once("exit", () => rmSync(appPath, { recursive: true, force: true }));
}
