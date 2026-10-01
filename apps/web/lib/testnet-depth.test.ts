import { describe, expect, it, vi } from "vitest";
import { depthFixture } from "../../../packages/core/src/testnet-depth.test-helper";
import { createTestnetDepthProxy, loadTestnetDepth } from "./testnet-depth";

const request = (suffix = "", method = "GET") => new Request(`http://127.0.0.1:3020/api/testnet-depth${suffix}`, { method });
describe("testnet web read boundary", () => {
  it("proxies one fixed private endpoint without keys or user parameters", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ depth: depthFixture() }));
    const proxy = createTestnetDepthProxy({}, fetcher);
    const result = await proxy(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:3021/api/v1/testnet/base-sepolia/depth",
      expect.objectContaining({ cache: "no-store", redirect: "error", method: "GET" }));
    expect((await proxy(request("?chainId=137"))).status).toBe(400);
    expect((await proxy(request("", "POST"))).status).toBe(405);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects remote/credentialed/configured-path targets before fetching", async () => {
    const fetcher = vi.fn();
    for (const url of ["https://evil.example", "http://127.0.0.1:3021@evil.example", "http://user:secret@localhost:3021",
      "http://127.0.0.1:3021/api/v1", "http://localhost:3022", "http://localhost:3021?rpc=private"]) {
      expect((await createTestnetDepthProxy({ DEX_API_URL: url }, fetcher)(request())).status).toBe(503);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects forged/oversized responses and keeps upstream errors bounded", async () => {
    for (const response of [Response.json({ depth: { ...depthFixture(), chainId: 137 } }),
      Response.json({ depth: depthFixture(), raw: "secret" }), new Response("a".repeat(65537)),
      Response.json({ error: "private endpoint token", code: "DEPTH_TIMEOUT" }, { status: 503 }),
    ]) {
      const output = await createTestnetDepthProxy({}, vi.fn(async () => response))(request());
      expect(output.status).toBe(503);
      expect(await output.text()).not.toMatch(/private|secret/);
    }
  });

  it("uses only the same-origin read route in the browser and rejects stale data", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ depth: depthFixture() }));
    expect((await loadTestnetDepth(fetcher)).chainId).toBe(84532);
    expect(fetcher.mock.calls[0][0]).toBe("/api/testnet-depth");
    await expect(loadTestnetDepth(vi.fn(async () => Response.json({ depth: depthFixture(Date.now() - 601000) })))).rejects.toThrow();
  });
});
