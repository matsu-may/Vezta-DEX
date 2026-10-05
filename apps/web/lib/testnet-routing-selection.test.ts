import { expect, it } from "vitest";
import { resolveTestnetRoutingSelection } from "./testnet-routing-selection";
it("accepts a complete curated pool identity and rejects partial, duplicate or substituted URLs", () => {
  const pool = "0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0";
  expect(resolveTestnetRoutingSelection({})).toBeUndefined();
  expect(resolveTestnetRoutingSelection({ fee: "500", pool })).toBe(500);
  for (const value of [{ fee: "500" }, { pool }, { fee: ["500", "3000"], pool }, { fee: "500", pool: [pool,pool] },
    { fee: "3000", pool }, { fee: "500junk", pool }]) expect(resolveTestnetRoutingSelection(value)).toBeNull();
});
