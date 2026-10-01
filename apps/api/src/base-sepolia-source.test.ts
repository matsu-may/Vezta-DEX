import { afterEach, expect, it, vi } from "vitest";
import { decodeAbiParameters, encodeAbiParameters, toFunctionSelector } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { TestnetDiscoveryReader } from "./testnet-discovery";
import { classifyTestnetRpcFailure } from "./testnet-rpc-diagnostics";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each(["no-length", "understated-length", "large-declared"])("rejects and cancels oversized RPC response streams (%s)", async mode => {
  const limit = 1048576; let emitted = 0; let cancelled = false;
  vi.stubGlobal("fetch", async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) { emitted += 65536; controller.enqueue(new Uint8Array(65536));
      if (emitted === 2097152) controller.close(); },
    cancel() { cancelled = true; },
  }), { headers: mode === "no-length" ? {} : { "content-length": mode === "large-declared" ? "2097152" : "64" } }));
  const failure = await createBaseSepoliaPreflightSource(`https://${mode}.example.invalid`)
    .getCode(P.pool, 123n).then(() => null, error => error);
  expect(classifyTestnetRpcFailure(failure)).toEqual({ kind: "response-too-large" });
  expect(cancelled).toBe(true);
  expect(emitted).toBeLessThanOrEqual(limit + 131072);
});

it("accepts a valid RPC response exactly at the byte ceiling", async () => {
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    const payload = JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0x6001" });
    return new Response(payload + " ".repeat(1048576 - payload.length));
  });
  expect(await createBaseSepoliaPreflightSource("https://byte-boundary.example.invalid").getCode(P.pool, 123n)).toBe("0x6001");
});

it("pins router/quoter/manager getters and pool tick spacing to the requested block", async () => {
  const calls: Array<{ method: string; params: [{ to: string; data: string }, string] }> = [];
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); calls.push(body);
    const selector = body.params[0].data;
    const result = selector === toFunctionSelector("tickSpacing()")
      ? encodeAbiParameters([{ type: "int24" }], [60])
      : encodeAbiParameters([{ type: "address" }], [selector === toFunctionSelector("factory()") ? C.v3Factory
        : selector === toFunctionSelector("WETH9()") ? C.WETH.address : C.v3PositionManager]);
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
  const source = createBaseSepoliaPreflightSource("https://rpc.example.invalid");
  expect(await source.getDependencyConfiguration(123n)).toEqual({
    router: { factory: C.v3Factory, weth: C.WETH.address, positionManager: C.v3PositionManager },
    quoter: { factory: C.v3Factory, weth: C.WETH.address },
    manager: { factory: C.v3Factory, weth: C.WETH.address },
  });
  expect(await source.getTickSpacing(P.pool, 123n)).toBe(60);
  expect(calls).toHaveLength(8);
  expect(calls.every(c => c.method === "eth_call" && c.params[1] === "0x7b")).toBe(true);
  expect(calls.map(c => c.params[0].to.toLowerCase()).sort()).toEqual([
    P.router, P.router, P.router, C.v3QuoterV2, C.v3QuoterV2,
    C.v3PositionManager, C.v3PositionManager, P.pool,
  ].map(a => a.toLowerCase()).sort());
});

it("uses pinned wallet reads and only pending for the separate nonce check", async () => {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); calls.push(body);
    return Response.json({ jsonrpc: "2.0", id: body.id, result: body.method === "eth_call"
      ? encodeAbiParameters([{ type: "uint256" }], [5n]) : "0x7" });
  });
  const source = createBaseSepoliaPreflightSource("https://rpc.example.invalid");
  const wallet = "0x1111111111111111111111111111111111111111";
  expect(await source.getTokenBalance(C.USDC.address, wallet, 123n)).toBe(5n);
  expect(await source.getTokenAllowance(C.USDC.address, wallet, P.router, 123n)).toBe(5n);
  expect(await source.getNativeBalance(wallet, 123n)).toBe(7n);
  expect(await source.getAccountNonce(wallet, 123n)).toBe(7n);
  expect(await source.getPendingNonce(wallet)).toBe(7n);
  expect(calls.map(c => [c.method, c.params[1]])).toEqual([
    ["eth_call", "0x7b"], ["eth_call", "0x7b"], ["eth_getBalance", "0x7b"],
    ["eth_getTransactionCount", "0x7b"], ["eth_getTransactionCount", "pending"],
  ]);
});

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
