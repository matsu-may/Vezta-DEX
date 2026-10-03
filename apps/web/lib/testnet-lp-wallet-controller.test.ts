import { expect, it } from "vitest";
import { lpWalletFixture, LP_HASH, LP_NOW } from "./testnet-lp-wallet.test-helper";
import { TestnetLpWalletController, type TestnetLpWalletApi } from "./testnet-lp-wallet-controller";
import { TESTNET_LP_SUBMISSION_KEY } from "./testnet-cross-flow";
import { TESTNET_SUBMISSION_KEY } from "./testnet-wallet-storage";
import { memoryStorage } from "./testnet-wallet.test-helper";
import { TestnetBrowserError } from "./testnet-wallet-client";
async function setup(kind: Parameters<typeof lpWalletFixture>[0] = "mint", percentage: 25|50|100 = 25, gate = true) {
  const f = lpWalletFixture(kind, percentage); const storage = memoryStorage(); const methods: string[] = []; const sends: unknown[][] = []; const events = new Map<string,(v: unknown)=>void>();
  let now = LP_NOW; let reject = false; let lose = false; let code = "0x"; let chain = "0x14a34"; let owner = f.intent.wallet; let receiptFailure = false;
  const wallet = { on(e: string, fn: (v: unknown)=>void) { events.set(e,fn); }, removeListener() {}, async request({method,params}: {method:string;params?:unknown[]}) {
    methods.push(method); if (method === "eth_accounts" || method === "eth_requestAccounts") return [owner]; if (method === "eth_chainId") return chain; if (method === "eth_getCode") return code;
    if (method === "eth_sendTransaction") { sends.push(params!); expect(storage.getItem(TESTNET_LP_SUBMISSION_KEY)).not.toBeNull(); if (reject) throw {code:4001}; if (lose) throw Error("unknown"); return LP_HASH; } throw Error("unexpected");
  } };
  const api: TestnetLpWalletApi = { async call(action) { if (action === "receipt") { if (receiptFailure) throw new TestnetBrowserError(503,"TESTNET_LP_TIMEOUT"); return {observation:{...f.observation, observedAt:new Date(now).toISOString()}}; } return {study:f.study}; } };
  const coordination = { async run(fn:()=>Promise<void>) { await fn(); } };
  const make = () => new TestnetLpWalletController(wallet,api,storage,()=>now,coordination,()=>gate); const controller = make();
  const reviewed = async () => { await controller.connect(); await controller.study(f.intent); };
  return { f,controller,make,storage,methods,sends,api,reviewed,expire:()=>{now+=120000;},reject:()=>{reject=true;},lose:()=>{lose=true;},failReceipt:()=>{receiptFailure=true;},
    setCode:(value:string)=>{code=value;},
    change:()=>{owner="0x1111111111111111111111111111111111111111";events.get("accountsChanged")?.([owner]);},wrongChain:()=>{chain="0x89";},smart:()=>{code="0xef0100";} };
}
it("explicitly studies, rechecks unchanged legacy calls and observes every operation independently", async () => {
  for (const kind of ["mint","increase","decrease","collect","burn","approve","reset"] as const) for (const percentage of kind === "decrease" ? [25,50,100] as const : [25] as const) {
    const s = await setup(kind,percentage); expect(s.methods).toEqual([]); await s.reviewed(); expect(s.controller.snapshot().stage).toBe("review");
    expect(s.methods).not.toContain("eth_sendTransaction"); await s.controller.submit(); expect(s.controller.snapshot().stage).toBe("pending");
    await s.controller.observe(); expect(s.controller.snapshot().stage).toBe("confirmed"); await s.controller.acknowledge(); expect(s.storage.getItem(TESTNET_LP_SUBMISSION_KEY)).toBeNull();
  }
});
it("blocks gate, expired review, wrong chain, smart account, changed account and recheck transaction drift", async () => {
  for (const failure of ["gate","expiry","chain","smart","account","tx","context","intent"] as const) {
    const s = await setup("mint",25,failure!=="gate"); await s.reviewed();
    if (failure === "expiry") s.expire(); if (failure === "chain") s.wrongChain(); if (failure === "smart") s.smart(); if (failure === "account") s.change();
    if (failure === "tx") s.f.study.transaction!.nonce="8"; if (failure === "context") s.f.study.contextId="bb".repeat(24); if (failure === "intent") s.f.study.intent.wallet="0x1111111111111111111111111111111111111111";
    await s.controller.submit(); expect(s.methods).not.toContain("eth_sendTransaction"); expect(s.storage.getItem(TESTNET_LP_SUBMISSION_KEY)).toBeNull();
  }
});
it("persists uncertainty before prompt, reload makes no calls, and recovers only the original hash", async () => {
  const s=await setup();await s.reviewed();s.lose();await s.controller.submit();expect(s.controller.snapshot().stage).toBe("uncertain");
  const count=s.methods.length;const reloaded=s.make();expect(s.methods.length).toBe(count);await reloaded.submit();expect(s.methods.length).toBe(count);
  await reloaded.recoverHash(LP_HASH);expect(reloaded.snapshot().stage).toBe("confirmed");expect(s.methods.length).toBe(count);
});
it("clears definite rejection, consumes review and never sends again automatically",async()=>{
  const s=await setup();await s.reviewed();s.reject();await s.controller.submit();expect(s.storage.getItem(TESTNET_LP_SUBMISSION_KEY)).toBeNull();
  expect(s.controller.snapshot().message).toContain("rejected");await s.controller.submit();expect(s.methods.filter(m=>m==="eth_sendTransaction")).toHaveLength(1);
});
it("fails closed for corrupt storage, write failures and active/corrupt swap recovery",async()=>{
  for(const failure of ["write","corrupt","swap"]){const s=await setup();await s.reviewed();
    if(failure==="write")s.storage.setItem=()=>{throw Error("denied");};if(failure==="corrupt")s.storage.setItem(TESTNET_LP_SUBMISSION_KEY,"bad");if(failure==="swap")s.storage.setItem(TESTNET_SUBMISSION_KEY,"bad");
    await s.controller.submit();expect(s.methods).not.toContain("eth_sendTransaction");if(failure==="swap")expect(s.controller.snapshot().message).toContain("Open Swap");
  }
});
it("cannot acknowledge stale observations or an earlier success after failed refresh",async()=>{
  for(const fail of ["stale","rpc"]){const s=await setup();await s.reviewed();await s.controller.submit();await s.controller.observe();expect(s.controller.snapshot().stage).toBe("confirmed");
    if(fail==="stale")s.expire();else{s.failReceipt();await s.controller.observe();}await s.controller.acknowledge();expect(s.storage.getItem(TESTNET_LP_SUBMISSION_KEY)).not.toBeNull();}
});
it("pending, unverified and reorged results never clear recovery",async()=>{
  for(const status of ["pending","unverified","reorged"] as const){const s=await setup();await s.reviewed();await s.controller.submit();s.api.call=async()=>({observation:{...s.f.observation,status,verified:false,amount0:"0",amount1:"0",diagnostic:status==="unverified"?"transaction-mismatch":null,confirmations:"0",receiptBlockNumber:null,receiptBlockHash:null}});
    await s.controller.observe();expect(s.controller.snapshot().stage).toBe(status);await s.controller.acknowledge();expect(s.storage.getItem(TESTNET_LP_SUBMISSION_KEY)).not.toBeNull();}
});
it("blocks wallets with archived unresolved swap approvals before a new LP study",async()=>{
  const {reviewedFixture}=await import("./testnet-wallet.test-helper");const {TESTNET_MANUAL_REVIEW_KEY}=await import("./testnet-wallet-storage");
  const old=await reviewedFixture("approve");const s=await setup();const record={version:1,intent:old.f.request.intent,quote:old.q.quote,action:old.checked.action,attemptedAt:old.f.clock(),hash:LP_HASH};
  s.storage.setItem(TESTNET_MANUAL_REVIEW_KEY,JSON.stringify([record]));await s.controller.connect();expect(s.controller.snapshot().account).toBeNull();expect(s.controller.snapshot().message).toContain("archived unresolved");expect(s.methods).not.toContain("eth_sendTransaction");
});

it("sends explicit legacy or EIP-1559 LP envelopes and retains all recovery fields", async () => {
  for (const dynamic of [false, true]) {
    const s = await setup();
    if (dynamic) { const fees = { feeModel: "eip1559", maxFeePerGas: s.f.study.transaction!.gasPrice, maxPriorityFeePerGas: "1000000" }; Object.assign(s.f.study.transaction!, fees); Object.assign(s.f.study.gas!, fees); }
    await s.reviewed(); await s.controller.submit(); expect(s.controller.snapshot().stage).toBe("pending"); expect(s.sends).toHaveLength(1);
    const sent = s.sends[0][0] as Record<string, unknown>;
    const tx = s.f.study.transaction!;
    expect(sent).toEqual({ from: tx.from, to: tx.to, data: tx.data, chainId: "0x14a34", value: "0x0", nonce: "0x7", gas: "0x1d4c0",
      ...(dynamic ? { type: "0x2", maxFeePerGas: "0x1312d00", maxPriorityFeePerGas: "0xf4240" }
        : { type: "0x0", gasPrice: "0x1312d00" }) });
    expect(sent.type).toBe(dynamic ? "0x2" : "0x0");
    if (dynamic) { expect(sent.maxFeePerGas).toBe("0x1312d00"); expect(sent.maxPriorityFeePerGas).toBe("0xf4240"); expect(sent).not.toHaveProperty("gasPrice"); }
    else { expect(sent.gasPrice).toBe("0x1312d00"); expect(sent).not.toHaveProperty("maxFeePerGas"); }
    expect(s.make().snapshot().submission).toEqual(s.controller.snapshot().submission);
  }
});
it("blocks mutation of the original LP priority cap on recheck", async () => {
  const s = await setup(); const fees = { feeModel: "eip1559", maxFeePerGas: s.f.study.transaction!.gasPrice, maxPriorityFeePerGas: "1000000" };
  Object.assign(s.f.study.transaction!, fees); Object.assign(s.f.study.gas!, fees); await s.reviewed();
  expect(s.controller.snapshot().stage).toBe("review");
  Object.assign(s.f.study.transaction!, { maxPriorityFeePerGas: "2" }); Object.assign(s.f.study.gas!, { maxPriorityFeePerGas: "2" });
  await s.controller.submit(); expect(s.sends).toHaveLength(0); expect(s.storage.getItem(TESTNET_LP_SUBMISSION_KEY)).toBeNull();
});

it("connects and rechecks the pinned MetaMask indicator before sending the exact reviewed inner type2 LP call", async () => {
  const s=await setup();s.setCode("0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b");
  const fees={feeModel:"eip1559",maxFeePerGas:s.f.study.transaction!.gasPrice,maxPriorityFeePerGas:"1000000"};Object.assign(s.f.study.transaction!,fees);Object.assign(s.f.study.gas!,fees);
  await s.reviewed();expect(s.controller.snapshot().stage).toBe("review");await s.controller.submit();expect(s.controller.snapshot().stage).toBe("pending");
  expect(s.sends).toHaveLength(1);expect(s.sends[0][0]).toMatchObject({type:"0x2",from:s.f.intent.wallet,to:s.f.study.transaction!.to,data:s.f.study.transaction!.data});
});
it("rejects an unknown delegation indicator during final LP recheck without a prompt",async()=>{
  const s=await setup();await s.reviewed();const call=s.api.call;s.api.call=async(action,body)=>{const result=await call(action,body);if(action==="recheck")s.setCode("0xef01001111111111111111111111111111111111111111");return result;};
  await s.controller.submit();expect(s.sends).toHaveLength(0);expect(s.storage.getItem(TESTNET_LP_SUBMISSION_KEY)).toBeNull();
});
