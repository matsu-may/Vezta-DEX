import { afterEach, expect, it, vi } from "vitest";
import { encodeAbiParameters } from "viem";
import { testnetChainConfig } from "@vezta-dex/core";
afterEach(() => vi.unstubAllGlobals());
it("reads each chain's factory and token pair at the requested block with no write RPC", async () => {
  const { createTestnetChainSource } = await import("../../infrastructure/rpc/base-sepolia-source");
  const calls: { method:string;params:[{to:string;data:string},string] }[] = [];
  vi.stubGlobal("fetch", async (_:unknown,init:RequestInit) => {
    const body = JSON.parse(String(init.body)); calls.push(body);
    return Response.json({jsonrpc:"2.0",id:body.id,result:encodeAbiParameters([{type:"address"}],[testnetChainConfig(1301).policy.pool])});
  });
  for (const id of [84532,1301] as const) {
    const c = testnetChainConfig(id);
    await createTestnetChainSource(id,`https://chain-source-${id}.example.invalid`).getPool(3000,123n);
    expect(calls.at(-1)?.params[0].to.toLowerCase()).toBe(c.candidate.v3Factory.toLowerCase());
    expect(calls.at(-1)?.params[0].data.toLowerCase()).toContain(c.candidate.USDC.address.slice(2).toLowerCase());
    expect(calls.at(-1)?.params[1]).toBe("0x7b");
  }
  expect(calls.every(c=>c.method==="eth_call")).toBe(true);
  expect(() => createTestnetChainSource(137,"https://invalid-chain.example.invalid")).toThrow();
});
