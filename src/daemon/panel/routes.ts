/**
 * The panel's two read-only screens (design's File Change row for `daemon/panel/routes.ts`, OVERVIEW.md
 * §10.2's "Control panel"/"Overview table" rows, F3 PR-04c). Every handler here is a pure registry/ledger
 * READ — no route in this module can mutate the registry, the ledger, or any project file (web-panel
 * spec's "Read-only surface, two screens only").
 *
 * **No `node:fs` at request time (PT-28).** Both screens' HTML is built from template-literal string
 * constants compiled into this module, never read from disk — the daemon bundle's `node:fs` allow-list
 * (`test/security/daemon-bundle.test.ts`) stays closed over this file.
 *
 * **`roster_drift` shows the condition and the stored snapshot, not a live diff** (PR-04a's own
 * disclosure): the daemon never holds the client's live roster array, only a hash comparison, so the
 * Overview table renders the raised condition plus the registry's own `roster_snapshot` — a human
 * wanting the actual live difference runs `conmuta project sync-roster` (PR-07), which reads the file.
 *
 * **Poll and thread counts reuse `daemon/serve/status.ts`'s own already-tested reads** (`listThreadIds`,
 * `readPollerEntry`, `computeUptimeSeconds`, exported for this module in the same PR) rather than a
 * second copy of the same SQL — this module only adds the one thing `status.ts` has no use for: an
 * "open and overdue" COUNT across every binding at once, with no per-client surfaced-set tiering (the
 * panel is not a session; nothing has "already been shown" to it).
 */

import type { DatabaseSync } from "node:sqlite";

import { REQUEST_REMINDER_WINDOW_HOURS } from "../../shared/constants.js";
import { computeAgeHours, isReminderDue } from "../../shared/protocol-select.js";
import type { Registry, RegistryBinding } from "../../registry/schema.js";
import type { RegistryLoader } from "../../registry/loader.js";
import { DAEMON_CONDITION_SCOPE, readCondition, readProjectConditions } from "../../ledger/conditions-store.js";
import { readThreadRecord } from "../../ledger/threads.js";
import { computeUptimeSeconds, listThreadIds, readPollerEntry, type StatusPollerEntry } from "../serve/status.js";
import type { PanelHandler, PanelResponse, PanelRouteKey } from "./server.js";

export interface PanelDaemonFacts {
  readonly pid: number;
  readonly started_at: string;
}

export interface PanelRoutesDeps {
  readonly db: DatabaseSync;
  readonly registry: RegistryLoader;
  readonly daemon: PanelDaemonFacts;
  readonly now?: () => Date;
}

/** Escapes the five characters HTML needs escaped; every registry/roster string is caller-supplied text, never trusted. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</body>
</html>`;
}

function htmlResponse(bodyHtml: string): PanelResponse {
  return { status: 200, contentType: "text/html; charset=utf-8", body: bodyHtml };
}

/** Raised conditions for one project, as `"name (since <ts>)"` strings — daemon-scope conditions are never a project's to show. */
function raisedConditionLines(db: DatabaseSync, projectId: string): string[] {
  const lines: string[] = [];
  const conditions = readProjectConditions(db, projectId);
  if (conditions.group_outage !== null) lines.push(`group_outage (since ${conditions.group_outage.since})`);
  if (conditions.state_quarantined !== null) lines.push(`state_quarantined (since ${conditions.state_quarantined.at})`);
  if (conditions.open_thread_backlog !== null) lines.push(`open_thread_backlog (since ${conditions.open_thread_backlog.since})`);
  const rosterDrift = readCondition(db, projectId, "roster_drift");
  if (rosterDrift !== undefined) lines.push(`roster_drift (since ${rosterDrift.since})`);
  return lines;
}

/** Open-thread and needs-action counts for one binding — the panel's own use of `status.ts`'s reads, with no per-client tiering. */
function threadCounts(db: DatabaseSync, binding: RegistryBinding, nowDate: Date): { open: number; needsAction: number } {
  const reminderWindowHours = binding.settings?.reminder_window_hours ?? REQUEST_REMINDER_WINDOW_HOURS;
  let open = 0;
  let needsAction = 0;
  for (const threadId of listThreadIds(db, binding.project_id)) {
    const record = readThreadRecord(db, binding.project_id, threadId);
    if (record === undefined || record.opened_type !== "REQUEST" || record.status !== "open") continue;
    open += 1;
    if (isReminderDue(computeAgeHours(record.opened_at, nowDate), reminderWindowHours)) {
      needsAction += 1;
    }
  }
  return { open, needsAction };
}

function pollSummary(poller: StatusPollerEntry | null): string {
  if (poller === null) return "never polled";
  return poller.last_poll_ok_at ?? `last attempt ${poller.last_poll_started_at ?? "unknown"} (no success yet)`;
}

function overviewLink(token: string): string {
  return `<p><a href="/overview?token=${encodeURIComponent(token)}">Overview</a></p>`;
}

/**
 * Home / Control panel (OVERVIEW.md §10.2: "Daemon pid, uptime, last poll per bot, conditions per
 * binding, links to the other views").
 */
export function createHomeHandler(deps: PanelRoutesDeps, panelToken: string): PanelHandler {
  return (): PanelResponse => {
    const now = deps.now ?? ((): Date => new Date());
    const registry: Registry | undefined = deps.registry.current();
    const uptimeSeconds = computeUptimeSeconds(deps.daemon.started_at, now());

    const botLines =
      registry === undefined || registry.bots.length === 0
        ? "<li>no bots registered</li>"
        : registry.bots
            .map((bot) => `<li>${escapeHtml(bot.username)} (bot_id ${bot.bot_id}): ${escapeHtml(pollSummary(readPollerEntry(deps.db, bot.bot_id)))}</li>`)
            .join("\n");

    const conditionLines =
      registry === undefined || registry.bindings.length === 0
        ? "<li>no bindings</li>"
        : registry.bindings
            .map((binding) => {
              const raised = raisedConditionLines(deps.db, binding.project_id);
              const summary = raised.length === 0 ? "none" : raised.map(escapeHtml).join(", ");
              return `<li>${escapeHtml(binding.project_id)}: ${summary}</li>`;
            })
            .join("\n");

    const body = `
<p>pid: ${deps.daemon.pid}</p>
<p>uptime_seconds: ${uptimeSeconds}</p>
<h2>Bots</h2>
<ul>
${botLines}
</ul>
<h2>Conditions per binding</h2>
<ul>
${conditionLines}
</ul>
${overviewLink(panelToken)}`;

    return htmlResponse(htmlPage("Conmuta — Control panel", body));
  };
}

/**
 * Overview table (OVERVIEW.md §10.2: "One row per binding: bot, bot id, group, group id, project
 * (folder), collaborators (roster), totals — open threads, needs_action, last poll, daemon
 * conditions"). No mutation control anywhere on this screen (web-panel spec).
 */
export function createOverviewHandler(deps: PanelRoutesDeps): PanelHandler {
  return (): PanelResponse => {
    const now = deps.now ?? ((): Date => new Date());
    const registry: Registry | undefined = deps.registry.current();
    const bindings = registry?.bindings ?? [];

    const rows = bindings
      .map((binding) => {
        const bot = registry?.bots.find((candidate) => candidate.bot_id === binding.bot_id);
        const group = registry?.groups.find((candidate) => candidate.group_id === binding.group_id);
        const project = registry?.projects.find((candidate) => candidate.project_id === binding.project_id);
        const counts = threadCounts(deps.db, binding, now());
        const poller = readPollerEntry(deps.db, binding.bot_id);
        const conditions = raisedConditionLines(deps.db, binding.project_id);
        const roster = binding.roster_snapshot.map((entry) => escapeHtml(entry.username)).join(", ");
        const rosterDriftRaised = conditions.some((line) => line.startsWith("roster_drift"));
        const snapshotNote = rosterDriftRaised
          ? `<br><small>stored roster_snapshot: ${roster || "(empty)"}</small>`
          : "";

        return `<tr>
<td>${escapeHtml(bot?.username ?? "(unknown bot)")}</td>
<td>${binding.bot_id}</td>
<td>${escapeHtml(group?.title ?? "(untitled group)")}</td>
<td>${binding.group_id}</td>
<td>${escapeHtml(project?.path ?? "(unknown project)")}</td>
<td>${roster || "(empty)"}</td>
<td>${counts.open}</td>
<td>${counts.needsAction}</td>
<td>${escapeHtml(pollSummary(poller))}</td>
<td>${conditions.length === 0 ? "none" : conditions.map(escapeHtml).join(", ")}${snapshotNote}</td>
</tr>`;
      })
      .join("\n");

    const body = `
<table border="1">
<thead>
<tr><th>Bot</th><th>Bot id</th><th>Group</th><th>Group id</th><th>Project</th><th>Collaborators</th>
<th>Open threads</th><th>Needs action</th><th>Last poll</th><th>Conditions</th></tr>
</thead>
<tbody>
${rows || '<tr><td colspan="10">no bindings</td></tr>'}
</tbody>
</table>`;

    return htmlResponse(htmlPage("Conmuta — Overview", body));
  };
}

export function createPanelRoutes(deps: PanelRoutesDeps, panelToken: string): Partial<Record<PanelRouteKey, PanelHandler>> {
  return {
    "GET /": createHomeHandler(deps, panelToken),
    "GET /overview": createOverviewHandler(deps),
  };
}
