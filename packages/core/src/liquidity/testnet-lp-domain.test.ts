import { expect, it } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { testnetChainConfig } from "../chains/testnet-chain-config";
import { testnetLpIntentSchema } from "./testnet-lp-wallet";
const wallet="0x1111111111111111111111111111111111111111",now=Date.parse("2026-10-06T14:00:00.000Z");
it("inspects LP authorization, chain and manager in an explicit domain while preserving legacy rejection",async()=>{
  const {createTestnetLpDomain}=await import("./testnet-lp-wallet");
  const c=testnetChainConfig(1301),d=createTestnetLpDomain(1301);
  const intent={chainId:1301,wallet,kind:"mint",amount0Cap:"1000000",amount1Cap:"1000000000000000"};
  expect(d.testnetLpIntentSchema.parse(intent).chainId).toBe(1301);
  expect(()=>testnetLpIntentSchema.parse(intent)).toThrow();
  const study={contextId:"ab".repeat(24),intent,status:"prepared",reason:null,actionKind:"approve",approvalToken:"USDC",
    plan:{amount0Cap:"1000000",amount1Cap:"1000000000000000",amount0Desired:"900000",amount1Desired:"900000000000000",amount0Minimum:"895500",amount1Minimum:"895500000000000",liquidity:"100",positionLiquidity:"0",storedOwed0:"0",storedOwed1:"0",tickLower:-887220,tickUpper:887220,deadline:String(now/1000+120)},
    transaction:{chainId:1301,from:wallet,to:c.candidate.USDC.address,data:encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[c.candidate.v3PositionManager,1000000n]}),value:"0",nonce:"1",gas:"60000",gasPrice:"20000000"},
    gas:{estimatedGas:"50000",gasLimit:"60000",gasPrice:"20000000",l2FeeCeiling:"1200000000000",l1FeeUpperBound:"100",operatorFeeUpperBound:"0",totalFeeBudget:"1200000000200",totalFeeQualified:true,fork:"jovian"},
    balances:{USDC:"1000000",WETH:"1000000000000000",ETH:"1000000000000000"},allowances:{USDC:"0",WETH:"0"},blockNumber:"123",blockHash:`0x${"ab".repeat(32)}`,observedAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString(),source:c.source,runtimeVerified:true,executionEnabled:false};
  expect(()=>d.inspectTestnetLpTransaction(study,now)).not.toThrow();
  expect(()=>d.inspectTestnetLpTransaction({...study,transaction:{...study.transaction,chainId:84532}},now)).toThrow();
  expect(()=>d.inspectTestnetLpTransaction({...study,transaction:{...study.transaction,data:encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[testnetChainConfig(84532).candidate.v3PositionManager,1000000n]})}},now)).toThrow();
  expect(()=>d.parseTestnetLpStudy({...study,source:"base-sepolia-rpc"},now)).toThrow();
});
