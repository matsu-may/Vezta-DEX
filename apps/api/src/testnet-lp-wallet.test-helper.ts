import { decodeFunctionData,encodeAbiParameters,type Hex, type Address } from "viem";
import { testnetLpWalletManagerAbi,type TestnetLpIntent,type TestnetLpStudy } from "@vezta-dex/core";
import { lpSource,position } from "./testnet-lp.test-helper";
import { TESTNET_NOW } from "./testnet-quote.test-helper";
import { TestnetLpWallet,type BaseSepoliaLpWalletSource } from "./testnet-lp-wallet";
import { TestnetLpWalletStore } from "./testnet-lp-wallet-store";
export async function testnetLpWalletFixture(actionKind:TestnetLpStudy["actionKind"]="mint", wallet: Address = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e") {
  let now=TESTNET_NOW;
  const kind=actionKind==="approve"||actionKind==="reset"?"mint":actionKind;
  const intent:TestnetLpIntent={chainId:84532,wallet,kind,...(kind==="mint"?{amount0Cap:"1000000",amount1Cap:"1000000000000000"}
    :kind==="increase"?{tokenId:"42",amount0Cap:"1000000",amount1Cap:"1000000000000000"}
    :kind==="decrease"?{tokenId:"42",percentage:50}:{tokenId:"42"})} as TestnetLpIntent;
  const baseSource=lpSource();
  const source:BaseSepoliaLpWalletSource={...baseSource,
    async getCode(a,b){return a.toLowerCase()===wallet.toLowerCase()?"0x":baseSource.getCode(a,b);},
    async getPositionOwner(){return wallet;},
    async getPosition(){return {...position(),liquidity:kind==="burn"?0n:1000000n,tokensOwed0:kind==="collect"?5n:0n,tokensOwed1:kind==="collect"?7n:0n};},
    async getTokenBalance(){return 10n**18n;},async getNativeBalance(){return 10n**18n;},
    async getTokenAllowance(token){return actionKind==="approve"?0n:actionKind==="reset"?1n:token.toLowerCase().includes("036cbd")?1000000n:1000000000000000n;},
    async getAccountNonce(){return 7n;},async getPendingNonce(){return 7n;},async getGasPrice(){return 10000000n;},
    async getAdditionalFees(){return {l1FeeUpperBound:3000000000n,operatorFeeUpperBound:0n,fork:"jovian"};},
    async estimateTestnetSwapGas(){return 150000n;},async simulateTestnetSwap(){return "0x";},
    async simulateTestnetLp(tx){
      if(actionKind==="approve"||actionKind==="reset")return encodeAbiParameters([{type:"bool"}],[true]);
      const d=decodeFunctionData({abi:testnetLpWalletManagerAbi,data:tx.data as Hex});
      if(d.functionName==="burn")return "0x";
      if(d.functionName==="mint")return encodeAbiParameters([{type:"uint256"},{type:"uint128"},{type:"uint256"},{type:"uint256"}],[42n,1000n,d.args[0].amount0Desired,d.args[0].amount1Desired]);
      if(d.functionName==="increaseLiquidity")return encodeAbiParameters([{type:"uint128"},{type:"uint256"},{type:"uint256"}],[1000n,d.args[0].amount0Desired,d.args[0].amount1Desired]);
      if(d.functionName==="decreaseLiquidity")return encodeAbiParameters([{type:"uint256"},{type:"uint256"}],[d.args[0].amount0Min,d.args[0].amount1Min]);
      if(d.functionName==="collect")return encodeAbiParameters([{type:"uint256"},{type:"uint256"}],[5n,7n]);
      return "0x";
    },
  };
  // Token address matching is explicit; callers may alter the read to exercise cap drift.
  const {BASE_SEPOLIA_CANDIDATE:C}=await import("@vezta-dex/core");
  source.getTokenAllowance=async token=>actionKind==="approve"?0n:actionKind==="reset"?1n:token.toLowerCase()===C.USDC.address.toLowerCase()?1000000n:1000000000000000n;
  const clock=()=>now,store=new TestnetLpWalletStore(undefined,clock),api=new TestnetLpWallet(()=>source,store,clock);
  const study=await api.study({intent});return {intent,source,wallet,study,clock,store,api,setNow:(n:number)=>{now=n;}};
}
