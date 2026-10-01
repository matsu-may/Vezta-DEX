import type { TradingIntent } from "@vezta-dex/core";
import { performance } from "node:perf_hooks";
import { WalletStateReader, WalletStateUnavailableError, type WalletStateSource } from "./wallet-state";

interface MethodTiming { calls: number; failed: number; totalMs: number; maxMs: number }
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Read-only host diagnostic. It records method names and durations, never results or provider errors. */
export async function runWalletStateDiagnostic({ source, intent, cycles = 3, now = Date.now,
  clock = () => performance.now(), pause = sleep, write = (line: string) => process.stdout.write(line + "\n"),
}: { source: WalletStateSource; intent: TradingIntent; cycles?: number; now?: () => number;
  clock?: () => number; pause?: (ms: number) => Promise<void>; write?: (line: string) => void }): Promise<boolean> {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 5) throw new Error("cycles must be 1-5");
  let allSucceeded = true;
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const methods: Record<string, MethodTiming> = {};
    const pending = new Set<Promise<unknown>>();
    const started = clock();
    const measure = <T>(name: string, action: () => Promise<T>): Promise<T> => {
      const began = clock();
      const record = (failed: boolean) => {
        const elapsed = Math.max(0, Math.round(clock() - began));
        const current = methods[name] ?? { calls: 0, failed: 0, totalMs: 0, maxMs: 0 };
        current.calls++;
        if (failed) current.failed++;
        current.totalMs += elapsed;
        current.maxMs = Math.max(current.maxMs, elapsed);
        methods[name] = current;
      };
      const result = Promise.resolve().then(action).then(
        value => { record(false); return value; },
        error => { record(true); throw error; },
      );
      pending.add(result);
      void result.then(() => pending.delete(result), () => pending.delete(result));
      return result;
    };
    const timed: WalletStateSource = {
      getBlock: () => measure("getBlock", () => source.getBlock()),
      getAccountCode: (owner, block) => measure("getAccountCode", () => source.getAccountCode(owner, block)),
      getAccountNonce: (owner, block) => measure("getAccountNonce", () => source.getAccountNonce(owner, block)),
      getPendingNonce: owner => measure("getPendingNonce", () => source.getPendingNonce(owner)),
      getTokenBalance: (token, owner, block) => measure("getTokenBalance", () => source.getTokenBalance(token, owner, block)),
      getNativeBalance: (owner, block) => measure("getNativeBalance", () => source.getNativeBalance(owner, block)),
      getTokenAllowance: (token, owner, spender, block) => measure("getTokenAllowance", () => source.getTokenAllowance(token, owner, spender, block)),
      getPermitAllowance: (token, owner, spender, block) => measure("getPermitAllowance", () => source.getPermitAllowance(token, owner, spender, block)),
      getGasPrice: () => measure("getGasPrice", () => source.getGasPrice()),
      estimateSwapGas: (transaction, block) => measure("estimateSwapGas", () => source.estimateSwapGas(transaction, block)),
      simulateApproval: (transaction, block) => measure("simulateApproval", () => source.simulateApproval(transaction, block)),
    };
    let code: string | undefined;
    try { await new WalletStateReader(timed, now).getState(intent); }
    catch (error) {
      allSucceeded = false;
      code = error instanceof WalletStateUnavailableError ? error.code : "WALLET_STATE_UNCLASSIFIED";
    }
    // Promise.all may reject as soon as one concurrent RPC fails. Wait for the remaining reads before reporting timings.
    await Promise.allSettled([...pending]);
    write(JSON.stringify({ cycle, status: code ? "unavailable" : "ok", ...(code ? { code } : {}),
      elapsedMs: Math.max(0, Math.round(clock() - started)), methods }));
    if (cycle !== cycles) await pause(1_250);
  }
  return allSucceeded;
}
