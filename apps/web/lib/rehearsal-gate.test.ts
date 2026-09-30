import { describe, expect, it, vi } from "vitest";
import { testPlan } from "./rehearsal-fixtures.test-helper";
import { rehearsalEnabled, createRehearsalProxy } from "./rehearsal-gate";
const enabled={NODE_ENV:"development",DEX_REHEARSAL_ENABLED:"1",DEX_REHEARSAL_BOUND_HOST:"127.0.0.1"};
const intent={chainId:137,swapper:"0x1111111111111111111111111111111111111111",tokenIn:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",tokenOut:"0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",amountIn:"1000000",slippageBps:50};
function req(body:unknown=intent,headers:Record<string,string>={}){return new Request("http://127.0.0.1:3020/api/rehearsal/state",{method:"POST",headers:{Origin:"http://127.0.0.1:3020","Content-Type":"application/json",...headers},body:JSON.stringify(body)});}
describe("development rehearsal boundary",()=>{
 it("is disabled without the launcher and always disabled in production",()=>{
  expect(rehearsalEnabled(enabled)).toBe(true);for(const env of [{},{...enabled,NODE_ENV:"production"},{...enabled,DEX_REHEARSAL_BOUND_HOST:"0.0.0.0"},{...enabled,DEX_REHEARSAL_ENABLED:"0"}])expect(rehearsalEnabled(env)).toBe(false);
 });
 it("returns404 before any API request when disabled",async()=>{
  const fetcher=vi.fn();const r=await createRehearsalProxy({},fetcher)(req(),"state");expect(r.status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
 });
 it.each<[Record<string,string>,string]>([
  [{Origin:"https://evil.example"},"LOCAL_ORIGIN"],
  [{Origin:"null"},"LOCAL_ORIGIN"],
  [{Host:"evil.example:3020"},"LOCAL_HOST"],
  [{"X-Forwarded-Host":"evil.example"},"LOCAL_FORWARDED_HOST"],
  [{"X-Forwarded-Proto":"https"},"LOCAL_FORWARDED_PROTO"],
  [{"X-Forwarded-For":"192.0.2.1"},"LOCAL_FORWARDED_FOR"],
  [{Forwarded:"for=192.0.2.1"},"LOCAL_FORWARDED"],
  [{"Content-Type":"text/plain"},"LOCAL_CONTENT_TYPE"],
 ])("rejects unsafe local request %o with a non-sensitive reason code",async(headers,code)=>{
  const fetcher=vi.fn();const r=await createRehearsalProxy(enabled,fetcher)(req(intent,headers),"state");expect(r.status).toBe(403);expect(await r.json()).toEqual({error:"Local same-origin JSON required",code});expect(fetcher).not.toHaveBeenCalled();
 });
 it("forwards only validated exact actions to the fixed API with no-store, no redirects",async()=>{
  const fetcher=vi.fn(async()=>Response.json({state:{chainId:137,account:intent.swapper,accountKind:"eoa",accountNonce:"7",blockNumber:"123",observedAt:new Date().toISOString(),balances:{USDC:"1000000",WETH:"0",POL:"1000000000000000000"},tokenAllowance:"1000000",permitAllowance:{amount:"0",expiration:"0",nonce:"7"},approvalGas:null}}));const r=await createRehearsalProxy(enabled,fetcher)(req(),"state");expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("no-store");
  expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:3021/api/v1/wallet-state",expect.objectContaining({redirect:"error",cache:"no-store",body:JSON.stringify(intent)}));
 });
 it("accepts consistent loopback forwarding headers inserted by Next",async()=>{
  const fetcher=vi.fn(async()=>new Response("failure",{status:503}));const r=await createRehearsalProxy(enabled,fetcher)(req(intent,{"X-Forwarded-Host":"127.0.0.1:3020","X-Forwarded-Proto":"http","X-Forwarded-For":"127.0.0.1"}),"state");expect(r.status).toBe(503);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("accepts a rewritten route URL when the browser Host and Origin remain canonical",async()=>{
  const headers={Host:"127.0.0.1:3020",Origin:"http://127.0.0.1:3020","Content-Type":"application/json"};
  const request=new Request("http://localhost:3020/api/rehearsal/state",{method:"POST",headers,body:JSON.stringify(intent)});
  const fetcher=vi.fn(async()=>new Response("upstream unavailable",{status:503}));
  const response=await createRehearsalProxy(enabled,fetcher)(request,"state");
  expect(response.status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const forged=new Request("http://localhost:3020/api/rehearsal/state",{method:"POST",headers:{...headers,Origin:"https://example.com"},body:JSON.stringify(intent)});
  expect((await createRehearsalProxy(enabled,fetcher)(forged,"state")).status).toBe(403);
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("rejects unknown/extra fields and oversized requests",async()=>{
  const fetcher=vi.fn();const handler=createRehearsalProxy(enabled,fetcher);
  expect((await handler(req(),"eth_sendRawTransaction")).status).toBe(404);
  expect((await handler(req({...intent,signature:"extra"}),"state")).status).toBe(400);
  expect((await handler(req({...intent,amountIn:"1000001"}),"state")).status).toBe(400);
  expect((await handler(req({padding:"x".repeat(5000)}),"state")).status).toBe(413);expect(fetcher).not.toHaveBeenCalled();
 });
 it("sanitizes upstream error bodies and validates fixed API origin",async()=>{
  const fetcher=vi.fn(async()=>new Response("secret-key",{status:503}));const r=await createRehearsalProxy(enabled,fetcher)(req(),"state");expect(await r.text()).not.toContain("secret");
  expect((await createRehearsalProxy({...enabled,DEX_API_URL:"https://evil.example"},fetcher)(req(),"state")).status).toBe(503);
 });
});

it("forwards a canonical permit plan while stripping no signed values and rejects secret-bearing success bodies",async()=>{
  const now=Date.now();const plan=testPlan(now);const handler=createRehearsalProxy(enabled,vi.fn(async()=>Response.json({permitPlan:plan})));
  const r=await handler(req({...intent,quoteId:"ab".repeat(24)}),"permit");expect(r.status).toBe(200);expect((await r.json()).permitPlan.permit.data).toEqual(plan.permit.data);
  const leaked=createRehearsalProxy(enabled,vi.fn(async()=>Response.json({permitPlan:plan,apiKey:"secret"})));
  const fail=await leaked(req({...intent,quoteId:"ab".repeat(24)}),"permit");expect(fail.status).toBe(503);expect(await fail.text()).not.toContain("secret");
});


it("rejects the localhost alias so recovery and wallet locks have one canonical origin", async () => {
  const fetcher = vi.fn(async () => Response.json({ permitPlan: testPlan() }));
  const request = new Request("http://localhost:3020/api/rehearsal/permit", { method: "POST", headers: { Origin: "http://localhost:3020", "Content-Type": "application/json" }, body: JSON.stringify({ ...intent, quoteId: "ab".repeat(24) }) });
  expect((await createRehearsalProxy(enabled, fetcher)(request, "permit")).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
