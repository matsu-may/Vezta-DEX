export type TradingApiPriority = "preview" | "execution";

type Job = { run: () => Promise<void> };

export class TradingApiQueueFullError extends Error {}

/** One-process budget for one Uniswap API key. Replicas need a shared limiter. */
export class TradingApiRateLimiter {
  private readonly previews: Job[] = [];
  private readonly executions: Job[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextDispatchAt = 0;
  private pausedUntil = 0;

  schedule<T>(task: () => Promise<T>, priority: TradingApiPriority = "preview"): Promise<T> {
    if (this.previews.length + this.executions.length >= 20) {
      return Promise.reject(new TradingApiQueueFullError("Trading API queue is full"));
    }
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        run: async () => {
          try { resolve(await task()); }
          catch (error) { reject(error); }
        },
      };
      (priority === "execution" ? this.executions : this.previews).push(job);
      this.arm();
    });
  }

  pauseFor(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + milliseconds);
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.arm();
  }

  private arm(): void {
    if (this.timer || (!this.executions.length && !this.previews.length)) return;
    const delay = Math.max(0, this.nextDispatchAt - Date.now(), this.pausedUntil - Date.now());
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const job = this.executions.shift() ?? this.previews.shift();
      if (!job) return;
      this.nextDispatchAt = Date.now() + 200;
      void job.run();
      this.arm();
    }, delay);
  }
}
