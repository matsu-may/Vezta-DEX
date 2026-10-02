import { expect, it, vi } from "vitest";
import type { ForkClientBoundary } from "./testnet-fork";

it("aligns an old fork clock before mining without changing quote TTL", async () => {
  const { mineFreshForkBlock } = await import("./testnet-fork-clock");
  const request = vi.fn(async () => null);
  const client: ForkClientBoundary = { transport: { type: "http", url: "http://127.0.0.1:12345" },
    async getChainId() { return 84532; }, async getClientVersion() { return "anvil/v1"; }, request };
  await mineFreshForkBlock(client, "http://127.0.0.1:12345", 1790800000n, new AbortController().signal, () => 1790800020000);
  expect(request.mock.calls).toEqual([[{ method: "evm_setNextBlockTimestamp", params: [1790800020] }], [{ method: "evm_mine", params: [] }]]);
});

it("keeps time monotonic but refuses a clock more than ten seconds ahead", async () => {
  const { mineFreshForkBlock } = await import("./testnet-fork-clock");
  const request = vi.fn(async () => null);
  const client: ForkClientBoundary = { transport: { type: "http", url: "http://127.0.0.1:12345" },
    async getChainId() { return 84532; }, async getClientVersion() { return "anvil/v1"; }, request };
  await mineFreshForkBlock(client, "http://127.0.0.1:12345", 1790800020n, new AbortController().signal, () => 1790800020000);
  expect(request.mock.calls[0]).toEqual([{ method: "evm_setNextBlockTimestamp", params: [1790800021] }]);
  request.mockClear();
  await expect(mineFreshForkBlock(client, "http://127.0.0.1:12345", 1790800030n,
    new AbortController().signal, () => 1790800020000)).rejects.toMatchObject({ code: "FORK_CLOCK_INVALID" });
  expect(request).not.toHaveBeenCalled();
});
