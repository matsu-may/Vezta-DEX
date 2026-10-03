import {expect,it} from "vitest";
import fixtures from "./fixtures/testnet-wallet-browser.json";
import {parseTestnetSubmission,parseTestnetWalletObservation} from "./testnet-wallet-contracts";
function setup(){
  const f=fixtures["forward-approve"],hash=`0x${"11".repeat(32)}`;
  const record=parseTestnetSubmission({version:1,intent:f.intent,quote:f.quote.quote,action:f.checked.action,attemptedAt:f.now,hash});
  const observation={contextId:record.action.contextId,hash,kind:"approve",chainId:84532,source:"base-sepolia-rpc",observedAt:new Date(f.now).toISOString(),executionEnabled:false,
    status:"confirmed",confirmations:"2",blockNumber:"124",blockHash:`0x${"cd".repeat(32)}`,executionModel:"metamask-delegation",gasPayer:"0x1111111111111111111111111111111111111111",
    execution:{status:"verified",amountIn:"0",amountOut:"0",approvedAmount:f.intent.amountIn,l2GasCost:"1000000000000000",actualTotalFeeQualified:false,balances:{USDC:"1000000",WETH:"0",ETH:"100"},tokenAllowance:f.intent.amountIn,allowanceMatchesExpected:true,stateBlockNumber:"125",stateBlockHash:`0x${"ef".repeat(32)}`}};
  return {f,record,observation};
}
it("separates relayer paid L2 cost from the reviewed inner wallet fee budget",()=>{const f=setup();expect(parseTestnetWalletObservation({observation:f.observation},f.record,f.f.now)).toMatchObject({executionModel:"metamask-delegation",gasPayer:f.observation.gasPayer});});
it("requires paired known relay metadata and preserves the direct cost ceiling",()=>{
  const f=setup();for(const change of [{...f.observation,gasPayer:undefined},{...f.observation,executionModel:undefined},{...f.observation,gasPayer:f.record.intent.wallet},{...f.observation,executionModel:"arbitrary"},{...f.observation,gasPayer:undefined,executionModel:undefined}]) expect(()=>parseTestnetWalletObservation({observation:change},f.record,f.f.now)).toThrow();
});
