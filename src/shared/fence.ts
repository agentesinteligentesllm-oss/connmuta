/**
 * Provenance: telegram-agent-bus src/tools/fetch.ts:43-63 @ bf8f365 — verdict: SEAM (D-08).
 * v1 body sha256: 68e241b22383bf6a9ec4a9d112b1960fe4c9c6d00fe2c6f03644f47a978be878   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: (1) the opening tag carries the D-15 origin attributes `project_id`/`agent_id`/`user_id`;
 * (2) every attribute value is escaped, so it can neither close the opening tag early nor inject a
 * second attribute (PT-14); (3) the label's leading JSDoc restored verbatim from
 * `v1:src/tools/fetch.ts:35-42`, the comment block immediately above the vendored range.
 */

/**
 * ADR-06 layer 7 (untrusted-input framing): every peer-authored `body` returned to the
 * caller — `needs_action` and `log` entries — is wrapped in this delimited, labelled block
 * before it ever reaches the agent's context, so it reads as data from a peer, never as an
 * instruction. In `waiting_on_peer` the decision is made per entry by AUTHORSHIP: this bridge's
 * own opening prose is already trusted and stays raw, while an inbound thread's opening was
 * written by a peer and is fenced like any other peer text.
 */
export const UNTRUSTED_BLOCK_LABEL = "UNTRUSTED-PEER-INPUT";

/** Who a fenced body came from, taken from the binding and the verified sender. */
export interface FenceOrigin {
  project_id: string;
  agent_id: string;
  user_id: number;
}

/**
 * Escapes one opening-tag attribute value: `&` first, then `<`, then `"`. The origin label is what
 * tells a reading agent WHO a fenced body came from (PT-14), so it must be as unforgeable as the
 * fence itself: a value carrying `"` could otherwise inject a second attribute — a forged `user_id`
 * — and one carrying `<` could close the opening tag early, dressing the rest of the body up as
 * fence structure. `&` goes first, or the ampersands the other two introduce get escaped twice.
 */
function escapeAttribute(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/**
 * Wraps peer-authored text in the layer-7 fence, escaping the one character every tag needs.
 *
 * This was raw concatenation until the v0.3.0 audit (ADR-12). A peer body containing
 * `</UNTRUSTED-PEER-INPUT>` closed the fence early, and everything after it reached the reading
 * agent as free-standing text — indistinguishable from trusted tool output, in a session that also
 * holds Bash, Edit and git. The control was forgeable by exactly the party it exists to quarantine.
 *
 * Escaping `<` rather than stripping the known tags is deliberate: a tag of ANY shape requires a
 * `<`, so removing that one character makes the fence unforgeable by construction instead of by
 * enumerating the delimiters we happened to anticipate. `&lt;` is the same escape the Telegram HTML
 * plane already uses (`escapeHtml` in envelope.ts), so peers read a familiar form.
 *
 * D-15 extends the opening tag with the origin the daemon knows from its binding and from the
 * verified Telegram sender. Each value goes through {@link escapeAttribute} for the same reason the
 * body goes through its escape: a label the peer can rewrite is not a label.
 *
 * The invariant this guarantees — and the one `assertFenceIsSound` in the tests pins — is that the
 * wrapped output holds exactly one opening tag, exactly one closing tag, and no raw `<` other than
 * those two delimiters: the body's is escaped, and so is every attribute value's on the opening tag.
 */
export function wrapUntrusted(body: string, origin: FenceOrigin): string {
  const attributes =
    `project_id="${escapeAttribute(origin.project_id)}"` +
    ` agent_id="${escapeAttribute(origin.agent_id)}"` +
    ` user_id="${escapeAttribute(origin.user_id)}"`;
  return `<${UNTRUSTED_BLOCK_LABEL} ${attributes}>${body.replace(/</g, "&lt;")}</${UNTRUSTED_BLOCK_LABEL}>`;
}
