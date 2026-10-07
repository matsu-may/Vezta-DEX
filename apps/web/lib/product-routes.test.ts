import { it, expect } from "vitest";
import { testnetChainConfig } from "@vezta-dex/core";
import { parseProductRoute, switchProductNetwork, resolveProductPoolSelection } from "./product-routes";

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
  expect(switchProductNetwork("/networks/unichain-sepolia/explore/transactions", 84532)).toBe("/networks/base-sepolia/explore/transactions");
  expect(switchProductNetwork(`/networks/unichain-sepolia/pools/${pool}`, 84532)).toBe("/networks/base-sepolia/explore/pools");
  expect(switchProductNetwork("/networks/unichain-sepolia/positions/123", 84532)).toBe("/networks/base-sepolia/positions");
  expect(switchProductNetwork("/networks/unichain-sepolia/positions/create", 84532)).toBe("/networks/base-sepolia/positions/create");
});
it("binds swap query selection to both fee and address on its own chain",()=>{
 const p=testnetChainConfig(1301).pools[0];
 expect(resolveProductPoolSelection(1301,{})).toBeUndefined();
 expect(resolveProductPoolSelection(1301,{fee:String(p.feeTier),pool:p.pool})).toBe(p.feeTier);
 expect(resolveProductPoolSelection(84532,{fee:String(p.feeTier),pool:p.pool})).toBeNull();
 expect(resolveProductPoolSelection(1301,{pool:"3000"})).toBeNull();
});
