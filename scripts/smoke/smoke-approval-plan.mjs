import { summarizeApprovalTransaction } from "./approval-summary.mjs";

// Queries only the local DEX API and Polygon RPC. Never signs or submits.
const apiUrl = process.env.DEX_API_URL ?? "http://127.0.0.1:3021";
const wallet = process.env.DEX_SMOKE_WALLET ?? "0x1111111111111111111111111111111111111111";
if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new Error("DEX_SMOKE_WALLET must be an EVM address");

const inputs = [
  ["USDC", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "1000000"],
  ["WETH", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "1000000000000000"],
];
const MAX_UINT256 = ((1n << 256n) - 1n).toString();

for (const [name, tokenIn, tokenOut, amountIn] of inputs) {
  try {
    const response = await fetch(new URL("/api/v1/approval-plan", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: 137, swapper: wallet, tokenIn, tokenOut, amountIn, slippageBps: 50 }),
      signal: AbortSignal.timeout(12_000),
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    const result = body?.approval;
    const allowance = result?.currentAllowance;
    process.stdout.write(JSON.stringify({
      token: name,
      status: response.status,
      chainId: result?.chainId,
      blockNumber: result?.blockNumber,
      observedAt: result?.observedAt,
      allowanceKind: allowance === "0" ? "zero" : allowance === amountIn ? "exact" : allowance === MAX_UINT256 ? "unlimited" : allowance == null ? "unavailable" : "other",
      planKind: result?.plan?.kind,
      transaction: result?.plan?.kind === "approve"
        ? summarizeApprovalTransaction(result.plan.transaction, { wallet, token: tokenIn, amount: BigInt(amountIn) })
        : undefined,
    }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ token: name, networkError: error instanceof Error ? error.name : "unknown" }) + "\n");
    break;
  }
}
