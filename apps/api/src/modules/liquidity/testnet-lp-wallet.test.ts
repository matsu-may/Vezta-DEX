import { mkdtempSync,readFileSync,readdirSync,statSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect,it,vi } from "vitest";
import { TestnetLpWallet } from "./testnet-lp-wallet";
import { TestnetLpWalletStore } from "./testnet-lp-wallet-store";
import { testnetLpWalletFixture } from "./testnet-lp-wallet.test-helper";
import { pool } from "./testnet-lp.test-helper";
import { TESTNET_NOW } from "../swap/testnet-quote.test-helper";
import { delegatedWalletCodeReader } from "../transaction/testnet-metamask-wallet.test-helper";

it("prepares and rechecks LP for the pinned delegate, binding the wallet code identity", async () => {
  const f = await testnetLpWalletFixture();
  f.source.getCode = delegatedWalletCodeReader(f.source.getCode, f.wallet);
  const study = await f.api.study({ intent: f.intent });
  expect(study.status).toBe("prepared");
  expect(await f.api.recheck({ contextId: study.contextId })).toEqual(study);
  await expect(f.api.recheck({ contextId: f.study.contextId })).rejects.toThrow("TESTNET_LP_STATE_CHANGED");
  const delegated = f.source.getCode;
  f.source.getCode = async (address, block) => address.toLowerCase() === f.wallet.toLowerCase()
    ? "0x" : delegated(address, block);
  await expect(f.api.recheck({ contextId: study.contextId })).rejects.toThrow("TESTNET_LP_STATE_CHANGED");
  f.source.getCode = delegatedWalletCodeReader(f.source.getCode, f.wallet, true);
  await expect(f.api.study({ intent: f.intent })).rejects.toThrow("TESTNET_METAMASK_RUNTIME_MISMATCH");
});
it.each(["mint","increase","decrease","collect","burn","approve","reset"] as const)("prepares and independently rechecks immutable %s",async kind=>{
  const f=await testnetLpWalletFixture(kind);expect(f.study.status).toBe("prepared");expect(f.study.actionKind).toBe(kind);
  expect(await f.api.recheck({contextId:f.study.contextId})).toEqual(f.study);
  expect(JSON.stringify(await f.api.recheck({contextId:f.study.contextId}))).toBe(JSON.stringify(f.study));
});
it("allows pool market and fee changes inside original spend minima and complete fee budget",async()=>{
  const f=await testnetLpWalletFixture();
  f.source.getLpPoolState=async()=>({...pool(),liquidity:1000000000n,feeGrowthGlobal0X128:5n*2n**128n});
  f.source.getGasPrice=async()=>15000000n;
  f.source.getAdditionalFees=async()=>({l1FeeUpperBound:5000000000n,operatorFeeUpperBound:0n,fork:"jovian"});
  f.source.getTokenBalance=async()=>5n*10n**17n;
  expect(await f.api.recheck({contextId:f.study.contextId})).toEqual(f.study);
});
it("rejects cap, owner, nonce, NFT and excessive fee changes without replacing the envelope",async()=>{
  for(const mutation of ["nonce","allowance","nft","fee","owner"]){
    const f=await testnetLpWalletFixture("increase");
    if(mutation==="nonce")f.source.getPendingNonce=async()=>8n;
    if(mutation==="allowance")f.source.getTokenAllowance=async()=>0n;
    if(mutation==="nft"){const read=f.source.getPosition;f.source.getPosition=async(...args)=>({...await read(...args),tokensOwed0:1n});}
    if(mutation==="fee")f.source.getAdditionalFees=async()=>({l1FeeUpperBound:7000000000n,operatorFeeUpperBound:0n,fork:"jovian"});
    if(mutation==="owner")f.source.getPositionOwner=async()=>"0x3333333333333333333333333333333333333333";
    await expect(f.api.recheck({contextId:f.study.contextId})).rejects.toThrow(/^TESTNET_LP_/);
    expect(f.store.read(f.study.contextId!).study).toEqual(f.study);
  }
});
it("checks strict request, expiry, EOA, incomplete fees and token funding before issuing",async()=>{
  const f=await testnetLpWalletFixture();
  const create=vi.fn(()=>f.source),api=new TestnetLpWallet(create,f.store,f.clock);
  await expect(api.study({intent:{...f.intent,chainId:137}})).rejects.toThrow("TESTNET_LP_REQUEST_INVALID");expect(create).not.toHaveBeenCalled();
  f.setNow(TESTNET_NOW+120000);await expect(api.recheck({contextId:f.study.contextId})).rejects.toThrow("TESTNET_LP_EXPIRED");
  const e=await testnetLpWalletFixture();e.source.getCode=async()=>"0x6000";await expect(e.api.study({intent:e.intent})).rejects.toThrow("TESTNET_LP_EOA_REQUIRED");
  const g=await testnetLpWalletFixture();g.source.getAdditionalFees=async()=>({l1FeeUpperBound:0n,operatorFeeUpperBound:0n,fork:"jovian"});await expect(g.api.study({intent:g.intent})).rejects.toThrow("TESTNET_FEE_INVALID");
  const b=await testnetLpWalletFixture();b.source.getTokenBalance=async()=>0n;expect(await b.api.study({intent:b.intent})).toMatchObject({status:"blocked",contextId:null,transaction:null,reason:"TESTNET_LP_TOKEN_BALANCE_LOW"});
});
it("persists bounded mode600 contexts and immutable unknown hash binding across restart",async()=>{
  const f=await testnetLpWalletFixture(),directory=mkdtempSync(join(tmpdir(),"lp-wallet-"));
  try{
    const a=new TestnetLpWalletStore(directory,f.clock,1),study=a.issue(f.study,"{}");
    const hash=`0x${"ab".repeat(32)}`;a.bindHash(study.contextId!,hash);
    const b=new TestnetLpWalletStore(directory,f.clock,1);expect(b.read(study.contextId!).originalHash).toBe(hash);
    expect(()=>b.bindHash(study.contextId!,`0x${"cd".repeat(32)}`)).toThrow("TESTNET_LP_CONTEXT_HASH_CHANGED");
    expect(()=>b.issue(f.study,"{}")).toThrow("TESTNET_LP_CONTEXT_CAPACITY");
    const path=join(directory,readdirSync(directory)[0]);expect(statSync(path).mode&0o777).toBe(0o600);expect(readFileSync(path,"utf8")).not.toContain("private");
    writeFileSync(path,"{broken");expect(()=>new TestnetLpWalletStore(directory,f.clock)).toThrow("TESTNET_LP_STORAGE_UNAVAILABLE");
  }finally{rmSync(directory,{recursive:true,force:true});}
});

it("propagates custom range to real SDK mint calldata and immutable recheck", async () => {
  const f = await testnetLpWalletFixture();
  const range = { tickLower: -120, tickUpper: 180 };
  const study = await f.api.study({ intent: { ...f.intent, range } });
  expect(study.plan).toMatchObject(range);
  const { decodeFunctionData } = await import("viem");
  const { testnetLpWalletManagerAbi, inspectTestnetLpTransaction } = await import("@vezta-dex/core");
  const decoded = decodeFunctionData({ abi: testnetLpWalletManagerAbi, data: study.transaction!.data as `0x${string}` });
  expect(decoded.functionName).toBe("mint"); expect(decoded.args[0]).toMatchObject(range);
  inspectTestnetLpTransaction(study, f.clock());
  expect(await f.api.recheck({ contextId: study.contextId })).toEqual(study);
});
it.each([{tickLower:0,tickUpper:60,amount0Cap:"1000000",amount1Cap:"0",zero:"amount1Desired"},
  {tickLower:-60,tickUpper:0,amount0Cap:"0",amount1Cap:"1000000000000000",zero:"amount0Desired"},
  {tickLower:60,tickUpper:120,amount0Cap:"1000000",amount1Cap:"0",zero:"amount1Desired"},
  {tickLower:-120,tickUpper:-60,amount0Cap:"0",amount1Cap:"1000000000000000",zero:"amount0Desired"}])(
  "supports exact zero authorization on the unused side of custom mint: $tickLower", async range => {
  const f = await testnetLpWalletFixture();
  const { BASE_SEPOLIA_CANDIDATE: C } = await import("@vezta-dex/core");
  f.source.getTokenAllowance = async token => BigInt(token.toLowerCase() === C.USDC.address.toLowerCase() ? range.amount0Cap : range.amount1Cap);
  const study = await f.api.study({ intent: { ...f.intent, amount0Cap:range.amount0Cap,amount1Cap:range.amount1Cap,
    range:{tickLower:range.tickLower,tickUpper:range.tickUpper} } });
  expect(study.actionKind).toBe("mint"); expect(study.plan[range.zero as "amount0Desired"|"amount1Desired"]).toBe("0");
  expect(BigInt(study.plan.liquidity)).toBeGreaterThan(0n);
});

it("rejects custom mint calldata tick mutation independently of the bound review", async () => {
  const f = await testnetLpWalletFixture();
  const study=await f.api.study({intent:{...f.intent,range:{tickLower:-120,tickUpper:180}}});
  const {decodeFunctionData,encodeFunctionData}=await import("viem");
  const {testnetLpWalletManagerAbi,inspectTestnetLpTransaction}=await import("@vezta-dex/core");
  const decoded=decodeFunctionData({abi:testnetLpWalletManagerAbi,data:study.transaction!.data as `0x${string}`});
  if(decoded.functionName!=="mint") throw Error("Expected mint");
  study.transaction!.data=encodeFunctionData({abi:testnetLpWalletManagerAbi,functionName:"mint",args:[{...decoded.args[0],tickUpper:240}]});
  expect(()=>inspectTestnetLpTransaction(study,f.clock())).toThrow("LP calldata mismatch");
});
it("increases a custom NFT using its stored range and refuses a replacement range intent", async () => {
  const f=await testnetLpWalletFixture("increase"), read=f.source.getPosition;
  f.source.getPosition=async(...args)=>({...await read(...args),tickLower:-180,tickUpper:240});
  const study=await f.api.study({intent:f.intent});
  expect(study.plan).toMatchObject({tickLower:-180,tickUpper:240});
  expect(await f.api.recheck({contextId:study.contextId})).toEqual(study);
  await expect(f.api.study({intent:{...f.intent,range:{tickLower:-60,tickUpper:60}}})).rejects.toThrow("TESTNET_LP_REQUEST_INVALID");
});
