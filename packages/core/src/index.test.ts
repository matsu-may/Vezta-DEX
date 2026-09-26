import { describe, expect, it } from "vitest";
import {
  POLYGON_CHAIN_ID,
  TOKENS,
  poolKey,
  parsePoolKey,
  tokenKey,
} from "./index";

describe("chain-aware identity", () => {
  it("keeps the same address on different chains distinct", () => {
    expect(tokenKey(137, TOKENS.USDC.address)).not.toBe(
      tokenKey(1, TOKENS.USDC.address),
    );
  });

  it("uses native Polygon USDC and not bridged USDC.e", () => {
    expect(POLYGON_CHAIN_ID).toBe(137);
    expect(TOKENS.USDC.address.toLowerCase()).toBe(
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    );
    expect(TOKENS.USDC.decimals).toBe(6);
    expect(TOKENS.WETH.decimals).toBe(18);
    expect(TOKENS.USDC.address.toLowerCase()).not.toBe(
      "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    );
  });

  it("keeps pool identity stable when display token order reverses", () => {
    const address = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";
    const key = poolKey(137, "v3", address);
    expect(parsePoolKey(key)).toEqual({ chainId: 137, protocol: "v3", reference: address.toLowerCase() });
    expect(key).toBe(poolKey(137, "v3", address.toLowerCase()));
  });

  it("rejects malformed and unsupported pool keys", () => {
    expect(() => parsePoolKey("137:v3:not-an-address")).toThrow();
    expect(() => parsePoolKey("1:v3:0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9")).toThrow();
    expect(() => parsePoolKey("137:v4:0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9")).toThrow();
  });
});
