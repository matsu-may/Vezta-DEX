import test from "node:test";
import assert from "node:assert/strict";
import { summarizeApprovalTransaction } from "./approval-summary.mjs";

const wallet = "0x1111111111111111111111111111111111111111";
const token = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const calldata = (amount) => `0x095ea7b3${permit2.slice(2).toLowerCase().padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
const tx = (amount) => ({ from: wallet, to: token, chainId: 137, value: "0", data: calldata(amount) });

test("summarizes exact ERC20 approval without exposing calldata", () => {
  const result = summarizeApprovalTransaction(tx(1_000_000n), { wallet, token, amount: 1_000_000n });
  assert.deepEqual(result, {
    present: true,
    chainMatches: true,
    fromMatchesWallet: true,
    targetMatchesToken: true,
    valueZero: true,
    isErc20Approve: true,
    spender: permit2.toLowerCase(),
    spenderMatchesPermit2: true,
    allowanceKind: "exact",
  });
  assert.equal(JSON.stringify(result).includes("095ea7b3"), false);
});

test("flags unlimited approval and malformed calldata", () => {
  const unlimited = summarizeApprovalTransaction(tx((1n << 256n) - 1n), { wallet, token, amount: 1_000_000n });
  assert.equal(unlimited.allowanceKind, "unlimited");
  const malformed = summarizeApprovalTransaction({ ...tx(1n), data: "0xdeadbeef" }, { wallet, token, amount: 1_000_000n });
  assert.equal(malformed.isErc20Approve, false);
  assert.equal(malformed.allowanceKind, "unknown");
  assert.deepEqual(summarizeApprovalTransaction(null, { wallet, token, amount: 1_000_000n }), { present: false });
});

test("detects wrong transaction identity and zero-value cancellation", () => {
  const result = summarizeApprovalTransaction({ ...tx(0n), chainId: 1, from: permit2, to: permit2, value: "1" }, { wallet, token, amount: 1_000_000n });
  assert.equal(result.chainMatches, false);
  assert.equal(result.fromMatchesWallet, false);
  assert.equal(result.targetMatchesToken, false);
  assert.equal(result.valueZero, false);
  assert.equal(result.allowanceKind, "zero");
});
