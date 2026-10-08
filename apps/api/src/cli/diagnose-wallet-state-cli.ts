// Read-only wallet-state timings. Run locally with: pnpm --filter @vezta-dex/api exec node --import tsx src/cli/diagnose-wallet-state-cli.ts
import { existsSync } from "node:fs";
import { TOKENS, type TradingIntent } from "@vezta-dex/core";
import { createPolygonPoolSource } from "../infrastructure/rpc/chain";
import { runWalletStateDiagnostic } from "../modules/wallet/wallet-state-diagnostic";

const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const wallet = process.env.DEX_SMOKE_WALLET ?? "0xb4f286aeb57ab61af848f7c1619ff98144aed44e";
if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
  process.stdout.write(JSON.stringify({ errorKind: "INVALID_PUBLIC_WALLET" }) + "\n");
  process.exitCode = 1;
} else {
  try {
    const source = createPolygonPoolSource(process.env.POLYGON_RPC_URL ?? "");
    const intent: TradingIntent = { chainId: 137, swapper: wallet as `0x${string}`,
      tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
    if (!await runWalletStateDiagnostic({ source, intent })) process.exitCode = 1;
  } catch {
    process.stdout.write(JSON.stringify({ errorKind: "WALLET_DIAGNOSTIC_UNAVAILABLE" }) + "\n");
    process.exitCode = 1;
  }
}
