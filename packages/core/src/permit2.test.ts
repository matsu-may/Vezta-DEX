import { describe, expect, it } from "vitest";
import { TOKENS, POLYGON_UNIVERSAL_ROUTER_212, type TradingIntent } from "./index";
import * as policy from "./permit2";

const now = Date.parse("2026-09-28T00:00:00Z");
const seconds = now / 1_000;
const intent: TradingIntent = {
  chainId: 137, swapper: "0x1111111111111111111111111111111111111111",
  tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50,
};

function fixture() {
  return {
    domain: { name: "Permit2", chainId: 137, verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
    types: {
      PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
      PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
    },
    values: { details: { token: intent.tokenIn, amount: intent.amountIn, expiration: seconds + 2_592_000, nonce: 7 }, spender: POLYGON_UNIVERSAL_ROUTER_212, sigDeadline: seconds + 1_800 },
  };
}

describe("standard Permit2 permission policy", () => {
  it("accepts exact amounts at the approved time caps without changing signed values", () => {
    const data = fixture();
    const original = structuredClone(data);
    expect(policy.validatePermit2Data(data, intent, 7n, now)).toEqual(original);
    expect(data).toEqual(original);
    expect(policy.PERMIT2_POLICY).toEqual({ maxAllowanceSeconds: 2_592_000, maxSignatureSeconds: 1_800 });
  });

  it("accepts canonical string uint values with the same EIP-712 meaning", () => {
    const data = JSON.parse(JSON.stringify(fixture())) as ReturnType<typeof fixture>;
    const strings = { ...data, domain: { ...data.domain, chainId: "137" }, values: { ...data.values, sigDeadline: String(data.values.sigDeadline), details: { ...data.values.details, expiration: String(data.values.details.expiration), nonce: "7" } } };
    expect(policy.validatePermit2Data(strings, intent, 7n, now)).toEqual(strings);
  });

  const mutations: [string, (data: ReturnType<typeof fixture>) => void][] = [
    ["wrong domain name", (d) => { d.domain.name = "Permit"; }],
    ["wrong chain", (d) => { d.domain.chainId = 1; }],
    ["wrong verifying contract", (d) => { d.domain.verifyingContract = intent.swapper; }],
    ["wrong token", (d) => { d.values.details.token = TOKENS.WETH.address as typeof intent.tokenIn; }],
    ["wrong spender", (d) => { Object.assign(d.values, { spender: intent.swapper }); }],
    ["wrong amount", (d) => { d.values.details.amount = "1000001"; }],
    ["unlimited amount", (d) => { d.values.details.amount = ((1n << 160n) - 1n).toString(); }],
    ["advanced nonce", (d) => { d.values.details.nonce = 8; }],
    ["nonce overflow", (d) => { d.values.details.nonce = 2 ** 48; }],
    ["negative nonce", (d) => { d.values.details.nonce = -1; }],
    ["fractional expiration", (d) => { d.values.details.expiration += 0.5; }],
    ["unsafe integer deadline", (d) => { d.values.sigDeadline = Number.MAX_SAFE_INTEGER + 1; }],
    ["zero expiration", (d) => { d.values.details.expiration = 0; }],
    ["expired allowance", (d) => { d.values.details.expiration = seconds; }],
    ["excess allowance window", (d) => { d.values.details.expiration += 1; }],
    ["expired signature", (d) => { d.values.sigDeadline = seconds; }],
    ["excess signature window", (d) => { d.values.sigDeadline += 1; }],
    ["changed field type", (d) => { d.types.PermitDetails[1].type = "uint256"; }],
    ["changed field order", (d) => { d.types.PermitDetails.reverse(); }],
    ["extra type", (d) => { Object.assign(d.types, { PermitBatch: [] }); }],
    ["extra domain field", (d) => { Object.assign(d.domain, { version: "1" }); }],
    ["extra signed value", (d) => { Object.assign(d.values, { recipient: intent.swapper }); }],
    ["extra detail", (d) => { Object.assign(d.values.details, { chainId: 137 }); }],
    ["extra top-level field", (d) => { Object.assign(d, { primaryType: "PermitBatch" }); }],
    ["extra type field", (d) => { Object.assign(d.types.PermitDetails[0], { ignored: true }); }],
    ["noncanonical integer", (d) => { d.values.details.amount = "01000000"; }],
  ];
  it.each(mutations)("rejects %s", (_name, mutate) => {
    const data = fixture();
    mutate(data);
    expect(() => policy.validatePermit2Data(data, intent, 7n, now)).toThrow();
  });

  it("rejects malformed objects, invalid intent and an invalid validation clock", () => {
    for (const data of [null, [], {}, { ...fixture(), values: null }]) {
      expect(() => policy.validatePermit2Data(data, intent, 7n, now)).toThrow();
    }
    expect(() => policy.validatePermit2Data(fixture(), { ...intent, chainId: 1 }, 7n, now)).toThrow();
    expect(() => policy.validatePermit2Data(fixture(), intent, 7n, NaN)).toThrow();
  });
});
