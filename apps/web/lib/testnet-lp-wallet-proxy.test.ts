import { expect,it,vi } from "vitest";
import { createTestnetLpWalletProxy } from "./testnet-lp-wallet-proxy";
import { lpWalletFixture, LP_HASH, LP_NOW } from "./testnet-lp-wallet.test-helper";
const req=(body:unknown,headers:Record<string,string>={},query="")=>new Request(`http://127.0.0.1:3020/api/testnet-lp/study${query}`,{method:"POST",headers:{host:"127.0.0.1:3020",origin:"http://127.0.0.1:3020","content-type":"application/json",...headers},body:JSON.stringify(body)});
it("bounds LP origin, action, body and configuration before reaching upstream",async()=>{
  const f=lpWalletFixture();const fetcher=vi.fn();const proxy=createTestnetLpWalletProxy({},fetcher,()=>LP_NOW);
  for(const headers of [{origin:"https://evil.test"},{host:"localhost:3020"},{forwarded:"for=evil"},{"x-forwarded-for":"192.0.2.1"},{"content-type":"text/plain"}] as Record<string,string>[])expect((await proxy(req({intent:f.intent},headers),"study")).status).toBe(403);
  expect((await proxy(req({intent:f.intent}, {}, "?rpc=evil"),"study")).status).toBe(400);
  expect((await proxy(req({intent:f.intent,data:"0x"}),"study")).status).toBe(400);
  expect((await proxy(req({contextId:f.study.contextId,transaction:f.study.transaction}),"recheck")).status).toBe(400);
  expect((await proxy(req({intent:{...f.intent,chainId:137}}),"study")).status).toBe(400);
  expect((await proxy(req({junk:"x".repeat(5000)}),"study")).status).toBe(413);
  expect((await proxy(req({}),"send")).status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
});
it("pins LP endpoints and keeps normal development read-only with independent response binding",async()=>{
  const f=lpWalletFixture();const fetcher=vi.fn(async()=>Response.json({study:f.study}));const proxy=createTestnetLpWalletProxy({},fetcher,()=>LP_NOW);
  const response=await proxy(req({intent:f.intent}),"study");expect(response.status).toBe(200);expect((await response.json()).study.executionEnabled).toBe(false);
  expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:3021/api/v1/testnet/base-sepolia/lp/study",expect.objectContaining({cache:"no-store",redirect:"error"}));
  const wrong=createTestnetLpWalletProxy({},async()=>Response.json({study:{...f.study,privateKey:"secret"}}),()=>LP_NOW);expect((await wrong(req({intent:f.intent}),"study")).status).toBe(503);
  const wrongContext=createTestnetLpWalletProxy({},async()=>Response.json({study:f.study}),()=>LP_NOW);expect((await wrongContext(req({contextId:"bb".repeat(24)}),"recheck")).status).toBe(503);
});
it("retains only explicit safe LP errors and rejects unbound receipt responses",async()=>{
  const f=lpWalletFixture();for(const code of ["TESTNET_LP_OWNER_CHANGED","TESTNET_LP_CONTEXT_UNAVAILABLE","TESTNET_LP_TIMEOUT"]){const proxy=createTestnetLpWalletProxy({},async()=>Response.json({code,error:"private RPC key"},{status:410}),()=>LP_NOW);
    expect(await(await proxy(req({intent:f.intent}),"study")).json()).toEqual({error:"Testnet action unavailable",code});}
  const privateProxy=createTestnetLpWalletProxy({},async()=>Response.json({code:"TESTNET_LP_PRIVATE_KEY",error:"secret"},{status:503}),()=>LP_NOW);expect(await(await privateProxy(req({intent:f.intent}),"study")).text()).not.toContain("PRIVATE_KEY");
  const wrong=createTestnetLpWalletProxy({},async()=>Response.json({observation:{...f.observation,hash:`0x${"22".repeat(32)}`}}),()=>LP_NOW);expect((await wrong(req({contextId:f.study.contextId,hash:LP_HASH}),"receipt")).status).toBe(503);
});
