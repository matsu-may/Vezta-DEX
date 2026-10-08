import { afterEach, expect, it, vi } from "vitest";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import type { ForkClientBoundary } from "./testnet-fork";
const origin = "http://127.0.0.1:45678";
const transaction = { from: "0x1111111111111111111111111111111111111111" as const, to: C.v3PositionManager, data: "0x12345678" as const, value: "0" as const };
const boundary = (): ForkClientBoundary => ({ transport: { type: "http", url: origin }, getChainId: async () => 84532,
  getClientVersion: async () => "anvil/v1", request: async () => { throw Error("No writes allowed"); } });
afterEach(() => vi.unstubAllGlobals());
async function warm() {
  const m = await import("./testnet-fork-warm").catch(() => undefined);
  expect(m?.warmOwnedForkCall).toBeTypeOf("function"); return m!.warmOwnedForkCall;
}
it("warms only an owned loopback eth_call before qualification, never broadcasts", async () => {
  const fn = await warm(); const calls: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); calls.push(body);
    return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x" });
  });
  await fn(boundary(), origin, transaction, 12n, new AbortController().signal);
  expect(calls).toHaveLength(1); expect(calls[0].method).toBe("eth_call");
  expect(calls[0].params).toEqual([{ from: transaction.from, to: transaction.to, data: transaction.data, gas: "0x16e360", value: "0x0" }, "0xc"]);
});
it("rejects non-owned origins, wrong chain/client, invalid calls and aborted work before HTTP", async () => {
  const fn = await warm(); let calls = 0;
  vi.stubGlobal("fetch", async () => { calls++; return Response.json({}); });
  for (const bad of ["https://sepolia.base.org", "http://localhost:45678", "http://127.0.0.1:45678/other"])
    await expect(fn(boundary(), bad, transaction, 12n, new AbortController().signal)).rejects.toThrow();
  for (const b of [{ ...boundary(), transport: { type: "http", url: "http://127.0.0.1:1" } },
    { ...boundary(), getChainId: async () => 137 }, { ...boundary(), getClientVersion: async () => "geth" }])
    await expect(fn(b, origin, transaction, 12n, new AbortController().signal)).rejects.toThrow();
  await expect(fn(boundary(), origin, { ...transaction, to: C.USDC.address }, 12n, new AbortController().signal)).rejects.toThrow();
  await expect(fn(boundary(), origin, transaction, 0n, new AbortController().signal)).rejects.toThrow();
  const c = new AbortController(); c.abort();
  await expect(fn(boundary(), origin, transaction, 12n, c.signal)).rejects.toThrow();
  expect(calls).toBe(0);
});
it("bounds a warmup response before JSON decoding", async () => {
  const fn = await warm(); vi.stubGlobal("fetch", async () => new Response("x".repeat(8193)));
  await expect(fn(boundary(), origin, transaction, 12n, new AbortController().signal)).rejects.toThrow(/response/i);
});
