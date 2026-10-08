import { expect, it } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import { testnetChainConfig } from "../chains/testnet-chain-config";
import { parseTestnetSwapIntent } from "./testnet-swap";
const now = Date.parse("2026-10-06T14:00:00.000Z");
const wallet = "0x1111111111111111111111111111111111111111";
it("builds exact chain-bound quotes, swaps and approvals without upgrading legacy Base requests", async () => {
  const {createTestnetSwapDomain} = await import("./testnet-swap");
  for (const chainId of [84532,1301] as const) {
    const c=testnetChainConfig(chainId),d=createTestnetSwapDomain(chainId);
    const i={chainId,wallet,tokenIn:c.candidate.USDC.address,tokenOut:c.candidate.WETH.address,amountIn:"1000000",slippageBps:50};
    const q={...i,protocol:"v3",pool:c.policy.pool,feeTier:3000,amountOut:"10000",minimumAmountOut:"9950",blockNumber:"123",blockHash:`0x${"ab".repeat(32)}`,observedAt:new Date(now).toISOString(),source:c.source};
    expect(d.parseTestnetSwapQuote(q,now).chainId).toBe(chainId);
    const tx=d.buildTestnetSwapTransaction(q,now);
    expect(tx).toMatchObject({chainId,to:c.policy.router,from:wallet,value:"0"});
    expect(()=>d.inspectTestnetSwapTransaction({...tx,chainId:chainId===84532?1301:84532},q,now)).toThrow();
    const approve=d.planTestnetTokenApproval(i,0n);
    expect(approve.kind).toBe("approve");
    if(approve.kind!=="ready") expect(decodeFunctionData({abi:erc20Abi,data:approve.transaction.data}).args).toEqual([c.policy.router,1000000n]);
    expect(()=>d.parseTestnetSwapQuote({...q,source:chainId===84532?"unichain-sepolia-rpc":"base-sepolia-rpc"},now)).toThrow();
    expect(()=>d.parseTestnetSwapIntent({...i,chainId:chainId===84532?1301:84532})).toThrow();
    if(chainId===1301){
      expect(()=>parseTestnetSwapIntent(i)).toThrow();
      expect(()=>d.parseTestnetSwapQuote({...q,pool:testnetChainConfig(84532).policy.pool},now)).toThrow();
      expect(()=>d.parseTestnetSwapIntent({...i,poolFeeTier:500})).toThrow();
    }
  }
});
