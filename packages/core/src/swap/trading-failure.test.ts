import { describe, expect, it } from "vitest";
import { summarizeTradingFailure } from "./trading-failure";

describe("safe quote failure diagnostics", () => {
  it("keeps only a known diagnostic code and a numeric HTTP status", () => {
    expect(summarizeTradingFailure({ code: "TRADING_API_RATE_LIMITED", upstreamStatus: 429, error: "private-key", quote: { permitData: "secret" } })).toEqual({ code: "TRADING_API_RATE_LIMITED", upstreamStatus: 429 });
  });

  it("discards unknown codes, raw messages and invalid status fields", () => {
    for (const value of [null, [], "private-key", { code: "PRIVATE_API_KEY", upstreamStatus: 401, error: "secret" }]) expect(summarizeTradingFailure(value)).toEqual({});
    for (const status of ["429", -1, 600, 200.5, "secret"]) {
      expect(summarizeTradingFailure({ code: "TRADING_API_NETWORK_ERROR", upstreamStatus: status })).toEqual({ code: "TRADING_API_NETWORK_ERROR" });
    }
  });
});
