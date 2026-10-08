import { describe, expect, it, vi } from "vitest";
import { ReadinessReader } from "./readiness";

const now = 1_790_000_000_000;
const freshBlock = { number: 123n, timestamp: BigInt(now / 1000 - 2) };

describe("Polygon read readiness", () => {
  it("accepts a recent positive Polygon block", async () => {
    const reader = new ReadinessReader({ getBlock: async () => freshBlock }, () => now);
    expect(await reader.check()).toEqual({ status: "ready", polygon: "ok" });
  });

  it.each([
    { number: 0n, timestamp: freshBlock.timestamp },
    { number: 123n, timestamp: BigInt(now / 1000 - 121) },
    { number: 123n, timestamp: BigInt(now / 1000 + 6) },
  ])("refuses an invalid or stale block", async block => {
    const reader = new ReadinessReader({ getBlock: async () => block }, () => now);
    expect(await reader.check()).toEqual({ status: "unavailable", polygon: "unavailable" });
  });

  it("hides provider details and deduplicates concurrent probes", async () => {
    const getBlock = vi.fn(async () => { throw new Error("secret RPC URL and provider response"); });
    const reader = new ReadinessReader({ getBlock }, () => now);
    const results = await Promise.all([reader.check(), reader.check()]);
    expect(results).toEqual(Array(2).fill({ status: "unavailable", polygon: "unavailable" }));
    expect(JSON.stringify(results)).not.toContain("secret RPC URL");
    expect(getBlock).toHaveBeenCalledTimes(1);
  });

  it("caches a probe briefly and retries after the cache expires", async () => {
    let clock = now;
    const getBlock = vi.fn(async () => freshBlock);
    const reader = new ReadinessReader({ getBlock }, () => clock);
    await reader.check();
    clock += 4_999;
    await reader.check();
    expect(getBlock).toHaveBeenCalledTimes(1);
    clock += 1;
    await reader.check();
    expect(getBlock).toHaveBeenCalledTimes(2);
  });
});
