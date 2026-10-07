import { testnetChainConfig, type TestnetChainId } from "@vezta-dex/core";
export const testnetNetworkId = (slug: string): TestnetChainId | null => slug === "base-sepolia" ? 84532 : slug === "unichain-sepolia" ? 1301 : null;
export function testnetNetworkHref(chainId: TestnetChainId, view: string, query: Record<string,string> = {}) {
 const params=new URLSearchParams(query);
 if(chainId===1301)params.set("network","unichain-sepolia");else params.delete("network");
 const suffix=params.toString();
 return `/${view}${suffix?`?${suffix}`:""}`;
}
export function productWorkspaceChain(pathname:string, network:string|null):TestnetChainId|null {
 if(pathname.startsWith("/networks/"))return testnetNetworkId(pathname.split("/")[2]??"");
 if(/^\/(?:swap|explore|pools|pool|positions|liquidity)(?:\/|$)/.test(pathname))return network===null?84532:testnetNetworkId(network);
 return null;
}
/** Any raw active record blocks switching, even malformed records; recovery stays on its original chain. */
export function pendingTestnetWorkspaces(storage: Pick<Storage,"getItem">) {
 const result: {chainId: TestnetChainId; flow: "swap" | "lp"; href: string}[]=[];
 for(const chainId of [84532,1301] as const) for(const flow of ["swap","lp"] as const) {
  const slug=testnetChainConfig(chainId).source.replace("-rpc","");
  if(storage.getItem(`vezta-dex:${slug}-${flow === "lp" ? "lp-" : ""}submission:v1`) !== null)
   result.push({chainId,flow,href:testnetNetworkHref(chainId,flow === "lp" ? "positions" : "swap")});
 }
 return result;
}
