import assert from "node:assert/strict";
import { test } from "node:test";

import { PANEL_TOKEN_BYTES } from "../../../src/shared/constants.js";
import { PanelTokenStore } from "../../../src/daemon/panel/token-store.js";

const PANEL_TOKEN_HEX_LENGTH = PANEL_TOKEN_BYTES * 2;
const panelTokenShape = new RegExp(`^[0-9a-f]{${PANEL_TOKEN_HEX_LENGTH}}$`);

test("a freshly constructed store carries one hex token of the expected length", () => {
  const store = new PanelTokenStore();
  assert.match(store.token, panelTokenShape);
});

test("the store's own token validates", () => {
  const store = new PanelTokenStore();
  assert.equal(store.validate(store.token), true);
});

test("a different, well-formed token is rejected", () => {
  const store = new PanelTokenStore();
  const other = new PanelTokenStore();
  assert.notEqual(store.token, other.token);
  assert.equal(store.validate(other.token), false);
});

test("a missing (empty string) candidate is rejected without throwing", () => {
  const store = new PanelTokenStore();
  assert.equal(store.validate(""), false);
});

test("a wrong-length or malformed candidate is rejected without throwing (constant-time length guard)", () => {
  const store = new PanelTokenStore();
  assert.equal(store.validate("ab"), false);
  assert.equal(store.validate("not-hex-at-all!!"), false);
});
