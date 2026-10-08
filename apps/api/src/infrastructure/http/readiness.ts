import type { PoolChainSource } from "../../modules/discovery/pools";

export type Readiness =
  | { status: "ready"; polygon: "ok" }
  | { status: "unavailable"; polygon: "unavailable" };

const CACHE_MS = 5_000;
const MAX_BLOCK_AGE_MS = 120_000;
const MAX_FUTURE_MS = 5_000;

/** Read-only Polygon dependency check. Never return an RPC URL or provider error. */
export class ReadinessReader {
  private cached?: { result: Readiness; expiresAt: number };
  private inFlight?: Promise<Readiness>;

  constructor(private readonly source: Pick<PoolChainSource, "getBlock">, private readonly now: () => number = Date.now) {}

  check(): Promise<Readiness> {
    const at = this.now();
    if (this.cached && at < this.cached.expiresAt) return Promise.resolve(this.cached.result);
    if (this.inFlight) return this.inFlight;
    const pending = this.probe().then(result => {
      this.cached = { result, expiresAt: this.now() + CACHE_MS };
      return result;
    }).finally(() => { this.inFlight = undefined; });
    this.inFlight = pending;
    return pending;
  }

  private async probe(): Promise<Readiness> {
    try {
      // The production source checks chain ID before returning this block.
      const block = await this.source.getBlock();
      const observed = Number(block.timestamp) * 1_000;
      const now = this.now();
      if (typeof block.number !== "bigint" || block.number <= 0n
        || typeof block.timestamp !== "bigint" || !Number.isSafeInteger(observed)
        || !Number.isSafeInteger(now) || observed > now + MAX_FUTURE_MS
        || now - observed > MAX_BLOCK_AGE_MS) {
        return { status: "unavailable", polygon: "unavailable" };
      }
      return { status: "ready", polygon: "ok" };
    } catch {
      return { status: "unavailable", polygon: "unavailable" };
    }
  }
}
