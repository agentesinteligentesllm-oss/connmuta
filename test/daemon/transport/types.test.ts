import { test } from "node:test";
import assert from "node:assert/strict";

import { TransportError, UnknownRecipientError } from "../../../src/daemon/transport/types.js";

test("TransportError sets name and preserves message and cause", () => {
  const cause = new Error("underlying failure");
  const err = new TransportError("transport failed", { cause });

  assert.ok(err instanceof Error);
  assert.ok(err instanceof TransportError);
  assert.equal(err.name, "TransportError");
  assert.equal(err.message, "transport failed");
  assert.equal(err.cause, cause);
});

test("UnknownRecipientError extends TransportError, sets name and exposes 'to' property", () => {
  const err = new UnknownRecipientError("@dev2-agent");

  assert.ok(err instanceof Error);
  assert.ok(err instanceof TransportError);
  assert.ok(err instanceof UnknownRecipientError);
  assert.equal(err.name, "UnknownRecipientError");
  assert.equal(err.to, "@dev2-agent");
  assert.equal(err.message, 'Unknown recipient: "@dev2-agent" is not present in the local roster');
});

test("UnknownRecipientError sets 'to' and message for a different recipient (triangulation)", () => {
  const err = new UnknownRecipientError("@dev3-agent");

  assert.equal(err.to, "@dev3-agent");
  assert.equal(err.message, 'Unknown recipient: "@dev3-agent" is not present in the local roster');
});
