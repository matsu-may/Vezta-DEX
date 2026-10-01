import { describe, expect, it } from "vitest";
import { BASE_SEPOLIA_CANDIDATE } from "@vezta-dex/core";
import { inspectBaseSepoliaQuote, requestBaseSepoliaQuoteWithRetry, summarizeBaseSepoliaQuoteFailure } from "./base-sepolia-quote-probe";

const C = BASE_SEPOLIA_CANDIDATE;
const wallet = "0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1";
const pool = "0x1111111111111111111111111111111111111111";
const input = { chainId: 84532, address: C.USDC.address };
const output = { chainId: 84532, address: C.WETH.address };
function response() {
  return { requestId: "request-1", routing: "CLASSIC", quote: {
    chainId: 84532, tradeType: "EXACT_INPUT", swapper: wallet,
    input: { token: C.USDC.address as string, amount: "1000000" },
    output: { token: C.WETH.address, amount: "400000000000000", minimumAmount: "398000000000000", recipient: wallet },
    txFailureReasons: [] as string[], route: [[{ type: "v3-pool" as string, address: pool as string, tokenIn: input, tokenOut: output }]],
  } };
}

describe("Base Sepolia Trading API quote probe", () => {
  it("retries only an upstream routing timeout with bounded exponential delays", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await requestBaseSepoliaQuoteWithRetry(async () => {
      calls += 1;
      return calls < 3
        ? new Response(JSON.stringify({ errorCode: "UpstreamTimeoutError" }), { status: 404 })
        : new Response(JSON.stringify(response()), { status: 200 });
    }, async ms => { delays.push(ms); });
    expect(result).toMatchObject({ ok: true, attempts: 3 });
    expect(calls).toBe(3);
    expect(delays).toEqual([1000, 2000]);
  });

  it("stops after the third upstream timeout without exposing its body", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await requestBaseSepoliaQuoteWithRetry(async () => {
      calls += 1;
      return new Response(JSON.stringify({ errorCode: "UpstreamTimeoutError", detail: "private diagnostic" }), { status: 404 });
    }, async ms => { delays.push(ms); });
    expect(result).toEqual({ ok: false, attempts: 3, failure: {
      status: "testnet-quote-unavailable", upstreamStatus: 404, errorCode: "UpstreamTimeoutError",
    } });
    expect(calls).toBe(3);
    expect(delays).toEqual([1000, 2000]);
  });

  it("does not retry a permanent route failure", async () => {
    let calls = 0;
    const result = await requestBaseSepoliaQuoteWithRetry(async () => {
      calls += 1;
      return new Response(JSON.stringify({ errorCode: "NoRouteFoundError" }), { status: 404 });
    }, async () => { throw new Error("Unexpected delay"); });
    expect(result).toEqual({ ok: false, attempts: 1, failure: {
      status: "testnet-quote-unavailable", upstreamStatus: 404, errorCode: "NoRouteFoundError",
    } });
    expect(calls).toBe(1);
  });

  it("reports a documented routing error without exposing upstream details", async () => {
    const failure = new Response(JSON.stringify({
      errorCode: "NoRouteFoundError", detail: "private diagnostic", requestId: "private-request-id",
    }), { status: 404 });
    expect(await summarizeBaseSepoliaQuoteFailure(failure)).toEqual({
      status: "testnet-quote-unavailable", upstreamStatus: 404, errorCode: "NoRouteFoundError",
    });
  });

  it("classifies unknown and malformed errors without copying untrusted strings", async () => {
    const unknown = new Response(JSON.stringify({ errorCode: "KEY=secret", detail: "private diagnostic" }), { status: 404 });
    const malformed = new Response("<html>private diagnostic</html>", { status: 503 });
    expect(await summarizeBaseSepoliaQuoteFailure(unknown)).toEqual({
      status: "testnet-quote-unavailable", upstreamStatus: 404, errorCode: "UNCLASSIFIED",
    });
    expect(await summarizeBaseSepoliaQuoteFailure(malformed)).toEqual({
      status: "testnet-quote-unavailable", upstreamStatus: 503, errorCode: "UNCLASSIFIED",
    });
  });

  it("accepts only a bounded exact-input v3 route through the pinned candidate pool", () => {
    expect(inspectBaseSepoliaQuote(response(), wallet, [pool])).toMatchObject({
      chainId: 84532, routing: "CLASSIC", poolAddress: pool,
      amountIn: "1000000", amountOut: "400000000000000",
      minimumAmountOut: "398000000000000", requestId: "request-1" });
  });

  it("rejects wrong chain, pool, wallet, token, minimum or failure reason", () => {
    const mutations: Array<(value: ReturnType<typeof response>) => void> = [
      x => { x.quote.chainId = 137; },
      x => { x.quote.route[0][0].address = "0x2222222222222222222222222222222222222222"; },
      x => { x.quote.swapper = "0x2222222222222222222222222222222222222222"; },
      x => { x.quote.input.token = C.WETH.address; },
      x => { x.quote.output.minimumAmount = "1"; },
      x => { x.quote.txFailureReasons = ["NO_BALANCE"]; },
      x => { x.quote.route[0][0].type = "v4-pool"; },
    ];
    for (const mutate of mutations) {
      const value = response(); mutate(value);
      expect(() => inspectBaseSepoliaQuote(value, wallet, [pool])).toThrow();
    }
  });
});
