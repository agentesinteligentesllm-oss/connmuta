/**
 * Provenance: telegram-agent-bus src/transport/dual.ts @ bf8f365 — verdict: AS-IS (D-08).
 * v1 body sha256: cf70e76ae24a3a6e5f0c1b2a48bd3de0e360fc9000a79bf96d020325a1154525   (SHA-256 of the v1 body at bf8f365, header and import block excluded)
 * Changes: none.
 */

import type { DirectTransport } from "./direct.js";
import type { GroupTransport } from "./group.js";
import { TransportError, type DualWriteResult, type SendOptions, type Transport } from "./types.js";

/**
 * Composes {@link GroupTransport} (observability) and {@link DirectTransport}
 * (delivery) into ADR-04's dual-write send:
 *
 * 1. The group post always runs FIRST, and its failure is now recorded rather
 *    than propagated (D1). The single exception is a message-level failure,
 *    which `GroupTransport` still throws — that payload would be rejected
 *    identically by every DM, so the fan-out is pointless and this method
 *    propagates with zero DM attempts (the surviving half of T3-a's ordering
 *    guarantee, still verified via the fake's call log).
 * 2. Each recipient in `recipients` is then sent a byte-identical direct DM
 *    independently. A DM failure is SOFT: it is recorded per recipient in
 *    the returned result, never thrown, and never rolls back the group post
 *    — there is no undo mechanism, since no component may delete messages
 *    (`telegram-transport`'s no-deletion requirement).
 * 3. The call rejects only when NOTHING was delivered anywhere. That is the
 *    honest definition of a failed send, and it is what makes the group's
 *    failure survivable instead of total.
 */
export class DualWriteTransport implements Transport {
  constructor(
    private readonly group: GroupTransport,
    private readonly direct: DirectTransport
  ) {}

  async send(text: string, recipients: string[], options: SendOptions = {}): Promise<DualWriteResult> {
    const groupResult = await this.group.send(text, options);

    const direct: DualWriteResult["direct"] = [];
    for (const to of recipients) {
      try {
        const result = await this.direct.send(to, text, options);
        direct.push({ to, ok: true, message_id: result.message_id });
      } catch (err) {
        direct.push({ to, ok: false, error: (err as Error).message });
      }
    }

    // Expressed as "did anything land" rather than "did everything fail". The inverted form is
    // vacuously true over an empty recipient list, which would report success for a send that
    // reached nobody at all — a real case, since a BROADCAST on a one-entry roster fans out to zero.
    const deliveredSomewhere = groupResult.ok || direct.some((outcome) => outcome.ok);
    if (!deliveredSomewhere) {
      const reasons = [groupResult.ok ? null : groupResult.error, ...direct.map((outcome) => outcome.error)]
        .filter((reason): reason is string => typeof reason === "string")
        .join("; ");
      throw new TransportError(`Nothing was delivered on either plane: ${reasons}`);
    }

    return {
      group: groupResult,
      direct,
      // A send the four humans cannot see is degraded even when every DM landed — that visibility is
      // the whole point of ADR-04's first plane, so its loss cannot read as a clean success.
      degraded: !groupResult.ok || direct.some((outcome) => !outcome.ok),
    };
  }
}
