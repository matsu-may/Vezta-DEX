import { afterEach, describe, expect, it, vi } from "vitest";
import { depthFixture } from "../../../packages/core/src/testnet-depth.test-helper";
import { TestnetDiscoveryReader, handleTestnetDiscovery } from "./testnet-discovery";

afterEach(() => vi.useRealTimers());
const req = (suffix = "", method = "GET") => new Request(`http://localhost/api/v1/testnet/base-sepolia/depth${suffix}`, { method });

describe("testnet discovery read API", () => {
  it("needs RPC configuration only, returns bounded failures, and rejects methods and query input", async () => {
    expect((await handleTestnetDiscovery(req())).status).toBe(503);
    const read = vi.fn(async () => depthFixture());
    const reader = new TestnetDiscoveryReader(read);
    expect((await handleTestnetDiscovery(req("?rpc=https://secret"), reader)).status).toBe(400);
    expect((await handleTestnetDiscovery(req("", "POST"), reader)).status).toBe(405);
    expect(read).not.toHaveBeenCalled();
    const response = await handleTestnetDiscovery(req(), reader);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ depth: { chainId: 84532, source: "base-sepolia-rpc" } });
    const bad = await handleTestnetDiscovery(req(), new TestnetDiscoveryReader(async () => { throw new Error("secret RPC key"); }));
    expect(bad.status).toBe(503);
    expect(await bad.text()).not.toContain("secret");
  });

  it("shares concurrent work, has no completed-result cache and rejects invalid reports", async () => {
    let resolve!: (value: unknown) => void;
    const run = vi.fn(() => new Promise<unknown>(done => { resolve = done; }));
    const reader = new TestnetDiscoveryReader(run);
    const a = reader.read(); const b = reader.read();
    expect(run).toHaveBeenCalledTimes(1);
    resolve(depthFixture());
    expect(await a).toEqual(await b);
    const c = reader.read();
    expect(run).toHaveBeenCalledTimes(2);
    resolve({ ...depthFixture(), chainId: 137 });
    await expect(c).rejects.toMatchObject({ code: "INVALID_DEPTH" });
  });

  it("aborts a hung study at 45 seconds and releases the single-flight gate", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const reader = new TestnetDiscoveryReader(signal => { signals.push(signal); return new Promise(() => {}); });
    const pending = expect(reader.read()).rejects.toMatchObject({ code: "DEPTH_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(45000);
    await pending;
    expect(signals[0].aborted).toBe(true);
    const next = expect(reader.read()).rejects.toMatchObject({ code: "DEPTH_TIMEOUT" });
    expect(signals).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(45000); await next;
  });
});
