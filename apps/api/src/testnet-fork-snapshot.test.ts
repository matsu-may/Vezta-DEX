import { expect, it, vi } from "vitest";
import type { ForkClientBoundary } from "./testnet-fork";

it("reverts exactly the owned snapshot on success and failure, preserving failure", async () => {
  const { withForkSnapshot } = await import("./testnet-fork-snapshot");
  for (const fails of [false, true]) {
    const request = vi.fn(async ({ method }: { method: string }) => method === "evm_snapshot" ? "0x7" : true);
    const client: ForkClientBoundary = { transport: { type: "http", url: "http://127.0.0.1:12345" },
      async getChainId() { return 84532; }, async getClientVersion() { return "anvil/v1"; }, request };
    const run = withForkSnapshot(client, "http://127.0.0.1:12345", async () => {
      if (fails) throw new Error("original operation failed"); return "verified";
    });
    if (fails) await expect(run).rejects.toThrow("original operation failed");
    else await expect(run).resolves.toBe("verified");
    expect(request.mock.calls).toEqual([[{ method: "evm_snapshot", params: [] }], [{ method: "evm_revert", params: ["0x7"] }]]);
  }
});

it("refuses missing snapshots and reports failed cleanup", async () => {
  const { withForkSnapshot } = await import("./testnet-fork-snapshot");
  const work = vi.fn();
  const client: ForkClientBoundary = { transport: { type: "http", url: "http://127.0.0.1:12345" },
    async getChainId() { return 84532; }, async getClientVersion() { return "anvil/v1"; }, async request() { return null; } };
  await expect(withForkSnapshot(client, "http://127.0.0.1:12345", work)).rejects.toMatchObject({ code: "FORK_SNAPSHOT_INVALID" });
  expect(work).not.toHaveBeenCalled();
  client.request = async ({ method }) => method === "evm_snapshot" ? "0x7" : false;
  await expect(withForkSnapshot(client, "http://127.0.0.1:12345", async () => true)).rejects.toMatchObject({ code: "FORK_CLEANUP_FAILED" });
});
