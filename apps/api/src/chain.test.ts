import { afterEach, describe, expect, it, vi } from "vitest";
import { createPolygonPoolSource } from "./chain";

afterEach(() => vi.unstubAllGlobals());

describe("raw account-code RPC boundary", () => {
  it("preserves explicit empty eth_getCode at a pinned block instead of viem's undefined sentinel", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => {
      const request = JSON.parse(options.body as string);
      calls.push(request);
      return Response.json({ jsonrpc: "2.0", id: request.id, result: "0x" });
    });
    const source = createPolygonPoolSource("http://127.0.0.1:9999");
    const owner = "0x1111111111111111111111111111111111111111";
    expect(await source.getAccountCode(owner, 123n)).toBe("0x");
    expect(calls).toEqual([expect.objectContaining({ method: "eth_getCode", params: [owner, "0x7b"] })]);
  });
});
