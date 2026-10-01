import { afterEach, expect, it, vi } from "vitest";
import { decodeAbiParameters, encodeAbiParameters } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";

afterEach(() => vi.unstubAllGlobals());

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
