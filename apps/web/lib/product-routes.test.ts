import { it, expect } from "vitest";
import { testnetChainConfig } from "@vezta-dex/core";
import { parseProductRoute, switchProductNetwork, resolveProductPoolSelection, parsePrimaryProductRoute } from "./product-routes";

it("validates deep links without moving pool or NFT identities between chains", () => {
  const pool = testnetChainConfig(1301).policy.pool;
  expect(parseProductRoute("unichain-sepolia", "pools", [pool])?.poolId).toBe(pool);
  expect(parseProductRoute("base-sepolia", "pools", [pool])).toBeNull();
  expect(parseProductRoute("unichain-sepolia", "positions", ["123"])?.tokenId).toBe("123");
  expect(parseProductRoute("unichain-sepolia", "positions", ["01"])).toBeNull();
  expect(parseProductRoute("unichain-sepolia", "positions", ["-1"])).toBeNull();
  expect(parseProductRoute("unichain-sepolia", "positions", ["1", "unexpected"])).toBeNull();
  expect(parseProductRoute("unknown", "swap")).toBeNull();
  expect(parseProductRoute("base-sepolia", "explore", ["transactions"])?.view).toBe("transactions");
  expect(parseProductRoute("base-sepolia", "positions", ["create"])?.view).toBe("create");
  expect(switchProductNetwork("/networks/unichain-sepolia/explore/transactions", 84532)).toBe("/explore/transactions");
  expect(switchProductNetwork(`/networks/unichain-sepolia/pools/${pool}`, 84532)).toBe("/explore/pools");
  expect(switchProductNetwork("/networks/unichain-sepolia/positions/123", 84532)).toBe("/positions");
  expect(switchProductNetwork("/networks/unichain-sepolia/positions/create", 84532)).toBe("/positions/create");
});
it("binds swap query selection to both fee and address on its own chain",()=>{
 const p=testnetChainConfig(1301).pools[0];
 expect(resolveProductPoolSelection(1301,{})).toBeUndefined();
 expect(resolveProductPoolSelection(1301,{fee:String(p.feeTier),pool:p.pool})).toBe(p.feeTier);
 expect(resolveProductPoolSelection(84532,{fee:String(p.feeTier),pool:p.pool})).toBeNull();
 expect(resolveProductPoolSelection(1301,{pool:"3000"})).toBeNull();
});

it("serves primary routes with explicit chain identity and rejects invalid network queries",()=>{
 expect(parsePrimaryProductRoute("swap",{})).toEqual({chainId:84532,view:"swap"});
 expect(parsePrimaryProductRoute("explore",{network:"unichain-sepolia"},["tokens"])).toEqual({chainId:1301,view:"tokens"});
 expect(parsePrimaryProductRoute("positions",{network:"unichain-sepolia"},["42"])).toEqual({chainId:1301,view:"position",tokenId:"42"});
 expect(parsePrimaryProductRoute("swap",{network:"polygon"})).toBeNull();
 expect(parsePrimaryProductRoute("swap",{network:["base-sepolia","unichain-sepolia"]})).toBeNull();
 const pool=testnetChainConfig(1301).policy.pool;
 expect(parsePrimaryProductRoute("pools",{},[pool])).toBeNull();
 expect(parsePrimaryProductRoute("pools",{network:"unichain-sepolia"},[pool])?.poolId).toBe(pool);
});
it("switches primary networks without carrying pool, NFT, owner or quote selection",()=>{
 expect(switchProductNetwork("/explore/transactions",1301)).toBe("/explore/transactions?network=unichain-sepolia");
 expect(switchProductNetwork("/positions/42",1301)).toBe("/positions?network=unichain-sepolia");
 expect(switchProductNetwork("/positions/create",84532)).toBe("/positions/create");
});
