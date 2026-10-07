import { spawn } from "node:child_process";

import {
	HARNESS_DEFAULT_ARGS,
	HARNESS_ENV_ALLOW_LIST,
	HARNESS_NAMES,
	MAX_TURN_OUTPUT_CHARS,
	REFUSED_ARGUMENTS,
	SEND_PROOF_PROFILES,
	VALUE_LESS_ARGUMENTS,
	WAKE_KILL_GRACE_MS,
	WAKE_TURN_TIMEOUT_MS,
	type HarnessName,
} from "./constants.js";
import type { LadderEntry } from "./ladder.js";

/**
 * The harness adapter (`runner/harness.ts`; ADR-0032 R2/R7, PT-37; THREAT-MODEL T24). This is the only place
 * in the whole product that starts another program, and it is deliberately the smallest surface that can do
 * it:
 *
 *  - **a closed executable set.** The executable is always one of {@link HARNESS_NAMES}; no field of the
 *    ladder record, no peer message and no CLI flag can name a different binary. The record may add
 *    *arguments* (`harness_args`), never an executable, an interpreter or a shell. And those arguments are
 *    classified by **shape** before the profile is appended (ADR-0037): a flag that takes a value must be
 *    written `--name=value`, a bare flag is accepted only when it is on {@link VALUE_LESS_ARGUMENTS}, and
 *    anything else — a positional, `@file` included — is refused. A `--name=value` token is self-contained,
 *    so it cannot consume the profile's first element; the shape rule makes the swallow unrepresentable
 *    instead of trying to enumerate every host flag that could cause it.
 *  - **no shell, ever.** `spawn(bin, argv, { shell: false })` with the prompt as the LAST argv element. There
 *    is no string concatenation and no parsing step, so a peer-controlled thread id or agent name is inert
 *    data rather than syntax. A harness that cannot be started without a shell (a Windows `.cmd` shim, for
 *    example) is **refused**, not accommodated: falling back to a shell is exactly the RCE path this design
 *    exists to avoid (T24).
 *  - **an environment allow-list.** The child inherits only {@link HARNESS_ENV_ALLOW_LIST}. The satellite must
 *    not hand a woken turn the operator's tokens, keys or IDE variables, and it holds none of its own.
 *  - **a confined working directory.** `cwd` is the bound project's own directory, resolved by the same
 *    walk-up the thin client uses.
 *  - **a send-proof tool profile.** Every woken turn is started under {@link SEND_PROOF_PROFILES}: no shell
 *    and no extension surface, so no `conmuta_*` tool and no raw IPC. A level or harness with no verified
 *    profile is **refused** (`profile_unavailable`), never started with the harness's full toolset
 *    (Director's order, 2026-10-05: no headless turn may send anything, directly or indirectly).
 *  - **a bounded turn.** Ten minutes, named in `./constants.ts`, then `SIGTERM` and, after a grace period,
 *    `SIGKILL`. One hung harness therefore cannot hold the binding's single in-flight slot forever.
 *  - **no permissions it grants.** This module writes no settings file and declares no permission: the
 *    harness's own configuration decides what its tools may do, and the runner never touches it (CONSTITUTION
 *    §3 layer 3). The prompt states the profile; the argv and the environment are what bound it.
 */

export interface HarnessSpec {
	readonly bin: HarnessName;
	readonly args: readonly string[];
	/** The exact argv handed to `spawn`: `args` and then the prompt, in that order and with nothing else. */
	readonly argv: readonly string[];
}

export type HarnessRefusalReason =
	| "harness_unknown"
	| "arguments_refused"
	| "argument_shape_invalid"
	| "profile_unavailable";

export type HarnessResolution =
	| { readonly kind: "spec"; readonly spec: HarnessSpec }
	| { readonly kind: "refused"; readonly reason: HarnessRefusalReason };

/**
 * Whether one argument is refused. Equality alone is not enough: the CLI accepts `--name=value`, and a short
 * flag can carry its value attached or in the same argv element (`-cCMD`, `-eval 1`), so an equality check
 * would let `--dangerously-skip-permissions=true` and `--command=sh` through. Both judgment-day judges of this
 * phase found that gap, which is why this helper exists and is tested directly.
 */
export function isRefusedArgument(arg: string): boolean {
	return REFUSED_ARGUMENTS.some((token) =>
		arg === token || arg.startsWith(`${token}=`) || (!token.startsWith("--") && arg.startsWith(token)),
	);
}

/**
 * Whether one **record** argument has an accepted shape (ADR-0037). A token containing `=` is
 * self-contained — `--name=value` cannot consume the next argv element — so it is accepted. A bare token
 * beginning with `-` is accepted only when it is on {@link VALUE_LESS_ARGUMENTS}, the named allow-list of
 * flags documented as taking no value. Everything else is refused: a bare value-consuming flag swallows the
 * first token of the appended send-proof profile, and a positional (a bare token, `@file` included) is
 * exactly the token whose meaning depends on the host's parse.
 *
 * This is orthogonal to {@link isRefusedArgument}: the deny-list refuses tokens by name and stays live, the
 * shape rule refuses a *form* the deny-list could never enumerate. It applies to a record's `harness_args`
 * only — {@link HARNESS_DEFAULT_ARGS} carries bare tokens (`-p`, `exec`, `run`) that are part of the closed
 * executable contract, not operator input.
 */
export function isAcceptedRecordArgumentShape(arg: string): boolean {
	if (arg.includes("=")) return true;
	return arg.startsWith("-") && VALUE_LESS_ARGUMENTS.includes(arg);
}

/**
 * The arguments that make a woken turn **send-proof**, or `null` when no verified profile covers this
 * (level, harness) pair. Only `wake` has one: `autopilot` exists to run a shell, and a shell can always
 * send, so it has none and is refused (see {@link SEND_PROOF_PROFILES}, `runner/constants.ts`).
 */
function sendProofProfile(level: LadderEntry["level"], bin: HarnessName): readonly string[] | null {
	return level === "wake" ? SEND_PROOF_PROFILES[bin] : null;
}

/**
 * Resolves a ladder entry into an executable argv, or refuses. `arguments_refused` is the interpreter escape
 * hatch: an argument that would hand the harness a command string of its own (`-c`, `eval`, …), that would
 * turn its own permission system off, or that would widen the send-proof profile this function appends is
 * refused outright, because any of them makes the closed-executable rule meaningless. It is checked first,
 * over the record's own arguments and the harness defaults alike, so a named refusal always wins.
 * `argument_shape_invalid` is ADR-0037's second, orthogonal check, applied to the **record's**
 * `harness_args` only: every entry must be self-contained (`--name=value`) or a bare flag on the named
 * value-less allow-list, so a record cannot end in a value-consuming flag that swallows the profile's first
 * token, and a positional (`@file` included) is refused by the same rule. `profile_unavailable` is the
 * fail-closed answer for a level or harness with no verified send-proof profile: no turn starts.
 */
export function resolveHarnessSpec(entry: LadderEntry, prompt: string): HarnessResolution {
	if (!(HARNESS_NAMES as readonly string[]).includes(entry.harness)) {
		return { kind: "refused", reason: "harness_unknown" };
	}
	const bin = entry.harness as HarnessName;
	const operatorArgs = [...HARNESS_DEFAULT_ARGS[bin], ...(entry.harness_args ?? [])];
	for (const arg of operatorArgs) {
		if (isRefusedArgument(arg)) {
			return { kind: "refused", reason: "arguments_refused" };
		}
	}
	// The shape rule is a property of the RECORD, not of `HARNESS_DEFAULT_ARGS`: the defaults carry bare
	// tokens (`-p`, `exec`, `run`) that the closed-executable contract defines, so exempting them here is what
	// keeps every harness startable instead of refusing all four.
	for (const arg of entry.harness_args ?? []) {
		if (!isAcceptedRecordArgumentShape(arg)) {
			return { kind: "refused", reason: "argument_shape_invalid" };
		}
	}
	const profile = sendProofProfile(entry.level, bin);
	if (profile === null) {
		return { kind: "refused", reason: "profile_unavailable" };
	}
	// The profile is appended LAST, so it is the tool selection the harness actually applies.
	const args = [...operatorArgs, ...profile];
	return { kind: "spec", spec: { bin, args, argv: [...args, prompt] } };
}

/** The `spawn` options this module ever passes. A closed shape, so no caller can widen them. */
export interface SpawnOptionsLike {
	readonly shell: false;
	readonly cwd: string;
	readonly env: Readonly<Record<string, string>>;
	readonly stdio: readonly ["ignore", "pipe", "pipe"];
}

/** The part of `ChildProcess` this module uses. Narrow on purpose, so a test can play a harness exactly. */
export interface ChildLike {
	on(event: "error", listener: (err: Error) => void): unknown;
	on(event: "close", listener: (code: number | null, signal: string | null) => void): unknown;
	kill(signal?: NodeJS.Signals): boolean;
	readonly stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
	readonly stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
}

export type SpawnImpl = (bin: string, argv: readonly string[], options: SpawnOptionsLike) => ChildLike;

export type TurnOutcome =
	| { readonly kind: "exited"; readonly code: number | null }
	| { readonly kind: "timed_out" }
	| { readonly kind: "aborted" }
	| { readonly kind: "unavailable"; readonly detail: string };

export interface RunTurnInput {
	readonly spec: HarnessSpec;
	readonly cwd: string;
	readonly signal?: AbortSignal;
}

export interface RunTurnDeps {
	readonly spawnImpl?: SpawnImpl;
	/** Defaults to `process.env`; only the allow-listed keys are handed to the child. */
	readonly env?: NodeJS.ProcessEnv;
	readonly timeoutMs?: number;
	readonly killGraceMs?: number;
	/** Every forwarded chunk of the turn's own stdout/stderr, already capped. Defaults to the runner's stderr. */
	readonly onOutput?: (chunk: string) => void;
}

/** The one real spawn site. The cast is the narrow-interface boundary: `ChildProcess` satisfies the two
 * events, `kill`, `stdout` and `stderr` this module uses, and nothing here touches the rest of it. */
const realSpawn: SpawnImpl = (bin, argv, options) =>
	spawn(bin, [...argv], {
		shell: false,
		cwd: options.cwd,
		env: { ...options.env },
		stdio: ["ignore", "pipe", "pipe"],
	}) as unknown as ChildLike;

/** The allow-listed subset of `source`, with no key present as `undefined`. */
export function confinedEnv(source: NodeJS.ProcessEnv): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of HARNESS_ENV_ALLOW_LIST) {
		const value = source[key];
		if (typeof value === "string" && value.length > 0) env[key] = value;
	}
	return env;
}

/**
 * Starts one turn and resolves once it is over — exited, timed out, aborted or unavailable. Never rejects: a
 * caller deciding what to record must not have to distinguish a throw from an outcome.
 */
export async function runTurn(deps: RunTurnDeps, input: RunTurnInput): Promise<TurnOutcome> {
	// An already-aborted signal starts nothing at all. Checking here (not only after the spawn) is what makes
	// "nothing was started" true rather than "something was started and immediately killed" — and it avoids the
	// listener gap an early return after a spawn would leave behind (a spawn that fails asynchronously would
	// emit `error` with nobody listening). One judge found the contradiction between this guarantee and the
	// code; the check now leads.
	if (input.signal?.aborted) {
		return { kind: "aborted" };
	}

	const spawnImpl = deps.spawnImpl ?? realSpawn;
	const timeoutMs = deps.timeoutMs ?? WAKE_TURN_TIMEOUT_MS;
	const killGraceMs = deps.killGraceMs ?? WAKE_KILL_GRACE_MS;
	const onOutput = deps.onOutput ?? ((chunk: string) => process.stderr.write(chunk));

	let forwarded = 0;
	const forward = (chunk: Buffer): void => {
		if (forwarded >= MAX_TURN_OUTPUT_CHARS) return;
		const text = chunk.toString("utf8");
		const room = MAX_TURN_OUTPUT_CHARS - forwarded;
		forwarded += text.length;
		onOutput(text.slice(0, room));
	};

	return new Promise<TurnOutcome>((resolve) => {
		let settled = false;
		let child: ChildLike | undefined;
		let timeoutTimer: NodeJS.Timeout | undefined;
		let killTimer: NodeJS.Timeout | undefined;
		const finish = (outcome: TurnOutcome): void => {
			if (settled) return;
			settled = true;
			if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
			if (killTimer !== undefined) clearTimeout(killTimer);
			input.signal?.removeEventListener("abort", onAbort);
			resolve(outcome);
		};

		const onAbort = (): void => {
			child?.kill("SIGTERM");
			// A harness that ignores SIGTERM must not survive the runner. The escalation is armed but never
			// waited for (shutdown must not be delayed by the grace period) and is `unref`ed so a pending
			// escalation never holds the process open after everything else has stopped.
			if (child !== undefined) {
				const escalation = setTimeout(() => child?.kill("SIGKILL"), killGraceMs);
				escalation.unref?.();
			}
			finish({ kind: "aborted" });
		};

		timeoutTimer = setTimeout(() => {
			child?.kill("SIGTERM");
			killTimer = setTimeout(() => {
				child?.kill("SIGKILL");
				finish({ kind: "timed_out" });
			}, killGraceMs);
		}, timeoutMs);

		try {
			child = spawnImpl(input.spec.bin, input.spec.argv, {
				shell: false,
				cwd: input.cwd,
				env: confinedEnv(deps.env ?? process.env),
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (err) {
			// A refused launch (a Windows `.cmd` shim, a missing interpreter) surfaces here or as `error`
			// below. Either way it is `unavailable` — never a shell fallback.
			finish({ kind: "unavailable", detail: err instanceof Error ? err.message : "spawn refused" });
			return;
		}

		if (input.signal?.aborted) {
			onAbort();
			return;
		}
		const started = child;
		started.stdout?.on("data", forward);
		started.stderr?.on("data", forward);
		started.on("error", (err: Error) => finish({ kind: "unavailable", detail: err.message }));
		started.on("close", (code: number | null) => {
			if (settled) return;
			finish(settledOutcome(killTimer !== undefined, code));
		});
		input.signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/** A close after the timeout path started is a timeout, not an ordinary exit: the two are different facts. */
function settledOutcome(killedByTimeout: boolean, code: number | null): TurnOutcome {
	return killedByTimeout ? { kind: "timed_out" } : { kind: "exited", code };
}
