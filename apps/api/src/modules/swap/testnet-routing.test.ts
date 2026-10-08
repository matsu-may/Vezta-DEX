import { expect, it, vi } from "vitest";
import { TESTNET_DIRECT_POOLS } from "@vezta-dex/core";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, testnetIntent } from "./testnet-quote.test-helper";
import { runtimeFixtureCode } from "../../infrastructure/deployments/testnet-runtime.test-helper";
import { verifyTestnetRuntimeCodes } from "../../infrastructure/deployments/testnet-runtime";

import { routingSource } from "./testnet-routing.test-helper";
it.each([false, true])("compares all qualified pools at one block and binds greatest output (%s)", async reverse => {
  const s = routingSource(); const calls = vi.spyOn(s, "quoteExactInput");
  const reader = new TestnetSwapQuoteReader(() => s, undefined, () => TESTNET_NOW);
  const i = { ...testnetIntent(reverse), routing: "best-direct" };
  const result = await reader.read(i);
  expect(result.quote).toMatchObject({ routing: "best-direct", feeTier: 100, pool: TESTNET_DIRECT_POOLS[0].pool });
  expect(result.comparison).toMatchObject({ qualifiedPoolCount: 4, attemptedPoolCount: 4 });
  expect(calls.mock.calls.map(c => c[3]).sort((a,b)=>a-b)).toEqual([100,500,3000,10000]);
  expect(calls.mock.calls.every(c => c[4] === 123n)).toBe(true);
  expect(() => reader.store.read(result.quoteId, testnetIntent(reverse))).toThrow();
  expect(() => reader.store.read(result.quoteId, { ...testnetIntent(reverse), poolFeeTier: 100 })).toThrow();
  expect(reader.store.read(result.quoteId, i).feeTier).toBe(100);
});
it("excludes an unavailable or high impact candidate, discloses partial coverage, and never accepts wrong runtime", async () => {
  const s = routingSource(); const old = s.quoteExactInput;
  s.quoteExactInput = async (...args) => {
    if (args[3] === 100) throw new Error("private provider URL");
    if (args[3] === 500) return { ...await old(...args), amountOut: 1n };
    return old(...args);
  };
  const r = new TestnetSwapQuoteReader(() => s, undefined, () => TESTNET_NOW);
  const result = await r.read({ ...testnetIntent(), routing: "best-direct" });
  expect(result.quote.feeTier).toBe(3000);
  expect(result.comparison).toMatchObject({ qualifiedPoolCount: 2, attemptedPoolCount: 4 });
  expect(JSON.stringify(result)).not.toContain("private");
  const code = s.getCode;
  s.getCode = async (a,b) => a.toLowerCase() === TESTNET_DIRECT_POOLS[0].pool.toLowerCase() ? "0x6000" : code(a,b);
  await expect(r.read({ ...testnetIntent(), poolFeeTier: 100 })).rejects.toMatchObject({ code: "TESTNET_RUNTIME_MISMATCH" });
});
it("uses only the selected pool runtime in the five-dependency guard", () => {
  const deps = ["0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
    "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", TESTNET_DIRECT_POOLS[1].pool, "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2"];
  const codes = deps.map(address => ({ address, code: runtimeFixtureCode(address) }));
  expect(() => verifyTestnetRuntimeCodes(84532, codes, 500)).not.toThrow();
  expect(() => verifyTestnetRuntimeCodes(84532, codes)).toThrow();
});
