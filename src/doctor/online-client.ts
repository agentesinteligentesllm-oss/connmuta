/**
 * The doctor's online-tier CLIENT (`doctor/online-client.ts`, design §9.2 D-44, spec `doctor` "Online
 * tier runs inside the daemon and checks live Telegram state", tasks.md 17.5). New code: design §12
 * lists no v1 range for this module — v1's doctor made every check in-process against the live token,
 * with no local daemon and no HTTP surface to call at all — so this file carries no vendoring header
 * and adds no row to `test/fixtures/v1-provenance.json`.
 *
 * Runs the client HALF of the `GET /identity` -> verify -> `POST /doctor` sequence design §9.2 defines,
 * against an ALREADY-RUNNING daemon only: {@link runOnlineDoctor} reads `run/daemon.json` and, when no
 * live daemon is found there, resolves `{status: "skipped"}` immediately — it never calls anything that
 * spawns one (design §9.1: "No daemon running: the online tier reports `skipped` and never spawns
 * one"). `readRunFile` alone is that check: it returns `null` for a missing, corrupt, or dead-pid run
 * file, with no side effect of its own.
 *
 * **Reuses `daemon/*` directly, unlike `client/*`'s own reimplementation of the identical HMAC
 * helpers.** `client/handshake.ts` and `client/run-state.ts` each reimplement pieces of
 * `daemon/ipc/handshake.ts` / `daemon/lifecycle/run-file.ts` locally, because `src/client/tsconfig.json`'s
 * `references` is `[{"path":"../shared"}]` only — no project-reference path from `client/*` to
 * `daemon/*`. This module's own `src/doctor/tsconfig.json` DOES reference `../daemon` (already needed
 * for `checks/system.ts`'s `daemon/lifecycle/lock.js` import), so `computeIdentityProof`,
 * `computeDoctorProof`, `readRunFile` and `resolveHomeDir` are imported directly here instead of
 * re-authored a third time.
 *
 * **Never imported from `doctor/offline.ts`.** This module and `daemon/ipc/doctor.ts` both reach the
 * network (`fetch`); `doctor/offline.js`'s closure must carry none of it (§9.1's zero-network pin), so
 * neither file is wired into `offline.ts` by this PR — that wiring (the `--online`/`--dm-probe` CLI
 * flags) is `doctor/main.ts`'s job, out of this PR's 4-file scope (see `main.ts:9`'s own disclosure).
 *
 * **No retry-on-re-read, unlike `client/handshake.ts`'s `performHandshake`.** That module retries once
 * against a freshly re-read run file because a session handshake is worth one extra attempt before
 * giving up. A doctor run is a one-shot diagnostic: a stale or racing run file is itself a fact worth
 * reporting as `"error"`, not silently retried past.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

import { resolveHomeDir } from "../daemon/home.js";
import { computeDoctorProof } from "../daemon/ipc/doctor.js";
import { computeIdentityProof } from "../daemon/ipc/handshake.js";
import { readRunFile, type DaemonRunPayload } from "../daemon/lifecycle/run-file.js";
import { IPC_NONCE_BYTES, IPC_REQUEST_TIMEOUT_MS } from "../shared/constants.js";
import {
	doctorResponseSchema,
	identityResponseSchema,
	IPC_LOOPBACK_HOST,
	type DoctorRequest,
	type DoctorResponse,
} from "../shared/ipc-contract.js";

/** Name of the daemon home's run-file/lock subdirectory (`daemon/home.ts`'s own convention; mirrors `doctor/checks/system.ts`'s identical private constant). */
const RUN_DIR_NAME = "run";

/** What {@link runOnlineDoctor} resolves with. See the module doc for why there is no retry between `"skipped"` and `"error"`. */
export type OnlineDoctorResult =
	| { readonly status: "skipped" }
	| { readonly status: "ok"; readonly response: DoctorResponse }
	| { readonly status: "error"; readonly message: string };

export interface RunOnlineDoctorOptions {
	/** Defaults to `~/.conmuta` via {@link resolveHomeDir}. */
	readonly homeDir?: string;
	/** Scopes the run to one bound project; required when `dmProbe` is `true` (mirrors `doctorRequestSchema`'s own cross-field rule). */
	readonly projectId?: string;
	/** Opts into the DM probe (design §9.1 D-46: off by default). */
	readonly dmProbe?: boolean;
	/** Defaults to the real `fetch`; tests inject a fake so no real network call is ever made. */
	readonly fetchImpl?: typeof globalThis.fetch;
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Constant-time equality of two lowercase-hex digests (mirrors `daemon/ipc/sessions.ts`'s identical helper). */
function hexDigestsEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "hex");
	const bufB = Buffer.from(b, "hex");
	return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Runs the online doctor tier's client half against an already-running daemon (design §9.2). Never
 * spawns a daemon: a missing or dead-pid `run/daemon.json` resolves `{status: "skipped"}` before any
 * network call.
 */
export async function runOnlineDoctor(options: RunOnlineDoctorOptions = {}): Promise<OnlineDoctorResult> {
	if (options.dmProbe === true && options.projectId === undefined) {
		return { status: "error", message: "dmProbe requires projectId (mirrors POST /doctor's own cross-field rule)" };
	}

	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const homeDir = resolveHomeDir(options.homeDir);
	const runDir = join(homeDir, RUN_DIR_NAME);

	const runPayload: DaemonRunPayload | null = readRunFile(runDir);
	if (runPayload === null) {
		return { status: "skipped" };
	}

	const nonce = randomBytes(IPC_NONCE_BYTES).toString("hex");
	let identityRes: Response;
	try {
		identityRes = await fetchImpl(`http://${IPC_LOOPBACK_HOST}:${runPayload.port}/identity?nonce=${nonce}`, {
			signal: AbortSignal.timeout(IPC_REQUEST_TIMEOUT_MS),
		});
	} catch (err) {
		return { status: "error", message: `GET /identity failed: ${describeError(err)}` };
	}
	if (!identityRes.ok) {
		return { status: "error", message: `GET /identity answered HTTP ${identityRes.status}` };
	}

	let identityBody: unknown;
	try {
		identityBody = await identityRes.json();
	} catch (err) {
		return { status: "error", message: `GET /identity returned a body that is not valid JSON: ${describeError(err)}` };
	}
	const parsedIdentity = identityResponseSchema.safeParse(identityBody);
	if (!parsedIdentity.success) {
		return { status: "error", message: "GET /identity returned a response that does not match its schema" };
	}
	const identity = parsedIdentity.data;

	const expectedProof = computeIdentityProof(runPayload.secret, nonce);
	if (!hexDigestsEqual(expectedProof, identity.proof)) {
		return { status: "error", message: "identity proof did not verify against this run file's secret" };
	}

	const doctorRequestBody = {
		server_nonce: identity.server_nonce,
		hmac: computeDoctorProof(runPayload.secret, identity.server_nonce),
		dm_probe: options.dmProbe ?? false,
		...(options.projectId !== undefined ? { project_id: options.projectId } : {}),
	} satisfies DoctorRequest;

	let doctorRes: Response;
	try {
		doctorRes = await fetchImpl(`http://${IPC_LOOPBACK_HOST}:${runPayload.port}/doctor`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(doctorRequestBody),
			signal: AbortSignal.timeout(IPC_REQUEST_TIMEOUT_MS),
		});
	} catch (err) {
		return { status: "error", message: `POST /doctor failed: ${describeError(err)}` };
	}
	if (!doctorRes.ok) {
		return { status: "error", message: `POST /doctor answered HTTP ${doctorRes.status}` };
	}

	let doctorBody: unknown;
	try {
		doctorBody = await doctorRes.json();
	} catch (err) {
		return { status: "error", message: `POST /doctor returned a body that is not valid JSON: ${describeError(err)}` };
	}
	const parsedResponse = doctorResponseSchema.safeParse(doctorBody);
	if (!parsedResponse.success) {
		return { status: "error", message: "POST /doctor returned a response that does not match its schema" };
	}

	return { status: "ok", response: parsedResponse.data };
}
