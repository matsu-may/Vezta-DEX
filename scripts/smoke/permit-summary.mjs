// Read-only diagnostics. This is not a typed-data validator or signing policy.
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const sameAddress = (value, expected) => typeof value === "string" && value.toLowerCase() === expected.toLowerCase();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function uint(value, bits) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) return null;
  const result = BigInt(value);
  return result < (1n << BigInt(bits)) ? result : null;
}

export function summarizePermit(data, expected, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { present: false };
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error("Invalid diagnostic timestamp");
  const domain = object(data.domain);
  const values = object(data.values);
  const details = object(values.details);
  const amount = uint(details.amount, 160);
  const requested = uint(expected.amount, 160);
  const expiration = uint(details.expiration, 48);
  const deadline = uint(values.sigDeadline, 256);
  const now = BigInt(nowSeconds);
  return {
    present: true,
    domainMatchesPermit2: domain.name === "Permit2" && String(domain.chainId) === String(expected.chainId) && sameAddress(domain.verifyingContract, PERMIT2),
    tokenMatches: sameAddress(details.token, expected.token),
    amountKind: amount === null ? "invalid" : amount === (1n << 160n) - 1n ? "unlimited" : requested !== null && amount === requested ? "exact" : "other",
    // Permit2 maps expiration=0 to the execution block timestamp, not Unix epoch.
    allowanceExpirationMode: expiration === null ? "invalid" : expiration === 0n ? "execution-block" : "timestamp",
    allowanceExpirationWindowSeconds: expiration === null || expiration === 0n ? null : (expiration - now).toString(),
    signatureDeadlineWindowSeconds: deadline === null ? null : (deadline - now).toString(),
    allowanceExpired: expiration === null || expiration === 0n ? null : expiration < now,
    signatureExpired: deadline === null ? null : deadline < now,
  };
}
