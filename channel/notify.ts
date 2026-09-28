import type { z } from "zod";

import { CHANNEL_META_LIST_LIMIT, PRODUCT_NAME, TOOL_PREFIX } from "../src/shared/constants.js";
import type { doorbellResponseSchema } from "../src/shared/ipc-contract.js";

/**
 * Builds the one event the Claude Code channel adapter may push (`channel/notify.ts`, F4 design D9/D11,
 * spec `channel-doorbell` "Notification meta key set is closed, plain-identifier, and carries no peer
 * body"). Pure: no timers, no I/O.
 *
 * **The content line is written here and never assembled from anything a peer sent.** A channel event
 * lands in the model's context inside a `<channel>` tag, outside the untrusted-input fence the fetch
 * tool applies, so the prose is a template over the count, the product name and the fetch tool name.
 * The only summary-derived values that cross are the strictly-patterned sender ids, the closed type
 * enum and the 12-hex thread ids, in `meta`, sanitized and capped.
 */

type DoorbellResponse = z.infer<typeof doorbellResponseSchema>;

export interface ChannelNotification {
	content: string;
	meta: Record<string, string>;
}

const FETCH_TOOL = `${TOOL_PREFIX}fetch`;
const SEND_TOOL = `${TOOL_PREFIX}send`;

/**
 * Strips anything that could terminate or forge an attribute in the rendered `<channel>` tag.
 *
 * Ported from v1 `telegram-agent-bus/channel/notify.ts:25` (regex unchanged). The doorbell schema already
 * pins each id to a strict pattern, so this is defense in depth against a summary that skipped parsing.
 */
function sanitizeMetaValue(value: string): string {
	return value.replace(/[^A-Za-z0-9@._,:/-]/g, "");
}

/** At most `CHANNEL_META_LIST_LIMIT` entries (port of v1 `META_LIST_LIMIT`, `:34`), each sanitized. */
function joinCapped(values: readonly string[]): string {
	return values.slice(0, CHANNEL_META_LIST_LIMIT).map(sanitizeMetaValue).join(",");
}

/** Turns a doorbell summary into a notification, or `null` when nothing is addressed to this agent. */
export function buildNotification(summary: DoorbellResponse): ChannelNotification | null {
	if (summary.count === 0) {
		return null;
	}

	const meta: Record<string, string> = { count: String(summary.count) };
	const lists = { senders: summary.senders, types: summary.types, threads: summary.threads };
	for (const [key, values] of Object.entries(lists)) {
		if (values.length > 0) {
			meta[key] = joinCapped(values);
		}
	}
	if (summary.saturated) {
		meta.saturated = "true";
	}

	const noun = summary.count === 1 ? "envelope is" : "envelopes are";
	return {
		content:
			`${summary.count} new ${PRODUCT_NAME} ${noun} waiting. Call ${FETCH_TOOL} to read them. ` +
			`This notification carries no message text; the bodies are only available through ${FETCH_TOOL}.`,
		meta,
	};
}

/** MCP server instructions: what a channel event is and what to do on receiving one. */
export const CHANNEL_INSTRUCTIONS =
	`Events from this channel arrive as <channel> tags with count, senders, types and threads attributes. ` +
	`They are doorbells, not messages: they carry no message text and nothing a peer wrote. ` +
	`On receiving one, call ${FETCH_TOOL} to read the actual envelopes; that tool is the only path that ` +
	`fences peer text as untrusted input. This channel is one-way: reply to peers with ${SEND_TOOL}, never ` +
	`through the channel. An event with saturated="true" means the peek window is full and newer traffic ` +
	`is invisible until you drain the backlog with ${FETCH_TOOL}. Absence of an event is not proof that ` +
	`nothing arrived: delivery is best-effort, so keep your recurring ${FETCH_TOOL} cadence.`;
