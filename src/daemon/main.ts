import { enforceNodeFloor } from "./node-floor.js";
import { LockHeldError } from "./lifecycle/lock.js";
import { EXIT_DAEMON_ALREADY_RUNNING } from "../shared/constants.js";

enforceNodeFloor();

// Dynamic import so node:sqlite and other ESM imports do not load before the gate (D-25)
const { startDaemon } = await import("./bootstrap.js");

// Parse --home <dir> if present
let explicitHome: string | undefined;
const homeIdx = process.argv.indexOf("--home");
if (homeIdx !== -1 && homeIdx + 1 < process.argv.length) {
  explicitHome = process.argv[homeIdx + 1];
}

try {
  const daemon = await startDaemon({ homeDir: explicitHome });

  const handleSignal = async () => {
    await daemon.stop();
    process.exit(0);
  };

  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);
} catch (err) {
  if (err instanceof LockHeldError || (err as { name?: string })?.name === "LockHeldError") {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(EXIT_DAEMON_ALREADY_RUNNING);
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
