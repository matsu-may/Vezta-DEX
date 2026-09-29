import { expect, it, vi } from "vitest";
import { createRehearsalClient } from "./rehearsal-client";
it("uses a fixed same-origin action, bounded no-store JSON and no automatic retry",async()=>{
  const fetcher=vi.fn(async()=>Response.json({ok:true}));const api=createRehearsalClient(fetcher);
  expect(await api.call("state",{chainId:137})).toEqual({ok:true});
  expect(fetcher).toHaveBeenCalledWith("/api/rehearsal/state",expect.objectContaining({method:"POST",cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json","Accept":"application/json"}}));
});
it("suppresses provider payloads and rejects oversized responses without retry",async()=>{
  const bad=vi.fn(async()=>new Response("secret-key",{status:503}));await expect(createRehearsalClient(bad).call("prepare",{})).rejects.toThrow("Rehearsal API unavailable");expect(bad).toHaveBeenCalledTimes(1);
  const huge=vi.fn(async()=>new Response("x".repeat(300000)));await expect(createRehearsalClient(huge).call("state",{})).rejects.toThrow();
});
