import { createFileFallbackStore } from "./file-fallback.js";
import { createKeyringStore } from "./keyring.js";
import { redactTokenShapes } from "./redaction.js";
import type { SecretStore } from "./types.js";

/**
 * The store-selection probe (`secret-store/index.ts`, design §6, PT-09).
 *
 * Runs once, at daemon start, before any binding is activated: it writes a value to a probe account
 * in the keychain, reads it back, and removes it again. A round trip — not the presence of the
 * `@napi-rs/keyring` native binding — is what decides, because the failure this guards against is a
 * credential store that exists and refuses to work (a locked Linux keyring, a headless CI runner);
 * loading the binding successfully says nothing about that. On success the keyring store is live; on
 * any failure the ACL'd file fallback is live and `secret_store_fallback` is reported, so `status`
 * shows the operator which store holds the tokens (design §6's last sentence).
 *
 * **New code, not vendored** (design §12 has no row for `secret-store/*`), so the module begins with
 * its imports and carries no `Provenance:` header.
 *
 * **The condition travels in the return value, not into the ledger.** The condition store lives in
 * `ledger/conditions-store.ts`, and this unit does not depend on the ledger (design §5's component
 * table gives `secret-store` exactly one edge, to `shared`). The daemon's composition root owns the
 * ledger handle and raises what {@link SecretStoreSelection} reports — the same shape the probe
 * already needs in order to explain itself.
 *
 * **The keyring is injectable, and that is what makes PT-09's forced-fallback half testable.** The
 * failure branch cannot be reached honestly on a machine whose credential store works, and cannot be
 * made to fail deterministically on one where it does not; injecting the probe target is what lets
 * `test/secret-store/index.test.ts` exercise both verdicts against the real fallback file. The
 * default is the real adapter, so a caller that passes nothing gets the production path.
 *
 * **The reason is redacted before it leaves this function.** It is the one string here that came
 * from outside (the keychain backend's own error text) and it is destined for a log line and a
 * condition detail, which is precisely the sink PT-08 covers.
 */

/**
 * The condition name `status` renders when the fallback store is live (design §6).
 *
 * The daemon must raise the name this constant spells; the ledger's own `ConditionName` union is
 * extended where the daemon raises it, not here, because this unit has no ledger edge.
 */
export const SECRET_STORE_FALLBACK_CONDITION = "secret_store_fallback";

/**
 * The probe account's bot id (design §6's "probe account").
 *
 * The keyring adapter prefixes `bot:`, so this is the account `bot:__probe__`; it can never collide
 * with a real binding, whose id is numeric, and it is removed again by every probe — successful or
 * not.
 */
export const KEYRING_PROBE_BOT_ID = "__probe__";

/**
 * The value the probe writes and reads back.
 *
 * Deliberately **not** token-shaped: it is stored in the OS keychain, and a probe whose own payload
 * looked like a bot token would be a token-shaped string in a place no redactor covers.
 */
const PROBE_VALUE = "conmuta-keyring-probe";

/**
 * The refusal the probe raises when the keychain accepts the write but does not return it.
 *
 * A silent write is the failure a plain `try`-the-native-call probe would miss: the API answered,
 * no error was raised, and the token would have gone nowhere.
 */
export const KEYRING_PROBE_MISMATCH_MESSAGE =
	"secret-store: the keyring probe wrote a value and read back a different one, so the credential store silently discards writes (design §6, PT-09).";

/** What the probe decided: the live store, and — when the keychain was refused — why. */
export interface SecretStoreSelection {
	/** The store the daemon uses for this whole run. */
	readonly store: SecretStore;
	/**
	 * The condition the daemon must raise when the keychain was refused; absent on a successful probe.
	 *
	 * Present exactly when `store.kind === "file"`.
	 */
	readonly condition?: typeof SECRET_STORE_FALLBACK_CONDITION;
	/** Why the keychain was refused, for the condition's detail and the startup log; absent on success. */
	readonly fallbackReason?: string;
}

/** What {@link selectSecretStore} accepts besides the daemon home. */
export interface SelectSecretStoreOptions {
	/** The keyring to probe; defaults to the real `@napi-rs/keyring` adapter. Injectable for tests. */
	readonly keyring?: SecretStore;
}

/**
 * Probes the keychain and returns the store the daemon should use, with the fallback condition when
 * the keychain was refused.
 *
 * Never throws for an unavailable keychain: an unusable credential store is a decision this function
 * makes, not an error it propagates — that is the whole point of PT-09's fallback scenario.
 */
export async function selectSecretStore(
	homeDir: string,
	options: SelectSecretStoreOptions = {},
): Promise<SecretStoreSelection> {
	const keyring = options.keyring ?? createKeyringStore();

	try {
		await keyring.set(KEYRING_PROBE_BOT_ID, PROBE_VALUE);
		const readBack = await keyring.get(KEYRING_PROBE_BOT_ID);
		if (readBack !== PROBE_VALUE) {
			throw new Error(KEYRING_PROBE_MISMATCH_MESSAGE);
		}
	} catch (error) {
		await discardProbeEntry(keyring);
		return {
			store: createFileFallbackStore(homeDir),
			condition: SECRET_STORE_FALLBACK_CONDITION,
			fallbackReason: redactTokenShapes(describeError(error)),
		};
	}

	await discardProbeEntry(keyring);
	return { store: keyring };
}

/**
 * Removes the probe entry, on both verdicts.
 *
 * Best-effort by design: a probe entry that cannot be deleted is not a reason to refuse a store that
 * just round-tripped, and it holds no token — the next probe overwrites it. Removing it on the
 * failure path as well keeps a half-written entry from a store that failed mid-write out of the
 * keychain.
 */
async function discardProbeEntry(keyring: SecretStore): Promise<void> {
	try {
		await keyring.delete(KEYRING_PROBE_BOT_ID);
	} catch {
		// Documented above: nothing to do, and nothing worth refusing the store over.
	}
}

/** The message of an unknown thrown value, for the fallback reason. */
function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
