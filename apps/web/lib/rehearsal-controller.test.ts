import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { POLYGON_PERMIT2, TOKENS } from "@vezta-dex/core";
import { RehearsalController, type RehearsalWallet, type RehearsalApi } from "./rehearsal-controller";
import { testAccount, testNow, testHash, testBlockHash, testIntent, testPlan, testQuote, testWalletState, testPreparation, testSignature } from "./rehearsal-fixtures.test-helper";

export async function setup(allowance = "1000000") {
  let now = testNow; let selected = testAccount.address; let chain = "0x89";
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const signature = await testSignature(); const values = new Map<string,string>();
  const storage = { getItem: (k:string) => values.get(k) ?? null, setItem: (k:string,v:string) => {values.set(k,v);}, removeItem: (k:string) => {values.delete(k);} };
  const wallet: RehearsalWallet = { request: vi.fn(async ({method}) => {
    if(method === "eth_chainId") return chain;
    if(method === "eth_signTypedData_v4") return signature;
    if(method === "eth_sendTransaction") return testHash;
    return [selected];
  }), on: (name, fn) => {listeners.set(name,fn);}, removeListener: name => {listeners.delete(name);} };
  const state = testWalletState(now,allowance);
  const prep = testPreparation(signature);
  let receiptKind: "approval"|"swap" = "swap";
  const api: RehearsalApi = { call: vi.fn(async (action) => {
    if(action === "quote") return {quote:testQuote(now),quoteId:"ab".repeat(24)};
    if(action === "state") return {state};
    if(action === "approval") return {approval:{chainId:137,blockNumber:"123",observedAt:new Date(now).toISOString(),currentAllowance:state.tokenAllowance,plan:state.tokenAllowance === "0" ? {kind:"approve",transaction:{chainId:137,from:testIntent.swapper,to:testIntent.tokenIn,data:encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[POLYGON_PERMIT2,1000000n]}),value:"0"}} : state.tokenAllowance === "1000000" ? {kind:"ready"} : {kind:"blocked-existing",allowance:state.tokenAllowance}}};
    if(action === "permit") return {permitPlan:testPlan(now)};
    if(action === "prepare" || action === "recheck") return {preparation:prep};
    return { observation:{chainId:137,hash:testHash,source:"polygon-rpc",observedAt:new Date(now).toISOString(),status:"confirmed",receipt:{from:testIntent.swapper,to:receiptKind === "approval" ? testIntent.tokenIn : prep.transaction.to,blockNumber:"123",blockHash:testBlockHash,confirmations:"2",outcome:"success",gasUsed:"100000",effectiveGasPrice:"30000000000"}},execution:{status:"verified",nonce:"7",amountIn:receiptKind === "swap" ? "1000000" : "0",amountOut:receiptKind === "swap" ? "1000" : "0",gasCost:"3000000000000000",balances:{USDC:"1000000",WETH:"1000",POL:"999000000000000000"},tokenAllowance:receiptKind === "approval" ? "1000000" : "0",permitAllowance:{amount:"0",expiration:"0",nonce:"8"}} };
  }) };
  const controller = new RehearsalController(wallet,api,storage,()=>now);
  return {controller,wallet,api,state,prep,values,storage,signature,advance:(ms:number)=>{now+=ms;},emit:(name:string,...args:unknown[])=>listeners.get(name)?.(...args),changeAccount:()=>{selected="0x1111111111111111111111111111111111111111";},changeChain:()=>{chain="0x1";},receiptKind:(k:"approval"|"swap")=>{receiptKind=k;} };
}
async function prepared(s: Awaited<ReturnType<typeof setup>>) {
  await s.controller.connect(); await s.controller.quote(testIntent); await s.controller.reviewPermit(); await s.controller.sign(); await s.controller.prepare();
}
describe("explicit local rehearsal controller",()=>{
  it("requires separate quote review, signature, preparation and broadcast actions",async()=>{
    const s=await setup(); await s.controller.connect();await s.controller.quote(testIntent);
    expect(s.controller.snapshot().stage).toBe("quote-review");
    expect(s.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));
    await s.controller.reviewPermit();expect(s.controller.snapshot().stage).toBe("permit-review");
    await s.controller.sign();expect(s.controller.snapshot().stage).toBe("permit-signed");
    await s.controller.prepare();expect(s.controller.snapshot().stage).toBe("swap-review");
    await s.controller.submit();expect(s.controller.snapshot().submission?.hash).toBe(testHash);
    expect(s.controller.snapshot().stage).toBe("pending");
    expect(s.values.values().next().value).not.toContain(s.signature);
    await s.controller.checkReceipt(); expect(s.controller.snapshot().stage).toBe("confirmed");
    expect(s.controller.snapshot().execution?.amountOut).toBe("1000");
  });
  it("uses exact approval, then requires fresh quote and allowance review",async()=>{
    const s=await setup("0");s.receiptKind("approval");await s.controller.connect();await s.controller.quote(testIntent);await s.controller.approve();
    expect(s.wallet.request).toHaveBeenCalledWith({method:"eth_sendTransaction",params:[expect.objectContaining({to:testIntent.tokenIn,value:"0x0",chainId:"0x89",data:encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[POLYGON_PERMIT2,1000000n]})})]});
    await s.controller.checkReceipt();expect(s.controller.snapshot().stage).toBe("requote");expect(s.controller.snapshot().quote).toBeNull();
  });
  it("blocks wrong chain, different allowance and non-EOA before any prompt",async()=>{
    for(const fault of ["chain","allowance","code"]){const s=await setup();
      if(fault === "chain")s.changeChain(); if(fault === "allowance")s.state.tokenAllowance="5";if(fault === "code")s.state.accountKind="blocked";
      await s.controller.connect();await s.controller.quote(testIntent);await s.controller.approve();await s.controller.reviewPermit();
      expect(s.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));
      expect(s.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_signTypedData_v4"}));
    }
  });
  it("checks current account even when provider omits account-change events",async()=>{
    const s=await setup();await prepared(s);s.changeAccount();await s.controller.submit();
    expect(s.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));
  });
  it("discards expired signatures and never calls preparation after expiry",async()=>{
    const s=await setup();await s.controller.connect();await s.controller.quote(testIntent);await s.controller.reviewPermit();s.advance(30000);await s.controller.sign();await s.controller.prepare();
    expect(s.api.call).not.toHaveBeenCalledWith("prepare",expect.anything());
  });
  it("prevents duplicate wallet prompts and retains returned hash after account invalidation",async()=>{
    const s=await setup();await prepared(s);let resolve!:(v:unknown)=>void;
    const old=s.wallet.request;s.wallet.request=vi.fn(args=>args.method === "eth_sendTransaction" ? new Promise(r=>{resolve=r;}) : old(args));
    const one=s.controller.submit();await vi.waitFor(()=>expect(resolve).toBeTruthy());
    await s.controller.submit();s.changeAccount();s.emit("accountsChanged",["0x1111111111111111111111111111111111111111"]);resolve(testHash);await one;
    expect(s.wallet.request).toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));
    expect(s.controller.snapshot().submission?.intent.swapper).toBe(testIntent.swapper);
    expect(s.controller.snapshot().submission?.hash).toBe(testHash);
  });
  it("persists ambiguity before broadcast and never retries on transport failure",async()=>{
    const s=await setup();await prepared(s);const old=s.wallet.request;
    s.wallet.request=vi.fn(async args=>{if(args.method === "eth_sendTransaction"){expect(s.values.size).toBe(1);throw new Error("secret-provider");}return old(args);});
    await s.controller.submit();await s.controller.submit();expect(s.controller.snapshot().stage).toBe("uncertain");
    expect(s.controller.snapshot().message).not.toContain("secret");
    expect(vi.mocked(s.wallet.request).mock.calls.filter(([a])=>a.method === "eth_sendTransaction")).toHaveLength(1);
  });
  it("handles explicit wallet rejection without claiming a submission",async()=>{
    const s=await setup();await prepared(s);const old=s.wallet.request;
    s.wallet.request=async args=>{if(args.method === "eth_sendTransaction")throw {code:4001};return old(args);};
    await s.controller.submit();expect(s.controller.snapshot().submission).toBeNull();expect(s.values.size).toBe(0);
  });
  it("requires renewed gas review if recheck raises the approved cost",async()=>{
    const s=await setup();await prepared(s);const old=s.api.call;
    s.api.call=async(a,b)=>a === "recheck" ? {preparation:{...s.prep,transaction:{...s.prep.transaction,gas:"240000"}}} : old(a,b);
    await s.controller.submit();expect(s.controller.snapshot().stage).toBe("swap-review");
    expect(s.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));
  });
  it("does not sign changed permit nonce or send after balance/allowance change",async()=>{
    const s=await setup();await s.controller.connect();await s.controller.quote(testIntent);await s.controller.reviewPermit();s.state.permitAllowance.nonce="8";await s.controller.sign();
    expect(s.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_signTypedData_v4"}));
    const t=await setup();await prepared(t);t.state.balances.POL="0";await t.controller.submit();expect(t.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));
  });
  it("rejects wrong recipient calldata from a successful preparation response",async()=>{
    const s=await setup();await s.controller.connect();await s.controller.quote(testIntent);await s.controller.reviewPermit();await s.controller.sign();
    s.prep.transaction.to=TOKENS.WETH.address;await s.controller.prepare();expect(s.controller.snapshot().stage).not.toBe("swap-review");
  });
});

describe("receipt lifecycle integration and recovery",()=>{
  it("restores an interrupted broadcast without reopening any wallet prompt",async()=>{
    const s=await setup();await prepared(s);const old=s.wallet.request;
    s.wallet.request=async args=>{if(args.method === "eth_sendTransaction")throw new Error("transport");return old(args);};
    await s.controller.submit();s.controller.dispose();
    const restored=new RehearsalController(s.wallet,s.api,s.storage,()=>testNow);
    expect(restored.snapshot().stage).toBe("uncertain");await restored.connect();await restored.quote(testIntent);await restored.submit();
    expect(restored.snapshot().submission?.hash).toBeNull();await restored.recover(testHash);await restored.checkReceipt();expect(restored.snapshot().stage).toBe("confirmed");
  });
  it("serializes receipt reads and recovers a late receipt after delay",async()=>{
    const s=await setup();await prepared(s);await s.controller.submit();s.advance(60001);const old=s.api.call;
    let resolve!:(value:unknown)=>void;let reads=0;
    s.api.call=async(a,b)=>a === "receipt" ? (reads++,new Promise(r=>{resolve=r;})) : old(a,b);
    const first=s.controller.checkReceipt();await vi.waitFor(()=>expect(resolve).toBeTruthy());await s.controller.checkReceipt();
    expect(reads).toBe(1);resolve({observation:{chainId:137,hash:testHash,source:"polygon-rpc",observedAt:new Date(testNow+60001).toISOString(),status:"pending",reason:"not-found"},execution:null});await first;
    expect(s.controller.snapshot().stage).toBe("delayed");s.api.call=old;await s.controller.checkReceipt();expect(s.controller.snapshot().stage).toBe("confirmed");
  });
  it("keeps original-account balances when another account is selected",async()=>{
    const s=await setup();await prepared(s);await s.controller.submit();s.changeAccount();s.emit("accountsChanged",["0x1111111111111111111111111111111111111111"]);await s.controller.checkReceipt();
    expect(s.controller.snapshot().account).toBeNull();expect(s.controller.snapshot().submission?.intent.swapper).toBe(testIntent.swapper);expect(s.controller.snapshot().execution?.balances?.WETH).toBe("1000");
  });
  it("does not clear unverified economic evidence or treat reverted gas as a swap",async()=>{
    const s=await setup();await prepared(s);await s.controller.submit();const old=s.api.call;
    s.api.call=async(a,b)=>{const r=await old(a,b);return a === "receipt" ? {...r as object,execution:{status:"unverified"}} : r;};
    await s.controller.checkReceipt();expect(s.controller.snapshot().stage).toBe("verification-needed");await s.controller.clearVerified();expect(s.controller.snapshot().submission?.hash).toBe(testHash);
    s.api.call=async(a,b)=>{const r=await old(a,b) as {observation:{receipt:{outcome:string}},execution:object};return a === "receipt" ? {observation:{...r.observation,status:"reverted",receipt:{...r.observation.receipt,outcome:"reverted"}},execution:{...r.execution,status:"reverted",amountIn:"0",amountOut:"0"}} : r;};
    await s.controller.checkReceipt();expect(s.controller.snapshot().stage).toBe("reverted");expect(s.controller.snapshot().execution?.gasCost).toBeTruthy();
  });
  it("blocks malformed recovery storage and storage failure before any broadcast",async()=>{
    const s=await setup();s.values.set("vezta-dex:local-submission:v1","bad");const restored=new RehearsalController(s.wallet,s.api,s.storage,()=>testNow);
    await restored.connect();expect(restored.snapshot().stage).toBe("recovery-blocked");
    const t=await setup();await prepared(t);t.storage.setItem=()=>{throw new Error("denied");};await t.controller.submit();
    expect(t.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));
  });
});

describe("remaining wallet integration failures",()=>{
 it("discards a signature that returns after quote TTL or a chain-change event",async()=>{
  for(const fault of ["expiry","chain"]){
   const s=await setup();await s.controller.connect();await s.controller.quote(testIntent);await s.controller.reviewPermit();const old=s.wallet.request;
   s.wallet.request=async args=>{if(args.method === "eth_signTypedData_v4"){if(fault==="expiry")s.advance(30000);else{s.changeChain();s.emit("chainChanged","0x1");}return s.signature;}return old(args);};
   await s.controller.sign();await s.controller.prepare();expect(s.api.call).not.toHaveBeenCalledWith("prepare",expect.anything());
  }
 });
 it("does not prepare after a rejected signature, stale RPC or insufficient token balance",async()=>{
  const s=await setup();await s.controller.connect();await s.controller.quote(testIntent);await s.controller.reviewPermit();const old=s.wallet.request;
  s.wallet.request=async args=>{if(args.method === "eth_signTypedData_v4")throw {code:4001};return old(args);};await s.controller.sign();await s.controller.prepare();expect(s.api.call).not.toHaveBeenCalledWith("prepare",expect.anything());
  for(const fault of ["stale","balance"]){const t=await setup();if(fault==="stale")t.state.observedAt=new Date(testNow-120001).toISOString();else t.state.balances.USDC="999999";await t.controller.connect();await t.controller.quote(testIntent);expect(t.controller.snapshot().stage).toBe("error");}
 });
 it("preserves intent and does not broadcast when simulation is unavailable",async()=>{
  const s=await setup();await prepared(s);const old=s.api.call;s.api.call=async(a,b)=>{if(a === "recheck")throw new Error("secret-rpc");return old(a,b);};await s.controller.submit();
  expect(s.wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));expect(s.controller.snapshot().message).not.toContain("secret");
 });
 it("does not prepare an already-ready permit after an invalid controller transition",async()=>{
  const s=await setup();s.state.permitAllowance.amount="1000000";s.state.permitAllowance.expiration=String(Math.floor(testNow/1000)+100);const old=s.api.call;
  s.api.call=vi.fn(async(a,b)=>a === "permit" ? {permitPlan:{...testPlan(),permit:{kind:"ready"}}} : old(a,b));
  await s.controller.connect();await s.controller.quote(testIntent);await s.controller.reviewPermit();await s.controller.sign();expect(s.controller.snapshot().stage).toBe("error");await s.controller.prepare();
  expect(s.api.call).not.toHaveBeenCalledWith("prepare",expect.anything());
 });
});
