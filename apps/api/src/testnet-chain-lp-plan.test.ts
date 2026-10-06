import { expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { testnetChainConfig } from "@vezta-dex/core";
import { planTestnetLp,lpManagerAbi } from "./testnet-lp-plan";
import { lpSdkPool } from "./testnet-lp-position";
import { pool as lpPoolState } from "./testnet-lp.test-helper";
it("plans LP tokens and NFT manager with chain-specific SDK identities, rejecting Base state on Unichain",()=>{
  const c=testnetChainConfig(1301),base=lpPoolState();
  const pool={...base,token0:c.candidate.USDC.address,token1:c.candidate.WETH.address,factory:c.candidate.v3Factory};
  expect(()=>lpSdkPool(base,1301)).toThrow();
  const plan=planTestnetLp({kind:"mint",wallet:"0x1111111111111111111111111111111111111111",amount0Cap:"1000000",amount1Cap:"1000000000000000",tickLower:-887220,tickUpper:887220,deadline:"1791288120"},{pool},1791288000,120,1301);
  expect(plan.transaction).toMatchObject({chainId:1301,to:c.candidate.v3PositionManager});
  const mint=decodeFunctionData({abi:lpManagerAbi,data:plan.transaction.data});
  expect(mint.functionName).toBe("mint");
  if(mint.functionName==="mint") expect(mint.args[0]).toMatchObject({token0:c.candidate.USDC.address,token1:c.candidate.WETH.address,fee:3000});
  expect(()=>planTestnetLp({kind:"mint",wallet:c.candidate.v3PositionManager,amount0Cap:"1000000",amount1Cap:"1000000000000000",tickLower:-887220,tickUpper:887220,deadline:"1791288120"},{pool},1791288000,120,1301)).toThrow();
});
