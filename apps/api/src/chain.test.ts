import { afterEach, describe, expect, it, vi } from "vitest";
import { createPolygonPoolSource } from "./chain";

afterEach(() => vi.unstubAllGlobals());

describe("raw account-code RPC boundary", () => {
  it("preserves explicit empty eth_getCode at a pinned block instead of viem's undefined sentinel", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => {
      const request = JSON.parse(options.body as string);
      calls.push(request);
      return Response.json({ jsonrpc: "2.0", id: request.id, result: "0x" });
    });
    const source = createPolygonPoolSource("http://127.0.0.1:9999");
    const owner = "0x1111111111111111111111111111111111111111";
    expect(await source.getAccountCode(owner, 123n)).toBe("0x");
    expect(calls).toEqual([expect.objectContaining({ method: "eth_getCode", params: [owner, "0x7b"] })]);
  });

  it("pins balance, simulation and gas estimation to the requested block with explicit sender", async () => {
    const calls: { method: string; params: unknown[] }[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => {
      const request = JSON.parse(options.body as string);
      calls.push(request);
      const result = request.method === "eth_call" && request.params[0].data.startsWith("0x70a08231") ? `0x${"0".repeat(60)}000a`
        : request.method === "eth_call" ? "0x" : "0xa";
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    });
    const source = createPolygonPoolSource("http://127.0.0.1:9999");
    const owner = "0x1111111111111111111111111111111111111111";
    const token = "0x2222222222222222222222222222222222222222";
    const tx = { chainId: 137 as const, from: owner, to: token, data: "0x1234" as const, value: "0" as const } as const;
    expect(await source.getTokenBalance(token, owner, 123n)).toBe(10n);
    expect(await source.getNativeBalance(owner, 123n)).toBe(10n);
    await source.simulateSwap(tx, 123n);
    expect(await source.estimateSwapGas(tx, 123n)).toBe(10n);
    expect(await source.getGasPrice()).toBe(10n);
    expect(calls.map(({ method }) => method)).toEqual(["eth_call", "eth_getBalance", "eth_call", "eth_estimateGas", "eth_gasPrice"]);
    expect(calls.slice(0, 4).map(({ params }) => params[1])).toEqual(["0x7b", "0x7b", "0x7b", "0x7b"]);
    expect(calls[2].params[0]).toMatchObject({ from: owner, to: token, data: "0x1234", value: "0x0" });
    expect(calls[3].params[0]).toMatchObject({ from: owner, to: token, data: "0x1234", value: "0x0" });
  });
});

it("reads account nonce at the closed block and pending tag with explicit owner", async () => {
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => {
    const request = JSON.parse(options.body as string); calls.push(request);
    return Response.json({ jsonrpc: "2.0", id: request.id, result: "0x7" });
  });
  const owner = "0x1111111111111111111111111111111111111111";
  const source = createPolygonPoolSource("http://127.0.0.1:9999");
  expect(await source.getAccountNonce(owner, 123n)).toBe(7n);
  expect(await source.getPendingNonce(owner)).toBe(7n);
  expect(calls).toEqual([
    expect.objectContaining({ method: "eth_getTransactionCount", params: [owner, "0x7b"] }),
    expect.objectContaining({ method: "eth_getTransactionCount", params: [owner, "pending"] }),
  ]);
});
