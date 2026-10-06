import { afterEach, expect, it, vi } from "vitest";
import { decodeAbiParameters, encodeAbiParameters, toFunctionSelector, type Address } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { probeBaseSepoliaDepth } from "./base-sepolia-depth";
import { TestnetDiscoveryReader } from "./testnet-discovery";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each([
  { status: 429, body: '{"error":"rate limited"}', contentType: "application/json" },
  { status: 503, body: "unavailable", contentType: "text/plain" },
])("preserves HTTP $status errors while buffering response bodies within the timeout", async fixture => {
  const fetchMock = vi.fn(async () => new Response(fixture.body, { status: fixture.status,
    headers: { "Content-Type": fixture.contentType } }));
  vi.stubGlobal("fetch", fetchMock);
  const source = createBaseSepoliaPreflightSource(`https://pacing-http-${fixture.status}.example.invalid`);
  await expect(source.getChainId()).rejects.toMatchObject({ name: "HttpRequestError", status: fixture.status });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("aborts stalled response bodies without a study signal and releases slots for a healthy queued read", async () => {
  vi.useFakeTimers(); const signals: AbortSignal[] = []; let calls = 0;
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); calls++;
    if (calls > 2) return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x6000" });
    const signal = init.signal!; signals.push(signal);
    return new Response(new ReadableStream({ start(controller) {
      const abort = () => controller.error(new DOMException("aborted body", "AbortError"));
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    } }), { headers: { "Content-Type": "application/json" } });
  });
  const source = createBaseSepoliaPreflightSource("https://pacing-body.example.invalid");
  const reads = Array.from({ length: 3 }, (_, i) => source
    .getCode(`0x${(i + 1).toString(16).padStart(40, "0")}`, 123n).catch(() => "failed"));
  await vi.advanceTimersByTimeAsync(8500);
  expect(signals.map(signal => signal.aborted)).toEqual([true, true]);
  expect(calls).toBe(3);
  expect(await Promise.all(reads)).toEqual(["failed", "failed", "0x6000"]);
});

it("shares the request start budget across source factories on the same RPC origin", async () => {
  vi.useFakeTimers(); const starts: number[] = []; const beginning = Date.now();
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    starts.push(Date.now() - beginning); const body = JSON.parse(String(init.body));
    return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x6000" });
  });
  const a = createBaseSepoliaPreflightSource("https://pacing-share.example.invalid/secret-one");
  const b = createBaseSepoliaPreflightSource("https://pacing-share.example.invalid/secret-two");
  const reads = Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? a : b)
    .getCode(`0x${(i + 1).toString(16).padStart(40, "0")}`, 123n));
  await vi.advanceTimersByTimeAsync(2100);
  expect(await Promise.all(reads)).toEqual(Array(7).fill("0x6000"));
  expect(starts).toEqual([0, 334, 668, 1002, 1336, 1670, 2004]);
});

it("completes all four pools and 24 depth samples within the unchanged discovery deadline", async () => {
  vi.useFakeTimers(); const beginning = Date.now(); const starts: number[] = [];
  const hash = `0x${"ab".repeat(32)}`; const sqrt = (2n ** 96n) * 20000n;
  const pools = new Map([100, 500, 3000, 10000].map(fee =>
    [fee, `0x${fee.toString(16).padStart(40, "0")}` as Address]));
  const uint = (type: string, value: bigint | number) => encodeAbiParameters([{ type }], [value]);
  const address = (value: Address) => encodeAbiParameters([{ type: "address" }], [value]);
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    starts.push(Date.now() - beginning); const body = JSON.parse(String(init.body)); let result;
    if (body.method === "eth_chainId") result = "0x14a34";
    else if (body.method === "eth_getBlockByNumber") result = { number: "0x7b", hash,
      timestamp: `0x${Math.floor(beginning / 1000).toString(16)}` };
    else if (body.method === "eth_getCode") result = "0x6000";
    else {
      const { to, data } = body.params[0]; const selector = data.slice(0, 10);
      const fee = [...pools].find(([, pool]) => pool.toLowerCase() === to.toLowerCase())?.[0];
      if (selector === toFunctionSelector("decimals()")) result = uint("uint8", to.toLowerCase() === C.USDC.address.toLowerCase() ? 6 : 18);
      else if (selector === toFunctionSelector("getPool(address,address,uint24)")) {
        const args = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }], `0x${data.slice(10)}`);
        result = address(pools.get(args[2])!);
      } else if (selector === toFunctionSelector("token0()")) result = address(C.USDC.address);
      else if (selector === toFunctionSelector("token1()")) result = address(C.WETH.address);
      else if (selector === toFunctionSelector("factory()")) result = address(C.v3Factory);
      else if (selector === toFunctionSelector("fee()")) result = uint("uint24", fee!);
      else if (selector === toFunctionSelector("liquidity()")) result = uint("uint128", 100n);
      else if (selector === toFunctionSelector("slot0()")) result = encodeAbiParameters([
        { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" },
        { type: "uint16" }, { type: "uint8" }, { type: "bool" },
      ], [sqrt, 0, 0, 1, 1, 0, true]);
      else if (selector === "0xc6a5026a") {
        const [tokenIn, , amountIn, quoteFee] = decodeAbiParameters([{ type: "address" }, { type: "address" },
          { type: "uint256" }, { type: "uint24" }, { type: "uint160" }], `0x${data.slice(10)}`);
        const forward = tokenIn.toLowerCase() === C.USDC.address.toLowerCase();
        const net = amountIn * BigInt(1000000 - quoteFee);
        const output = forward ? net * 400000000n / 1000000n : net / 400000000000000n;
        result = encodeAbiParameters([{ type: "uint256" }, { type: "uint160" },
          { type: "uint32" }, { type: "uint256" }], [output, forward ? sqrt - 1n : sqrt + 1n, 0, 120000n]);
      } else throw new Error("Unexpected discovery RPC call");
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
  const reader = new TestnetDiscoveryReader(signal => probeBaseSepoliaDepth(
    createBaseSepoliaPreflightSource("https://pacing-discovery.example.invalid", signal), beginning));
  const study = reader.read();
  await vi.advanceTimersByTimeAsync(44000);
  const report = await study;
  expect(report.depthQualified).toBe(true);
  expect(report.pools).toHaveLength(4);
  expect(report.pools.every(pool => pool.samples.length === 6 && pool.depthQualified)).toBe(true);
  expect(starts.length).toBeGreaterThan(90);
  expect(starts.at(-1)! + 300).toBeLessThan(45000);
  expect(starts.slice(1).every((time, i) => time - starts[i] >= 334)).toBe(true);
});

it("does not send queued reads after the study aborts and aborts the active fetch", async () => {
  vi.useFakeTimers(); const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    const signal = init.signal!; signals.push(signal);
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("aborted", "AbortError"));
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    });
  });
  const controller = new AbortController();
  const source = createBaseSepoliaPreflightSource("https://pacing-abort.example.invalid", controller.signal);
  const reads = Array.from({ length: 10 }, (_, i) => source
    .getCode(`0x${(i + 1).toString(16).padStart(40, "0")}`, 123n).catch(() => "failed"));
  await vi.advanceTimersByTimeAsync(100); controller.abort();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await Promise.all(reads)).toEqual(Array(10).fill("failed"));
  expect(signals).toHaveLength(1);
  expect(signals[0].aborted).toBe(true);
});

it("starts the eight-second network timeout after a queue wait longer than eight seconds", async () => {
  vi.useFakeTimers(); const starts: number[] = []; const signals: AbortSignal[] = [];
  const beginning = Date.now(); let finalSettled = false;
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); starts.push(Date.now() - beginning);
    if (starts.length < 29) return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x6000" });
    const signal = init.signal!; signals.push(signal);
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("aborted", "AbortError"));
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    });
  });
  const source = createBaseSepoliaPreflightSource("https://pacing-timeout.example.invalid", new AbortController().signal);
  const reads = Array.from({ length: 29 }, (_, i) => source
    .getCode(`0x${(i + 1).toString(16).padStart(40, "0")}`, 123n).catch(() => { if (i === 28) finalSettled = true; return "failed"; }));
  await vi.advanceTimersByTimeAsync(10000);
  expect(starts[28]).toBe(9352);
  expect(signals[0].aborted).toBe(false);
  expect(finalSettled).toBe(false);
  await vi.advanceTimersByTimeAsync(7400);
  expect(signals[0].aborted).toBe(true);
  expect(finalSettled).toBe(true);
  expect((await Promise.all(reads))[28]).toBe("failed");
});

it("uses a separate bounded six-RPS budget only for explicit loopback fixture reads", async () => {
  vi.useFakeTimers(); const beginning = Date.now(); const starts: number[] = [];
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    starts.push(Date.now() - beginning); const body = JSON.parse(String(init.body));
    return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x6000" });
  });
  expect(() => createBaseSepoliaPreflightSource("https://public-fixture-budget.example.invalid", undefined, 6)).toThrow();
  const source = createBaseSepoliaPreflightSource("http://127.0.0.1:45679", undefined, 6);
  const reads = Array.from({ length: 4 }, (_, i) => source.getCode(`0x${(i + 1).toString(16).padStart(40,"0")}`, 123n));
  await vi.advanceTimersByTimeAsync(600);
  expect(await Promise.all(reads)).toEqual(Array(4).fill("0x6000"));
  expect(starts).toEqual([0, 167, 334, 501]);
});
