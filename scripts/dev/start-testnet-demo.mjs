import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
// Explicit local testnet consumer. The API never signs or sends transactions.
if (process.argv.length !== 2 || process.env.NODE_ENV === "production") {
  process.stderr.write("Testnet demo requires development mode and accepts no arguments.\n");
  process.exit(1);
}
for (const port of [3020, 3021]) {
  try { await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  }); } catch { process.stderr.write(`Port ${port} is occupied. Stop your previous DEX dev session first.\n`); process.exit(1); }
}
const child = spawn("pnpm", ["-r", "--parallel", "dev"], {
  cwd: fileURLToPath(new URL("../../", import.meta.url)), detached: true, stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development", HOST: "127.0.0.1", PORT: "3021",
    DEX_TESTNET_DEMO_ENABLED: "1", DEX_TESTNET_BOUND_HOST: "127.0.0.1" },
});
let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return; stopping = true;
  try { process.kill(-child.pid, signal); } catch { /* The owned group may have exited. */ }
  setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already stopped. */ } }, 3000);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
child.on("error", () => { process.stderr.write("Unable to start local testnet demo.\n"); process.exitCode = 1; });
child.on("exit", code => { stop(); process.exitCode = stopping && code === null ? 0 : code ?? 1; });
