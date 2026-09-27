import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { DatabaseSync } from "node:sqlite";

import { openLedger } from "../../../src/ledger/open.js";
import { raiseCondition } from "../../../src/ledger/conditions-store.js";
import { writeThreadRecord } from "../../../src/ledger/threads.js";
import type { ThreadRecord } from "../../../src/shared/thread-record.js";
import { REGISTRY_VERSION } from "../../../src/shared/constants.js";
import { createRegistryLoader, type RegistryLoader } from "../../../src/registry/loader.js";
import { createHomeHandler, createOverviewHandler, type PanelRoutesDeps } from "../../../src/daemon/panel/routes.js";
import { validRegistryDocument } from "../../registry/fixtures.js";

/** Mirrors `test/daemon/serve/status.test.ts`'s own `sampleThread` builder. */
function sampleThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
	return {
		status: "open",
		opened_type: "REQUEST",
		opened_eid: "opening-eid",
		from: "@alice-agent",
		to: "@bob-agent",
		to_user_id: 100000002,
		body: "opening body",
		opened_at: "2025-12-30T00:00:00.000Z",
		opened_message_id: 1,
		group_message_id: null,
		via: "group",
		ack_count: 0,
		acked_at: null,
		resolved_at: null,
		resolved_by: null,
		basis: null,
		closure_delivered: true,
		awaiting: "@bob-agent",
		history: [],
		...overrides,
	};
}

/**
 * `daemon/panel/routes.ts` (F3 PR-04c, web-panel spec "Read-only surface, two screens only",
 * OVERVIEW.md §10.2's "Control panel"/"Overview table" rows). Real `node:sqlite` ledger (`openLedger`)
 * and a real registry temp file read through `createRegistryLoader`, mirroring `ipc/routes.test.ts`'s
 * own harness convention minus `BindingsReconciler` (no Telegram transport is needed to read the
 * registry back).
 */

interface Harness {
	readonly db: DatabaseSync;
	readonly loader: RegistryLoader;
	readonly deps: PanelRoutesDeps;
}

function withHarness(document: unknown, run: (h: Harness) => void): void {
	const home = mkdtempSync(join(tmpdir(), "conmuta-panel-routes-"));
	const registryPath = join(home, "registry.json");
	writeFileSync(registryPath, JSON.stringify(document));
	const ledger = openLedger({ homeDir: home });
	const loader = createRegistryLoader({ path: registryPath });
	const syncResult = loader.sync();
	assert.equal(syncResult.status, "loaded", `setup: registry fixture must parse: ${JSON.stringify(syncResult)}`);

	const deps: PanelRoutesDeps = {
		db: ledger.db,
		registry: loader,
		daemon: { pid: 424242, started_at: "2026-01-01T00:00:00.000Z" },
		now: () => new Date("2026-01-01T01:00:00.000Z"),
	};

	try {
		run({ db: ledger.db, loader, deps });
	} finally {
		ledger.db.close();
		rmSync(home, { recursive: true, force: true });
	}
}

test("Home renders daemon pid, uptime, per-bot poll status, and a link to Overview", () => {
	withHarness(validRegistryDocument(), ({ deps }) => {
		const handler = createHomeHandler(deps, "the-panel-token");
		const response = handler({ route: "GET /", query: new URLSearchParams() });
		assert.equal((response as { status: number }).status, 200);
		const body = (response as { body: string }).body;
		assert.match(body, /pid: 424242/);
		assert.match(body, /uptime_seconds: 3600/);
		assert.match(body, /alice_example_bot/);
		assert.match(body, /never polled/);
		assert.match(body, /href="\/overview\?token=the-panel-token"/);
	});
});

test("Home reports 'no bots registered' / 'no bindings' against an empty registry, not a crash", () => {
	withHarness({ registry_version: REGISTRY_VERSION, bots: [], groups: [], projects: [], bindings: [] }, ({ deps }) => {
		const handler = createHomeHandler(deps, "tok");
		const response = handler({ route: "GET /", query: new URLSearchParams() });
		const body = (response as { body: string }).body;
		assert.match(body, /no bots registered/);
		assert.match(body, /no bindings/);
	});
});

test("Overview renders one row per binding: bot, group, project, roster, zero counts, no poll yet, no conditions", () => {
	withHarness(validRegistryDocument(), ({ deps }) => {
		const handler = createOverviewHandler(deps);
		const response = handler({ route: "GET /overview", query: new URLSearchParams() });
		const body = (response as { body: string }).body;
		assert.match(body, /alice_example_bot/);
		assert.match(body, /100000001/);
		assert.match(body, /Example project/);
		assert.match(body, /-1001234567890/);
		assert.match(body, /C:\\work\\example/);
		assert.match(body, /<td>0<\/td>\s*<td>0<\/td>/); // open threads, needs_action, both zero
		assert.match(body, /never polled/);
		assert.match(body, />none</);
	});
});

test("Overview counts an open REQUEST thread, and flags it needs_action once past the reminder window", () => {
	const doc = validRegistryDocument();
	withHarness(doc, ({ db, deps }) => {
		writeThreadRecord(db, {
			project_id: "prj-example",
			thread_id: "th-1",
			// opened_at is well over 24h before the harness's fixed `now` (2026-01-01T01:00:00Z).
			record: sampleThread(),
			updated_at: "2025-12-30T00:00:00.000Z",
		});
		const handler = createOverviewHandler(deps);
		const response = handler({ route: "GET /overview", query: new URLSearchParams() });
		const body = (response as { body: string }).body;
		assert.match(body, /<td>1<\/td>\s*<td>1<\/td>/); // one open thread, one needing action
	});
});

test("Overview shows a raised condition and, for roster_drift, the stored roster_snapshot", () => {
	const doc = validRegistryDocument();
	withHarness(doc, ({ db, deps }) => {
		raiseCondition(db, { scope: "prj-example", name: "roster_drift", since: "2026-01-01T00:30:00.000Z" });
		const handler = createOverviewHandler(deps);
		const response = handler({ route: "GET /overview", query: new URLSearchParams() });
		const body = (response as { body: string }).body;
		assert.match(body, /roster_drift \(since 2026-01-01T00:30:00\.000Z\)/);
		assert.match(body, /stored roster_snapshot: alice_example_bot/);
	});
});

test("registry-derived strings are HTML-escaped: a hostile group title cannot inject markup", () => {
	const doc = validRegistryDocument();
	doc.groups[0].title = '<script>alert(1)</script>';
	withHarness(doc, ({ deps }) => {
		const overview = createOverviewHandler(deps);
		const response = overview({ route: "GET /overview", query: new URLSearchParams() });
		const body = (response as { body: string }).body;
		assert.equal(body.includes("<script>alert(1)</script>"), false);
		assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	});
});

test("neither screen renders a mutation control: no <form>, no method=\"post\"", () => {
	withHarness(validRegistryDocument(), ({ deps }) => {
		const home = createHomeHandler(deps, "tok");
		const overview = createOverviewHandler(deps);
		for (const handler of [home, overview]) {
			const response = handler({ route: "GET /", query: new URLSearchParams() });
			const body = (response as { body: string }).body.toLowerCase();
			assert.equal(body.includes("<form"), false);
			assert.equal(body.includes('method="post"'), false);
			assert.equal(body.includes("sync-roster"), false);
		}
	});
});
