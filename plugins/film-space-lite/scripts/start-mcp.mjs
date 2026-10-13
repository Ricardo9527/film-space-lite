import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(pluginRoot);
await import(pathToFileURL(path.join(pluginRoot, "mcp", "server.mjs")).href);
