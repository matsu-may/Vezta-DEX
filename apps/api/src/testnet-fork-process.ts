import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { assertTestnetForkOrigin, forkAssert, TestnetForkError, type ForkClientBoundary } from "./testnet-fork";

export async function startOwnedTestnetAnvil(signal: AbortSignal, fork?: { url: string; block: bigint }) {
  signal.throwIfAborted();
  if (fork) {
    const url = new URL(fork.url);
    forkAssert((url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
      && fork.block > 0n, "FORK_UPSTREAM_INVALID");
  }
  const allocator = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    allocator.once("error", reject);
    allocator.listen(0, "127.0.0.1", () => {
      const address = allocator.address();
      if (!address || typeof address === "string") { allocator.close(); reject(new TestnetForkError("FORK_PORT_UNAVAILABLE")); return; }
      allocator.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  signal.throwIfAborted();
  const origin = assertTestnetForkOrigin(`http://127.0.0.1:${port}`);
  const executable = existsSync(`${homedir()}/.foundry/bin/anvil`) ? `${homedir()}/.foundry/bin/anvil` : "anvil";
  const child = spawn(executable, ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "84532", "--accounts", "0",
    ...(fork ? ["--fork-url", fork.url, "--fork-block-number", fork.block.toString(), "--retries", "0", "--timeout", "8000", "--no-storage-caching"] : [])],
  { stdio: ["ignore", "pipe", "ignore"] });
  // Never echo child args/output: upstream URLs and generated account material are private.
  let stopped = false; let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const exited = new Promise<void>(resolve => { child.once("exit", () => resolve()); child.once("error", () => resolve()); });
  const stop = async () => {
    if (!stopped) {
      stopped = true; child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    }
    await exited; clearTimeout(forceTimer); signal.removeEventListener("abort", onAbort);
  };
  const onAbort = () => { void stop(); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      let tail = ""; let done = false;
      const finish = (error?: Error) => {
        if (done) return; done = true; clearTimeout(timer);
        child.stdout.removeListener("data", output); child.removeListener("exit", failed); child.removeListener("error", failed);
        signal.removeEventListener("abort", aborted);
        if (error) reject(error); else resolve();
      };
      const output = (data: Buffer) => {
        tail = (tail + data.toString("utf8")).slice(-512);
        if (tail.includes(`Listening on 127.0.0.1:${port}`)) finish();
      };
      const failed = () => finish(new TestnetForkError("FORK_ANVIL_UNAVAILABLE"));
      const aborted = () => finish(new TestnetForkError("FORK_ABORTED"));
      const timer = setTimeout(() => finish(new TestnetForkError("FORK_START_TIMEOUT")), 20000);
      child.stdout.on("data", output); child.once("exit", failed); child.once("error", failed);
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
    });
    const client = createPublicClient({ chain: baseSepolia, transport: http(origin, { timeout: 8000, retryCount: 0 }) });
    const request = client.request as unknown as ForkClientBoundary["request"];
    const boundary: ForkClientBoundary = { transport: client.transport, getChainId: () => client.getChainId(),
      async getClientVersion() {
        const version = await request({ method: "web3_clientVersion" });
        forkAssert(typeof version === "string", "FORK_CLIENT_INVALID"); return version;
      }, request };
    forkAssert(await boundary.getChainId() === 84532 && /\banvil\b/i.test(await boundary.getClientVersion()), "FORK_CLIENT_INVALID");
    signal.throwIfAborted();
    return { client, boundary, origin, stop };
  } catch (error) { await stop(); throw error; }
}
