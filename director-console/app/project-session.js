export const LAST_OPENED_PROJECT_STORAGE_KEY = "film-space.last-opened-project-id";

export function readLastOpenedProjectID(storage = browserStorage()) {
  if (!storage || typeof storage.getItem !== "function") return "";
  try {
    return String(storage.getItem(LAST_OPENED_PROJECT_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function rememberLastOpenedProjectID(projectID, storage = browserStorage()) {
  const value = String(projectID || "").trim();
  if (!value || !storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(LAST_OPENED_PROJECT_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function initialProjectID(
  summaries,
  { requestedProjectID = "", rememberedProjectID = "" } = {}
) {
  const available = Array.isArray(summaries) ? summaries.filter((summary) => !summary.readError) : [];
  const availableIDs = new Set(available.map((summary) => summary?.id).filter(Boolean));
  const requested = String(requestedProjectID || "").trim();
  if (requested && availableIDs.has(requested)) return requested;
  const remembered = String(rememberedProjectID || "").trim();
  if (remembered && availableIDs.has(remembered)) return remembered;
  return available[0]?.id || "";
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
