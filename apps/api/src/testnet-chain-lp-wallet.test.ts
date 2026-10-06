import { expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testnetChainConfig } from "@vezta-dex/core";
import { TestnetLpWalletStore } from "./testnet-lp-wallet-store";
import { TestnetLpWallet } from "./testnet-lp-wallet";
import { testnetLpWalletFixture } from "./testnet-lp-wallet.test-helper";
import { TESTNET_NOW } from "./testnet-quote.test-helper";
const C=testnetChainConfig(1301).candidate,P=testnetChainConfig(1301).policy;
async function source(){
 const s=(await testnetLpWalletFixture("approve", "0x1111111111111111111111111111111111111111")).source;const codes=JSON.parse(gunzipSync(readFileSync(new URL("fixtures/unichain-sepolia-runtime.json.gz",import.meta.url))).toString("utf8")).contracts as {address:string;code:`0x${string}`}[];
 return {...s,getChainId:async()=>1301,getPool:async()=>P.pool,getDecimals:async(a:string)=>a.toLowerCase()===C.USDC.address.toLowerCase()?6:18,
 getCode:async(a:string)=>a==="0x1111111111111111111111111111111111111111"?"0x" as const:codes.find(c=>c.address.toLowerCase()===a.toLowerCase())?.code??"0x6001",
 getLpPoolState:async()=>({...await s.getLpPoolState(123n),token0:C.USDC.address,token1:C.WETH.address,factory:C.v3Factory}),
 getDependencyConfiguration:async()=>({router:{factory:C.v3Factory,weth:C.WETH.address,positionManager:C.v3PositionManager},quoter:{factory:C.v3Factory,weth:C.WETH.address},manager:{factory:C.v3Factory,weth:C.WETH.address}})};
}
it("issues/rechecks chain-bound LP approval and recovers original context after restart without accepting another chain",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"dex-chain-lp-"));
 try{
 const store=new TestnetLpWalletStore(dir,()=>TESTNET_NOW,128,1301),s=await source();
 const wallet=new TestnetLpWallet(()=>s,store,()=>TESTNET_NOW,1301);
 const intent={chainId:1301,wallet:"0x1111111111111111111111111111111111111111",kind:"mint",amount0Cap:"1000000",amount1Cap:"1000000000000000"};
 const study=await wallet.study({intent});expect(study.status).toBe("prepared");expect(study.transaction?.chainId).toBe(1301);
 expect(study.transaction?.to.toLowerCase()).toBe(C.USDC.address.toLowerCase());
 expect(await wallet.recheck({contextId:study.contextId})).toEqual(study);
 const recovered=new TestnetLpWalletStore(dir,()=>TESTNET_NOW,128,1301);expect(recovered.read(study.contextId!).study).toEqual(study);
 expect(()=>new TestnetLpWalletStore(dir,()=>TESTNET_NOW)).toThrow("TESTNET_LP_STORAGE_UNAVAILABLE");
 await expect(wallet.study({intent:{...intent,chainId:84532}})).rejects.toMatchObject({code:"TESTNET_LP_REQUEST_INVALID"});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it("reconciles original Unichain approval receipts on their original chain with exact events",async()=>{
 const {TestnetLpWalletReceiptReader}=await import("./testnet-lp-wallet-receipt");
 const {encodeAbiParameters,encodeEventTopics,erc20Abi}=await import("viem");
 const store=new TestnetLpWalletStore(undefined,()=>TESTNET_NOW,128,1301),s=await source();
 const api=new TestnetLpWallet(()=>s,store,()=>TESTNET_NOW,1301);
 const study=await api.study({intent:{chainId:1301,wallet:"0x1111111111111111111111111111111111111111",kind:"mint",amount0Cap:"1000000",amount1Cap:"1000000000000000"}}),t=study.transaction!;
 const hash=`0x${"cc".repeat(32)}` as const,blockHash=`0x${"dd".repeat(32)}` as const,headHash=`0x${"ee".repeat(32)}` as const;
 const tx={hash,type:"legacy",chainId:1301,from:t.from,to:t.to,input:t.data as `0x${string}`,value:0n,nonce:Number(t.nonce),gas:BigInt(t.gas),gasPrice:BigInt(t.gasPrice),blockNumber:125n,blockHash};
 const receipt={transactionHash:hash,from:t.from,to:t.to,blockNumber:125n,blockHash,status:"success" as const,gasUsed:50000n,effectiveGasPrice:BigInt(t.gasPrice),logs:[{address:C.USDC.address,blockNumber:125n,blockHash,transactionHash:hash,
   topics:encodeEventTopics({abi:erc20Abi,eventName:"Approval",args:{owner:t.from,spender:C.v3PositionManager}}) as `0x${string}`[],data:encodeAbiParameters([{type:"uint256"}],[1000000n])}]};
 const rpc={...s,getLatestBlock:async()=>({number:126n,hash:headHash,timestamp:1790800000n}),getBlockHash:async(n:bigint)=>n===125n?blockHash:headHash,getTransaction:async()=>tx,getReceipt:async()=>receipt,
 getTokenAllowance:async()=>1000000n,getPositionOwnerOrNull:async()=>null};
 const reader=new TestnetLpWalletReceiptReader(()=>rpc,store,()=>TESTNET_NOW,1301);
 expect(await reader.observe({contextId:study.contextId,hash})).toMatchObject({chainId:1301,source:"unichain-sepolia-rpc",status:"confirmed",verified:true,actualTotalFeeQualified:false});
 tx.chainId=84532;
 expect(await reader.observe({contextId:study.contextId,hash})).toMatchObject({status:"unverified",diagnostic:"transaction-mismatch"});
});
