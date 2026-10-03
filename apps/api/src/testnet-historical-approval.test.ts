import { expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { wrappedReceiptFixture } from "./testnet-metamask-execution.test-helper";
import { TestnetHistoricalApprovalReader } from "./testnet-historical-approval";
import { handleTestnetHistoricalApprovalRequest } from "./testnet-historical-approval-routes";
import { TESTNET_NOW, TESTNET_HASH } from "./testnet-quote.test-helper";

async function fixture() {
  const f = await wrappedReceiptFixture();
  f.receipt.logs.push({ address: C.USDC.address, topics: encodeEventTopics({ abi: erc20Abi, eventName: "Approval",
    args: { owner: f.f.owner, spender: P.router } }) as Hex[], data: encodeAbiParameters([{ type: "uint256" }], [1000000n]),
    blockNumber: f.receipt.blockNumber, blockHash: f.receipt.blockHash, transactionHash: f.tx.hash });
  const source = { ...f.source, async getChainId() { return 84532; },
    async getLatestBlock() { return { number: 125n, hash: TESTNET_HASH, timestamp: 1790800000n }; },
    async getBlockHash(block: bigint) { return block === 124n ? f.receipt.blockHash as Hex : TESTNET_HASH; },
    async getTransaction() { return f.tx; }, async getReceipt() { return f.receipt; },
    async getTokenAllowance(_token: string, _wallet: string, _spender: string, block: bigint): Promise<bigint> { return block === 124n ? 1000000n : 0n; },
  };
  const create = vi.fn(() => source), reader = new TestnetHistoricalApprovalReader(create, () => TESTNET_NOW);
  return { ...f, source, create, reader, request: { wallet: f.f.owner, hash: f.tx.hash } };
}

it("qualifies a historical one-use approval independently of the missing original review", async () => {
  const f = await fixture();
  expect(await f.reader.read(f.request)).toMatchObject({ wallet: f.f.owner, hash: f.tx.hash, chainId: 84532,
    kind: "approve", token: C.USDC.address, spender: P.router, approvedAmount: "1000000", currentAllowance: "0",
    receiptBlockNumber: "124", receiptBlockHash: f.receipt.blockHash, confirmations: "2",
    originalReviewAvailable: false, status: "verified-historical-approval", executionModel: "metamask-delegation",
    gasPayer: f.tx.from, actualTotalFeeQualified: false, executionEnabled: false });
});

it("rejects forged request fields and malformed wallet/hash before RPC", async () => {
  const f = await fixture();
  for (const value of [{ ...f.request, expected: f.expected }, { ...f.request, wallet: "0x0" },
    { ...f.request, hash: `0x${"00".repeat(32)}` }]) await expect(f.reader.read(value)).rejects.toMatchObject({ code: "TESTNET_HISTORICAL_REQUEST_INVALID" });
  expect(f.create).not.toHaveBeenCalled();
});

it("rejects another wallet, nonapproval calldata, wrong event, and receipt allowance mismatch", async () => {
  for (const mutation of ["wallet", "calldata", "event", "allowance", "transfer", "runtime", "auth"]) {
    const f = await fixture();
    if (mutation === "wallet") f.request.wallet = "0x1111111111111111111111111111111111111111";
    if (mutation === "calldata") f.tx.input = "0x12345678";
    if (mutation === "event") f.receipt.logs.at(-1)!.data = encodeAbiParameters([{ type: "uint256" }], [1000001n]);
    if (mutation === "allowance") f.source.getTokenAllowance = async () => 999999n;
    if (mutation === "transfer") f.receipt.logs.push({ ...f.receipt.logs.at(-1)!, topics: encodeEventTopics({ abi: erc20Abi,
      eventName: "Transfer", args: { from: f.f.owner, to: P.router } }) as Hex[] });
    if (mutation === "runtime") f.source.getCode = async () => "0x";
    if (mutation === "auth") f.tx.authorizationList = [];
    await expect(f.reader.read(f.request)).rejects.toMatchObject({ code: "TESTNET_HISTORICAL_UNVERIFIED" });
  }
});

it("requires successful two-confirmation canonical receipts and a stable fresh head", async () => {
  for (const mutation of ["failed", "confirmation", "reorg", "head", "stale", "wrong-chain"]) {
    const f = await fixture();
    if (mutation === "failed") f.receipt.status = "reverted";
    if (mutation === "confirmation") f.source.getLatestBlock = async () => ({ number: 124n, hash: f.receipt.blockHash as Hex, timestamp: 1790800000n });
    if (mutation === "reorg") f.source.getBlockHash = async () => TESTNET_HASH;
    if (mutation === "head") { const read = f.source.getBlockHash; f.source.getBlockHash = async block => block === 125n ? `0x${"ef".repeat(32)}` : read(block); }
    if (mutation === "stale") f.source.getLatestBlock = async () => ({ number: 125n, hash: TESTNET_HASH, timestamp: 1790799900n });
    if (mutation === "wrong-chain") f.source.getChainId = async () => 137;
    await expect(f.reader.read(f.request)).rejects.toThrow(/^TESTNET_HISTORICAL_/);
  }
});

it("routes bounded no-store read-only reconciliation and sanitizes provider failures", async () => {
  const f = await fixture(), path = "http://127.0.0.1:3021/api/v1/testnet/base-sepolia/historical-approval";
  const req = (value: unknown = f.request, suffix = "", contentType = "application/json") => new Request(path + suffix,
    { method: "POST", headers: { "content-type": contentType }, body: JSON.stringify(value) });
  for (const [request, status] of [[new Request(path), 405], [req(f.request, "?x=1"), 400], [req(f.request, "", "text/plain"), 415],
    [req({ padding: "x".repeat(5000) }), 413], [req({ ...f.request, expected: {} }), 400]] as const)
    expect((await handleTestnetHistoricalApprovalRequest(request, f.reader))?.status).toBe(status);
  expect(f.create).not.toHaveBeenCalled();
  const response = await handleTestnetHistoricalApprovalRequest(req(), f.reader);
  expect(response?.status).toBe(200); expect(response?.headers.get("cache-control")).toBe("no-store");
  expect(await response?.json()).toMatchObject({ reconciliation: { originalReviewAvailable: false, executionEnabled: false } });
  f.source.getChainId = async () => { throw new Error("secret-key-url"); };
  const failure = await handleTestnetHistoricalApprovalRequest(req(), f.reader);
  expect(await failure?.json()).toEqual({ error: "Historical approval could not be verified", code: "TESTNET_HISTORICAL_RPC_UNAVAILABLE" });
});
