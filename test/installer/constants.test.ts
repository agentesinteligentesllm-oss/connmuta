import { test } from "node:test";
import assert from "node:assert/strict";
import * as sharedConstants from "../../src/shared/constants.js";
import {
  MCP_SERVER_NAME,
  EXIT_INSTALLER_REFUSED,
  EXIT_DOCTOR_FAILED,
  INSTALLER_LEDGER_BUSY_TIMEOUT_MS,
  BACKUP_SUFFIX_PREFIX,
  JSON_DEFAULT_INDENT,
  AGENTS_MD_MAX_LINES,
  AUTOSTART_RUN_KEY,
  AUTOSTART_VALUE_NAME,
  AUTOSTART_LAUNCHD_LABEL,
  DOCTOR_PROOF_LABEL,
  REGISTRY_REPLACE_ATTEMPTS,
} from "../../src/installer/constants.js";
import * as installerConstants from "../../src/installer/constants.js";
import { PRODUCT_NAME, EXIT_VALIDATION_FAILED } from "../../src/shared/constants.js";

test("MCP_SERVER_NAME advertises this product's own name on every tool-config surface (design.md:66)", () => {
  assert.equal(MCP_SERVER_NAME, PRODUCT_NAME);
});

test("EXIT_INSTALLER_REFUSED and EXIT_DOCTOR_FAILED are the next two free exit codes (design.md:67-68)", () => {
  assert.equal(EXIT_INSTALLER_REFUSED, EXIT_VALIDATION_FAILED + 1);
  assert.equal(EXIT_DOCTOR_FAILED, EXIT_INSTALLER_REFUSED + 1);
  assert.equal(EXIT_INSTALLER_REFUSED, 9);
  assert.equal(EXIT_DOCTOR_FAILED, 10);
});

test("INSTALLER_LEDGER_BUSY_TIMEOUT_MS absorbs a busy-lock burst while a human waits at a prompt (design.md:69)", () => {
  assert.equal(INSTALLER_LEDGER_BUSY_TIMEOUT_MS, 5000);
});

test("BACKUP_SUFFIX_PREFIX follows the *.bak-<reason>-<date> convention with this product's own name (design.md:70)", () => {
  assert.equal(BACKUP_SUFFIX_PREFIX, `.bak-pre-${PRODUCT_NAME}-`);
});

test("JSON_DEFAULT_INDENT is 2 spaces, used only when no indented line exists to learn from (design.md:71)", () => {
  assert.equal(JSON_DEFAULT_INDENT, 2);
});

test("AGENTS_MD_MAX_LINES pins the installer's AGENTS.md template ceiling (design.md:72, OVERVIEW §10.1 step 5)", () => {
  assert.equal(AGENTS_MD_MAX_LINES, 200);
});

test("AUTOSTART_RUN_KEY pins the Windows Run key with real backslashes, not stripped escapes (design.md:73)", () => {
  assert.equal(AUTOSTART_RUN_KEY, "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run");
  assert.equal(AUTOSTART_RUN_KEY.split("\\").length, 6);
});

test("AUTOSTART_VALUE_NAME and AUTOSTART_LAUNCHD_LABEL derive from this product's own name (design.md:74-75, B-11)", () => {
  assert.equal(AUTOSTART_VALUE_NAME, PRODUCT_NAME);
  assert.equal(AUTOSTART_LAUNCHD_LABEL, `io.${PRODUCT_NAME}.daemon`);
});

test("DOCTOR_PROOF_LABEL domain-separates doctor proofs from identity:/session: proofs (design.md:76, D-14)", () => {
  assert.equal(DOCTOR_PROOF_LABEL, "doctor:");
});

test("REGISTRY_REPLACE_ATTEMPTS bounds the Windows rename-over retry loop (design.md:77)", () => {
  assert.equal(REGISTRY_REPLACE_ATTEMPTS, 3);
});

test("no installer EXIT_* value collides with a shared/constants.ts EXIT_* value", () => {
  const sharedExitValues: unknown[] = Object.entries(sharedConstants)
    .filter(([name]) => name.startsWith("EXIT_"))
    .map(([, value]) => value);
  const installerExitValues: unknown[] = Object.entries(installerConstants)
    .filter(([name]) => name.startsWith("EXIT_"))
    .map(([, value]) => value);

  // Non-vacuous: both sides must actually contribute EXIT_* values, otherwise this test would pass
  // trivially even if one side stopped exporting any.
  assert.ok(sharedExitValues.length > 0, "expected shared/constants.ts to export at least one EXIT_* value");
  assert.ok(installerExitValues.length > 0, "expected installer/constants.ts to export at least one EXIT_* value");

  for (const value of installerExitValues) {
    assert.equal(
      sharedExitValues.includes(value),
      false,
      `installer EXIT_* value ${value} collides with a shared/constants.ts EXIT_* value`,
    );
  }
});
