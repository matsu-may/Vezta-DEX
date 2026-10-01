import { describe, expect, it, vi } from "vitest";
import { depthFixture } from "../../../packages/core/src/testnet-depth.test-helper";
import { handleTestnetRequest } from "./testnet-routes";
import { TestnetDiscoveryReader } from "./testnet-discovery";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";
import { toApiRequest } from "./api-request";
import { TestnetWalletStateReader } from "./testnet-wallet-state";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";

const path = "/api/v1/testnet/base-sepolia/quote";
const request = (body: unknown = testnetIntent(), suffix = "", contentType = "application/json") =>
  new Request(`http://127.0.0.1:3021${path}${suffix}`, { method: "POST",
    headers: { "content-type": contentType }, body: JSON.stringify(body) });
const reader = () => new TestnetSwapQuoteReader(() => testnetQuoteSource(), undefined, () => TESTNET_NOW);

describe("testnet read routing", () => {
  it("validates approval request bodies and exposes only a bound blocked study for an unfunded wallet", async () => {
    const { TestnetApprovalReader } = await import("./testnet-approval");
    const quoteReader = reader(); const quote = await quoteReader.read(testnetIntent());
    const source = { ...testnetQuoteSource(), async getTokenBalance() { return 0n; },
      async getNativeBalance() { return 0n; }, async getTokenAllowance() { return 0n; },
      async getAccountNonce() { return 7n; }, async getPendingNonce() { return 7n; },
      async simulateApproval() { throw new Error("must not simulate"); },
      async estimateApprovalGas() { throw new Error("must not estimate"); }, async getGasPrice() { return 1n; },
      async getAdditionalFees() { throw new Error("must not read fees"); } };
    const create = vi.fn(() => source);
    const approvals = new TestnetApprovalReader(create, quoteReader.store, () => TESTNET_NOW);
    const req = (value: unknown, suffix = "") => new Request(`http://local/api/v1/testnet/base-sepolia/approval${suffix}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
    });
    const body = { intent: testnetIntent(), quoteId: quote.quoteId };
    for (const [value, suffix, status] of [[{ ...body, secret: "private" }, "", 400],
      [body, "?key=private", 400], [{ padding: "x".repeat(5000) }, "", 413]] as const) {
      expect((await handleTestnetRequest(req(value, suffix), undefined, quoteReader, undefined, approvals))?.status).toBe(status);
    }
    expect(create).not.toHaveBeenCalled();
    const response = await handleTestnetRequest(req(body), undefined, quoteReader, undefined, approvals);
    expect(response?.status).toBe(200); expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toMatchObject({ approval: { status: "blocked", transaction: null,
      reason: "TESTNET_INPUT_BALANCE_LOW", runtimeVerified: true, executionEnabled: false } });
    source.getTokenBalance = async () => { throw new Error("private-rpc-key"); };
    const failure = await handleTestnetRequest(req(body), undefined, quoteReader, undefined, approvals);
    expect(await failure?.json()).toEqual({ error: "Testnet approval unavailable", code: "TESTNET_RPC_UNAVAILABLE" });
  });
  it("routes valid unfunded wallet state separately and sanitizes failure", async () => {
    const source = { ...testnetQuoteSource(), async getTokenBalance() { return 0n; },
      async getNativeBalance() { return 0n; }, async getTokenAllowance() { return 0n; },
      async getAccountNonce() { return 7n; }, async getPendingNonce() { return 7n; } };
    const r = new TestnetWalletStateReader(() => source, () => TESTNET_NOW);
    const req = () => new Request("http://local/api/v1/testnet/base-sepolia/state", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(testnetIntent()),
    });
    expect((await handleTestnetRequest(req()))?.status).toBe(503);
    const response = await handleTestnetRequest(req(), undefined, undefined, r);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ state: { tokenAllowance: "0", approvalKind: "approve",
      balances: { USDC: "0", WETH: "0", ETH: "0" } } });
    source.getTokenBalance = async () => { throw new Error(`private-${C.USDC.address}`); };
    const bad = await handleTestnetRequest(req(), undefined, undefined, r);
    expect(await bad?.json()).toEqual({ error: "Testnet state unavailable", code: "TESTNET_RPC_UNAVAILABLE" });
  });
  it("dispatches a quote and keeps discovery/unknown routes separate", async () => {
    const response = await handleTestnetRequest(request(), undefined, reader());
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toMatchObject({ quoteId: expect.stringMatching(/^[a-f0-9]{48}$/),
      quote: { chainId: 84532 }, qualification: { executionEnabled: false, runtimeVerified: true } });
    const discovery = new TestnetDiscoveryReader(async () => depthFixture());
    expect((await handleTestnetRequest(new Request("http://local/api/v1/testnet/base-sepolia/depth"), discovery))?.status).toBe(200);
    expect(await handleTestnetRequest(new Request("http://local/api/v1/testnet/base-sepolia/unknown"))).toBeUndefined();
  });

  it("rejects invalid method/query/content/body before requesting RPC", async () => {
    const source = vi.fn(() => testnetQuoteSource());
    const r = new TestnetSwapQuoteReader(source, undefined, () => TESTNET_NOW);
    const cases: Array<[Request, number]> = [
      [new Request(`http://local${path}`), 405], [request(testnetIntent(), "?key=secret"), 400],
      [request(testnetIntent(), "", "text/plain"), 415], [request({ ...testnetIntent(), rpc: "private" }), 400],
      [new Request(`http://local${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), 400],
      [request({ padding: "a".repeat(5000) }), 413],
    ];
    for (const [req, status] of cases) expect((await handleTestnetRequest(req, undefined, r))?.status).toBe(status);
    expect(source).not.toHaveBeenCalled();
  });

  it("reports missing configuration and sanitizes provider errors", async () => {
    expect((await handleTestnetRequest(request()))?.status).toBe(503);
    const bad = new TestnetSwapQuoteReader(() => { throw new Error("rpc-url-private-key"); });
    const response = await handleTestnetRequest(request(), undefined, bad);
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: "Testnet quote unavailable", code: "TESTNET_RPC_UNAVAILABLE" });
  });

  it("forwards Content-Type at the native HTTP boundary without copying unrelated headers", async () => {
    const req = toApiRequest(new URL(`http://local${path}`), "POST", JSON.stringify(testnetIntent()),
      { "content-type": "application/json; charset=utf-8", authorization: "private" });
    expect(req.headers.get("authorization")).toBeNull();
    expect((await handleTestnetRequest(req, undefined, reader()))?.status).toBe(200);
  });
});
