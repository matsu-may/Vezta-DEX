import { afterEach, expect, it, vi } from "vitest";
import { TestnetRpcPacer, TestnetRpcPacerRegistry, parseBaseSepoliaRpcRps } from "./testnet-rpc-pacer";

afterEach(() => vi.useRealTimers());

it("spaces starts across concurrent calls and preserves FIFO results", async () => {
  vi.useFakeTimers();
  const pacer = new TestnetRpcPacer(3); const times: number[] = [];
  const start = Date.now();
  const results = Array.from({ length: 7 }, (_, i) => pacer.run(async () => { times.push(Date.now() - start); return i; }));
  await vi.advanceTimersByTimeAsync(2100);
  expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(times).toEqual([0, 334, 668, 1002, 1336, 1670, 2004]);
});

it("keeps at most two in flight and releases capacity after an original error", async () => {
  vi.useFakeTimers();
  const pacer = new TestnetRpcPacer(6); let active = 0; let maximum = 0;
  const failure = new Error("original error");
  const results = Array.from({ length: 5 }, (_, i) => pacer.run(async () => {
    active++; maximum = Math.max(maximum, active);
    try { await new Promise(resolve => setTimeout(resolve, 1000)); if (i === 0) throw failure; return i; }
    finally { active--; }
  }).catch(error => error));
  await vi.advanceTimersByTimeAsync(4000);
  expect(maximum).toBe(2);
  expect(await Promise.all(results)).toEqual([failure, 1, 2, 3, 4]);
});

it("cancels queued work without executing it and accepts the next fresh study", async () => {
  vi.useFakeTimers();
  const pacer = new TestnetRpcPacer(3); const controller = new AbortController(); let cancelledStarts = 0;
  await pacer.run(async () => 1);
  const queued = pacer.run(async () => { cancelledStarts++; }, controller.signal).catch(e => e);
  controller.abort();
  expect((await queued).name).toBe("AbortError");
  await vi.advanceTimersByTimeAsync(1000);
  expect(cancelledStarts).toBe(0);
  expect(await pacer.run(async () => "fresh")).toBe("fresh");
  await expect(pacer.run(async () => "never", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

it("bounds queued work and queue wait, then releases aborted queue resources", async () => {
  vi.useFakeTimers();
  const pacer = new TestnetRpcPacer(3); const controller = new AbortController();
  let finishA!: () => void; let finishB!: () => void;
  const a = pacer.run(() => new Promise<void>(resolve => { finishA = resolve; }));
  const b = pacer.run(() => new Promise<void>(resolve => { finishB = resolve; }));
  await vi.advanceTimersByTimeAsync(334);
  const queued = Array.from({ length: 128 }, () => pacer.run(async () => "never", controller.signal).catch(e => e));
  await expect(pacer.run(async () => "overflow")).rejects.toMatchObject({ name: "RpcQueueFullError" });
  await vi.advanceTimersByTimeAsync(25000);
  expect((await Promise.all(queued)).every(error => error.name === "TimeoutError")).toBe(true);
  controller.abort(); finishA(); finishB(); await Promise.all([a, b]);
  expect(await pacer.run(async () => "recovered")).toBe("recovered");
});

it("shares budget by origin across credentials/paths and rejects budget-reset or registry overflow", () => {
  const registry = new TestnetRpcPacerRegistry();
  const a = registry.get(new URL("https://rpc.example.invalid/key-one"), 3);
  expect(registry.get(new URL("https://user:secret@rpc.example.invalid/key-two"), 3)).toBe(a);
  expect(() => registry.get(new URL("https://rpc.example.invalid/key-two"), 6)).toThrow("RPC rate configuration changed");
  for (let i = 1; i < 32; i++) registry.get(new URL(`https://rpc${i}.example.invalid`), 3);
  expect(() => registry.get(new URL("https://overflow.example.invalid/private-key"), 3)).toThrow("RPC origin capacity exceeded");
});

it("accepts only bounded whole-number configuration", () => {
  expect(parseBaseSepoliaRpcRps(undefined)).toBe(3);
  expect(parseBaseSepoliaRpcRps(" 2 ")).toBe(2);
  for (const value of ["0", "7", "-1", "3.5", "3junk", "Infinity", "01"]) {
    expect(() => parseBaseSepoliaRpcRps(value)).toThrow("Invalid Base Sepolia RPC rate");
  }
});
