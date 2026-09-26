import { test } from "node:test";
import assert from "node:assert/strict";
import { modify, applyEdits } from "jsonc-parser";

/**
 * Throwaway import-smoke test (tasks.md PR-01, sub-task 1.2; design.md §16 risk).
 *
 * `jsonc-parser` ships no `exports` map in its `package.json` — only `main` (UMD/CJS) and `module`
 * (ESM, which Node's resolver never reads without an `exports` map). This pins that Node's CJS-to-ESM
 * named-export detection still resolves `modify` and `applyEdits` as named imports at runtime from
 * this project's own compiled `dist/test` output, so `installer/formats/jsonc.ts` (PR-02) can rely on
 * `import { modify, applyEdits } from "jsonc-parser"` directly, with no default-import fallback.
 *
 * No fallback was needed: named ESM imports resolved correctly on the first try (verified both via a
 * standalone `node --input-type=module` probe and via this compiled test).
 */
test("jsonc-parser exposes modify and applyEdits as named ESM imports", () => {
  assert.equal(typeof modify, "function");
  assert.equal(typeof applyEdits, "function");

  const original = '{\n  "a": 1\n}';
  const edits = modify(original, ["b"], 2, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
  const result = applyEdits(original, edits);

  assert.equal(result, '{\n  "a": 1,\n  "b": 2\n}');
});
