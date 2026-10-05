import { TESTNET_DIRECT_POOLS } from "@vezta-dex/core";
import { forkAssert } from "./testnet-fork";
export type TestnetForkRouting = { routing?: "best-direct"; poolFeeTier?: 100 | 500 | 3000 | 10000 };
export function parseTestnetForkRouting(args: string[]): TestnetForkRouting {
  if (args.length === 0) return {};
  if (args.length === 1 && args[0] === "--compare-direct") return { routing: "best-direct" };
  const selected = args.length === 1 ? TESTNET_DIRECT_POOLS.find(p => args[0] === `--pool-fee=${p.feeTier}`) : undefined;
  forkAssert(selected, "FORK_ROUTING_INVALID");
  return { poolFeeTier: selected.feeTier };
}
