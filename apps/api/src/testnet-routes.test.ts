import { describe, expect, it, vi } from "vitest";
import { depthFixture } from "../../../packages/core/src/testnet-depth.test-helper";
import { handleTestnetRequest } from "./testnet-routes";
import { TestnetDiscoveryReader } from "./testnet-discovery";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";
import { toApiRequest } from "./api-request";

const path = "/api/v1/testnet/base-sepolia/quote";
const request = (body: unknown = testnetIntent(), suffix = "", contentType = "application/json") =>
  new Request(`http://127.0.0.1:3021${path}${suffix}`, { method: "POST",
    headers: { "content-type": contentType }, body: JSON.stringify(body) });
const reader = () => new TestnetSwapQuoteReader(() => testnetQuoteSource(), undefined, () => TESTNET_NOW);

describe("testnet read routing", () => {
  it("dispatches a quote and keeps discovery/unknown routes separate", async () => {
    const response = await handleTestnetRequest(request(), undefined, reader());
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toMatchObject({ quoteId: expect.stringMatching(/^[a-f0-9]{48}$/),
      quote: { chainId: 84532 }, qualification: { executionEnabled: false, runtimeVerified: false } });
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
