import {expect,it} from "vitest";
import fixtures from "./fixtures/testnet-wallet-browser.json";
import {parseTestnetSubmission} from "./testnet-wallet-contracts";
import {parseHistoricalTestnetApproval} from "./testnet-wallet-historical";
import {TESTNET_SWAP_POLICY as P} from "@vezta-dex/core";
const f=fixtures["forward-approve"];const hash=`0x${"11".repeat(32)}`;
const record=parseTestnetSubmission({version:1,intent:f.intent,quote:f.quote.quote,action:f.checked.action,attemptedAt:f.now,hash});
const reconciliation={wallet:record.intent.wallet,hash,chainId:84532,kind:"approve",token:record.intent.tokenIn,spender:P.router,approvedAmount:record.intent.amountIn,receiptBlockNumber:"124",receiptBlockHash:`0x${"ab".repeat(32)}`,observedAt:new Date(f.now).toISOString(),confirmations:"2",currentAllowance:record.intent.amountIn,originalReviewAvailable:false,status:"verified-historical-approval",executionModel:"metamask-delegation",gasPayer:"0x1111111111111111111111111111111111111111",actualTotalFeeQualified:false,executionEnabled:false};
it("binds a historical approval to the preserved original without pretending the API review exists",()=>{
 expect(parseHistoricalTestnetApproval({reconciliation},record,f.now)).toMatchObject({originalReviewAvailable:false,status:"verified-historical-approval"});
 for(const change of [{wallet:reconciliation.gasPayer},{hash:`0x${"22".repeat(32)}`},{kind:"reset"},{token:reconciliation.gasPayer},{spender:reconciliation.gasPayer},{approvedAmount:"1"},{originalReviewAvailable:true},{executionEnabled:true},{confirmations:"1"}])expect(()=>parseHistoricalTestnetApproval({reconciliation:{...reconciliation,...change}},record,f.now)).toThrow();
 expect(()=>parseHistoricalTestnetApproval({reconciliation},record,f.now+30000)).toThrow();
});
