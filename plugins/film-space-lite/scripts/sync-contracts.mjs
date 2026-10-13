import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  blockoutSurfaceAuthoringGuidance,
  filmSpaceOperationActions,
  filmSpaceOperationDefinitions,
  filmSpaceOperationDomains,
} from "../../../director-console/app/project-command-contracts.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDirectory = path.join(pluginRoot, "assets");
const outputPath = path.join(assetDirectory, "operation-contracts.json");

await mkdir(assetDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  version: 1,
  blockoutSurfaceAuthoringGuidance,
  actions: filmSpaceOperationActions,
  domains: filmSpaceOperationDomains,
  definitions: filmSpaceOperationDefinitions,
})}\n`, "utf8");

process.stdout.write(`Synced Film Space MCP contracts: ${outputPath}\n`);
