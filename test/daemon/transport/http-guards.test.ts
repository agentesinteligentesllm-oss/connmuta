import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IncomingMessage } from "node:http";

import { HTTP_FORBIDDEN, IPC_HOST_REJECTED } from "../../../src/shared/ipc-contract.js";
import { checkTransportGuards, TRANSPORT_ORIGIN_REJECTED } from "../../../src/daemon/transport/http-guards.js";

const EXPECTED_HOST = "127.0.0.1:54321";

function fakeRequest(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe("checkTransportGuards", () => {
  it("refuses a foreign Host header", () => {
    const req = fakeRequest({ host: "evil.example.com" });

    const result = checkTransportGuards(req, { expectedHost: EXPECTED_HOST, requireOrigin: false });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.rejection.status, HTTP_FORBIDDEN);
    assert.deepEqual(result.rejection.body, {
      code: IPC_HOST_REJECTED,
      message: "Host header must name this daemon's own loopback address",
      retryable: false,
    });
  });

  it("refuses a present, foreign Origin when requireOrigin is true", () => {
    const req = fakeRequest({ host: EXPECTED_HOST, origin: "http://evil.example.com" });

    const result = checkTransportGuards(req, { expectedHost: EXPECTED_HOST, requireOrigin: true });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.rejection.status, HTTP_FORBIDDEN);
    assert.deepEqual(result.rejection.body, {
      code: TRANSPORT_ORIGIN_REJECTED,
      message: "Origin header must name this daemon's own loopback address",
      retryable: false,
    });
  });

  it("admits an absent Origin when requireOrigin is true (plain top-level navigation)", () => {
    const req = fakeRequest({ host: EXPECTED_HOST });

    const result = checkTransportGuards(req, { expectedHost: EXPECTED_HOST, requireOrigin: true });

    assert.deepEqual(result, { ok: true });
  });

  it("ignores a foreign Origin entirely when requireOrigin is false", () => {
    const req = fakeRequest({ host: EXPECTED_HOST, origin: "http://evil.example.com" });

    const result = checkTransportGuards(req, { expectedHost: EXPECTED_HOST, requireOrigin: false });

    assert.deepEqual(result, { ok: true });
  });

  it("admits a matching Host and matching Origin when requireOrigin is true", () => {
    const req = fakeRequest({ host: EXPECTED_HOST, origin: `http://${EXPECTED_HOST}` });

    const result = checkTransportGuards(req, { expectedHost: EXPECTED_HOST, requireOrigin: true });

    assert.deepEqual(result, { ok: true });
  });
});
