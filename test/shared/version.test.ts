import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SERVER_VERSION, WIRE_VERSION } from "../../src/shared/version.js";
import { PROTOCOL_SENTINEL } from "../../src/shared/constants.js";

test("SERVER_VERSION matches package.json's version — the single source of truth (v1:src/config.ts:44-52)", () => {
  const packageJsonPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
  assert.equal(SERVER_VERSION, packageJson.version);
});

test("WIRE_VERSION matches the digits PROTOCOL_SENTINEL emits (F3 PR-08, version-observability)", () => {
  assert.equal(PROTOCOL_SENTINEL, `AGENTBUS/${WIRE_VERSION}`);
});

// Pins the concrete value, not just the derivation's round-trip: a real wire-protocol bump must show
// up here as a deliberate test update, not pass silently (RDD review review-bf6758a77fcaac8d,
// R3-wire-version-no-concrete-pin).
test("WIRE_VERSION is currently '2'", () => {
  assert.equal(WIRE_VERSION, "2");
});
