import { describe, expect, it, vi } from "vitest";
import { encodeEventTopics, erc20Abi, keccak256, type Hex } from "viem";
import { TOKENS, type TradingIntent } from "@vezta-dex/core";
import { WalletObservationReader, type WalletObservationSource } from "./wallet-observation";

const hash = `0x${"11".repeat(32)}` as Hex; const blockHash = `0x${"22".repeat(32)}` as Hex;
const intent: TradingIntent = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
const data = "0x1234" as Hex;
const query = { kind: "swap" as const, intent, hash, dataHash: keccak256(data), minimumAmountOut: "995", submittedAt: 999000, submissionId: "11111111-1111-4111-8111-111111111111", afterBlock: "122", expectedNonce: "7" };
function setup() {
  const log = (address: Hex, from: Hex, to: Hex, amount: bigint) => ({ address, topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }), data: `0x${amount.toString(16).padStart(64, "0")}`, removed: false });
  const router = "0xDc264714F68d84CF29BC605589405E78bDBE7C9f" as Hex;
  const receipt = { transactionHash: hash, from: intent.swapper, to: router, blockNumber: 123n, blockHash, status: "success", gasUsed: 100000n, effectiveGasPrice: 30000000000n, logs: [log(intent.tokenIn, intent.swapper, router, 1000000n), log(intent.tokenOut, router, intent.swapper, 1000n)] };
  const client = {
    chain: { id: 137 }, getChainId: async () => 137,
    getTransactionReceipt: vi.fn(async () => receipt), getBlockNumber: async () => 124n,
    getBlock: vi.fn(async () => ({ number: 123n, hash: blockHash, timestamp: 1000n })),
    getTransaction: vi.fn(async () => ({ hash, from: intent.swapper, to: router, input: data, value: 0n, nonce: 7, blockHash, blockNumber: 123n })),
  };
  const source = { receiptClient: client, getTokenBalance: async () => 5n, getNativeBalance: async () => 10n, getTokenAllowance: async () => 0n, getPermitAllowance: async () => ({ amount: 0n, expiration: 0n, nonce: 8n }) } as unknown as WalletObservationSource;
  return { client, receipt, source, reader: new WalletObservationReader(source, () => 1000000) };
}
describe("wallet execution observation", () => {
  it("verifies actual transaction digest, canonical receipt and net curated transfers", async () => {
    const s = setup(); const r = await s.reader.observe(query);
    expect(r.observation.status).toBe("confirmed");
    expect(r.execution).toMatchObject({ status: "verified", amountIn: "1000000", amountOut: "1000", nonce: "7", tokenAllowance: "0", gasCost: "3000000000000000" });
  });
  it("rejects unrelated calldata and excessive input/insufficient output evidence", async () => {
    for (const fault of ["data", "input", "output", "removed"]) {
      const s = setup();
      if (fault === "data") s.client.getTransaction = vi.fn(async () => ({ hash, from: intent.swapper, to: s.receipt.to, input: "0x4567", value: 0n, nonce: 7, blockHash, blockNumber: 123n }));
      if (fault === "input") s.receipt.logs[0].data = `0x${(1000001n).toString(16).padStart(64,"0")}`;
      if (fault === "output") s.receipt.logs[1].data = `0x${(994n).toString(16).padStart(64,"0")}`;
      if (fault === "removed") s.receipt.logs[0].removed = true;
      const r = await s.reader.observe(query);
      expect(r.execution?.status).toBe("unverified");
    }
  });
  it("does not verify on a changed canonical block during post-receipt reads", async () => {
    const s = setup(); let reads = 0;
    s.client.getBlock = vi.fn(async () => ({ number: 123n, hash: ++reads === 1 ? blockHash : `0x${"33".repeat(32)}` as Hex, timestamp: 1000n }));
    expect((await s.reader.observe(query)).execution?.status).toBe("unverified");
  });
  it("refreshes balances after a reverted canonical receipt, without claiming a successful swap", async () => {
    const s = setup(); s.receipt.status = "reverted";
    const r = await s.reader.observe(query);
    expect(r.observation.status).toBe("reverted");
    expect(r.execution).toMatchObject({ status: "reverted", balances: { POL: "10" } });
  });
  it("rejects malformed submission metadata before RPC", async () => {
    const s = setup();
    await expect(s.reader.observe({ ...query, dataHash: "bad" })).rejects.toThrow();
    expect(s.client.getTransaction).not.toHaveBeenCalled();
  });
});


it("cannot verify historical identical approval evidence for a newly submitted marker", async () => {
  const s = setup();
  const approval = (await import("viem")).encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: ["0x000000000022D473030F116dDEE9F6B43aC78BA3", 1000000n] });
  s.receipt.to = intent.tokenIn;
  s.client.getTransaction = vi.fn(async () => ({ hash, from: intent.swapper, to: intent.tokenIn, input: approval, value: 0n, nonce: 7, blockHash, blockNumber: 123n }));
  s.client.getBlock = vi.fn(async () => ({ number: 123n, hash: blockHash, timestamp: 1000n }));
  s.source.getTokenAllowance = async () => 1000000n;
  const result = await s.reader.observe({ ...query, kind: "approval", dataHash: keccak256(approval), minimumAmountOut: "0", submittedAt: Date.parse("2026-09-29T00:00:00Z") });
  expect(result.execution?.status).toBe("unverified");
});

it("rejects a different nonce or inclusion at/before the pre-send block", async () => {
  for (const extra of [{ expectedNonce: "8" }, { afterBlock: "123" }, { afterBlock: "124" }]) {
    const s = setup(); expect((await s.reader.observe({ ...query, ...extra })).execution?.status).toBe("unverified");
  }
});
