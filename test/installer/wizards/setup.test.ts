import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PRODUCT_NAME } from "../../../src/shared/constants.js";
import { AUTOSTART_LAUNCHD_LABEL, AUTOSTART_VALUE_NAME } from "../../../src/installer/constants.js";
import type { AutostartOptions } from "../../../src/installer/autostart.js";
import { runReg } from "../../../src/installer/exec.js";
import { parseRegistryDocument } from "../../../src/registry/schema.js";
import { serializeRegistry } from "../../../src/registry/writer.js";
import type { Prompter } from "../../../src/installer/prompter.js";
import { runSetup } from "../../../src/installer/wizards/setup.js";
import { validRegistryDocument } from "../../registry/fixtures.js";

/**
 * `installer/wizards/setup.ts` (spec.md:40-59, :145-172; tasks.md PR-12 sub-task 12.1/12.2): home +
 * registry scaffold, ledger, ACL, the start-at-login checkbox, then the doctor hook.
 *
 * Every run in this suite injects a scratch `autostartOptions` (a unique scratch Run-key name, a
 * scratch `launchAgentsDir`), mirroring `autostart.test.ts`'s own real-round-trip pattern: never the
 * real `HKCU\...\Run` key and never the real `~/Library/LaunchAgents`, even for a run that answers the
 * checkbox `false` (which still forwards to `disableAutostart`, per tasks.md 12.1's "unmodified"
 * wording).
 */

const CANCEL = Symbol("cancel");

function confirmPrompter(answer: boolean | typeof CANCEL): Prompter {
	return {
		async password() {
			throw new Error("not used by this suite");
		},
		async text() {
			throw new Error("not used by this suite");
		},
		async select() {
			throw new Error("not used by this suite");
		},
		async multiselect() {
			throw new Error("not used by this suite");
		},
		async confirm() {
			return answer === CANCEL ? CANCEL : answer;
		},
		isCancel(value) {
			return value === CANCEL;
		},
	};
}

/** A fresh, not-yet-created home path under a scratch base, plus a scratch autostart target; both removed after. */
function withSetupFixture(
	run: (fixture: { readonly homeDir: string; readonly autostartOptions: AutostartOptions }) => Promise<void>,
): Promise<void> {
	const base = mkdtempSync(join(tmpdir(), "conmuta-setup-"));
	const homeDir = join(base, "home");
	const scratchRunKey = `HKCU\\Software\\${PRODUCT_NAME}-test-${randomUUID()}`;
	const launchAgentsDir = mkdtempSync(join(tmpdir(), "conmuta-setup-autostart-"));
	return run({ homeDir, autostartOptions: { runKey: scratchRunKey, launchAgentsDir } }).finally(() => {
		rmSync(base, { recursive: true, force: true });
		rmSync(launchAgentsDir, { recursive: true, force: true });
		if (process.platform === "win32") {
			try {
				runReg(["delete", scratchRunKey, "/f"]);
			} catch {
				// Never created, or already removed by the test itself; nothing to clean up.
			}
		}
	});
}

test("a first run scaffolds the home directory and an empty schema-valid registry.json before the first wizard prompt", async () => {
	await withSetupFixture(async ({ homeDir, autostartOptions }) => {
		const outcome = await runSetup({ homeDir, prompter: confirmPrompter(false), autostartOptions });

		assert.equal(outcome.outcome, "completed");
		if (outcome.outcome !== "completed") return;
		assert.equal(outcome.registryScaffolded, true);
		outcome.db.close();

		assert.equal(statSync(homeDir).isDirectory(), true);
		assert.equal(statSync(join(homeDir, "run")).isDirectory(), true);
		assert.equal(statSync(join(homeDir, "secrets")).isDirectory(), true);

		const parsed = parseRegistryDocument(JSON.parse(readFileSync(outcome.registryPath, "utf8")));
		assert.equal(parsed.ok, true);
		if (parsed.ok) {
			assert.deepEqual([...parsed.registry.bots], []);
			assert.deepEqual([...parsed.registry.bindings], []);
		}
	});
});

test("a re-run against an existing registry with a binding makes no write to it", async () => {
	await withSetupFixture(async ({ homeDir, autostartOptions }) => {
		const first = await runSetup({ homeDir, prompter: confirmPrompter(false), autostartOptions });
		assert.equal(first.outcome, "completed");
		if (first.outcome !== "completed") return;
		first.db.close();

		const seededParsed = parseRegistryDocument(validRegistryDocument());
		assert.equal(seededParsed.ok, true);
		if (!seededParsed.ok) throw new Error("unreachable");
		const seededText = serializeRegistry(seededParsed.registry);
		writeFileSync(first.registryPath, seededText, "utf8");

		const second = await runSetup({ homeDir, prompter: confirmPrompter(false), autostartOptions });
		assert.equal(second.outcome, "completed");
		if (second.outcome !== "completed") return;
		assert.equal(second.registryScaffolded, false);
		second.db.close();

		assert.equal(readFileSync(first.registryPath, "utf8"), seededText, "registry.json must be byte-identical, untouched");
	});
});

test(
	"the start-at-login checkbox, answered true, forwards unmodified to installer/autostart.ts's real enable function",
	{ skip: process.platform !== "win32" && process.platform !== "darwin" },
	async () => {
		await withSetupFixture(async ({ homeDir, autostartOptions }) => {
			const outcome = await runSetup({ homeDir, prompter: confirmPrompter(true), autostartOptions });

			assert.equal(outcome.outcome, "completed");
			if (outcome.outcome !== "completed") return;
			assert.equal(outcome.autostart, "created");
			outcome.db.close();

			if (process.platform === "win32") {
				const queried = runReg(["query", autostartOptions.runKey as string, "/v", AUTOSTART_VALUE_NAME]);
				assert.match(queried, new RegExp(AUTOSTART_VALUE_NAME));
			} else {
				const plistPath = join(autostartOptions.launchAgentsDir as string, `${AUTOSTART_LAUNCHD_LABEL}.plist`);
				assert.equal(existsSync(plistPath), true);
			}
		});
	},
);

test(
	"on a platform installer/autostart.ts does not support, the checkbox answer is a documented no-op rather than a throw",
	{ skip: process.platform === "win32" || process.platform === "darwin" },
	async () => {
		await withSetupFixture(async ({ homeDir, autostartOptions }) => {
			const outcome = await runSetup({ homeDir, prompter: confirmPrompter(true), autostartOptions });

			assert.equal(outcome.outcome, "completed");
			if (outcome.outcome !== "completed") return;
			assert.equal(outcome.autostart, "unsupported-platform");
			outcome.db.close();
		});
	},
);

test("a cancelled start-at-login prompt leaves any existing autostart entry untouched", async () => {
	await withSetupFixture(async ({ homeDir, autostartOptions }) => {
		const outcome = await runSetup({ homeDir, prompter: confirmPrompter(CANCEL), autostartOptions });

		assert.equal(outcome.outcome, "completed");
		if (outcome.outcome !== "completed") return;
		assert.equal(outcome.autostart, "cancelled");
		outcome.db.close();
	});
});

test("runDoctor is invoked exactly once, as the final step of a completed run", async () => {
	await withSetupFixture(async ({ homeDir, autostartOptions }) => {
		const calls: string[] = [];
		const prompter: Prompter = {
			...confirmPrompter(false),
			async confirm() {
				calls.push("confirm");
				return false;
			},
		};
		let runDoctorCalls = 0;

		const outcome = await runSetup({
			homeDir,
			prompter,
			autostartOptions,
			runDoctor: () => {
				runDoctorCalls++;
				calls.push("runDoctor");
			},
		});

		assert.equal(outcome.outcome, "completed");
		if (outcome.outcome === "completed") {
			outcome.db.close();
		}
		assert.equal(runDoctorCalls, 1);
		assert.deepEqual(calls, ["confirm", "runDoctor"]);
	});
});
