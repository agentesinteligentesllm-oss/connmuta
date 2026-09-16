import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// dist/test/security/provenance.test.js -> repo root is three levels up
// (dist/test/security/ -> dist/test/ -> dist/ -> repo root).
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SELF_RELATIVE_PATH = "test/security/provenance.test.ts";
const FIXTURE_RELATIVE_PATH = "test/fixtures/v1-provenance.json";
const SCANNED_PREFIXES = ["src/", "test/"];

interface ProvenanceEntry {
  v2Path: string;
  v1Path: string;
  commit: string;
  verdict: "AS-IS" | "SEAM";
}

/** The file's leading JSDoc header block, only when it carries a `Provenance:` line — undefined otherwise. */
function leadingProvenanceHeader(text: string): string | undefined {
  if (!text.startsWith("/**")) return undefined;
  const end = text.indexOf("*/");
  if (end === -1) return undefined;
  const block = text.slice(0, end + 2);
  return block.includes("Provenance:") ? block : undefined;
}

/**
 * Strips a leading Provenance header (if present) and the leading import block, returning the
 * exact region DN-06's hash pins (design §12). The v1 source (no header) and the v2 vendored
 * copy (with header) hash to the same value under this function. Line endings are normalized
 * first: this repo's `.gitattributes` forces `eol=lf`, the v1 checkout has none, and an
 * unnormalized hash would not be portable across a CRLF/LF checkout.
 */
export function vendoredBody(text: string): string {
  let rest = text.replace(/\r\n/g, "\n");
  const header = leadingProvenanceHeader(rest);
  if (header) rest = rest.slice(header.length).replace(/^\n+/, "");

  const lines = rest.split("\n");
  let i = 0;
  let inImport = false;
  while (i < lines.length) {
    const line = lines[i];
    if (inImport) {
      i += 1;
      if (/;\s*$/.test(line)) inImport = false;
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (/^import\b/.test(line)) {
      inImport = !/;\s*$/.test(line);
      i += 1;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n");
}

function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function parseHeader(v2Path: string, text: string) {
  const header = leadingProvenanceHeader(text);
  if (!header) return undefined;
  const identity = header.match(
    /Provenance: telegram-agent-bus (\S+) @ (\S+) — verdict: (AS-IS|SEAM) \(D-08\)\./,
  );
  const hash = header.match(/v1 body sha256: ([0-9a-f]{64})/);
  const changes = header.match(/Changes: ([^\n]*)/);
  if (!identity || !hash || !changes) return undefined;
  const [, v1Path, commit, verdict] = identity;
  const entry: ProvenanceEntry = { v2Path, v1Path, commit, verdict: verdict as "AS-IS" | "SEAM" };
  return { entry, hash: hash[1], changes: changes[1].trim() };
}

function listScannedFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, shell: false, encoding: "utf8" });
  return output
    .split("\0")
    .filter((path) => path.length > 0 && path !== SELF_RELATIVE_PATH)
    .filter((path) => SCANNED_PREFIXES.some((prefix) => path.startsWith(prefix)));
}

test("vendored files match the provenance registry and their pinned body hashes (design §12, DN-06)", () => {
  const fixture: ProvenanceEntry[] = JSON.parse(readFileSync(join(REPO_ROOT, FIXTURE_RELATIVE_PATH), "utf8"));
  assert.ok(fixture.length > 0, "expected the provenance fixture to be non-empty");

  const scanned: (ProvenanceEntry & { hash: string; changes: string })[] = [];
  // A header that carries `Provenance:` but does not parse is a defect, not an unvendored file:
  // skipping it would let a mistyped verdict or hash line escape the registry check.
  const malformed: string[] = [];
  for (const path of listScannedFiles()) {
    const text = readFileSync(join(REPO_ROOT, path), "utf8");
    if (!leadingProvenanceHeader(text)) continue;
    const parsed = parseHeader(path, text);
    if (parsed) scanned.push({ ...parsed.entry, hash: parsed.hash, changes: parsed.changes });
    else malformed.push(path);
  }
  assert.deepEqual(malformed, [], `malformed Provenance header(s) in: ${malformed.join(", ")}`);

  const byPath = (a: ProvenanceEntry, b: ProvenanceEntry) => a.v2Path.localeCompare(b.v2Path);
  const scannedIdentity = scanned.map(({ v2Path, v1Path, commit, verdict }) => ({ v2Path, v1Path, commit, verdict }));
  assert.deepEqual([...scannedIdentity].sort(byPath), [...fixture].sort(byPath));

  for (const entry of scanned) {
    const actualHash = sha256Hex(vendoredBody(readFileSync(join(REPO_ROOT, entry.v2Path), "utf8")));
    if (entry.verdict === "AS-IS") {
      assert.equal(actualHash, entry.hash, `${entry.v2Path}: AS-IS body must match its pinned v1 hash`);
    } else {
      assert.notEqual(actualHash, entry.hash, `${entry.v2Path}: SEAM body must differ from the v1 hash`);
      assert.notEqual(entry.changes, "none.", `${entry.v2Path}: SEAM header must list its changes`);
    }
  }
});

test("a synthetic SEAM header parses, hash-mismatches its body and carries a non-'none' Changes note", () => {
  const v1Body = "export const X = 1;\n";
  const seamText =
    `/**\n * Provenance: telegram-agent-bus src/fake.ts @ bf8f365 — verdict: SEAM (D-08).\n` +
    ` * v1 body sha256: ${sha256Hex(v1Body)}   (SHA-256 of the v1 body at bf8f365, header and import block excluded)\n` +
    ` * Changes: (1) renamed the export.\n */\n\nexport const Y = 1;\n`;

  const parsed = parseHeader("src/fake.ts", seamText);
  assert.ok(parsed !== undefined, "expected a well-formed Provenance header to parse");
  assert.equal(parsed?.entry.verdict, "SEAM");
  assert.notEqual(sha256Hex(vendoredBody(seamText)), parsed?.hash);
  assert.notEqual(parsed?.changes, "none.");
});
