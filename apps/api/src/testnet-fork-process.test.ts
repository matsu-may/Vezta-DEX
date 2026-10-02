import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { expect, it } from "vitest";
import { guardedForkRequest } from "./testnet-fork";

it("refuses an aborted startup before allocating a process", async () => {
  const { startOwnedTestnetAnvil } = await import("./testnet-fork-process");
  const controller = new AbortController(); controller.abort();
  await expect(startOwnedTestnetAnvil(controller.signal)).rejects.toThrow();
});

// Native integration needs permission to bind localhost; unit/CI sandboxes may forbid it.
it.skipIf(process.env.DEX_ANVIL_INTEGRATION !== "1" || !existsSync(`${homedir()}/.foundry/bin/anvil`))("owns an actual isolated Anvil process and stops only that process", async () => {
  const { startOwnedTestnetAnvil } = await import("./testnet-fork-process");
  const controller = new AbortController(); const fork = await startOwnedTestnetAnvil(controller.signal);
  try {
    expect(await fork.client.getChainId()).toBe(84532);
    const snapshot = await guardedForkRequest(fork.boundary, fork.origin, "evm_snapshot", []);
    expect(typeof snapshot).toBe("string");
    expect(await guardedForkRequest(fork.boundary, fork.origin, "evm_revert", [snapshot])).toBe(true);
  } finally { await fork.stop(); }
  await expect(fetch(fork.origin, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
}, 15000);
