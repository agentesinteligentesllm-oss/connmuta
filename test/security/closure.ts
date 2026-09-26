import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Matches a relative (`./`, `../`) specifier in a static `import`/`export ... from` statement; a bare specifier (e.g. `"node:fs"`, `"zod"`) never matches because the captured group requires a leading `.`. */
const RELATIVE_IMPORT_RE =
  /\b(?:import|export)\b[^'"]*?from\s+["'](\.[^"']+)["']|\bimport\s+["'](\.[^"']+)["']/g;

function relativeSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(RELATIVE_IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/**
 * Transitive closure of relative import/export specifiers reachable from `entryPath`.
 *
 * Each specifier resolves against the directory of the file that references it, not the entry
 * file's directory — a chain `entry.js -> sub/mid.js -> "./leaf.js"` resolves `leaf.js` inside
 * `sub/`, not next to `entry.js`.
 */
function computeClosure(entryPath: string): Set<string> {
  const visited = new Set<string>();
  const worklist: string[] = [resolve(entryPath)];

  while (worklist.length > 0) {
    const current = worklist.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);

    const currentDir = dirname(current);
    for (const specifier of relativeSpecifiers(readFileSync(current, "utf8"))) {
      const resolved = resolve(currentDir, specifier);
      if (!visited.has(resolved)) worklist.push(resolved);
    }
  }

  return visited;
}

export { computeClosure };
