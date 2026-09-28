import assert from "node:assert/strict";
import test from "node:test";
import { summarizePermit } from "./permit-summary.mjs";

const now = 1_790_460_000;
const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const token = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const expected = { chainId: 137, token, amount: "1000000" };
function permit(changes = {}) {
  return {
    domain: { chainId: 137, name: "Permit2", verifyingContract: permit2 },
    values: { details: { token, amount: "1000000", expiration: now + 30 * 86400, nonce: 0 }, sigDeadline: now + 1800 },
    types: { PermitSingle: [], PermitDetails: [] },
    ...changes,
  };
}

test("distinguishes Permit2 allowance expiry from signature deadline without exposing the message", () => {
  const result = summarizePermit(permit(), expected, now);
  assert.equal(result.present, true);
  assert.equal(result.domainMatchesPermit2, true);
  assert.equal(result.tokenMatches, true);
  assert.equal(result.amountKind, "exact");
  assert.equal(result.allowanceExpirationWindowSeconds, "2592000");
  assert.equal(result.signatureDeadlineWindowSeconds, "1800");
  assert.equal(result.allowanceExpired, false);
  assert.equal(result.signatureExpired, false);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("reports unlimited and mismatched permit amounts separately", () => {
  for (const [amount, kind] of [[((1n << 160n) - 1n).toString(), "unlimited"], ["2000000", "other"], ["not-an-amount", "invalid"]]) {
    const data = permit();
    data.values.details.amount = amount;
    assert.equal(summarizePermit(data, expected, now).amountKind, kind);
  }
});

test("handles absent, malformed, expired and out-of-range timing fields", () => {
  assert.deepEqual(summarizePermit(null, expected, now), { present: false });
  assert.deepEqual(summarizePermit("raw-secret", expected, now), { present: false });
  const data = permit();
  data.values.details.expiration = now - 1;
  data.values.sigDeadline = now - 1;
  const expired = summarizePermit(data, expected, now);
  assert.equal(expired.allowanceExpired, true);
  assert.equal(expired.signatureExpired, true);
  data.values.details.expiration = (1n << 48n).toString();
  data.values.sigDeadline = "bad";
  const invalid = summarizePermit(data, expected, now);
  assert.equal(invalid.allowanceExpirationWindowSeconds, null);
  assert.equal(invalid.signatureDeadlineWindowSeconds, null);
});

test("does not emit arbitrary permit data, nonce, signature or error text", () => {
  const secret = "secret-that-must-not-be-logged";
  const data = permit({ signature: secret, unexpected: secret });
  data.domain.chainId = 1;
  data.values.details.token = "0x1111111111111111111111111111111111111111";
  data.values.details.nonce = secret;
  const result = summarizePermit(data, expected, now);
  assert.equal(result.domainMatchesPermit2, false);
  assert.equal(result.tokenMatches, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal("nonce" in result, false);
  assert.equal("signature" in result, false);
});

test("reports zero allowance expiration as execution-block scoped rather than already expired", () => {
  const data = permit();
  data.values.details.expiration = 0;
  const result = summarizePermit(data, expected, now);
  assert.equal(result.allowanceExpirationMode, "execution-block");
  assert.equal(result.allowanceExpirationWindowSeconds, null);
  assert.equal(result.allowanceExpired, null);
  assert.equal(result.signatureDeadlineWindowSeconds, "1800");
});
