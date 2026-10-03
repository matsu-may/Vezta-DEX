import { expect, it } from "vitest";
import { parseTestnetWalletReview, parseTestnetWalletObservation, parseTestnetSubmission } from "./testnet-wallet-contracts";
import { reviewedFixture, memoryStorage } from "./testnet-wallet.test-helper";
import { readTestnetSubmission, writeTestnetSubmission, clearTestnetSubmission, TESTNET_SUBMISSION_KEY } from "./testnet-wallet-storage";


it("binds actual server fixtures to the original quote and exact/reset transactions in both directions", async () => {
  for (const reverse of [false, true]) for (const kind of ["swap", "approve", "reset"] as const) {
    const { f, checked, q, review } = await reviewedFixture(kind, reverse);
    expect(review.action?.kind).toBe(kind); expect(review.action?.executionEnabled).toBe(false);
    for (const change of ["intent", "quote-id", "expiry", "calldata", "nonce", "gas", "funding", "minimum"]) {
      const bad = structuredClone(checked);
      if (change === "intent") bad.study.intent.amountIn = "5000000";
      if (change === "quote-id") bad.study.quoteId = "11".repeat(24);
      if (change === "expiry") bad.action!.quoteExpiresAt = new Date(f.clock() + 86400000).toISOString();
      if (change === "calldata") bad.action!.transaction.data = "0x1234";
      if (change === "nonce") bad.action!.transaction.nonce = "8";
      if (change === "gas") bad.action!.transaction.gasPrice = "0";
      if (change === "funding") bad.study.funding.inputBalanceSufficient = false;
      if (change === "minimum") bad.action!.transaction.value = "1" as "0";
      expect(() => parseTestnetWalletReview(bad, q, kind === "swap" ? "swap" : "approval", f.clock())).toThrow();
    }
    expect(() => parseTestnetWalletReview(checked, q, kind === "swap" ? "swap" : "approval", f.clock() + 30000)).toThrow();
  }
});

it("stores original attempts without extending broadcast expiry; refuses corruption and conflicting ownership", async () => {
  const { f, q, review } = await reviewedFixture(); const storage = memoryStorage();
  const record = { version: 1 as const, intent: f.request.intent, quote: q.quote, action: review.action!, attemptedAt: f.clock(), hash: null };
  writeTestnetSubmission(storage, record);
  expect(readTestnetSubmission(storage)).toEqual({ kind: "record", record: parseTestnetSubmission(record) });
  expect(() => writeTestnetSubmission(storage, record)).toThrow();
  const sent = { ...record, hash: `0x${"11".repeat(32)}` };
  writeTestnetSubmission(storage, sent, record); expect(readTestnetSubmission(storage).kind).toBe("record");
  expect(() => clearTestnetSubmission(storage, record)).toThrow();
  clearTestnetSubmission(storage, sent); expect(readTestnetSubmission(storage).kind).toBe("empty");
  storage.setItem(TESTNET_SUBMISSION_KEY, JSON.stringify({ ...record, quote: { ...record.quote, minimumAmountOut: "1" } }));
  expect(readTestnetSubmission(storage).kind).toBe("invalid");
  storage.setItem(TESTNET_SUBMISSION_KEY, "x".repeat(8193)); expect(readTestnetSubmission(storage).kind).toBe("invalid");
});

it("validates original receipt identity and economics without requiring an unexpired execution quote", async () => {
  const { f, q, review } = await reviewedFixture(); const hash = `0x${"11".repeat(32)}`;
  const record = { version: 1 as const, intent: f.request.intent, quote: q.quote, action: review.action!, attemptedAt: f.clock(), hash };
  const observed = { observation: { contextId: record.action.contextId, hash, kind: "swap", chainId: 84532,
    source: "base-sepolia-rpc", observedAt: new Date(f.clock()).toISOString(), executionEnabled: false,
    status: "confirmed", confirmations: "2", blockNumber: "124", blockHash: `0x${"cd".repeat(32)}`,
    execution: { status: "verified", amountIn: record.intent.amountIn, amountOut: record.quote.amountOut,
      l2GasCost: "123", actualTotalFeeQualified: false, tokenAllowance: "0", allowanceMatchesExpected: true,
      balances: { USDC: "0", WETH: record.quote.amountOut, ETH: "100" }, stateBlockNumber: "125", stateBlockHash: `0x${"ef".repeat(32)}` } } };
  expect(parseTestnetWalletObservation(observed, record, f.clock()).status).toBe("confirmed");
  for (const change of ["context", "hash", "chain", "kind", "spend", "output", "confirmation"]) {
    const bad = structuredClone(observed);
    if (change === "context") bad.observation.contextId = "ab".repeat(24);
    if (change === "hash") bad.observation.hash = `0x${"22".repeat(32)}`;
    if (change === "chain") bad.observation.chainId = 137;
    if (change === "kind") bad.observation.kind = "approve";
    if (change === "spend") bad.observation.execution.amountIn = "1";
    if (change === "output") bad.observation.execution.amountOut = "1";
    if (change === "confirmation") bad.observation.confirmations = "1";
    expect(() => parseTestnetWalletObservation(bad, record, f.clock())).toThrow();
  }
});

it("binds coupled EIP-1559 gas studies and keeps their fields in original recovery", async () => {
  const { f, q, checked } = await reviewedFixture();
  const fees = { feeModel: "eip1559", maxFeePerGas: checked.action!.transaction.gasPrice, maxPriorityFeePerGas: "1000000" };
  Object.assign(checked.action!.transaction, fees); Object.assign(checked.study.transaction!, fees); Object.assign(checked.study.gas!, fees);
  const review = parseTestnetWalletReview(checked, q, "swap", f.clock());
  const record = parseTestnetSubmission({ version: 1, intent: f.request.intent, quote: q.quote, action: review.action!, attemptedAt: f.clock(), hash: null });
  expect(record.action.transaction).toMatchObject(fees);
  for (const target of ["gas", "transaction", "action"] as const) {
    const bad = structuredClone(checked);
    const part = target === "action" ? bad.action!.transaction : target === "transaction" ? bad.study.transaction! : bad.study.gas!;
    Object.assign(part, { maxPriorityFeePerGas: "2" });
    expect(() => parseTestnetWalletReview(bad, q, "swap", f.clock())).toThrow();
  }
  const storage = memoryStorage(); writeTestnetSubmission(storage, record);
  const changed = structuredClone(record); Object.assign(changed.action.transaction, { maxPriorityFeePerGas: "2" });
  expect(() => clearTestnetSubmission(storage, changed)).toThrow();
  expect(readTestnetSubmission(storage)).toEqual({ kind: "record", record });
});
