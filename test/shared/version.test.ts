import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SERVER_VERSION } from "../../src/shared/version.js";

test("SERVER_VERSION matches package.json's version — the single source of truth (v1:src/config.ts:44-52)", () => {
  const packageJsonPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
  assert.equal(SERVER_VERSION, packageJson.version);
});
