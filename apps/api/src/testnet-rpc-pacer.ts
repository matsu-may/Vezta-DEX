interface QueuedRequest {
  start(): void;
  reject(reason: unknown): void;
  signal?: AbortSignal;
  abort?: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const aborted = (signal: AbortSignal) => signal.reason ?? new DOMException("RPC study aborted", "AbortError");

/** Process-local request starts/concurrency. Active network cancellation remains the transport's job. */
export class TestnetRpcPacer {
  private readonly queue: QueuedRequest[] = [];
  private active = 0;
  private nextStartAt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly interval: number;
  constructor(readonly rps = 3) {
    if (!Number.isInteger(rps) || rps < 1 || rps > 6) throw new Error("Invalid Base Sepolia RPC rate");
    this.interval = Math.ceil(1000 / rps);
  }

  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(aborted(signal));
    if (this.queue.length >= 128) {
      const error = new Error("RPC queue capacity exceeded"); error.name = "RpcQueueFullError";
      return Promise.reject(error);
    }
    return new Promise<T>((resolve, reject) => {
      const item: QueuedRequest = {
        signal, reject,
        timer: setTimeout(() => this.cancel(item, new DOMException("RPC queue wait expired", "TimeoutError")), 25000),
        start: () => {
          void (async () => {
            try { signal?.throwIfAborted(); resolve(await task()); }
            catch (error) { reject(error); }
            finally { this.active--; this.pump(); }
          })();
        },
      };
      if (signal) {
        item.abort = () => this.cancel(item, aborted(signal));
        signal.addEventListener("abort", item.abort, { once: true });
      }
      this.queue.push(item); this.pump();
    });
  }

  private cleanup(item: QueuedRequest): void {
    clearTimeout(item.timer);
    if (item.abort) item.signal?.removeEventListener("abort", item.abort);
  }
  private cancel(item: QueuedRequest, reason: unknown): void {
    const index = this.queue.indexOf(item);
    if (index < 0) return;
    this.queue.splice(index, 1); this.cleanup(item); item.reject(reason); this.pump();
  }
  private pump(): void {
    clearTimeout(this.timer); this.timer = undefined;
    while (this.queue[0]?.signal?.aborted) {
      const item = this.queue.shift()!; this.cleanup(item); item.reject(aborted(item.signal!));
    }
    if (this.active >= 2 || this.queue.length === 0) return;
    const delay = Math.max(0, this.nextStartAt - performance.now());
    if (delay > 0) {
      this.timer = setTimeout(() => { this.timer = undefined; this.pump(); }, Math.ceil(delay));
      return;
    }
    const item = this.queue.shift()!; this.cleanup(item);
    this.active++; this.nextStartAt = performance.now() + this.interval;
    item.start(); this.pump();
  }
}

export function parseBaseSepoliaRpcRps(value: string | undefined): number {
  const rate = value?.trim();
  if (!rate) return 3;
  if (!/^[1-6]$/.test(rate)) throw new Error("Invalid Base Sepolia RPC rate");
  return Number(rate);
}

export class TestnetRpcPacerRegistry {
  private readonly origins = new Map<string, TestnetRpcPacer>();
  get(url: URL, rps: number): TestnetRpcPacer {
    const existing = this.origins.get(url.origin);
    if (existing) {
      if (existing.rps !== rps) throw new Error("RPC rate configuration changed");
      return existing;
    }
    if (this.origins.size >= 32) throw new Error("RPC origin capacity exceeded");
    const pacer = new TestnetRpcPacer(rps); this.origins.set(url.origin, pacer); return pacer;
  }
}

// Never evict a live budget or include endpoint credentials/paths in diagnostic output.
export const baseSepoliaRpcPacers = new TestnetRpcPacerRegistry();
