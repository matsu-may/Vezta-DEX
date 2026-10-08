import { describe, expect, it } from "vitest";
import { TOKENS } from "../index";
import { inspectTradingRoute, TRADING_ROUTING_POLICY } from "./trading-route";

const zero = "0x0000000000000000000000000000000000000000";
const intermediate = "0x1111111111111111111111111111111111111111";
const intent = { chainId: 137, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address };
// Synthetic fixtures use the public routing-api producer's pool/token shape.
function pool(type = "v3-pool", changes: Record<string, unknown> = {}) {
  return {
    type,
    address: type === "v4-pool" ? `0x${"1".repeat(64)}` : `0x${"1".repeat(40)}`,
    tokenIn: { chainId: 137, address: intent.tokenIn },
    tokenOut: { chainId: 137, address: intent.tokenOut },
    ...(type === "v4-pool" ? { hooks: zero } : {}),
    ...changes,
  };
}

describe("hook-free Uniswap route policy", () => {
  it("pins the chosen protocols and explicitly disables V4 hooks", () => {
    expect(TRADING_ROUTING_POLICY).toEqual({ protocols: ["V2", "V3", "V4"], hooksOptions: "V4_NO_HOOKS" });
  });

  it.each(["v2-pool", "v3-pool", "v4-pool"])("accepts a complete %s path", (type) => {
    expect(inspectTradingRoute([[pool(type)]], intent)).toEqual({ pathCount: 1, poolCount: 1, v4PoolCount: type === "v4-pool" ? 1 : 0 });
  });

  it("inspects every pool of split and mixed protocol routes", () => {
    const route = [[pool()], [
      pool("v2-pool", { tokenOut: { chainId: "137", address: intermediate } }),
      pool("v4-pool", { tokenIn: { chainId: "137", address: intermediate } }),
    ]];
    expect(inspectTradingRoute(route, intent)).toEqual({ pathCount: 2, poolCount: 3, v4PoolCount: 1 });
    route[1][1] = pool("v4-pool", { hooks: intermediate, tokenIn: { chainId: 137, address: intermediate } });
    expect(() => inspectTradingRoute(route, intent)).toThrow();
  });

  it.each([undefined, null, "0x0", intermediate, 0])("rejects missing, malformed or nonzero V4 hooks: %s", (hooks) => {
    expect(() => inspectTradingRoute([[pool("v4-pool", { hooks })]], intent)).toThrow();
  });

  it.each(["v2-pool", "v3-pool"])("rejects contradictory hook metadata on %s", (type) => {
    expect(() => inspectTradingRoute([[pool(type, { hooks: intermediate })]], intent)).toThrow();
  });

  it.each([undefined, null, {}, [], [[]], [[null]], [[pool("unknown-pool")]]])("rejects unverifiable route structure: %j", (route) => {
    expect(() => inspectTradingRoute(route, intent)).toThrow();
  });

  it.each([undefined, zero, "0x123", `0x${"1".repeat(64)}`])("rejects invalid V2/V3 pool references: %s", (address) => {
    expect(() => inspectTradingRoute([[pool("v3-pool", { address })]], intent)).toThrow();
  });

  it("requires V4 bytes32 pool identity", () => {
    expect(() => inspectTradingRoute([[pool("v4-pool", { address: intermediate })]], intent)).toThrow();
  });

  it("rejects missing currency metadata, wrong chains and wrong endpoints", () => {
    for (const changes of [
      { tokenIn: undefined },
      { tokenOut: { address: intent.tokenOut } },
      { tokenIn: { chainId: 1, address: intent.tokenIn } },
      { tokenOut: { chainId: 137, address: "not-an-address" } },
      { tokenIn: { chainId: 137, address: intermediate } },
      { tokenOut: { chainId: 137, address: intermediate } },
    ]) expect(() => inspectTradingRoute([[pool("v3-pool", changes)]], intent)).toThrow();
    expect(() => inspectTradingRoute([[pool()]], { ...intent, chainId: 1 })).toThrow();
  });

  it("rejects disconnected hops and identical input/output currencies", () => {
    expect(() => inspectTradingRoute([[pool(), pool()]], intent)).toThrow();
    expect(() => inspectTradingRoute([[pool("v3-pool", { tokenOut: { chainId: 137, address: intent.tokenIn } })]], intent)).toThrow();
  });

  it("bounds route branches and path lengths", () => {
    expect(() => inspectTradingRoute(Array.from({ length: 33 }, () => [pool()]), intent)).toThrow();
    expect(() => inspectTradingRoute([Array.from({ length: 17 }, () => pool())], intent)).toThrow();
  });
});
