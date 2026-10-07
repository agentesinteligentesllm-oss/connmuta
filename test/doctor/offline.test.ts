import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { runOfflineDoctor } from "../../src/doctor/offline.js";
import { runRegistryChecks } from "../../src/doctor/checks/registry.js";
import { runSystemChecks } from "../../src/doctor/checks/system.js";
import { createFileFallbackStore } from "../../src/secret-store/file-fallback.js";
import { computeClosure, bareSpecifiers } from "../security/closure.js";

/**
 * `doctor/offline.ts` (design.md §9.1, spec.md "Offline tiers make zero network calls"; tasks.md 14.3).
 *
 * **Two halves, and B-82 is why both exist.** The *behavioural* half replaces `globalThis.fetch`,
 * `http.request` and `https.request` with throwing spies for the duration of one run, restored in
 * `finally` — the same monkey-patch discipline `test/cli/main.test.ts`'s own `process.version` overrides
 * use. The *static* half enumerates the entry's import closure, because the spies can only fail on a
 * binding shape they happen to patch: B-82 found that the original spy covered `http.request` and not
 * `https.request` nor a named `import { request } from "node:http"` binding, and that the token assertion
 * next to it was **vacuous** — it spied on a `SecretStore` the test constructed and `runOfflineDoctor`
 * never receives. The closure assertions below turn both into facts about the module graph, which no
 * binding shape can route around, and they are what `offline.ts`'s own comment already promised ("design.md
 * §9.1's static half is Unit 11's job"): a dependency that is not in the closure cannot be called.
 */

const BOT_ID = "900000777";
const FIXTURE_TOKEN = `${BOT_ID}:${"A".repeat(35)}`;

/** `dist/`, two levels above this compiled test. Mirrors `test/security/channel-bundle.test.ts`'s own constant. */
const DIST_DIR = fileURLToPath(new URL("../../", import.meta.url));
const OFFLINE_ENTRY = "src/doctor/offline.js";

/** Module specifiers whose presence anywhere in the closure would make a call out possible from any binding shape. */
const NETWORK_MODULES: ReadonlySet<string> = new Set([
	"node:http",
	"node:https",
	"node:net",
	"node:dgram",
	"node:tls",
	"undici",
]);

/** The offline entry's relative-import closure as repo-relative POSIX paths, sorted. */
function offlineClosure(): string[] {
	return [...computeClosure(join(DIST_DIR, OFFLINE_ENTRY))]
		.map((file) => relative(DIST_DIR, file).split(sep).join("/"))
		.sort();
}

function withTempHome(run: (homeDir: string) => void): void {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-doctor-offline-"));
	try {
		run(homeDir);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
}

test("runOfflineDoctor makes zero network calls through either http binding, even though a binding's token exists", async () => {
	const homeDir = mkdtempSync(join(tmpdir(), "conmuta-doctor-offline-"));
	try {
		// A bound project with a stored token — spec.md's own scenario setup.
		const store = createFileFallbackStore(homeDir);
		await store.set(BOT_ID, FIXTURE_TOKEN);

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

		let httpsRequestCallCount = 0;
		const originalHttpsRequest = https.request;
		https.request = (() => {
			httpsRequestCallCount += 1;
			throw new Error("doctor/offline.ts must never call https.request");
		}) as typeof https.request;

		try {
			const findings = runOfflineDoctor({ homeDir });
			assert.ok(findings.length > 0, "expected at least one finding");
		} finally {
			globalThis.fetch = originalFetch;
			http.request = originalHttpRequest;
			https.request = originalHttpsRequest;
		}

		assert.equal(fetchCallCount, 0, "fetch must never be called by the offline tiers");
		assert.equal(httpRequestCallCount, 0, "http.request must never be called by the offline tiers");
		assert.equal(httpsRequestCallCount, 0, "https.request must never be called by the offline tiers");

		// The token is genuinely readable through the real store — proving the zero calls above are because the
		// offline tiers never reach for it, not because the fixture is broken.
		assert.equal(await store.get(BOT_ID), FIXTURE_TOKEN);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
});

test("the offline doctor's closure reaches no secret-store module, so the stored token is unreachable by construction (B-82)", () => {
	const closure = offlineClosure();

	// Guards against a walk that collapsed to the entry alone: a passing assertion over an empty or tiny set
	// would say nothing about the real module graph.
	assert.ok(closure.length >= 20, `the import walk must not collapse — it found ${closure.length} file(s)`);
	assert.ok(closure.includes(OFFLINE_ENTRY), "the entry itself must be in its own closure");
	assert.deepEqual(
		closure.filter((file) => file.startsWith("src/secret-store/")),
		[],
		"no secret-store module (and so no keyring, no file fallback, no token read) may be reachable from the offline tier — the previous assertion spied on a store the doctor was never given and could never fail",
	);
});

test("the offline doctor's closure reaches no network module, so no binding shape can make it call out (B-82)", () => {
	const reached = new Set<string>();
	for (const file of offlineClosure()) {
		for (const specifier of bareSpecifiers(readFileSync(join(DIST_DIR, file), "utf8"))) {
			if (NETWORK_MODULES.has(specifier)) {
				reached.add(specifier);
			}
		}
	}

	assert.deepEqual(
		[...reached].sort(),
		[],
		"the closure must reach no network module: a named `import { request } from \"node:http\"` binding is invisible to the runtime spies above, but it cannot exist without its module appearing here",
	);
});

test("runOfflineDoctor returns the system tier's findings followed by the registry tier's, in that fixed order", () => {
	withTempHome((homeDir) => {
		const findings = runOfflineDoctor({ homeDir });
		const ids = findings.map((f) => f.id);

		// B-82: this test's title claims the composition the tiers define, so it compares against the tiers
		// themselves. The hard-coded list below used to be the *whole* assertion, which could only prove that
		// some pinned ids appeared — never that the offline tier still composes the two halves in order.
		assert.deepEqual(
			ids,
			[...runSystemChecks({ homeDir }).map((f) => f.id), ...runRegistryChecks({ homeDir }).map((f) => f.id)],
			"the offline tier must be exactly the system tier's findings followed by the registry tier's",
		);

		// And the list stays, because it pins the *content* the composition cannot: a tier that silently
		// dropped a check would still compose cleanly against itself.
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
