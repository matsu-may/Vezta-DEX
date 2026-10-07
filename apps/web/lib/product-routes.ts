import { testnetChainConfig, type TestnetChainId } from "@vezta-dex/core";
import { testnetNetworkHref, testnetNetworkId } from "./testnet-network-selection";
export type ProductView = "swap" | "tokens" | "auctions" | "pools" | "transactions" | "pool" | "positions" | "create" | "position" | "launch-auction";
export type ProductRoute = { chainId: TestnetChainId; view: ProductView; poolId?: string; tokenId?: string };
export function parseProductRoute(network: string, section: string, segments: string[] = []): ProductRoute | null {
  const chainId = testnetNetworkId(network);
  if (!chainId || segments.length > 1) return null;
  const id = segments[0];
  if (section === "explore") {
    if (!id) return { chainId, view: "pools" };
    if (["tokens", "auctions", "pools", "transactions"].includes(id)) return { chainId, view: id as ProductView };
  }
  if (section === "positions") {
    if (!id) return { chainId, view: "positions" };
    if (id === "create") return { chainId, view: "create" };
    if (/^(0|[1-9][0-9]{0,77})$/.test(id) && BigInt(id) < 2n ** 256n) return { chainId, view: "position", tokenId: id };
  }
  if (section === "pools" || section === "pool") {
    if (!id) return { chainId, view: section === "pool" ? "pool" : "pools", ...(section === "pool" ? {poolId:testnetChainConfig(chainId).policy.pool} : {}) };
    const pool = testnetChainConfig(chainId).pools.find(p => p.pool.toLowerCase() === id.toLowerCase());
    if (pool) return { chainId, view: "pool", poolId: pool.pool };
  }
  if (section === "swap" && !id) return { chainId, view: "swap" };
  if (section === "liquidity" && id === "launch-auction") return { chainId, view: "launch-auction" };
  return null;
}
export function parsePrimaryProductRoute(section:string,query:Record<string,string|string[]|undefined>,segments:string[]=[]):ProductRoute|null {
 if(query.network!==undefined&&typeof query.network!=="string")return null;
 return parseProductRoute(query.network??"base-sepolia",section,segments);
}
export function switchProductNetwork(pathname: string, chainId: TestnetChainId): string {
  const parts = pathname.split("/"), offset=pathname.startsWith("/networks/")?3:1, section = parts[offset] ?? "swap", rest = parts.slice(offset+1);
  const view = section === "positions" && rest[0] && rest[0] !== "create" ? "positions"
    : ["pool", "pools"].includes(section) ? "explore/pools"
    : ["swap", "explore", "positions", "liquidity"].includes(section) ? [section,...rest].join("/") : "swap";
  return testnetNetworkHref(chainId, view);
}
export function resolveProductPoolSelection(chainId:TestnetChainId,query:Record<string,string|string[]|undefined>):number|null|undefined {
 if(query.fee===undefined&&query.pool===undefined)return undefined;
 if(typeof query.fee!=="string"||typeof query.pool!=="string")return null;
 return testnetChainConfig(chainId).pools.find(p=>String(p.feeTier)===query.fee&&p.pool.toLowerCase()===query.pool?.toString().toLowerCase())?.feeTier??null;
}
