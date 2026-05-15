const STORAGE_KEY = "aura:manifest-entities";
const TTL_KEY = "aura:manifest-ttl";
const TTL_MS = 10 * 60 * 1000;

function loadFromStorage(): Record<string, string[]> {
  if (typeof sessionStorage === "undefined") return {};
  const raw = sessionStorage.getItem(STORAGE_KEY);
  const ttl = sessionStorage.getItem(TTL_KEY);
  if (!raw || !ttl) return {};
  if (Date.now() > Number(ttl)) {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(TTL_KEY);
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

function saveToStorage(map: Record<string, string[]>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    sessionStorage.setItem(TTL_KEY, String(Date.now() + TTL_MS));
  } catch {
    // Storage full — ignore
  }
}

let entitiesByOperation: Record<string, string[]> = loadFromStorage();

export function setManifestEntities(
  map: Record<string, string[]>,
): void {
  entitiesByOperation = map;
  saveToStorage(map);
}

export function getOperationEntities(
  operationName: string,
): string[] {
  return entitiesByOperation[operationName] ?? [];
}

export function getManifestEntities(): Record<string, string[]> {
  return entitiesByOperation;
}

// Re-hydrate from storage if HMR cleared the module variable
if (typeof sessionStorage !== "undefined" && Object.keys(entitiesByOperation).length === 0) {
  const stored = loadFromStorage();
  if (Object.keys(stored).length > 0) {
    entitiesByOperation = stored;
  }
}
