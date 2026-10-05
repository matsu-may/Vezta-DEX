import { TESTNET_DIRECT_POOLS } from "@vezta-dex/core";
export function resolveTestnetRoutingSelection(params: Record<string, string | string[] | undefined>): number | null | undefined {
  if (params.fee === undefined && params.pool === undefined) return undefined;
  if (typeof params.fee !== "string" || typeof params.pool !== "string") return null;
  return TESTNET_DIRECT_POOLS.find(p => String(p.feeTier) === params.fee
    && p.pool.toLowerCase() === params.pool?.toString().toLowerCase())?.feeTier ?? null;
}
