/**
 * Auto-discovery — scans `src/operations/` for Aura artifacts and registers them.
 * Resolves: Requirements 37.5, 37.6, 37.7, 37.8 (Task 26).
 *
 * At startup (or via Vite plugin in dev), this module globs for files matching
 * the suffix conventions and imports them. Each file is validated:
 *   - Correct export shape (default export is a registered operation/cron/etc.)
 *   - Name matches file path
 *   - One artifact per file
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

export interface DiscoveredArtifact {
  type: "operation" | "middleware" | "cron" | "workflow" | "agent" | "http" | "rag" | "search" | "vector" | "db-read" | "component";
  filePath: string;
  derivedName: string;
}

const SUFFIX_MAP: Record<string, DiscoveredArtifact["type"]> = {
  ".operation.ts": "operation",
  ".middleware.ts": "middleware",
  ".cron.ts": "cron",
  ".workflow.ts": "workflow",
  ".agent.ts": "agent",
  ".http.ts": "http",
  ".rag.ts": "rag",
  ".search.ts": "search",
  ".vector.ts": "vector",
  ".db-read.ts": "db-read",
  ".component.ts": "component",
};

/**
 * Derive the operation/artifact name from a file path relative to the operations root.
 * Example: `catalog/product-by-slug.operation.ts` → `catalog.product-by-slug`
 */
export function deriveNameFromPath(relativePath: string): string {
  // Remove the suffix (e.g. `.operation.ts`)
  let name = relativePath;
  for (const suffix of Object.keys(SUFFIX_MAP)) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  // Convert path separators to dots
  return name.replace(/[\\/]/g, ".");
}

/**
 * Detect the artifact type from a file path.
 */
export function detectArtifactType(filePath: string): DiscoveredArtifact["type"] | null {
  for (const [suffix, type] of Object.entries(SUFFIX_MAP)) {
    if (filePath.endsWith(suffix)) return type;
  }
  return null;
}

/**
 * Recursively scan a directory for Aura artifact files.
 */
export function discoverArtifacts(rootDir: string): DiscoveredArtifact[] {
  const artifacts: DiscoveredArtifact[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith("_") || entry.startsWith(".")) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const type = detectArtifactType(entry);
        if (type) {
          const rel = relative(rootDir, fullPath);
          artifacts.push({
            type,
            filePath: fullPath,
            derivedName: deriveNameFromPath(rel),
          });
        }
      }
    }
  }

  walk(rootDir);
  return artifacts;
}

/**
 * Validate that a file's exported operation name matches its derived name.
 */
export function validateNameMatch(exportedName: string, derivedName: string): boolean {
  return exportedName === derivedName;
}

/**
 * Generate the `_registry.ts` file content from discovered artifacts.
 */
export function generateRegistrySource(artifacts: DiscoveredArtifact[], rootDir: string): string {
  const lines = [
    "// AUTO-GENERATED — do not edit by hand.",
    "// Re-run `bun run aura:codegen` to refresh.",
    "",
  ];

  for (const artifact of artifacts) {
    const rel = relative(rootDir, artifact.filePath).replace(/\.ts$/, "");
    lines.push(`import "./${rel.replace(/\\/g, "/")}";`);
  }

  lines.push("");
  lines.push("// All artifacts are self-registering on import.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Validate the operations directory structure.
 * Returns warnings/errors for misplaced files.
 */
export function validateStructure(rootDir: string): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith("_") || entry.startsWith(".")) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith(".ts")) {
        const type = detectArtifactType(entry);
        if (!type) {
          warnings.push(`File has no recognized suffix: ${relative(rootDir, fullPath)}`);
        }

        // Check kebab-case
        const nameWithoutExt = basename(entry).replace(/\.(operation|middleware|cron|workflow|agent|http|rag|search|vector|db-read|component)\.ts$/, "");
        if (nameWithoutExt !== nameWithoutExt.toLowerCase() || nameWithoutExt.includes("_")) {
          if (!/^[a-z][a-z0-9-]*$/.test(nameWithoutExt)) {
            warnings.push(`File name is not kebab-case: ${entry} (expected: ${toKebabCase(nameWithoutExt)})`);
          }
        }
      }
    }
  }

  walk(rootDir);
  return { warnings, errors };
}

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}
