import { describe, expect, it } from "vitest";
import { formatRequestLog } from "./request-log";

describe("sanitized API request log", () => {
  it("labels the testnet read endpoints without query data", () => {
    for (const [suffix, label] of [["quote", "testnet_quote"], ["depth", "testnet_depth"]]) {
      expect(JSON.parse(formatRequestLog({ requestId: "id", method: "POST",
        url: `/api/v1/testnet/base-sepolia/${suffix}?rpc=secret`, status: 200, durationMs: 1 })).route).toBe(label);
    }
  });
  it("records bounded route, method, status and duration with a request ID", () => {
    expect(JSON.parse(formatRequestLog({ requestId: "local-id", method: "POST", url: "/api/v1/trading-quote", status: 503, durationMs: 123.6 })))
      .toEqual({ event: "dex_api_request", requestId: "local-id", route: "trading_quote", method: "POST", status: 503, durationMs: 124 });
  });

  it("never copies path segments, query parameters or unsupported method text", () => {
    const secret = "rpc-key-and-wallet-secret";
    const line = formatRequestLog({ requestId: "local-id", method: `BAD-${secret}`,
      url: `/api/v1/pools/${secret}?api_key=${secret}`, status: 400, durationMs: 1 });
    expect(JSON.parse(line)).toMatchObject({ route: "pool_detail", method: "OTHER" });
    expect(line).not.toContain(secret);
  });

  it("uses a generic route for unknown or malformed input", () => {
    expect(JSON.parse(formatRequestLog({ requestId: "id", method: "GET", url: "/unknown/secret", status: 404, durationMs: -5 })).route).toBe("other");
    expect(JSON.parse(formatRequestLog({ requestId: "id", method: "GET", url: "???", status: 500, durationMs: NaN })))
      .toMatchObject({ route: "other", durationMs: 0 });
  });
});
