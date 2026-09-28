import { POLYGON_UNIVERSAL_ROUTER_212, validateTradingIntent, type TradingIntent } from "./trading";
import type { Address } from "./index";

export const POLYGON_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
export const PERMIT2_POLICY = Object.freeze({ maxAllowanceSeconds: 2_592_000, maxSignatureSeconds: 1_800 });

const canonicalTypes = {
  PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
  PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
} as const;

type Uint = string | number;
export interface Permit2Data {
  domain: { name: "Permit2"; chainId: 137; verifyingContract: Address };
  types: typeof canonicalTypes;
  values: {
    details: { token: Address; amount: Uint; expiration: Uint; nonce: Uint };
    spender: Address;
    sigDeadline: Uint;
  };
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Permit2 object");
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) throw new Error("Invalid Permit2 fields");
  return record;
}

function uint(value: unknown, bits: number): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid Permit2 integer");
  if (typeof value !== "number" && (typeof value !== "string" || !/^(0|[1-9]\d{0,77})$/.test(value))) throw new Error("Invalid Permit2 integer");
  const result = BigInt(value as Uint);
  if (result >= 1n << BigInt(bits)) throw new Error("Permit2 integer overflow");
  return result;
}

function address(value: unknown, expected: string): void {
  if (typeof value !== "string" || value.toLowerCase() !== expected.toLowerCase()) throw new Error("Permit2 address mismatch");
}

/** Validate, never repair, the exact message from the stored quote. Nonce is a pinned chain snapshot. */
export function validatePermit2Data(data: unknown, intent: TradingIntent, nonce: bigint, now: number): Permit2Data {
  validateTradingIntent(intent);
  if (!Number.isSafeInteger(now) || now < 0 || nonce < 0n || nonce >= 1n << 48n) throw new Error("Invalid Permit2 validation context");
  const root = object(data, ["domain", "types", "values"]);
  const domain = object(root.domain, ["name", "chainId", "verifyingContract"]);
  // viem infers EIP712Domain.chainId only from numeric values. Preserve, never normalize, API data.
  if (domain.name !== "Permit2" || domain.chainId !== 137) throw new Error("Permit2 domain mismatch");
  address(domain.verifyingContract, POLYGON_PERMIT2);
  const types = object(root.types, ["PermitSingle", "PermitDetails"]);
  for (const key of ["PermitSingle", "PermitDetails"] as const) {
    const fields = types[key];
    if (!Array.isArray(fields) || fields.length !== canonicalTypes[key].length) throw new Error("Invalid Permit2 types");
    fields.forEach((value, index) => {
      const field = object(value, ["name", "type"]);
      if (field.name !== canonicalTypes[key][index].name || field.type !== canonicalTypes[key][index].type) throw new Error("Invalid Permit2 field type");
    });
  }
  const values = object(root.values, ["details", "spender", "sigDeadline"]);
  const details = object(values.details, ["token", "amount", "expiration", "nonce"]);
  address(values.spender, POLYGON_UNIVERSAL_ROUTER_212);
  address(details.token, intent.tokenIn);
  if (uint(details.amount, 160) !== BigInt(intent.amountIn) || uint(details.nonce, 48) !== nonce) throw new Error("Permit2 amount or nonce mismatch");
  const seconds = BigInt(Math.floor(now / 1_000));
  const expiration = uint(details.expiration, 48);
  const deadline = uint(values.sigDeadline, 256);
  // Zero has execution-block semantics on-chain; this adapter supports timestamp permits only.
  if (expiration <= seconds || expiration > seconds + BigInt(PERMIT2_POLICY.maxAllowanceSeconds)) throw new Error("Unsupported Permit2 allowance lifetime");
  if (deadline <= seconds || deadline > seconds + BigInt(PERMIT2_POLICY.maxSignatureSeconds)) throw new Error("Unsupported Permit2 signature deadline");
  return structuredClone(data) as Permit2Data;
}
