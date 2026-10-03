import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";

// dist/test/security/markdown-links.test.js -> repo root is three levels up
// (dist/test/security/ -> dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const FIXTURE_RELATIVE_PATH = "test/fixtures/markdown-links-negative.md";

/**
 * Files the clean-tree scan skips:
 * - the seeded negative fixture, which exists to fail the check (tested separately below);
 */
const EXCLUDED_FILES = new Set([FIXTURE_RELATIVE_PATH]);

/** Regex matching Markdown inline links [text](target) and image links ![alt](target). */
const MARKDOWN_LINK_RE = /(?:!\[[^\]]*\]|\[[^\]]*\])\(([^)]+)\)/g;

export interface LinkViolation {
  file: string;
  link: string;
  resolvedPath: string;
}

export function scanMarkdownLinks(relativeFilePath: string): LinkViolation[] {
  const absolutePath = join(REPO_ROOT, relativeFilePath);
  const content = readFileSync(absolutePath, "utf8");
  const violations: LinkViolation[] = [];

  let match: RegExpExecArray | null;
  const re = new RegExp(MARKDOWN_LINK_RE.source, MARKDOWN_LINK_RE.flags);
  while ((match = re.exec(content)) !== null) {
    const rawTarget = match[1].trim();
    // Ignore external URLs, mailto, etc.
    if (/^[a-z]+:/i.test(rawTarget) || rawTarget.startsWith("#")) {
      continue;
    }
    // Strip optional markdown link title: [text](target "title")
    const targetWithoutTitle = rawTarget.split(/\s+["']/)[0].trim();
    // Strip in-file anchors and query parameters
    let cleanTarget = targetWithoutTitle.split("#")[0].split("?")[0];
    if (!cleanTarget) {
      continue;
    }
    try {
      cleanTarget = decodeURIComponent(cleanTarget);
    } catch {
      // Keep cleanTarget as-is if decoding fails
    }

    const resolved = resolve(dirname(absolutePath), cleanTarget);
    if (!existsSync(resolved)) {
      violations.push({
        file: relativeFilePath,
        link: rawTarget,
        resolvedPath: resolved,
      });
    }
  }

  return violations;
}

function listTrackedMarkdownFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, shell: false, encoding: "utf8" });
  return output
    .split("\0")
    .filter((path) => path.endsWith(".md"));
}

test("every relative link in tracked Markdown files resolves to an existing target", () => {
  const trackedFiles = listTrackedMarkdownFiles().filter((p) => !EXCLUDED_FILES.has(p));
  assert.ok(trackedFiles.length > 0, "expected git ls-files to report at least one tracked markdown file");

  const allViolations: LinkViolation[] = [];
  for (const file of trackedFiles) {
    const fileViolations = scanMarkdownLinks(file);
    allViolations.push(...fileViolations);
  }

  assert.deepEqual(
    allViolations,
    [],
    `found broken relative markdown link(s):\n${allViolations.map((v) => `  ${v.file}: ${v.link} -> ${v.resolvedPath}`).join("\n")}`,
  );
});

test("the seeded negative fixture fails the link check (non-vacuous)", () => {
  const violations = scanMarkdownLinks(FIXTURE_RELATIVE_PATH);
  assert.ok(violations.length > 0, "expected seeded negative fixture to produce link violation(s)");
  assert.ok(
    violations.some((v) => v.link.includes("non-existent-target-file.md")),
    `expected violation for non-existent-target-file.md, got: ${JSON.stringify(violations)}`,
  );
});
