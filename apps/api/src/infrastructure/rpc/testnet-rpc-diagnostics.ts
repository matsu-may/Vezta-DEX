import { performance } from "node:perf_hooks";
import type { BaseSepoliaSwapSource } from "../../modules/swap/testnet-swap-quote";

type FailureKind = "rate-limited" | "timeout" | "contract-revert" | "http-error" | "transport"
  | "rpc-error" | "aborted" | "response-too-large" | "unclassified";
interface Failure { kind: FailureKind; httpStatus?: number }
const METHODS = ["getChainId", "getLatestBlock", "getBlockHash", "getCode", "getDecimals",
  "getPool", "getPoolState", "quoteOneUsdc", "quoteExactInput", "getTickSpacing", "getDependencyConfiguration"] as const satisfies readonly (keyof BaseSepoliaSwapSource)[];
type Method = typeof METHODS[number];
interface MethodStats { method: Method; calls: number; failed: number; totalMs: number; maxMs: number }
export interface TestnetRpcDiagnosticSnapshot {
  methods: MethodStats[];
  firstFailure: ({ method: Method } & Failure) | null;
}

// Read only allowlisted metadata from a bounded cause chain. Never stringify an RPC error.
export function classifyTestnetRpcFailure(error: unknown): Failure {
  const seen = new Set<object>();
  let fallback: Failure = { kind: "unclassified" };
  try {
    for (let depth = 0; depth < 12 && error !== null && typeof error === "object" && !seen.has(error); depth++) {
      seen.add(error);
      const value = error as { name?: unknown; status?: unknown; cause?: unknown };
      const name = value.name;
      if (name === "HttpRequestError") {
        const rawStatus = value.status;
        const status = typeof rawStatus === "number" && Number.isInteger(rawStatus)
          && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : undefined;
        if (status === 429) return { kind: "rate-limited", httpStatus: 429 };
        fallback = status ? { kind: "http-error", httpStatus: status } : { kind: "transport" };
      } else if (name === "TimeoutError") return { kind: "timeout" };
      else if (name === "ContractFunctionRevertedError" || name === "ExecutionRevertedError") return { kind: "contract-revert" };
      else if (name === "RpcRequestError") fallback = { kind: "rpc-error" };
      else if (name === "AbortError") return { kind: "aborted" };
      else if (name === "RpcResponseTooLargeError") return { kind: "response-too-large" };
      error = value.cause;
    }
  } catch { /* Even malformed error objects must not alter the RPC result or expose details. */ }
  return fallback;
}

const milliseconds = (value: number) => Number.isFinite(value) ? Math.min(60000, Math.max(0, Math.round(value))) : 0;

/** CLI-only observations. Wrapping preserves original results/errors and introduces no retries. */
export class TestnetRpcDiagnostics {
  private readonly methods = new Map<Method, MethodStats>();
  private firstFailure: TestnetRpcDiagnosticSnapshot["firstFailure"] = null;
  constructor(private readonly now = () => performance.now()) {}

  wrap<T extends BaseSepoliaSwapSource>(source: T): T {
    return new Proxy(source, { get: (target, property, receiver) => {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !METHODS.includes(property as Method) || typeof value !== "function") return value;
      const method = property as Method;
      return async (...args: unknown[]) => {
        const stats = this.methods.get(method) ?? { method, calls: 0, failed: 0, totalMs: 0, maxMs: 0 };
        stats.calls++; this.methods.set(method, stats);
        const start = this.now();
        try { return await value.apply(target, args); }
        catch (error) {
          stats.failed++;
          this.firstFailure ??= { method, ...classifyTestnetRpcFailure(error) };
          throw error;
        } finally {
          const elapsed = milliseconds(this.now() - start);
          stats.totalMs += elapsed; stats.maxMs = Math.max(stats.maxMs, elapsed);
        }
      };
    } });
  }

  snapshot(): TestnetRpcDiagnosticSnapshot {
    return { methods: Array.from(this.methods.values(), value => ({ ...value })),
      firstFailure: this.firstFailure ? { ...this.firstFailure } : null };
  }
}
