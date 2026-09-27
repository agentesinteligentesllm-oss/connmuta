import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runOfflineDoctor } from "../../src/doctor/offline.js";
import { createFileFallbackStore } from "../../src/secret-store/file-fallback.js";

/**
 * `doctor/offline.ts` (design.md §9.1, spec.md "Offline tiers make zero network calls"; tasks.md
 * 14.3). The runtime half of the zero-network pin: `globalThis.fetch` and `http.request` are replaced
 * with throwing spies for the duration of one run, restored in `finally` — the same monkey-patch
 * discipline `test/cli/main.test.ts`'s own `process.version` overrides already use, applied here to
 * the two network primitives design.md §9.1 names, since `doctor/offline.ts` has no injection seam for
 * either (it must never need one).
 */

const BOT_ID = "900000777";
const FIXTURE_TOKEN = `${BOT_ID}:${"A".repeat(35)}`;

function withTempHome(run: (homeDir: string) => void): void {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-doctor-offline-"));
	try {
		run(homeDir);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
}

test("runOfflineDoctor makes zero network calls and never reads the stored token, even though a binding's token exists", async () => {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-doctor-offline-"));
	try {
		// A bound project with a stored token — spec.md's own scenario setup.
		const store = createFileFallbackStore(homeDir);
		await store.set(BOT_ID, FIXTURE_TOKEN);

		let getCallCount = 0;
		const realGet = store.get.bind(store);
		store.get = async (botId: string) => {
			getCallCount += 1;
			return realGet(botId);
		};

		let fetchCallCount = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			fetchCallCount += 1;
			throw new Error("doctor/offline.ts must never call fetch");
		}) as typeof globalThis.fetch;

		let httpRequestCallCount = 0;
		const originalHttpRequest = http.request;
		http.request = (() => {
			httpRequestCallCount += 1;
			throw new Error("doctor/offline.ts must never call http.request");
		}) as typeof http.request;

		try {
			const findings = runOfflineDoctor({ homeDir });
			assert.ok(findings.length > 0, "expected at least one finding");
		} finally {
			globalThis.fetch = originalFetch;
			http.request = originalHttpRequest;
		}

		assert.equal(fetchCallCount, 0, "fetch must never be called by the offline tiers");
		assert.equal(httpRequestCallCount, 0, "http.request must never be called by the offline tiers");
		assert.equal(getCallCount, 0, "the secret store's get() must never be called for the stored token");

		// The token is genuinely readable through the real store — proving the zero calls above are
		// because the offline tiers never reach for it, not because the fixture is broken.
		assert.equal(await realGet(BOT_ID), FIXTURE_TOKEN);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
});

test("runOfflineDoctor returns the system tier's findings followed by the registry tier's, in that fixed order", () => {
	withTempHome((homeDir) => {
		const findings = runOfflineDoctor({ homeDir });
		const ids = findings.map((f) => f.id);
		assert.deepEqual(
			ids,
			[
				"node-floor",
				"launcher-paths",
				"home-writable",
				"ledger",
				"daemon-lock",
				"spawn-lock",
				"home-acl",
				"secrets-acl",
				// No registry.json exists in this fresh temp home, so the registry tier reports exactly
				// one parse-level finding (PR-15's own `checks/registry.ts`) and nothing further.
				"registry-parse-unreadable",
			],
		);
	});
});
