import { expect, it } from "vitest";
import { parseTestnetForkRouting } from "./testnet-fork-routing";
it("preserves default fork scope and allows only bounded routing options before any upstream access", () => {
  expect(parseTestnetForkRouting([])).toEqual({});
  expect(parseTestnetForkRouting(["--compare-direct"])).toEqual({ routing: "best-direct" });
  expect(parseTestnetForkRouting(["--pool-fee=500"])).toEqual({ poolFeeTier: 500 });
  for (const args of [["--pool-fee=50"], ["--pool-fee=500junk"], ["--compare-direct", "--pool-fee=500"], ["--rpc=https://remote"]])
    expect(() => parseTestnetForkRouting(args)).toThrow();
});
