import { expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { BASE_SEPOLIA_CANDIDATE as B, testnetChainConfig, createTestnetSwapDomain } from "@vezta-dex/core";
import { TestnetQuoteStore } from "./testnet-quote-store";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, testnetQuoteSource } from "./testnet-quote.test-helper";
const c=testnetChainConfig(1301),wallet="0x1111111111111111111111111111111111111111";
const intent={chainId:1301,wallet,tokenIn:c.candidate.USDC.address,tokenOut:c.candidate.WETH.address,amountIn:"1000000",slippageBps:50} as const;
function source(){
  const codes=JSON.parse(gunzipSync(readFileSync(new URL("../../fixtures/unichain-sepolia-runtime.json.gz",import.meta.url))).toString("utf8")).contracts as {address:string;code:`0x${string}`}[];
  const s=testnetQuoteSource();
  return {...s,getChainId:async()=>1301,getPool:async()=>c.policy.pool,getDecimals:async(a:string)=>a.toLowerCase()===c.candidate.USDC.address.toLowerCase()?6:18,quoteExactInput:async(a: `0x${string}`,b: `0x${string}`,v:bigint,fee:number,n:bigint)=>s.quoteExactInput(a.toLowerCase()===c.candidate.USDC.address.toLowerCase()?B.USDC.address:B.WETH.address,b,v,fee,n),getCode:async(a:string)=>a.toLowerCase()===wallet.toLowerCase()?"0x" as const:codes.find(x=>x.address.toLowerCase()===a.toLowerCase())?.code??"0x6001",
    getDependencyConfiguration:async()=>({router:{factory:c.candidate.v3Factory,weth:c.candidate.WETH.address,positionManager:c.candidate.v3PositionManager},quoter:{factory:c.candidate.v3Factory,weth:c.candidate.WETH.address},manager:{factory:c.candidate.v3Factory,weth:c.candidate.WETH.address}}),
    getPoolState:async()=>({...await s.getPoolState(c.policy.pool,123n),token0:c.candidate.USDC.address,token1:c.candidate.WETH.address,factory:c.candidate.v3Factory})};
}
it("qualifies/stores Unichain quotes only in its explicit domain and never upgrades the default Base reader",async()=>{
  const store=new TestnetQuoteStore(()=>TESTNET_NOW,128,1301);
  const reader=new TestnetSwapQuoteReader(()=>source(),store,()=>TESTNET_NOW,1301);
  const q=await reader.read(intent);
  expect(q.quote).toMatchObject({chainId:1301,source:"unichain-sepolia-rpc",pool:c.policy.pool});
  expect(store.read(q.quoteId,intent)).toEqual(q.quote);
  expect(()=>store.read(q.quoteId,{...intent,chainId:84532})).toThrow();
  expect(()=>new TestnetQuoteStore(()=>TESTNET_NOW).save(q.quote)).toThrow();
  await expect(new TestnetSwapQuoteReader(()=>source(),undefined,()=>TESTNET_NOW).read(intent)).rejects.toMatchObject({code:"TESTNET_INTENT_INVALID"});
  const other=createTestnetSwapDomain(84532);
  expect(()=>other.parseTestnetSwapQuote(q.quote,TESTNET_NOW)).toThrow();
});
it("rejects wrong-chain RPC before code/price reads even with Unichain addresses",async()=>{
  let called=false;
  const reader=new TestnetSwapQuoteReader(()=>({...source(),getChainId:async()=>84532,getLatestBlock:async()=>{called=true;throw Error();}}),undefined,()=>TESTNET_NOW,1301);
  await expect(reader.read(intent)).rejects.toMatchObject({code:"TESTNET_WRONG_CHAIN"});expect(called).toBe(false);
});
