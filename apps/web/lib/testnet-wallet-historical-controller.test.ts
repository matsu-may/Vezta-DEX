import {expect,it} from "vitest";
import fixtures from "./fixtures/testnet-wallet-browser.json";
import {TESTNET_SWAP_POLICY as P} from "@vezta-dex/core";
import {parseTestnetSubmission} from "./testnet-wallet-contracts";
import {memoryStorage} from "./testnet-wallet.test-helper";
import {TestnetWalletController} from "./testnet-wallet-controller";
import {TESTNET_SUBMISSION_KEY,TESTNET_MANUAL_REVIEW_KEY,readTestnetManualReview,readTestnetApprovalHistory} from "./testnet-wallet-storage";
const hash=`0x${"11".repeat(32)}`;
function setup(archived=false){const f=fixtures["forward-approve"];const record=parseTestnetSubmission({version:1,intent:f.intent,quote:f.quote.quote,action:f.checked.action,attemptedAt:f.now,hash});const storage=memoryStorage();storage.setItem(archived?TESTNET_MANUAL_REVIEW_KEY:TESTNET_SUBMISSION_KEY,JSON.stringify(archived?[record]:record));let now=f.now;const methods:string[]=[];
 const reconciliation={wallet:record.intent.wallet,hash,chainId:84532,kind:"approve",token:record.intent.tokenIn,spender:P.router,approvedAmount:record.intent.amountIn,receiptBlockNumber:"124",receiptBlockHash:`0x${"ab".repeat(32)}`,observedAt:new Date(f.now).toISOString(),confirmations:"2",currentAllowance:"0",originalReviewAvailable:false,status:"verified-historical-approval",executionModel:"metamask-delegation",gasPayer:"0x1111111111111111111111111111111111111111",actualTotalFeeQualified:false,executionEnabled:false};
 const api={async call(){return{reconciliation};}};const make=()=>new TestnetWalletController({async request({method}){methods.push(method);return method==="eth_chainId"?"0x14a34":method==="eth_getCode"?"0x":[record.intent.wallet];}},api,storage,()=>now,{async run(fn){await fn();}});const c=make();return{record,reconciliation,storage,methods,make,c,expire:()=>{now+=30000;}};}
it("qualifies an active context-lost historical approval, requires explicit acknowledgment and retains original history",async()=>{
 const s=setup();await s.c.reconcileHistoricalApproval();expect(s.c.snapshot().historical).toMatchObject({originalReviewAvailable:false});expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).not.toBeNull();expect(s.methods).toEqual([]);
 await s.c.acknowledgeHistoricalApproval();expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).toBeNull();expect(readTestnetApprovalHistory(s.storage)).toEqual([s.record]);expect(readTestnetManualReview(s.storage)).toEqual([]);
 const reload=s.make();expect(reload.snapshot().historical).toBeNull();expect(reload.snapshot().resolvedHistory).toHaveLength(1);await reload.connect();expect(reload.snapshot().account).toBe(s.record.intent.wallet);
});
it("resolves only the qualified archived approval while another same-wallet approval still blocks",async()=>{
 const s=setup(true);const second={...s.record,hash:`0x${"22".repeat(32)}`};s.storage.setItem(TESTNET_MANUAL_REVIEW_KEY,JSON.stringify([s.record,second]));await s.c.reconcileHistoricalApproval(hash);await s.c.acknowledgeHistoricalApproval();
 expect(readTestnetApprovalHistory(s.storage)).toEqual([s.record,second]);expect(readTestnetManualReview(s.storage)).toEqual([second]);const reload=s.make();await reload.connect();expect(reload.snapshot().account).toBeNull();
});
it("mismatch, stale qualification and storage failure cannot clear original recovery",async()=>{
 for(const failure of ["mismatch","stale","storage"]){const s=setup();if(failure==="mismatch")s.reconciliation.approvedAmount="1";await s.c.reconcileHistoricalApproval();if(failure==="stale")s.expire();if(failure==="storage")s.storage.setItem=()=>{throw Error("denied");};await s.c.acknowledgeHistoricalApproval();expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).not.toBeNull();}
});
