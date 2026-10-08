import { expect, it } from "vitest";
import { testnetHttpExecutionEnabled } from "./testnet-execution-gate";
import { testnetActionFixture } from "../../modules/transaction/testnet-action.test-helper";
import { handleTestnetRequest } from "../../http/testnet-routes";
import { TestnetRechecker, TestnetActionStore } from "../../modules/transaction/testnet-action";
const enabled = { NODE_ENV: "development", DEX_TESTNET_DEMO_ENABLED: "1", DEX_TESTNET_BOUND_HOST: "127.0.0.1" };
it("requires an explicit fixed loopback development API binding", () => {
  expect(testnetHttpExecutionEnabled(enabled, "127.0.0.1", 3021)).toBe(true);
  for (const env of [{}, { ...enabled, NODE_ENV: "production" }, { ...enabled, DEX_TESTNET_BOUND_HOST: "localhost" }]) expect(testnetHttpExecutionEnabled(env, "127.0.0.1", 3021)).toBe(false);
  expect(testnetHttpExecutionEnabled(enabled, "0.0.0.0", 3021)).toBe(false);
  expect(testnetHttpExecutionEnabled(enabled, "127.0.0.1", 3001)).toBe(false);
});
it("changes only explicitly enabled HTTP quote/recheck metadata and retains original consumers", async () => {
  const f = await testnetActionFixture();
  const rechecker = new TestnetRechecker(f.approvals, f.preparer, f.quotes.store, new TestnetActionStore(f.clock));
  const request = (path: string, body: unknown) => new Request(`http://127.0.0.1:3021/api/v1/testnet/base-sepolia/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const q = await handleTestnetRequest(request("quote", f.request.intent), undefined, f.quotes, undefined, f.approvals, f.preparer, rechecker, undefined, true);
  expect((await q!.json()).qualification.executionEnabled).toBe(true);
  const result = await handleTestnetRequest(request("recheck", { ...f.request, kind: "swap" }), undefined, f.quotes, undefined, f.approvals, f.preparer, rechecker, undefined, true);
  expect(await result!.json()).toMatchObject({ study: { executionEnabled: true }, action: { executionEnabled: true } });
  expect(f.quoted.qualification.executionEnabled).toBe(false); // CLI/source qualification is unchanged.
});
