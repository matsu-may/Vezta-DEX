import { expect, it, vi } from "vitest";
import { handleTestnetRequest } from "./testnet-routes";
import { TestnetActionStore, TestnetRechecker } from "./testnet-action";
import { TestnetReceiptReader } from "./testnet-receipt";
import { testnetActionFixture } from "./testnet-action.test-helper";

const request = (endpoint: string, body: unknown, suffix = "", type = "application/json") =>
  new Request(`http://local/api/v1/testnet/base-sepolia/${endpoint}${suffix}`, {
    method: "POST", headers: { "content-type": type }, body: JSON.stringify(body),
  });

it("routes a one-time recheck and observes only its opaque original context", async () => {
  const f = await testnetActionFixture(); const store = new TestnetActionStore(f.clock);
  const rechecker = new TestnetRechecker(f.approvals, f.preparer, f.quotes.store, store);
  const receipts = new TestnetReceiptReader(() => ({ ...f.source, async getTransaction() { return null; }, async getReceipt() { return null; } }), store, f.clock);
  const handle = (req: Request) => handleTestnetRequest(req, undefined, f.quotes, undefined, f.approvals, f.preparer, rechecker, receipts);
  const body = { ...f.request, kind: "swap" };
  const response = await handle(request("recheck", body)); expect(response?.status).toBe(200);
  expect(response?.headers.get("cache-control")).toBe("no-store");
  const result = await response!.json(); expect(result.action).toMatchObject({ kind: "swap", executionEnabled: false });
  const again = await handle(request("recheck", body)); expect(again?.status).toBe(503);
  const query = { contextId: result.action.contextId, hash: `0x${"ab".repeat(32)}` };
  const receipt = await handle(request("receipt", query)); expect(receipt?.status).toBe(200);
  expect(await receipt!.json()).toMatchObject({ observation: { status: "unknown-original", execution: null, executionEnabled: false } });
  const lost = await handle(request("receipt", { ...query, contextId: "cd".repeat(24) }));
  expect(lost?.status).toBe(410); expect(await lost!.json()).toMatchObject({ code: "TESTNET_CONTEXT_UNAVAILABLE" });
});

it("validates all new boundaries before RPC and sanitizes provider failure", async () => {
  const f = await testnetActionFixture(); const store = new TestnetActionStore(f.clock);
  const rechecker = new TestnetRechecker(f.approvals, f.preparer, f.quotes.store, store);
  const create = vi.fn(() => { throw new Error("private-provider-key"); });
  const receipts = new TestnetReceiptReader(create, store, f.clock);
  const handle = (req: Request) => handleTestnetRequest(req, undefined, f.quotes, undefined, f.approvals, f.preparer, rechecker, receipts);
  const body = { ...f.request, kind: "swap" }; const read = vi.spyOn(rechecker, "read");
  for (const endpoint of ["receipt", "recheck"]) {
    for (const [req, status] of [[new Request(`http://local/api/v1/testnet/base-sepolia/${endpoint}`), 405],
      [request(endpoint, body, "?private=key"), 400], [request(endpoint, body, "", "text/plain"), 415],
      [request(endpoint, { padding: "x".repeat(5000) }), 413], [request(endpoint, { ...body, sender: "fake" }), 400]] as const) {
      expect((await handle(req))?.status).toBe(status);
    }
  }
  expect(read).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  expect((await handleTestnetRequest(request("recheck", body)))?.status).toBe(503);
  const action = store.issue(f.input, () => {});
  const query = { contextId: action.contextId, hash: `0x${"ab".repeat(32)}` };
  expect((await handleTestnetRequest(request("receipt", query)))?.status).toBe(503);
  const failure = await handle(request("receipt", query)); expect(failure?.status).toBe(503);
  expect(await failure!.json()).toEqual({ error: "Testnet receipt unavailable", code: "TESTNET_RPC_UNAVAILABLE" });
});
