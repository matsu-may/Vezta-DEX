import {it,expect} from "vitest";
import {pendingTestnetWorkspaces,testnetNetworkId,testnetNetworkHref} from "./testnet-network-selection";
it("preserves the original chain recovery route and blocks corrupted active records",()=>{
 const storage={getItem:(key:string)=>key === "vezta-dex:unichain-sepolia-lp-submission:v1" ? "corrupt" : null};
 expect(pendingTestnetWorkspaces(storage)).toEqual([{chainId:1301,flow:"lp",href:"/positions?network=unichain-sepolia"}]);
 expect(testnetNetworkId("polygon")).toBeNull(); expect(testnetNetworkId("unichain-sepolia")).toBe(1301);
 expect(()=>pendingTestnetWorkspaces({getItem:()=>{throw new Error("denied");}})).toThrow();
});

it("builds canonical links preserving network and caller query independently",()=>{
 expect(testnetNetworkHref(84532,"swap")).toBe("/swap");
 const url=new URL(testnetNetworkHref(1301,"swap",{fee:"3000",pool:"0x123"}),"http://localhost");
 expect(url.pathname).toBe("/swap");expect(url.searchParams.get("network")).toBe("unichain-sepolia");expect(url.searchParams.get("fee")).toBe("3000");expect(url.searchParams.get("pool")).toBe("0x123");
});
