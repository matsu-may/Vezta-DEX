import { describe, expect, it } from "vitest";
import { createPublicClient, custom, type Hash } from "viem";
import { polygon } from "viem/chains";
import { TOKENS, type TradingIntent } from "@vezta-dex/core";
import { readTransactionReceipt, type SubmittedTransaction } from "./transaction-receipt";

const owner = "0x1111111111111111111111111111111111111111";
const hash: Hash = `0x${"ab".repeat(32)}`;
const blockHash: Hash = `0x${"cd".repeat(32)}`;
const otherHash: Hash = `0x${"ef".repeat(32)}`;
const router = "0xDc264714F68d84CF29BC605589405E78bDBE7C9f";
const now = Date.parse("2026-09-29T06:00:00.000Z");

function transaction(kind: "approval" | "swap" = "swap") {
  const intent: TradingIntent = {
    chainId: 137, swapper: owner, tokenIn: TOKENS.USDC.address,
    tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50,
  };
  return { kind, intent, hash };
}

function rpcReceipt(overrides: Record<string, unknown> = {}) {
  return {
    transactionHash: hash, transactionIndex: "0x0", blockHash, blockNumber: "0x64",
    from: owner, to: router, contractAddress: null, cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208", effectiveGasPrice: "0x77359400", logs: [],
    logsBloom: `0x${"00".repeat(256)}`, status: "0x1", type: "0x2",
    ...overrides,
  };
}

function rpcBlock(overrides: Record<string, unknown> = {}) {
  return {
    number: "0x64", hash: blockHash, parentHash: otherHash, nonce: "0x0000000000000000",
    sha3Uncles: otherHash, logsBloom: `0x${"00".repeat(256)}`, transactionsRoot: otherHash,
    stateRoot: otherHash, receiptsRoot: otherHash, miner: owner, difficulty: "0x0",
    totalDifficulty: "0x0", extraData: "0x", size: "0x400", gasLimit: "0x1c9c380",
    gasUsed: "0x5208", timestamp: "0x6abc1234", transactions: [], uncles: [],
    baseFeePerGas: "0x1", mixHash: otherHash, ...overrides,
  };
}

function rpcHarness(options: {
  receipt?: ReturnType<typeof rpcReceipt> | null;
  canonicalBlock?: ReturnType<typeof rpcBlock>;
  chains?: string[];
  heads?: string[];
  failMethod?: string;
} = {}) {
  const calls: string[] = [];
  let chainReads = 0;
  let headReads = 0;
  const client = createPublicClient({
    chain: polygon,
    transport: custom({
      async request({ method, params }) {
        calls.push(method);
        if (method === options.failMethod) throw new Error("secret RPC endpoint and credential text");
        switch (method) {
          case "eth_chainId": {
            const chains = options.chains ?? ["0x89"];
            return chains[Math.min(chainReads++, chains.length - 1)];
          }
          case "eth_getTransactionReceipt":
            if (JSON.stringify(params) !== JSON.stringify([hash])) throw new Error("Unexpected hash");
            return options.receipt === undefined ? rpcReceipt() : options.receipt;
          case "eth_blockNumber": {
            const heads = options.heads ?? ["0x65"];
            return heads[Math.min(headReads++, heads.length - 1)];
          }
          case "eth_getBlockByNumber":
            if (JSON.stringify(params) !== JSON.stringify(["0x64", false])) throw new Error("Unpinned block lookup");
            return options.canonicalBlock ?? rpcBlock();
          default: throw new Error(`Unexpected RPC method ${method}`);
        }
      },
    }, { retryCount: 0 }),
  });
  return { client, calls };
}

describe("readTransactionReceipt", () => {
  it("confirms a matching swap only after the explicit confirmation threshold", async () => {
    const { client } = rpcHarness();
    const observation = await readTransactionReceipt(client, transaction(), 2, now);
    expect(observation).toMatchObject({
      status: "confirmed", chainId: 137, hash, source: "polygon-rpc",
      observedAt: "2026-09-29T06:00:00.000Z",
      receipt: { from: owner, to: router, blockNumber: 100n, blockHash, confirmations: 2n, gasUsed: 21000n, effectiveGasPrice: 2000000000n },
    });
  });

  it.each([TOKENS.USDC, TOKENS.WETH])("binds an approval receipt to the original $symbol token", async (token) => {
    const submitted = transaction("approval");
    if (token.symbol === "WETH") {
      submitted.intent.tokenIn = TOKENS.WETH.address;
      submitted.intent.tokenOut = TOKENS.USDC.address;
      submitted.intent.amountIn = "1000000000000000";
    }
    const { client } = rpcHarness({ receipt: rpcReceipt({ to: token.address }) });
    expect(await readTransactionReceipt(client, submitted, 2, now)).toMatchObject({ status: "confirmed", receipt: { to: token.address } });
  });

  it("reports a reverted receipt separately from a successful swap", async () => {
    const { client } = rpcHarness({ receipt: rpcReceipt({ status: "0x0" }) });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "reverted", receipt: { outcome: "reverted" } });
  });

  it.each(["0x0", "0x1"])("waits for enough confirmations even when an included receipt has status %s", async (status) => {
    const { client } = rpcHarness({ receipt: rpcReceipt({ status }), heads: ["0x64"] });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "confirming", receipt: { confirmations: 1n } });
  });

  it("represents an absent receipt as pending without declaring failure", async () => {
    const { client } = rpcHarness({ receipt: null });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "pending", hash, reason: "not-found" });
  });

  it("checks the chain even when no receipt exists", async () => {
    const { client } = rpcHarness({ receipt: null, chains: ["0x89", "0x1"] });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "unavailable", reason: "wrong-chain" });
  });

  it("refuses a wrong RPC chain before looking up a receipt", async () => {
    const { client, calls } = rpcHarness({ chains: ["0x1"] });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "unavailable", reason: "wrong-chain" });
    expect(calls).toEqual(["eth_chainId"]);
  });

  it("does not confirm if the chain changes during the read", async () => {
    const { client } = rpcHarness({ chains: ["0x89", "0x1"] });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "unavailable", reason: "wrong-chain" });
  });

  it.each([
    { transactionHash: otherHash },
    { from: "0x2222222222222222222222222222222222222222" },
    { to: TOKENS.USDC.address },
    { to: null },
    { blockHash: "0x1234" },
    { blockNumber: null },
    { status: "0x2" },
    { gasUsed: null },
    { effectiveGasPrice: null },
  ])("rejects a mismatched or malformed receipt: %j", async (overrides) => {
    const { client } = rpcHarness({ receipt: rpcReceipt(overrides) });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "unavailable", hash, reason: "invalid-receipt" });
  });

  it("does not count a receipt in a noncanonical block as confirmed", async () => {
    const { client } = rpcHarness({ canonicalBlock: rpcBlock({ hash: otherHash }) });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "pending", reason: "noncanonical-block" });
  });

  it("rejects a canonical-block response for a different block number", async () => {
    const { client } = rpcHarness({ canonicalBlock: rpcBlock({ number: "0x63" }) });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "unavailable", reason: "invalid-block" });
  });

  it("does not claim success when the RPC head is behind the receipt", async () => {
    const { client } = rpcHarness({ heads: ["0x63"] });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "pending", reason: "inconsistent-block" });
  });

  it("refreshes the RPC head without viem's short block-number cache", async () => {
    const { client } = rpcHarness({ heads: ["0x64", "0x65"] });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "confirming" });
    expect(await readTransactionReceipt(client, transaction(), 2, now)).toMatchObject({ status: "confirmed" });
  });

  it("sanitizes RPC errors and retains the original transaction hash", async () => {
    const { client } = rpcHarness({ failMethod: "eth_getTransactionReceipt" });
    const result = await readTransactionReceipt(client, transaction(), 2, now);
    expect(result).toMatchObject({ status: "unavailable", hash, reason: "rpc-unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("uses the original submitted intent when the caller mutates its object during RPC", async () => {
    const submitted = transaction("approval");
    const { client } = rpcHarness({ receipt: rpcReceipt({ to: TOKENS.USDC.address }) });
    const pending = readTransactionReceipt(client, submitted, 2, now);
    submitted.intent.tokenIn = TOKENS.WETH.address;
    submitted.intent.tokenOut = TOKENS.USDC.address;
    expect(await pending).toMatchObject({ status: "confirmed", receipt: { to: TOKENS.USDC.address } });
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid confirmation configuration %s before RPC", async (threshold) => {
    const { client, calls } = rpcHarness();
    await expect(readTransactionReceipt(client, transaction(), threshold, now)).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it.each([
    { hash: "0x1234" },
    { kind: "permit" },
    { intent: { ...transaction().intent, chainId: 1 } },
  ])("rejects malformed submitted identity before RPC: %j", async (overrides) => {
    const { client, calls } = rpcHarness();
    await expect(readTransactionReceipt(client, { ...transaction(), ...overrides } as SubmittedTransaction, 2, now)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
