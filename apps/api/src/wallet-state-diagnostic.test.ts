import { describe, expect, it } from "vitest";
import { TOKENS, type TradingIntent } from "@vezta-dex/core";
import { runWalletStateDiagnostic } from "./wallet-state-diagnostic";
import type { WalletStateSource } from "./wallet-state";

const intent: TradingIntent = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111",
  tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
const source = (): WalletStateSource => ({
  getBlock: async () => ({ number: 123n, timestamp: 1000n }),
  getAccountCode: async () => "0x",
  getAccountNonce: async () => 7n,
  getPendingNonce: async () => 7n,
  getTokenBalance: async () => 2_000_000n,
  getNativeBalance: async () => 10n ** 18n,
  getTokenAllowance: async () => 0n,
  getPermitAllowance: async () => ({ amount: 0n, expiration: 0n, nonce: 7n }),
  getGasPrice: async () => 30_000_000_000n,
  estimateSwapGas: async () => 50_000n,
  simulateApproval: async () => {},
});

describe("sanitized wallet state diagnostic", () => {
  it("times each dependency and reports success without balances or addresses", async () => {
    const lines: unknown[] = [];
    const result = await runWalletStateDiagnostic({ source: source(), intent, cycles: 1,
      now: () => 1_000_000, clock: () => 0, pause: async () => {},
      write: line => lines.push(JSON.parse(line)) });
    expect(result).toBe(true);
    expect(lines).toMatchObject([{ cycle: 1, status: "ok", methods: {
      getBlock: { calls: 1 }, getTokenBalance: { calls: 2 }, simulateApproval: { calls: 1 },
      estimateSwapGas: { calls: 1 }, getGasPrice: { calls: 1 },
    } }]);
    expect(JSON.stringify(lines)).not.toContain(intent.swapper);
    expect(JSON.stringify(lines)).not.toContain("2000000");
  });

  it("waits for concurrent reads after one failure and hides provider details", async () => {
    const failing = source();
    let resolveNative!: (value: bigint) => void;
    failing.getTokenBalance = async () => { throw new Error("secret-rpc-url"); };
    failing.getNativeBalance = () => new Promise(resolve => { resolveNative = resolve; });
    const lines: unknown[] = [];
    const run = runWalletStateDiagnostic({ source: failing, intent, cycles: 1,
      now: () => 1_000_000, clock: () => 0, pause: async () => {},
      write: line => lines.push(JSON.parse(line)) });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(lines).toHaveLength(0);
    resolveNative(10n ** 18n);
    expect(await run).toBe(false);
    expect(lines).toMatchObject([{ cycle: 1, status: "unavailable", code: "WALLET_STATE_READS_UNAVAILABLE",
      methods: { getTokenBalance: { failed: 2 }, getNativeBalance: { calls: 1 } } }]);
    expect(JSON.stringify(lines)).not.toContain("secret-rpc-url");
  });
});
