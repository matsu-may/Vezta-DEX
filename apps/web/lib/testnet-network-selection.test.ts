import {it,expect} from "vitest";
import {pendingTestnetWorkspaces,testnetNetworkId} from "./testnet-network-selection";
it("preserves the original chain recovery route and blocks corrupted active records",()=>{
 const storage={getItem:(key:string)=>key === "vezta-dex:unichain-sepolia-lp-submission:v1" ? "corrupt" : null};
 expect(pendingTestnetWorkspaces(storage)).toEqual([{chainId:1301,flow:"lp",href:"/networks/unichain-sepolia/positions"}]);
 expect(testnetNetworkId("polygon")).toBeNull(); expect(testnetNetworkId("unichain-sepolia")).toBe(1301);
 expect(()=>pendingTestnetWorkspaces({getItem:()=>{throw new Error("denied");}})).toThrow();
});
