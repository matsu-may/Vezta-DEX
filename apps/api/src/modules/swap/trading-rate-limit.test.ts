import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingApiQueueFullError, TradingApiRateLimiter } from "./trading-rate-limit";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

describe("Trading API rate limiter", () => {
  it("spaces concurrent dispatches by at least 200 milliseconds without a burst", async () => {
    const limiter = new TradingApiRateLimiter();
    const starts: number[] = [];
    const jobs = Array.from({ length: 3 }, () => limiter.schedule(async () => starts.push(Date.now())));
    await vi.advanceTimersByTimeAsync(400);
    await Promise.all(jobs);
    expect(starts).toEqual([0, 200, 400]);
  });

  it("dispatches execution work before older queued previews", async () => {
    const limiter = new TradingApiRateLimiter();
    const order: string[] = [];
    const jobs = [
      limiter.schedule(async () => order.push("preview-1")),
      limiter.schedule(async () => order.push("preview-2")),
      limiter.schedule(async () => order.push("execution"), "execution"),
    ];
    await vi.advanceTimersByTimeAsync(400);
    await Promise.all(jobs);
    expect(order).toEqual(["execution", "preview-1", "preview-2"]);
  });

  it("rejects work beyond twenty waiting requests", async () => {
    const limiter = new TradingApiRateLimiter();
    const jobs = Array.from({ length: 20 }, () => limiter.schedule(async () => 1));
    await expect(limiter.schedule(async () => 1)).rejects.toBeInstanceOf(TradingApiQueueFullError);
    await vi.runAllTimersAsync();
    await Promise.all(jobs);
  });

  it("pauses all queued requests after a key-wide rate limit", async () => {
    const limiter = new TradingApiRateLimiter();
    const starts: number[] = [];
    const first = limiter.schedule(async () => { starts.push(Date.now()); limiter.pauseFor(1_000); });
    const second = limiter.schedule(async () => starts.push(Date.now()));
    await vi.advanceTimersByTimeAsync(999);
    expect(starts).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, second]);
    expect(starts).toEqual([0, 1_000]);
  });
});
