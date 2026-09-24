import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { clientErrorPayload, type ClientPassthroughErrorCode } from "../../src/client/errors.js";
import { HANDSHAKE_ERROR_CODES, type HandshakeErrorCode } from "../../src/client/handshake.js";

/** Mirrors `handshake.ts`'s own (unexported) `HANDSHAKE_ERROR_RETRYABLE` — see errors.ts's module doc. */
const HANDSHAKE_RETRYABLE: Record<HandshakeErrorCode, boolean> = {
  DAEMON_DOWN: true,
  DAEMON_IDENTITY_MISMATCH: true,
  DAEMON_VERSION_MISMATCH: false,
  IPC_ERROR: true,
};

const PASSTHROUGH_RETRYABLE: Record<ClientPassthroughErrorCode, boolean> = {
  UNBOUND_PROJECT: false,
  BINDING_CHANGED: false,
  WRONG_ROOM: false,
  BINDING_MISMATCH: false,
};

test("clientErrorPayload produces {code, message, retryable} with the fixed retryable value for every HandshakeErrorCode", () => {
  for (const code of HANDSHAKE_ERROR_CODES) {
    const payload = clientErrorPayload(code, `message for ${code}`);
    assert.deepEqual(payload, { code, message: `message for ${code}`, retryable: HANDSHAKE_RETRYABLE[code] });
  }
});

test("clientErrorPayload produces {code, message, retryable: false} for every daemon-passthrough code", () => {
  for (const code of Object.keys(PASSTHROUGH_RETRYABLE) as ClientPassthroughErrorCode[]) {
    const payload = clientErrorPayload(code, `message for ${code}`);
    assert.deepEqual(payload, { code, message: `message for ${code}`, retryable: false });
  }
});

test("client-local codes need no Telegram import: compiled errors.js never imports daemon/telegram", () => {
  // Regex anchored to an import/require statement's specifier string, not a blind substring search —
  // a bare substring match could false-positive on legitimate prose in a doc comment (mirrors
  // run-state.test.ts's own "never uses \"daemon.lock\"" test and its stated reasoning).
  const compiledSource = readFileSync(new URL("../../src/client/errors.js", import.meta.url), "utf8");
  const importsTelegram = /from\s+["'][^"']*telegram|require\(\s*["'][^"']*telegram/.test(compiledSource);
  assert.equal(importsTelegram, false, "client/errors.ts must not import daemon/telegram");
});
