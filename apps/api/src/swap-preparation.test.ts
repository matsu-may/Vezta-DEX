import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, TOKENS, type Permit2Data, type TradingIntent, type TradingQuoteSummary } from "@vezta-dex/core";
import { QuoteStore } from "./quote-store";
import { TradingApiClient } from "./trading-client";
import { SwapPreparer, type SwapPreparationChainSource } from "./swap-preparation";
import { handleRequest } from "./server";
import { PoolReader } from "./pools";

// Public deterministic test key only. No real wallet, RPC, signature or broadcast.
const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
const initial = Date.parse("2026-09-28T00:00:00Z");
const seconds = BigInt(initial / 1000);
const intent: TradingIntent = { chainId: 137, swapper: account.address, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
const summary: TradingQuoteSummary = { ...intent, chainId: 137, amountOut: "1000", minimumAmountOut: "995", routing: "CLASSIC", routerVersion: "2.1.2", requestId: "private-request", quotedAt: new Date(initial).toISOString(), source: "uniswap-trading-api" };
const permit: Permit2Data = {
  domain: { name: "Permit2", chainId: 137, verifyingContract: POLYGON_PERMIT2 },
  types: {
    PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
    PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
  },
  values: { details: { token: intent.tokenIn, amount: intent.amountIn, expiration: Number(seconds) + 2592000, nonce: 7 }, spender: POLYGON_UNIVERSAL_ROUTER_212, sigDeadline: Number(seconds) + 1800 },
};
const signature = await account.signTypedData({ domain: permit.domain, types: permit.types, primaryType: "PermitSingle", message: { details: { token: intent.tokenIn, amount: 1000000n, expiration: Number(seconds) + 2592000, nonce: 7 }, spender: POLYGON_UNIVERSAL_ROUTER_212, sigDeadline: seconds + 1800n } });

// ABI literals are independent of the production decoder constants.
function calldata(withPermit = true, minimum = 995n) {
  const path = `0x${intent.tokenIn.slice(2)}0001f4${intent.tokenOut.slice(2)}` as Hex;
  const swap = encodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"), [intent.swapper, 1000000n, minimum, path, true, []]);
  const signed = encodeAbiParameters(parseAbiParameters("((address,uint160,uint48,uint48),address,uint256),bytes"), [[[intent.tokenIn, 1000000n, Number(seconds) + 2592000, 7], POLYGON_UNIVERSAL_ROUTER_212, seconds + 1800n], signature]);
  return encodeFunctionData({ abi: parseAbi(["function execute(bytes,bytes[],uint256) payable"]), functionName: "execute", args: [withPermit ? "0x0a00" : "0x00", withPermit ? [signed, swap] : [swap], seconds + 30n] });
}

function payload(withPermit = true) {
  return { routing: "CLASSIC", privateMarker: "hidden-upstream", permitTransaction: null, permitData: withPermit ? permit : null, quote: { privateMarker: "hidden-quote", route: [[{ type: "v3-pool", address: "0x1111111111111111111111111111111111111111", tokenIn: { chainId: 137, address: intent.tokenIn }, tokenOut: { chainId: 137, address: intent.tokenOut } }]] } };
}
function upstream(withPermit = true) {
  return { requestId: "hidden-swap-request", swap: { chainId: 137, from: intent.swapper, to: POLYGON_UNIVERSAL_ROUTER_212, data: calldata(withPermit), value: "0", gasLimit: "9000000", gasPrice: "999999999999999999", authorizationList: ["ignored"], privateMarker: "hidden-upstream" } };
}
function setup(withPermit = true, overrides: Partial<SwapPreparationChainSource> = {}) {
  let now = initial;
  const store = new QuoteStore(() => now);
  const id = store.save(intent, summary, payload(withPermit), initial);
  const rpc: { method: string; args: unknown[] }[] = [];
  let blockReads = 0;
  const source: SwapPreparationChainSource = {
    getBlock: async () => ({ number: 123n + BigInt(Math.min(blockReads++, 1)), timestamp: seconds }),
    getAccountCode: async (...args) => { rpc.push({ method: "code", args }); return "0x"; },
    getPermitAllowance: async (...args) => { rpc.push({ method: "permit", args }); return { amount: withPermit ? 0n : 1000000n, expiration: withPermit ? 0n : seconds + 100n, nonce: 7n }; },
    getTokenAllowance: async (...args) => { rpc.push({ method: "approval", args }); return 1000000n; },
    getTokenBalance: async (...args) => { rpc.push({ method: "token", args }); return 1000000n; },
    getNativeBalance: async (...args) => { rpc.push({ method: "native", args }); return 1000000000000000000n; },
    getGasPrice: async () => 30000000000n,
    simulateSwap: async (...args) => { rpc.push({ method: "simulate", args }); },
    estimateSwapGas: async (...args) => { rpc.push({ method: "gas", args }); return 100000n; },
    ...overrides,
  };
  const posts: { url: string; options: RequestInit; body: Record<string, unknown> }[] = [];
  const api = { response: () => Promise.resolve(Response.json(upstream(withPermit))) };
  const client = new TradingApiClient("test-api-key", async (url, options) => {
    posts.push({ url: String(url), options: options!, body: JSON.parse(options!.body as string) });
    return api.response();
  });
  return { store, id, source, rpc, posts, api, preparer: new SwapPreparer(source, store, client, () => now), advance: (ms: number) => { now += ms; } };
}

describe("single-use EOA swap preparation", () => {
  it("returns only locally simulated unsigned calldata and bounded local gas, consuming the stored quote", async () => {
    const s = setup();
    const result = await s.preparer.prepare(intent, s.id, signature);
    expect(result).toMatchObject({ chainId: 137, quoteId: s.id, intent, quoteExpiresAt: "2026-09-28T00:00:30.000Z", deadline: String(seconds + 30n), transaction: { from: intent.swapper, to: POLYGON_UNIVERSAL_ROUTER_212, chainId: 137, data: calldata(), value: "0", gas: "120000", gasPrice: "36000000000" }, simulation: { status: "success", source: "polygon-rpc", blockNumber: "124", observedAt: "2026-09-28T00:00:00.000Z" } });
    expect(Object.keys(result.transaction).sort()).toEqual(["chainId", "data", "from", "gas", "gasPrice", "to", "value"]);
    expect(JSON.stringify(result)).not.toMatch(/hidden-|test-api-key|permitData/);
    expect(s.posts).toHaveLength(1);
    expect(s.posts[0].url).toBe("https://trade-api.gateway.uniswap.org/v1/swap");
    expect(s.posts[0].body).toEqual({ quote: payload().quote, permitData: permit, signature, deadline: Number(seconds) + 30, simulateTransaction: true });
    expect(s.posts[0].options.headers).toMatchObject({ "x-universal-router-version": "2.1.2" });
    expect(s.rpc.filter(({ method }) => method === "simulate").map(({ args }) => args[1])).toEqual([124n]);
    expect(s.rpc.filter(({ method }) => method === "approval").map(({ args }) => args)).toEqual([[intent.tokenIn, intent.swapper, POLYGON_PERMIT2, 123n], [intent.tokenIn, intent.swapper, POLYGON_PERMIT2, 124n], [intent.tokenIn, intent.swapper, POLYGON_PERMIT2, 124n]]);
    await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
    expect(s.posts).toHaveLength(1);
  });

  it("supports an exact existing Permit2 allowance without a signature", async () => {
    const s = setup(false);
    expect((await s.preparer.prepare(intent, s.id)).transaction.data).toBe(calldata(false));
    expect(s.posts[0].body).toEqual({ quote: payload(false).quote, deadline: Number(seconds) + 30, simulateTransaction: true });
  });

  it("resimulates and recomputes gas when Polygon advances during preparation", async () => {
    const s = setup(); let reads = 0;
    s.source.getBlock = async () => ({ number: 123n + BigInt(reads++), timestamp: seconds });
    s.source.estimateSwapGas = async (_tx, block) => block === 125n ? 200000n : 100000n;
    const result = await s.preparer.prepare(intent, s.id, signature);
    expect(result.transaction.gas).toBe("240000");
    expect(result.simulation.blockNumber).toBe("125");
    expect(s.rpc.filter(({ method }) => method === "simulate").map(({ args }) => args[1])).toEqual([124n, 125n]);
    expect(s.posts).toHaveLength(1);
  });

  it.each([undefined, "0x", `0x${"11".repeat(65)}`])("rejects missing/invalid signatures before contacting Uniswap %s", async (sig) => {
    const s = setup();
    await expect(s.preparer.prepare(intent, s.id, sig as Hex)).rejects.toThrow();
    expect(s.posts).toHaveLength(0);
  });
  it("rejects a surplus signature for an unsigned-existing-permission quote", async () => {
    const s = setup(false);
    await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
    expect(s.posts).toHaveLength(0);
  });
  it.each([0n, 999999n, 1000001n, (1n << 256n) - 1n])("rejects non-exact ERC20 approval %s", async (amount) => {
    const s = setup(true, { getTokenAllowance: async () => amount });
    await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
    expect(s.posts).toHaveLength(0);
  });
  it.each(["0x6000", "0xef01001111111111111111111111111111111111111111", undefined, "0x0"])("blocks unsupported or malformed code %s", async (code) => {
    const s = setup(true, { getAccountCode: async () => code as string });
    await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
    expect(s.posts).toHaveLength(0);
  });
  it("rejects a changed nonce and insufficient input before the signed request", async () => {
    for (const source of [{ getPermitAllowance: async () => ({ amount: 0n, expiration: 0n, nonce: 8n }) }, { getTokenBalance: async () => 999999n }]) {
      const s = setup(true, source);
      await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
      expect(s.posts).toHaveLength(0);
    }
  });
  it("rejects unsafe existing Permit2 state", async () => {
    for (const state of [{ amount: 1000001n, expiration: seconds + 100n, nonce: 7n }, { amount: 1000000n, expiration: seconds, nonce: 7n }, { amount: 1000000n, expiration: seconds + 2592001n, nonce: 7n }]) {
      const s = setup(false, { getPermitAllowance: async () => state });
      await expect(s.preparer.prepare(intent, s.id)).rejects.toThrow();
      expect(s.posts).toHaveLength(0);
    }
  });
  it("allows at most one concurrent signed request", async () => {
    const s = setup();
    const results = await Promise.allSettled([s.preparer.prepare(intent, s.id, signature), s.preparer.prepare(intent, s.id, signature)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(s.posts).toHaveLength(1);
  });
  it("rejects reusing an accepted PermitSingle for a different quote ID or preparer instance", async () => {
    const s = setup();
    await s.preparer.prepare(intent, s.id, signature);
    const anotherId = s.store.save(intent, summary, payload(), initial);
    let secondDispatches = 0;
    const next = new SwapPreparer(s.source, s.store, new TradingApiClient("test-key", async () => { secondDispatches++; return Response.json(upstream()); }), () => initial);
    await expect(next.prepare(intent, anotherId, signature)).rejects.toThrow();
    expect(secondDispatches).toBe(0);
  });
  it("does not restore or retry a consumed quote after network/HTTP/malformed failures", async () => {
    for (const response of [async () => { throw new Error("hidden-key-url"); }, async () => new Response("hidden-key-url", { status: 503 }), async () => Response.json({ swap: {} }), async () => Response.json({ ...upstream(), txFailureReasons: ["hidden-revert"] }), async () => new Response("x".repeat(256001))]) {
      const s = setup(); s.api.response = response;
      await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow("Swap preparation is unavailable");
      await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
      expect(s.posts).toHaveLength(1);
    }
  });
  it.each([{ chainId: 1 }, { from: POLYGON_PERMIT2 }, { to: POLYGON_PERMIT2 }, { value: "1" }, { data: "0x" }, { data: calldata(true, 994n) }])("rejects malicious transaction effects %s", async (change) => {
    const s = setup(); s.api.response = async () => Response.json({ ...upstream(), swap: { ...upstream().swap, ...change } });
    await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
    expect(s.rpc.filter(({ method }) => method === "simulate")).toHaveLength(0);
  });
  it("rejects a quote expiring in preflight, upstream or simulation", async () => {
    for (const phase of ["preflight", "upstream", "simulation"]) {
      const s = setup();
      if (phase === "preflight") s.source.getTokenBalance = async () => { s.advance(30000); return 1000000n; };
      if (phase === "upstream") s.api.response = async () => { s.advance(30000); return Response.json(upstream()); };
      if (phase === "simulation") s.source.simulateSwap = async () => { s.advance(30000); };
      await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
      expect(s.posts).toHaveLength(phase === "preflight" ? 0 : 1);
    }
  });
  it("rechecks code/nonce/approval at a new block after the API response", async () => {
    for (const phase of ["code", "nonce", "approval"]) {
      const s = setup(); let calls = 0;
      if (phase === "code") s.source.getAccountCode = async () => ++calls === 1 ? "0x" : "0x6000";
      if (phase === "nonce") s.source.getPermitAllowance = async () => ({ amount: 0n, expiration: 0n, nonce: ++calls === 1 ? 7n : 8n });
      if (phase === "approval") s.source.getTokenAllowance = async () => ++calls === 1 ? 1000000n : 0n;
      await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
      expect(s.posts).toHaveLength(1);
    }
  });
  it("rejects failed simulation, insufficient gas and malformed estimates", async () => {
    for (const source of [{ simulateSwap: async () => { throw new Error("hidden-revert"); } }, { getNativeBalance: async () => 4319999999999999n }, { estimateSwapGas: async () => 0n }, { estimateSwapGas: async () => 30000001n }, { getGasPrice: async () => -1n }]) {
      const s = setup(true, source);
      await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
    }
  });
  it("rechecks TTL after the final account/state read and refuses a stale Polygon block", async () => {
    const s = setup(); let calls = 0;
    s.source.getAccountCode = async () => { if (++calls === 3) s.advance(30000); return "0x"; };
    await expect(s.preparer.prepare(intent, s.id, signature)).rejects.toThrow();
    const stale = setup(true, { getBlock: async () => ({ number: 123n, timestamp: seconds - 121n }) });
    await expect(stale.preparer.prepare(intent, stale.id, signature)).rejects.toThrow();
    expect(stale.posts).toHaveLength(0);
  });
});

describe("swap preparation HTTP boundary", () => {
  const pools = new PoolReader({ getBlock: async () => { throw new Error("unused"); }, getPoolAddress: async () => { throw new Error("unused"); }, getPoolState: async () => { throw new Error("unused"); } });
  const request = (body: unknown) => new Request("http://localhost/api/v1/swap-preparation", { method: "POST", body: JSON.stringify(body) });
  it("returns a no-store unsigned preparation, never a raw quote or API key", async () => {
    const s = setup();
    const response = await handleRequest(request({ ...intent, quoteId: s.id, signature }), pools, undefined, undefined, undefined, undefined, s.preparer);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = await response.json();
    expect(result.preparation.transaction.data).toBe(calldata());
    expect(JSON.stringify(result)).not.toMatch(/hidden-|test-api-key|permitData/);
  });
  it("rejects extra quote/message/transaction fields, malformed JSON, missing service and errors safely", async () => {
    const s = setup();
    for (const extra of [{ quote: {} }, { permitData: permit }, { transaction: upstream().swap }, { chainId: 1 }, { signature: "0x" }, { quoteId: "wrong" }]) {
      expect((await handleRequest(request({ ...intent, quoteId: s.id, signature, ...extra }), pools, undefined, undefined, undefined, undefined, s.preparer)).status).toBe(400);
    }
    const malformed = new Request("http://localhost/api/v1/swap-preparation", { method: "POST", body: "{" });
    expect((await handleRequest(malformed, pools, undefined, undefined, undefined, undefined, s.preparer)).status).toBe(400);
    expect((await handleRequest(new Request("http://localhost/api/v1/swap-preparation"), pools)).status).toBe(405);
    expect((await handleRequest(request({ ...intent, quoteId: s.id, signature }), pools)).status).toBe(503);
    s.source.getBlock = async () => { throw new Error("hidden-rpc-secret"); };
    const failed = await handleRequest(request({ ...intent, quoteId: s.id, signature }), pools, undefined, undefined, undefined, undefined, s.preparer);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("hidden-rpc-secret");
  });
});
