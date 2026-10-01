import { afterEach, expect, it, vi } from "vitest";
import { decodeAbiParameters, encodeAbiParameters } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { TestnetDiscoveryReader } from "./testnet-discovery";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function hungFetch(signals: AbortSignal[]) {
  return vi.fn<typeof fetch>(async (_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error("RPC request must carry cancellation");
    signals.push(signal);
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    });
  });
}

it("preserves the eight-second RPC timeout while a study signal is supplied", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", hungFetch(signals));
  const controller = new AbortController();
  let settled = false;
  const result = createBaseSepoliaPreflightSource("https://timeout.example.invalid", controller.signal)
    .getChainId().catch(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(8200);
  expect(signals).toHaveLength(1);
  expect(signals[0].aborted).toBe(true);
  expect(settled).toBe(true);
  expect(controller.signal.aborted).toBe(false);
  await result;
});

it("propagates the 45-second study deadline to an RPC request started late in the study", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", hungFetch(signals));
  const reader = new TestnetDiscoveryReader(async signal => {
    await new Promise(resolve => setTimeout(resolve, 40000));
    return createBaseSepoliaPreflightSource("https://deadline.example.invalid", signal).getChainId();
  });
  const failure = expect(reader.read()).rejects.toMatchObject({ code: "DEPTH_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(40000);
  expect(signals).toHaveLength(1);
  expect(signals[0].aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(5000);
  await failure;
  expect(signals[0].aborted).toBe(true);
});

it("encodes a reverse QuoterV2 call at the requested block and preserves all quote fields", async () => {
  const calls: Array<{ method: string; params: [{ to: string; data: `0x${string}` }, string] }> = [];
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: encodeAbiParameters([
      { type: "uint256" }, { type: "uint160" }, { type: "uint32" }, { type: "uint256" },
    ], [249875n, 1584563250285286751870879006720001n, 3, 120000n]) }),
    { headers: { "content-type": "application/json" } });
  });
  const source = createBaseSepoliaPreflightSource("https://rpc.example.invalid");
  expect(await source.quoteExactInput(C.WETH.address, C.USDC.address, 100000000000000n, 500, 123n))
    .toEqual({ amountOut: 249875n, sqrtPriceX96After: 1584563250285286751870879006720001n,
      initializedTicksCrossed: 3, gasEstimate: 120000n });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ method: "eth_call", params: [{ to: C.v3QuoterV2 }, "0x7b"] });
  // Official IQuoterV2 tuple order: tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96.
  expect(calls[0].params[0].data.slice(0, 10)).toBe("0xc6a5026a");
  expect(decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" },
    { type: "uint24" }, { type: "uint160" }], `0x${calls[0].params[0].data.slice(10)}`))
    .toEqual([C.WETH.address, C.USDC.address, 100000000000000n, 500, 0n]);
});
