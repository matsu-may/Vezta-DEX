import { expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import type { TestnetForkReceiptEvidence } from "./testnet-fork";

const wallet = "0x1111111111111111111111111111111111111111";
const hash = `0x${"ab".repeat(32)}` as Hex;
const blockHash = `0x${"cd".repeat(32)}` as Hex;
const transaction = { chainId: 84532 as const, from: wallet, to: P.router, data: "0x1234" as Hex,
  value: "0" as const, nonce: "7", gas: "180000", gasPrice: "20000000" };
const log = (address: typeof C.USDC.address | typeof C.WETH.address, from: typeof wallet | typeof P.pool,
  to: typeof wallet | typeof P.pool, value: bigint) => ({ address,
  topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }) as Hex[],
  data: encodeAbiParameters([{ type: "uint256" }], [value]), removed: false,
  blockNumber: 124n, blockHash, transactionHash: hash });
function evidence(): TestnetForkReceiptEvidence {
  return { kind: "swap" as "swap" | "approve" | "reset", tokenIn: C.USDC.address, tokenOut: C.WETH.address,
    amountIn: "1000000", minimumAmountOut: "995", transaction, hash,
    afterBlock: 123n, canonical: { number: 124n, hash: blockHash }, latestBlock: 125n,
    tx: { hash, from: wallet, to: P.router, input: "0x1234" as Hex, value: 0n,
      nonce: 7, chainId: 84532, blockNumber: 124n, blockHash, gas: 180000n, gasPrice: 20000000n },
    receipt: { transactionHash: hash, from: wallet, to: P.router, blockNumber: 124n, blockHash,
      status: "success" as "success" | "reverted", gasUsed: 100000n, effectiveGasPrice: 20000000n,
      logs: [log(C.USDC.address, wallet, P.pool, 1000000n), log(C.WETH.address, P.pool, wallet, 1000n)] },
    before: { input: 1000000n, output: 0n, native: 1000000000000000000n },
    after: { input: 0n, output: 1000n, native: 999998000000000000n, allowance: 0n } };
}

it("refuses nonlocal, mismatched-transport, non-Anvil and wrong-chain writes before sending", async () => {
  const { guardedForkRequest } = await import("./testnet-fork");
  const request = vi.fn(async () => "0x1");
  const client = { transport: { type: "http", url: "http://127.0.0.1:8547" }, request,
    async getChainId() { return 84532; }, async getClientVersion() { return "anvil/v1"; } };
  for (const origin of ["https://sepolia.base.org", "http://localhost:8547", "http://127.0.0.1:8547/",
    "http://127.0.0.1:8547?secret=x", "http://127.0.0.1:8547/evil", "http://user:pass@127.0.0.1:8547"]) {
    await expect(guardedForkRequest(client, origin, "anvil_setBalance", [])).rejects.toThrow();
  }
  client.transport.url = "https://sepolia.base.org";
  await expect(guardedForkRequest(client, "http://127.0.0.1:8547", "anvil_setBalance", [])).rejects.toThrow();
  client.transport.url = "http://127.0.0.1:8547"; client.getChainId = async () => 137;
  await expect(guardedForkRequest(client, client.transport.url, "anvil_setBalance", [])).rejects.toThrow();
  client.getChainId = async () => 84532; client.getClientVersion = async () => "geth/v1";
  await expect(guardedForkRequest(client, client.transport.url, "anvil_setBalance", [])).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  client.getClientVersion = async () => "anvil/v1";
  await expect(guardedForkRequest(client, client.transport.url, "eth_sendRawTransaction", [])).rejects.toThrow();
  expect(await guardedForkRequest(client, client.transport.url, "anvil_setBalance", [])).toBe("0x1");
});

it("reconciles original receipt/calldata, exact token deltas, consumed allowance and local gas", async () => {
  const { reviewTestnetForkReceipt } = await import("./testnet-fork");
  expect(reviewTestnetForkReceipt(evidence())).toEqual({ verified: true, amountIn: "1000000", amountOut: "1000",
    l2GasCost: "2000000000000", actualTotalFeeQualified: false });
});

it("rejects wrong chain/sender/target/input/nonce/value, reorg and insufficient confirmations", async () => {
  const { reviewTestnetForkReceipt } = await import("./testnet-fork");
  for (const change of ["chain", "from", "to", "data", "nonce", "value", "hash", "block", "confirm", "gas", "price", "reverted"]) {
    const e = evidence();
    if (change === "chain") e.tx.chainId = 137;
    if (change === "from") e.tx.from = P.pool;
    if (change === "to") e.tx.to = P.pool;
    if (change === "data") e.tx.input = "0x1235";
    if (change === "nonce") e.tx.nonce = 8;
    if (change === "value") e.tx.value = 1n;
    if (change === "hash") e.canonical.hash = `0x${"ef".repeat(32)}`;
    if (change === "block") e.afterBlock = 124n;
    if (change === "confirm") e.latestBlock = 124n;
    if (change === "gas") e.receipt.gasUsed = 180001n;
    if (change === "price") e.receipt.effectiveGasPrice = 20000001n;
    if (change === "reverted") e.receipt.status = "reverted";
    expect(() => reviewTestnetForkReceipt(e)).toThrow();
  }
});

it("rejects missing, removed or malformed transfers, weakened minimum and incorrect balances/allowance", async () => {
  const { reviewTestnetForkReceipt } = await import("./testnet-fork");
  for (const change of ["missing", "removed", "malformed", "extra-data", "log-hash", "minimum", "input-delta", "output-delta", "native", "allowance"]) {
    const e = evidence();
    if (change === "missing") e.receipt.logs = [];
    if (change === "removed") e.receipt.logs[0].removed = true;
    if (change === "malformed") e.receipt.logs[0].data = "0x";
    if (change === "extra-data") e.receipt.logs[0].data = `${e.receipt.logs[0].data}00`;
    if (change === "log-hash") e.receipt.logs[0].transactionHash = `0x${"ef".repeat(32)}`;
    if (change === "minimum") e.minimumAmountOut = "1001";
    if (change === "input-delta") e.after.input = 1n;
    if (change === "output-delta") e.after.output = 999n;
    if (change === "native") e.after.native += 1n;
    if (change === "allowance") e.after.allowance = 1n;
    expect(() => reviewTestnetForkReceipt(e)).toThrow();
  }
});

it.each(["approve", "reset"] as const)("requires original Approval event and pinned reread for %s", async kind => {
  const { reviewTestnetForkReceipt } = await import("./testnet-fork");
  const e = evidence(); e.kind = kind; const amount = kind === "reset" ? 0n : 1000000n;
  e.transaction = { ...transaction, to: C.USDC.address }; e.tx.to = C.USDC.address; e.receipt.to = C.USDC.address;
  e.receipt.logs = [{ ...e.receipt.logs[0], topics: encodeEventTopics({ abi: erc20Abi, eventName: "Approval",
    args: { owner: wallet, spender: P.router } }) as Hex[], data: encodeAbiParameters([{ type: "uint256" }], [amount]) }];
  e.after.input = e.before.input; e.after.output = e.before.output; e.after.allowance = amount;
  expect(reviewTestnetForkReceipt(e)).toMatchObject({ verified: true, amountIn: "0", amountOut: "0" });
  e.after.allowance = amount + 1n;
  expect(() => reviewTestnetForkReceipt(e)).toThrow();
});
