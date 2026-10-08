import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingApiClient } from "./trading-client";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

describe("Trading API client", () => {
  it("shares the key budget across quote and execution paths", async () => {
    const starts: number[] = [];
    const fetcher = vi.fn(async () => { starts.push(Date.now()); return Response.json({}); }) as unknown as typeof fetch;
    const client = new TradingApiClient("test-key", fetcher);
    const calls = [client.post("/quote", {}, "preview"), client.post("/swap", {}, "execution")];
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all(calls);
    expect(starts).toEqual([0, 200]);
    expect(vi.mocked(fetcher).mock.calls[0][1]?.headers).toMatchObject({ "x-api-key": "test-key" });
  });

  it("pauses queued work after 429 without automatically replaying", async () => {
    const starts: number[] = [];
    const fetcher = vi.fn(async () => {
      starts.push(Date.now());
      return starts.length === 1 ? new Response("", { status: 429, headers: { "Retry-After": "2" } }) : Response.json({});
    }) as unknown as typeof fetch;
    const client = new TradingApiClient("test-key", fetcher);
    const first = client.post("/quote", {}, "preview");
    const second = client.post("/quote", {}, "preview");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(starts).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect((await first).status).toBe(429);
    expect((await second).status).toBe(200);
    expect(starts).toEqual([0, 2_000]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
