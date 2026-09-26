/**
 * Provenance: telegram-agent-bus test/security.test.ts:107-169 @ bf8f365 — verdict: AS-IS (D-08).
 * v1 body sha256: a8d108d8c39cf614e7adec6195ba1a52f9b61d5b5805459930326219f5bf7a1f
 *   (lines 107-169, LF-normalized, including the terminating newline. Reproduce with a sha256 over
 *    the frozen checkout, or see `test/fixtures/v1-provenance.json`.)
 * Changes: none.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasChildProcessReference,
  hasFsModuleReference,
  hasSettingsPathReference,
  hasDeleteMessageCallOrDefinition,
  hasAutonomousTimerReference,
  hasUnboundedLoopReference,
  hasTimersModuleReference,
  sendMessageCallLines,
  isIndentedCallSite,
} from "./predicates.js";

test("hasChildProcessReference: catches an import of node:child_process; a clean fs-only sample does not trigger it", () => {
  assert.equal(hasChildProcessReference('import { exec } from "node:child_process";'), true);
  assert.equal(hasChildProcessReference('import { readFileSync } from "node:fs";'), false);
});

test("hasFsModuleReference: catches a node:fs import (require or ESM); a sample with no fs reference does not trigger it", () => {
  assert.equal(hasFsModuleReference('import { readFileSync } from "node:fs";'), true);
  assert.equal(hasFsModuleReference('const fs = require("node:fs");'), true);
  assert.equal(hasFsModuleReference('import { z } from "zod";'), false);
});

test("hasSettingsPathReference: catches a .claude/settings path or a permissions.allow reference; unrelated text does not trigger it", () => {
  assert.equal(hasSettingsPathReference('const p = ".claude/settings.json";'), true);
  assert.equal(hasSettingsPathReference("const allow = config.permissions.allow;"), true);
  assert.equal(hasSettingsPathReference('const x = "hello world";'), false);
});

test("hasDeleteMessageCallOrDefinition: catches an actual call/definition, but NOT a bare prose mention documenting its absence", () => {
  assert.equal(hasDeleteMessageCallOrDefinition("client.deleteMessage({ chat_id, message_id });"), true);
  assert.equal(hasDeleteMessageCallOrDefinition("async deleteMessage(params) {"), true);
  assert.equal(
    hasDeleteMessageCallOrDefinition("`deleteMessage` is deliberately absent from this interface and MUST NEVER be added"),
    false
  );
});

test("hasAutonomousTimerReference: catches setInterval/setTimeout/setImmediate; an unrelated await does not trigger it", () => {
  assert.equal(hasAutonomousTimerReference("setInterval(poll, 1000);"), true);
  assert.equal(hasAutonomousTimerReference("setTimeout(poll, 1000);"), true);
  assert.equal(hasAutonomousTimerReference("setImmediate(poll);"), true);
  assert.equal(hasAutonomousTimerReference("await sleepUntilReady();"), false);
});

test("hasUnboundedLoopReference: catches the timer-free background loop shapes; a bounded loop does not trigger it", () => {
  assert.equal(hasUnboundedLoopReference("for (;;) { await client.getUpdates({ timeout: 50 }); }"), true);
  assert.equal(hasUnboundedLoopReference("for ( ; ; ) { poll(); }"), true);
  assert.equal(hasUnboundedLoopReference("while (true) { await poll(); }"), true);
  assert.equal(hasUnboundedLoopReference("while (1) { await poll(); }"), true);
  assert.equal(hasUnboundedLoopReference("for (const update of updates) { apply(update); }"), false);
  assert.equal(hasUnboundedLoopReference("while (attempts < max) { retry(); }"), false);
});

test("hasTimersModuleReference: catches both timers entrypoints; an unrelated node import does not trigger it", () => {
  assert.equal(hasTimersModuleReference('import { setTimeout } from "node:timers/promises";'), true);
  assert.equal(hasTimersModuleReference('import { scheduler } from "node:timers/promises";'), true);
  assert.equal(hasTimersModuleReference("const t = require('node:timers');"), true);
  assert.equal(hasTimersModuleReference('import { readFileSync } from "node:fs";'), false);
});

test("sendMessageCallLines: finds every line containing a `.sendMessage(` call site, and none when there is none", () => {
  const withCall = ["class X {", "  async send() {", "    return this.client.sendMessage(params);", "  }", "}"].join("\n");
  const lines = sendMessageCallLines(withCall);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes(".sendMessage("));

  const withoutCall = ["class X {", "  async send() {", "    return this.client.getUpdates(params);", "  }", "}"].join("\n");
  assert.deepEqual(sendMessageCallLines(withoutCall), []);
});

test("isIndentedCallSite: distinguishes a class-method-nested call site from a bare module-level statement", () => {
  assert.equal(isIndentedCallSite("    return this.client.sendMessage(params);"), true);
  assert.equal(isIndentedCallSite("client.sendMessage(params);"), false);
});
