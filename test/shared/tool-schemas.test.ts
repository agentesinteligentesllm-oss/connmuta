import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchInputSchema,
  statusInputSchema,
  threadInputSchema,
  sendInputBaseSchema,
  sendInputSchema,
  type SendToolInput,
} from "../../src/shared/tool-schemas.js";

// --- PT-02: the tool inputs carry no destination and no sender (schema-shape assertion, not just a
// runtime check). v1 precedent: the `from` and `to_user_id` assertions at
// `v1:test/tools/send.test.ts:122-136` and `:295-303`. `chat_id` is Telegram's own field,
// `bot`/`group`/`to_chat` are the v1 bridge's vocabulary for it, and `from`/`to_user_id` are the
// anchors the daemon derives instead (design §9 — "neither is an input").

const FORBIDDEN_INPUT_KEYS = ["chat_id", "bot", "group", "to_chat", "from", "to_user_id"];

/** Every `z.object` schema the four tools expose, including the un-refined base of `send`. The refined
 * `sendInputSchema` is pinned behaviourally below instead, because a shape-only read of the base would
 * miss a key added to the exported schema (finding C1). */
const ALL_SCHEMAS: Array<[string, { shape: Record<string, unknown> }]> = [
  ["send", sendInputBaseSchema],
  ["fetch", fetchInputSchema],
  ["status", statusInputSchema],
  ["thread", threadInputSchema],
];

test("PT-02: no tool input schema declares a destination or sender key", () => {
  for (const [tool, schema] of ALL_SCHEMAS) {
    const keys = Object.keys(schema.shape);
    for (const forbidden of FORBIDDEN_INPUT_KEYS) {
      assert.ok(!keys.includes(forbidden), `${tool} input must never declare a \`${forbidden}\` field`);
    }
  }
});

test("the `send` base schema declares exactly v1's six fields (v1:src/tools/send.ts:47-54)", () => {
  assert.deepEqual(Object.keys(sendInputBaseSchema.shape).sort(), [
    "approval_ref",
    "basis",
    "body",
    "thread",
    "to",
    "type",
  ]);
});

test("no forbidden key survives validation on the tool-visible, refined `send` schema", () => {
  const values: Record<string, unknown> = {
    chat_id: -1001234567890, bot: "@dev1-agent", group: "@dev1-agent",
    to_chat: "@dev1-agent", from: "@dev1-agent", to_user_id: 8223456789,
  };
  for (const [key, value] of Object.entries(values)) {
    const parsed = sendInputSchema.safeParse({ type: "BROADCAST", body: "hi", [key]: value });
    assert.equal(parsed.success, true, `a stray \`${key}\` must not make a valid input invalid`);
    assert.ok(parsed.success && !(key in parsed.data), `\`${key}\` must not survive validation`);
  }
});

test("TypeScript's SendToolInput type structurally forbids a `from` field (compile-time excess-property check)", () => {
  // If `from` ever became a valid SendToolInput property, `tsc` would fail this build with
  // "Unused '@ts-expect-error' directive" (TS2578), turning a silent regression into a hard compile
  // failure that `npm test` (= `tsc -b && node --test ...`) cannot pass around.
  // @ts-expect-error `from` must never be assignable to SendToolInput — it is always stamped server-side.
  const spoofed: SendToolInput = { type: "REQUEST", to: "@attacker-agent", body: "hi", from: "@attacker-agent" };
  assert.ok(spoofed, "reached only if compilation succeeded despite the injected `from` field");
});

// --- The four schemas parse v1's documented inputs unchanged (spec: "Four tool input schemas port
// unchanged").

const THREAD_ID = "a1b2c3d4e5f6";
const PEER = "@dev1-agent";

test("fetch accepts v1's documented input and the bare empty object", () => {
  assert.equal(fetchInputSchema.safeParse({}).success, true);
  assert.equal(
    fetchInputSchema.safeParse({ max_batch: 5, timeout_s: 0, mark_seen: false, force_full: true }).success,
    true,
  );
  assert.equal(fetchInputSchema.safeParse({ max_batch: 0 }).success, false, "max_batch is positive");
  assert.equal(fetchInputSchema.safeParse({ timeout_s: -1 }).success, false, "timeout_s is nonnegative");
  assert.equal(fetchInputSchema.safeParse({ mark_seen: "yes" }).success, false);
});

test("status takes no input at all and thread takes exactly one hex thread id", () => {
  assert.deepEqual(Object.keys(statusInputSchema.shape), []);
  assert.equal(statusInputSchema.safeParse({}).success, true);
  assert.equal(threadInputSchema.safeParse({ thread_id: THREAD_ID }).success, true);
  assert.equal(threadInputSchema.safeParse({ thread_id: "A1B2C3D4E5F6" }).success, false, "uppercase hex is refused");
  assert.equal(threadInputSchema.safeParse({ thread_id: "a1b2c3" }).success, false, "a short id is refused");
  assert.equal(threadInputSchema.safeParse({}).success, false);
  // The field SET of each read-only schema is pinned too, not just its accept/refuse behaviour
  // (v1:src/index.ts:29-42; spec "the field set and validation rules are identical").
  assert.deepEqual(Object.keys(fetchInputSchema.shape).sort(), ["force_full", "mark_seen", "max_batch", "timeout_s"]);
  assert.deepEqual(Object.keys(threadInputSchema.shape), ["thread_id"]);
});

test("send accepts one well-formed input of each v1 type", () => {
  // v1 accepts no thread-carrying input without an addressee: `to` is required for every type
  // except BROADCAST, REPLY and ACK included (`v1:test/tools/send.test.ts:181,404,420`).
  const accepted: Record<string, unknown>[] = [
    { type: "BROADCAST", body: "status update" },
    { type: "REQUEST", body: "please review", to: PEER },
    { type: "REPLY", body: "on it", to: PEER, thread: THREAD_ID },
    { type: "ACK", body: "acknowledged", to: PEER, thread: THREAD_ID },
    { type: "RESOLVED", body: "done", to: PEER, thread: THREAD_ID, basis: "work-confirmed" },
    { type: "RESOLVED", body: "done", to: PEER, thread: THREAD_ID, basis: "human-approved", approval_ref: "pr-123" },
  ];
  for (const input of accepted) {
    assert.equal(sendInputSchema.safeParse(input).success, true, `expected to accept ${JSON.stringify(input)}`);
  }
});

test("send refuses every cross-field violation v1's refinements encode", () => {
  // Each case isolates exactly ONE violation, so a failure names the rule that broke.
  const refused: Array<[string, Record<string, unknown>]> = [
    ["`to` is forbidden for BROADCAST", { type: "BROADCAST", body: "hi", to: PEER }],
    ["`to` is required for REQUEST", { type: "REQUEST", body: "hi" }],
    ["`to` is required for REPLY too", { type: "REPLY", body: "hi", thread: THREAD_ID }],
    ["`thread` is forbidden for BROADCAST", { type: "BROADCAST", body: "hi", thread: THREAD_ID }],
    ["`thread` is forbidden for REQUEST", { type: "REQUEST", body: "hi", to: PEER, thread: THREAD_ID }],
    ["`thread` is required for REPLY", { type: "REPLY", body: "hi", to: PEER }],
    ["`thread` is required for ACK", { type: "ACK", body: "hi", to: PEER }],
    ["`basis` is required for RESOLVED", { type: "RESOLVED", body: "hi", to: PEER, thread: THREAD_ID }],
    ["`basis` is forbidden for ACK even when valid on RESOLVED", { type: "ACK", body: "hi", to: PEER, thread: THREAD_ID, basis: "work-confirmed" }],
    ["`basis` is forbidden for REPLY", { type: "REPLY", body: "hi", to: PEER, thread: THREAD_ID, basis: "work-confirmed" }],
    ["`approval_ref` is required for basis human-approved", { type: "RESOLVED", body: "hi", to: PEER, thread: THREAD_ID, basis: "human-approved" }],
    ["`approval_ref` is forbidden otherwise", { type: "RESOLVED", body: "hi", to: PEER, thread: THREAD_ID, basis: "work-confirmed", approval_ref: "pr-123" }],
    ["`body` is non-empty", { type: "BROADCAST", body: "" }],
    ["`to` matches the agent-id shape", { type: "REQUEST", body: "hi", to: "dev1-agent" }],
    ["`thread` is 12 lowercase hex", { type: "REPLY", body: "hi", to: PEER, thread: "nope" }],
    ["`type` is one of the five wire types", { type: "PING", body: "hi", to: PEER }],
  ];
  for (const [why, input] of refused) {
    assert.equal(sendInputSchema.safeParse(input).success, false, `expected to refuse: ${why}`);
  }
});

test("a whitespace-only `approval_ref` does not satisfy the human-approved rule", () => {
  const input = { type: "RESOLVED", body: "done", to: PEER, thread: THREAD_ID, basis: "human-approved", approval_ref: "   " };
  assert.equal(sendInputSchema.safeParse(input).success, false);
});
