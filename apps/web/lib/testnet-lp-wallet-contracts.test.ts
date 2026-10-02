import {expect,it} from "vitest";
import {lpWalletFixture,LP_HASH,LP_NOW} from "./testnet-lp-wallet.test-helper";
import {parseTestnetLpSubmission,parseTestnetLpObservation,parseTestnetLpReview} from "./testnet-lp-wallet-contracts";
it("binds reviewed intent/context and independently rejects altered calldata and transaction envelopes",()=>{
  const f=lpWalletFixture();expect(parseTestnetLpReview({study:f.study},f.intent,LP_NOW).status).toBe("prepared");
  for(const field of ["data","nonce","to"] as const){const bad=structuredClone(f.study);Object.assign(bad.transaction!, {[field]:field==="data"?"0x1234":field==="nonce"?"8":"0x1111111111111111111111111111111111111111"});
    expect(()=>parseTestnetLpReview({study:bad},f.intent,LP_NOW,f.study)).toThrow();}
  expect(()=>parseTestnetLpReview({study:{...f.study,contextId:"bb".repeat(24)}},f.intent,LP_NOW,f.study)).toThrow();
  expect(()=>parseTestnetLpReview({study:f.study},f.intent,LP_NOW+120000)).toThrow();
});
it("keeps expired reviewed records valid for recovery but refuses malformed attempts and bound receipt identity",()=>{
  const f=lpWalletFixture();const record=parseTestnetLpSubmission({version:1,study:f.study,hash:LP_HASH,attemptedAt:LP_NOW});
  expect(parseTestnetLpSubmission(record).study.contextId).toBe(f.study.contextId);
  expect(()=>parseTestnetLpSubmission({...record,attemptedAt:LP_NOW+120000})).toThrow();
  expect(parseTestnetLpObservation({observation:f.observation},record,LP_NOW).status).toBe("confirmed");
  for(const bad of [{...f.observation,hash:`0x${"22".repeat(32)}`},{...f.observation,contextId:"bb".repeat(24)},{...f.observation,actionKind:"collect"},{...f.observation,intent:{...f.intent,wallet:"0x1111111111111111111111111111111111111111"}}])expect(()=>parseTestnetLpObservation({observation:bad},record,LP_NOW)).toThrow();
});

it("rejects a verified receipt without canonical successor block or different position NFT",()=>{
 const f=lpWalletFixture("collect"); const rec=parseTestnetLpSubmission({version:1,study:f.study,hash:LP_HASH,attemptedAt:LP_NOW});
 for(const observation of [{...f.observation,receiptBlockNumber:"123"},{...f.observation,blockNumber:"124"},{...f.observation,tokenId:"43"}])expect(()=>parseTestnetLpObservation({observation},rec,LP_NOW)).toThrow();
});
it("qualifies confirmed deposit amounts against reviewed minimums and desired amounts",()=>{
 const f=lpWalletFixture();const rec=parseTestnetLpSubmission({version:1,study:f.study,hash:LP_HASH,attemptedAt:LP_NOW});
 for(const amount0 of ["0","500001"])expect(()=>parseTestnetLpObservation({observation:{...f.observation,amount0}},rec,LP_NOW)).toThrow();
});
