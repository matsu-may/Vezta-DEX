import { expect, it, vi } from "vitest";
import type { startOwnedTestnetAnvil } from "./testnet-fork-process";
import { TESTNET_HASH } from "./testnet-quote.test-helper";

vi.mock("./base-sepolia-source", () => ({ createBaseSepoliaPreflightSource: () => ({ async getCode() { return "0x6000"; } }) }));
const fixture = () => {
  const upstream = { number: 123n, hash: TESTNET_HASH, timestamp: BigInt(Math.floor(Date.now() / 1000)) };
  const request = vi.fn(async ({ method }: { method: string }) => method === "evm_snapshot" ? "0x7" : true);
  const fork = { origin: "http://127.0.0.1:12345", stop: vi.fn(),
    client: { async getBlock() { return upstream; }, async getChainId() { return 84532; } },
    boundary: { transport: { type: "http", url: "http://127.0.0.1:12345" },
      async getChainId() { return 84532; }, async getClientVersion() { return "anvil/v1"; }, request },
  };
  return { upstream, request, fork: fork as unknown as Awaited<ReturnType<typeof startOwnedTestnetAnvil>> };
};

it("refuses wrong fork block/hash/stale source/chain before snapshot or mutation", async () => {
  const { runTestnetForkLifecycle } = await import("./testnet-fork-lifecycle");
  for (const change of ["number", "hash", "stale", "chain"]) {
    const { upstream, request, fork } = fixture();
    if (change === "number") fork.client.getBlock = vi.fn().mockResolvedValue({ ...upstream, number: 124n });
    if (change === "hash") fork.client.getBlock = vi.fn().mockResolvedValue({ ...upstream, hash: `0x${"cd".repeat(32)}` });
    if (change === "stale") upstream.timestamp -= 120n;
    if (change === "chain") fork.client.getChainId = vi.fn().mockResolvedValue(137);
    await expect(runTestnetForkLifecycle(fork, upstream, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: "FORK_SOURCE_MISMATCH" });
    expect(request).not.toHaveBeenCalled();
  }
});

it("restores its snapshot before leaving on a fixture failure and never reports verified", async () => {
  const { runTestnetForkLifecycle } = await import("./testnet-fork-lifecycle");
  const { fork, upstream, request } = fixture(); const report = vi.fn();
  await expect(runTestnetForkLifecycle(fork, upstream, new AbortController().signal, report)).rejects.toMatchObject({ code: "FORK_FIXTURE_NOT_EOA" });
  expect(request.mock.calls).toEqual([[{ method: "evm_snapshot", params: [] }], [{ method: "evm_revert", params: ["0x7"] }]]);
  expect(report.mock.calls.some(([row]) => row.verified === true)).toBe(false);
});
