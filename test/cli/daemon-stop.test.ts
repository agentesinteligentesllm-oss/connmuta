import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isProcessAlive, resolveLockPath } from "../../src/daemon/lifecycle/lock.js";
import { stopDaemon } from "../../src/cli/daemon-stop.js";

function spawnFakeDaemon(
  homeDir: string,
  behavior = "normal",
): Promise<{ child: ChildProcess; pid: number }> {
  return new Promise((resolve, reject) => {
    const script = `
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const [dir, b] = process.argv.slice(1);
const runDir = path.join(dir, "run");
fs.mkdirSync(runDir, { recursive: true });
const secret = crypto.randomBytes(32).toString("hex");
const s = http.createServer((req, res) => {
  if (b === "http-error") {
    res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "internal error" }));
    return;
  }
  if (b === "timeout") {
    return;
  }
  const nonce = new URL(req.url, "http://127.0.0.1").searchParams.get("nonce") || "";
  const proof = b === "wrong-proof"
    ? "00".repeat(32)
    : crypto.createHmac("sha256", secret).update("identity:" + nonce).digest("hex");
  const pid = b === "wrong-pid" ? 999999 : process.pid;
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ proof, pid }));
}).listen(0, "127.0.0.1", () => {
  const port = s.address().port;
  fs.writeFileSync(path.join(runDir, "daemon.json"), JSON.stringify({ port, pid: process.pid, secret }));
  fs.writeFileSync(path.join(runDir, "daemon.lock"), JSON.stringify({ pid: process.pid, acquired_at: Date.now() }));
  process.send({ pid: process.pid });
});
process.on("SIGTERM", () => s.close(() => process.exit(0)));`;

    const child = spawn(process.execPath, ["--input-type=module", "-e", script, homeDir, behavior], {
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    child.on("message", (msg: { pid: number }) => resolve({ child, pid: msg.pid }));
    child.on("error", reject);
  });
}

test("stop terminates a live, identity-confirmed daemon (D-29)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-stop-"));
  const { child, pid } = await spawnFakeDaemon(dir);
  try {
    assert.ok(isProcessAlive(pid));
    const lockPath = resolveLockPath(dir);
    const runPath = join(dir, "run", "daemon.json");
    assert.ok(existsSync(lockPath));
    assert.ok(existsSync(runPath));

    const result = await stopDaemon({ homeDir: dir, io: { out: () => {}, err: () => {} } });
    assert.equal(result.exitCode, 0);

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(isProcessAlive(pid), false);
    assert.equal(existsSync(lockPath), false);
    assert.equal(existsSync(runPath), false);
  } finally {
    if (isProcessAlive(pid)) try { child.kill("SIGKILL"); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stop refuses when the identity challenge fails (proof mismatch) (D-29)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-stop-fail-"));
  const { child, pid } = await spawnFakeDaemon(dir, "wrong-proof");
  try {
    const err: string[] = [];
    const result = await stopDaemon({ homeDir: dir, io: { out: () => {}, err: (m) => err.push(m) } });
    assert.equal(result.exitCode, 1);
    assert.match(err.join("\n"), /identity/i);
    assert.ok(isProcessAlive(pid));
    assert.ok(existsSync(resolveLockPath(dir)));
    assert.ok(existsSync(join(dir, "run", "daemon.json")));
  } finally {
    if (isProcessAlive(pid)) try { child.kill("SIGKILL"); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stop refuses when the identity challenge fails (pid mismatch) (D-29)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-stop-pid-fail-"));
  const { child, pid } = await spawnFakeDaemon(dir, "wrong-pid");
  try {
    const err: string[] = [];
    const result = await stopDaemon({ homeDir: dir, io: { out: () => {}, err: (m) => err.push(m) } });
    assert.equal(result.exitCode, 1);
    assert.match(err.join("\n"), /identity/i);
    assert.ok(isProcessAlive(pid));
  } finally {
    if (isProcessAlive(pid)) try { child.kill("SIGKILL"); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stop refuses when the identity challenge fails (HTTP 500 error) (D-29)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-stop-http-err-"));
  const { child, pid } = await spawnFakeDaemon(dir, "http-error");
  try {
    const err: string[] = [];
    const result = await stopDaemon({ homeDir: dir, io: { out: () => {}, err: (m) => err.push(m) } });
    assert.equal(result.exitCode, 1);
    assert.match(err.join("\n"), /identity/i);
    assert.ok(isProcessAlive(pid));
    assert.ok(existsSync(resolveLockPath(dir)));
    assert.ok(existsSync(join(dir, "run", "daemon.json")));
  } finally {
    if (isProcessAlive(pid)) try { child.kill("SIGKILL"); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stop refuses when the identity challenge times out (D-29)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-stop-timeout-"));
  const { child, pid } = await spawnFakeDaemon(dir, "timeout");
  try {
    const err: string[] = [];
    const result = await stopDaemon({
      homeDir: dir,
      timeoutMs: 50,
      io: { out: () => {}, err: (m) => err.push(m) },
    });
    assert.equal(result.exitCode, 1);
    assert.match(err.join("\n"), /identity/i);
    assert.ok(isProcessAlive(pid));
    assert.ok(existsSync(resolveLockPath(dir)));
    assert.ok(existsSync(join(dir, "run", "daemon.json")));
  } finally {
    if (isProcessAlive(pid)) try { child.kill("SIGKILL"); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stop reports error when no daemon is running", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conmuta-stop-none-"));
  try {
    const err: string[] = [];
    const result = await stopDaemon({ homeDir: dir, io: { out: () => {}, err: (m) => err.push(m) } });
    assert.equal(result.exitCode, 1);
    assert.match(err.join("\n"), /not running/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
