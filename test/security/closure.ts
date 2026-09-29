import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Matches a relative (`./`, `../`) specifier in a static `import`/`export ... from` statement, a bare
 * `import "./..."` statement, or a dynamic `import("./...")` call (D-25: `daemon/main.ts` reaches
 * `bootstrap.ts` only through `await import("./bootstrap.js")`, never a static specifier). A bare
 * specifier (e.g. `"node:fs"`, `"zod"`) never matches because every captured group requires a leading
 * `.`.
 */
const RELATIVE_IMPORT_RE =
  /\b(?:import|export)\b[^'"]*?from\s+["'](\.[^"']+)["']|\bimport\s+["'](\.[^"']+)["']|\bimport\s*\(\s*["'](\.[^"']+)["']/g;

function relativeSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(RELATIVE_IMPORT_RE)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/**
 * Extracts every bare (non-relative) module specifier referenced in the same statement shapes
 * RELATIVE_IMPORT_RE recognizes, plus a `require("...")` call as defense in depth (B-100a precedent:
 * `hasFsModuleReference` in predicates.ts treats `require()` as a live form even where currently
 * unobserved in this project's ESM-only source). `computeClosure` never follows a bare specifier — this
 * function exists so a caller can enumerate them explicitly instead of leaving them invisible to
 * bundle-conformance checks (B-100b; `channel-bundle.test.ts`'s own module doc names this exact gap).
 * A relative specifier never matches — the excluded leading `.` mirrors RELATIVE_IMPORT_RE's own
 * required leading `.`, inverted.
 */
const BARE_SPECIFIER_RE =
  /\b(?:import|export)\b[^'"]*?from\s+["']([^."'][^"']*)["']|\bimport\s+["']([^."'][^"']*)["']|\bimport\s*\(\s*["']([^."'][^"']*)["']|\brequire\(\s*["']([^."'][^"']*)["']\s*\)/g;

function bareSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(BARE_SPECIFIER_RE)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
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

export { computeClosure, bareSpecifiers };
