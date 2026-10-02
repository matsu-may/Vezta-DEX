import { expect,it,vi } from "vitest";
import { handleTestnetLpWalletRequest as handle } from "./testnet-lp-wallet-routes";
import { testnetLpWalletFixture } from "./testnet-lp-wallet.test-helper";
const req=(path:string,body:unknown,type="application/json")=>new Request(`http://local/api/v1/testnet/base-sepolia/lp/${path}`,{method:"POST",headers:{"content-type":type},body:JSON.stringify(body)});
it("returns direct LP studies under the same explicit execution gate",async()=>{
  const f=await testnetLpWalletFixture();
  const r=await handle(req("study",{intent:f.intent}),f.api);expect(r?.status).toBe(200);expect(r?.headers.get("cache-control")).toBe("no-store");
  expect(await r!.json()).toMatchObject({study:{status:"prepared",executionEnabled:false}});
  const enabled=await handle(req("recheck",{contextId:f.study.contextId}),f.api,undefined,true);expect(await enabled!.json()).toMatchObject({study:{executionEnabled:true}});
});
it("bounds requests before reads and preserves specific startup storage failure",async()=>{
  const f=await testnetLpWalletFixture();const read=vi.spyOn(f.api,"study");
  expect((await handle(req("study",{intent:f.intent},"text/plain"),f.api))?.status).toBe(415);
  expect((await handle(req("study",{intent:{...f.intent,data:"0x"}}),f.api))?.status).toBe(400);
  expect((await handle(req("study",{padding:"x".repeat(5000)}),f.api))?.status).toBe(413);expect(read).not.toHaveBeenCalled();
  const unavailable=await handle(req("study",{intent:f.intent}),undefined,undefined,false,"TESTNET_LP_STORAGE_UNAVAILABLE");
  expect(await unavailable!.json()).toMatchObject({code:"TESTNET_LP_STORAGE_UNAVAILABLE"});
  const lost=await handle(req("recheck",{contextId:"aa".repeat(24)}),f.api);expect(lost?.status).toBe(410);
});
