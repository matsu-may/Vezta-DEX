import { afterEach, expect, it, vi } from "vitest";
import { baseSepolia, unichainSepolia } from "viem/chains";
afterEach(()=>vi.unstubAllGlobals());
async function factory() {
  const m = await import("./testnet-read-client").catch(()=>undefined);
  expect(m?.createTestnetReadClient).toBeTypeOf("function"); return m!.createTestnetReadClient;
}
it("uses caller chain metadata and reads the actual network ID without broadcasting",async()=>{
  const make = await factory(); const methods:string[]=[];
  vi.stubGlobal("fetch",async(_input:unknown,init:RequestInit)=>{
    const body=JSON.parse(String(init.body));methods.push(body.method);
    return Response.json({jsonrpc:"2.0",id:body.id,result:"0x515"});
  });
  const client=make("https://chain-neutral-read.example.invalid",unichainSepolia);
  expect(client.chain.id).toBe(1301);expect(await client.getChainId()).toBe(1301);expect(methods).toEqual(["eth_chainId"]);
});
it("rejects wallet, signing and broadcasting methods before issuing HTTP",async()=>{
  const make=await factory();let calls=0;vi.stubGlobal("fetch",async()=>{calls++;return Response.json({});});
  const client=make("https://read-only-methods.example.invalid",baseSepolia);
  for(const method of ["eth_sendRawTransaction","eth_sendTransaction","eth_sign","wallet_switchEthereumChain","anvil_setBalance","debug_traceTransaction"])
    await expect(client.request({method,params:[]} as never)).rejects.toThrow(/read-only/i);
  expect(calls).toBe(0);
});
it("bounds RPC responses before JSON decoding",async()=>{
  const make=await factory();vi.stubGlobal("fetch",async()=>new Response("{}",{headers:{"content-length":"1048577"}}));
  await expect(make("https://read-too-large.example.invalid",baseSepolia).getChainId()).rejects.toThrow(/byte limit/);
  vi.stubGlobal("fetch",async()=>new Response("x".repeat(1048577)));
  await expect(make("https://read-too-large-chunked.example.invalid",baseSepolia).getChainId()).rejects.toThrow(/byte limit/);
});
it("rejects unsafe endpoints and invalid budgets, and honors already aborted calls",async()=>{
  const make=await factory();let calls=0;vi.stubGlobal("fetch",async()=>{calls++;return Response.json({});});
  for(const url of ["http://example.com","file:///tmp/a","invalid"]) expect(()=>make(url,baseSepolia)).toThrow();
  for(const rps of [0,7,1.2,NaN]) expect(()=>make("https://invalid-rate.example.invalid",baseSepolia,undefined,rps)).toThrow();
  const c=new AbortController();c.abort();
  await expect(make("http://127.0.0.1:9999",baseSepolia,c.signal).getChainId()).rejects.toThrow();expect(calls).toBe(0);
});

it("also guards viem's exposed transport request before HTTP",async()=>{
  const make=await factory();let calls=0;vi.stubGlobal("fetch",async()=>{calls++;return Response.json({});});
  const client=make("https://transport-guard.example.invalid",baseSepolia);
  const request=client.transport.request as typeof client.request;
  await expect(request({method:"eth_sendRawTransaction",params:["0xdeadbeef"]} as never)).rejects.toThrow(/read-only/i);
  expect(calls).toBe(0);
});
it("snapshots allowed method and params before origin pacing queues dispatch",async()=>{
  const make=await factory();const seen:{method:string;params:unknown}[]=[];
  vi.stubGlobal("fetch",async(_input:unknown,init:RequestInit)=>{
    const body=JSON.parse(String(init.body));seen.push(body);return Response.json({jsonrpc:"2.0",id:body.id,result:"0x14a34"});
  });
  const client=make("https://queued-read-guard.example.invalid",baseSepolia);
  await client.getChainId();
  const args={method:"eth_getCode",params:["0x"+"11".repeat(20),"latest"]};
  const pending=client.request(args as never);
  args.method="eth_sendRawTransaction";args.params[0]="0xdeadbeef";
  await pending;
  expect(seen.map(c=>c.method)).toEqual(["eth_chainId","eth_getCode"]);
  expect(seen[1].params).toEqual(["0x"+"11".repeat(20),"latest"]);
});
