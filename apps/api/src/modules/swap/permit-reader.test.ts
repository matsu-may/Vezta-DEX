import { describe, expect, it } from "vitest";
import { TOKENS, POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, type TradingIntent, type TradingQuoteSummary } from "@vezta-dex/core";
import { PermitReader, type PermitChainSource } from "./permit-reader";
import { QuoteStore } from "./quote-store";
import { handleRequest } from "../../http/server";
import { PoolReader } from "../discovery/pools";

const initial = Date.parse("2026-09-28T00:00:00Z");
const seconds = BigInt(initial / 1_000);
const intent: TradingIntent = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
const summary: TradingQuoteSummary = { ...intent, chainId: 137, amountOut: "1000000000000000", minimumAmountOut: "995000000000000", routing: "CLASSIC", routerVersion: "2.1.2", requestId: "private-request", quotedAt: new Date(initial).toISOString(), source: "uniswap-trading-api" };

function payload() {
  return {
    routing: "CLASSIC", privateMarker: "hidden-upstream", permitTransaction: null,
    quote: { route: [[{ type: "v3-pool", address: "0x1111111111111111111111111111111111111111", tokenIn: { chainId: 137, address: intent.tokenIn }, tokenOut: { chainId: 137, address: intent.tokenOut } }]] },
    permitData: {
      domain: { name: "Permit2", chainId: 137, verifyingContract: POLYGON_PERMIT2 },
      types: {
        PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
        PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
      },
      values: { details: { token: intent.tokenIn, amount: intent.amountIn, expiration: Number(seconds) + 2_592_000, nonce: 7 }, spender: POLYGON_UNIVERSAL_ROUTER_212, sigDeadline: Number(seconds) + 1_800 },
    },
  };
}

function setup(raw: unknown = payload(), overrides: Partial<PermitChainSource> = {}) {
  let now = initial;
  const nowFn = () => now;
  const store = new QuoteStore(nowFn);
  const id = store.save(intent, summary, raw, initial);
  const calls: unknown[][] = [];
  const source: PermitChainSource = {
    getBlock: async () => ({ number: 123n, timestamp: seconds }),
    getAccountCode: async () => "0x",
    getPermitAllowance: async (...args) => { calls.push(args); return { amount: 0n, expiration: 0n, nonce: 7n }; },
    ...overrides,
  };
  return { store, id, calls, source, reader: new PermitReader(source, store, nowFn), advance: (ms: number) => { now += ms; } };
}

describe("quote-bound read-only Permit2 plan", () => {
  it("checks account code at the pinned Polygon block", async () => {
    const codeCalls: unknown[][] = [];
    const s = setup(payload(), { getAccountCode: async (...args) => { codeCalls.push(args); return "0x"; } });
    expect((await s.reader.getPlan(intent, s.id)).permit.kind).toBe("sign");
    expect(codeCalls).toEqual([[intent.swapper, 123n]]);
  });

  it.each(["0x00", "0x6000", "0xef01001111111111111111111111111111111111111111"])("blocks deployed or delegated code %s before exposing signing data", async (code) => {
    const s = setup(payload(), { getAccountCode: async () => code });
    const result = await s.reader.getPlan(intent, s.id);
    expect(result.permit).toEqual({ kind: "blocked-account" });
    expect(s.calls).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("PermitSingle");
  });

  it.each([undefined, null, "", "0X", "0x0", "0xzz"])("fails closed on unavailable or malformed code %s", async (code) => {
    const s = setup(payload(), { getAccountCode: async () => code as string });
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
    expect(s.calls).toEqual([]);
  });

  it("does not reuse an exact existing permit for a contract account", async () => {
    const s = setup({ ...payload(), permitData: null }, { getAccountCode: async () => "0x6000" });
    expect((await s.reader.getPlan(intent, s.id)).permit).toEqual({ kind: "blocked-account" });
  });

  it("rechecks quote expiry after a delayed code read", async () => {
    const s = setup();
    s.source.getAccountCode = async () => { s.advance(30_000); return "0x"; };
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
    expect(s.calls).toEqual([]);
  });
  it("returns only validated unchanged signing data and pinned block provenance", async () => {
    const s = setup();
    const result = await s.reader.getPlan(intent, s.id);
    expect(result).toMatchObject({ chainId: 137, quoteId: s.id, blockNumber: "123", observedAt: new Date(initial).toISOString(), quoteExpiresAt: new Date(initial + 30_000).toISOString(), permit: { kind: "sign", data: payload().permitData } });
    expect(s.calls).toEqual([[intent.tokenIn, intent.swapper, POLYGON_UNIVERSAL_ROUTER_212, 123n]]);
    expect(JSON.stringify(result)).not.toContain("hidden-upstream");
    expect(result).not.toHaveProperty("quote");
    expect(s.store.consume(s.id, intent, "2.1.2").payload).toEqual(payload());
  });

  it("rejects a changed nonce from another client", async () => {
    const s = setup(payload(), { getPermitAllowance: async () => ({ amount: 0n, expiration: 0n, nonce: 8n }) });
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
  });

  it("rejects a quote that expires during the allowance RPC call", async () => {
    const s = setup();
    s.source.getPermitAllowance = async () => { s.advance(30_000); return { amount: 0n, expiration: 0n, nonce: 7n }; };
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
  });

  it("rejects an ID consumed by another request during the RPC call", async () => {
    const s = setup();
    s.source.getPermitAllowance = async () => { s.store.consume(s.id, intent, "2.1.2"); return { amount: 0n, expiration: 0n, nonce: 7n }; };
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
  });

  it("rejects a wrong intent or ID before reading chain data", async () => {
    const s = setup();
    s.source.getBlock = async () => { throw new Error("must not reach RPC"); };
    for (const [value, id] of [[{ ...intent, chainId: 1 }, s.id], [{ ...intent, amountIn: "2" }, s.id], [intent, "unknown"]] as const) {
      await expect(s.reader.getPlan(value, id)).rejects.toThrow("Invalid permit plan request");
    }
  });

  it.each([-121, 6])("rejects a block timestamp offset %s seconds", async (offset) => {
    const s = setup(payload(), { getBlock: async () => ({ number: 123n, timestamp: seconds + BigInt(offset) }) });
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
  });

  it("rejects a block that becomes stale during a delayed state read", async () => {
    const s = setup(payload(), { getBlock: async () => ({ number: 123n, timestamp: seconds - 119n }) });
    s.source.getPermitAllowance = async () => { s.advance(2_000); return { amount: 0n, expiration: 0n, nonce: 7n }; };
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
  });

  it.each([
    { amount: 1n << 160n, expiration: 0n, nonce: 7n },
    { amount: 0n, expiration: 1n << 48n, nonce: 7n },
    { amount: 0n, expiration: 0n, nonce: 1n << 48n },
    { amount: -1n, expiration: 0n, nonce: 7n },
  ])("rejects out-of-range chain allowance state %s", async (state) => {
    const s = setup(payload(), { getPermitAllowance: async () => state });
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
  });

  it("rejects an allowance/signature already expired at a slightly ahead block", async () => {
    const raw = payload();
    raw.permitData.values.sigDeadline = Number(seconds) + 3;
    const s = setup(raw, { getBlock: async () => ({ number: 123n, timestamp: seconds + 4n }) });
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
  });

  it.each(["permit", "transaction", "route", "missing"])("rejects unsupported %s metadata", async (field) => {
    const raw = payload();
    if (field === "permit") raw.permitData.values.details.amount = "2";
    if (field === "transaction") Object.assign(raw, { permitTransaction: { data: "0xdead" } });
    if (field === "route") raw.quote.route[0][0].type = "unknown";
    if (field === "missing") Object.assign(raw, { permitData: undefined });
    const s = setup(raw);
    await expect(s.reader.getPlan(intent, s.id)).rejects.toThrow();
  });

  it("requires an actual exact allowance within the time cap when the API returns no permit", async () => {
    const s = setup({ ...payload(), permitData: null }, { getPermitAllowance: async () => ({ amount: 1_000_000n, expiration: seconds + 2_592_000n, nonce: 7n }) });
    expect((await s.reader.getPlan(intent, s.id)).permit).toEqual({ kind: "ready" });
  });

  it.each([
    { amount: 0n, expiration: seconds + 100n, nonce: 7n },
    { amount: (1n << 160n) - 1n, expiration: seconds + 100n, nonce: 7n },
    { amount: 1_000_000n, expiration: seconds, nonce: 7n },
    { amount: 1_000_000n, expiration: seconds + 2_592_001n, nonce: 7n },
  ])("blocks absent, excessive, expired or long existing permissions %s", async (state) => {
    const s = setup({ ...payload(), permitData: null }, { getPermitAllowance: async () => state });
    expect((await s.reader.getPlan(intent, s.id)).permit).toEqual({ kind: "blocked-existing" });
  });
});

describe("Permit2 plan HTTP boundary", () => {
  const pools = new PoolReader({ getBlock: async () => { throw new Error("not used"); }, getPoolAddress: async () => { throw new Error("not used"); }, getPoolState: async () => { throw new Error("not used"); } });
  const request = (body: unknown) => new Request("http://localhost/api/v1/permit-plan", { method: "POST", body: JSON.stringify(body) });

  it("serves a no-store read-only plan using the stored quote", async () => {
    const s = setup();
    const response = await handleRequest(request({ ...intent, quoteId: s.id }), pools, undefined, undefined, undefined, s.reader);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.permitPlan.permit.data).toEqual(payload().permitData);
    expect(body).not.toHaveProperty("quote");
    expect(JSON.stringify(body)).not.toContain("hidden-upstream");
  });

  it("rejects malformed inputs and unavailable services without exposing details", async () => {
    const s = setup();
    for (const body of [{ ...intent, quoteId: "wrong" }, { ...intent, chainId: 1, quoteId: s.id }, { ...intent, quoteId: s.id, permitData: payload().permitData }]) {
      expect((await handleRequest(request(body), pools, undefined, undefined, undefined, s.reader)).status).toBe(400);
    }
    const malformed = new Request("http://localhost/api/v1/permit-plan", { method: "POST", body: "{" });
    expect((await handleRequest(malformed, pools, undefined, undefined, undefined, s.reader)).status).toBe(400);
    expect((await handleRequest(new Request("http://localhost/api/v1/permit-plan"), pools, undefined, undefined, undefined, s.reader)).status).toBe(405);
    expect((await handleRequest(request({ ...intent, quoteId: s.id }), pools)).status).toBe(503);
    const broken = setup(payload(), { getBlock: async () => { throw new Error("secret-rpc-key"); } });
    const response = await handleRequest(request({ ...intent, quoteId: broken.id }), pools, undefined, undefined, undefined, broken.reader);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-rpc-key");
  });
});
