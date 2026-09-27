import { readFileSync } from "node:fs";
import { summarizeApprovalTransaction } from "./approval-summary.mjs";

// Read-only API probe. It never signs, submits, or prints transaction calldata.
const env = readFileSync(new URL("../apps/api/.env", import.meta.url), "utf8");
const key = env.split(/\r?\n/).find((line) => line.startsWith("UNISWAP_API_KEY="))?.slice("UNISWAP_API_KEY=".length).trim();
if (!key) throw new Error("UNISWAP_API_KEY is missing");

const wallet = process.env.DEX_SMOKE_WALLET ?? "0x1111111111111111111111111111111111111111";
if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new Error("DEX_SMOKE_WALLET must be an EVM address");

const inputs = [
  ["USDC", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "1000000"],
  ["WETH", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "1000000000000000"],
];

for (const [tokenName, token, amount] of inputs) {
  try {
    const response = await fetch("https://trade-api.gateway.uniswap.org/v1/check_approval", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ walletAddress: wallet, token, amount, chainId: 137 }),
      signal: AbortSignal.timeout(12_000),
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    process.stdout.write(JSON.stringify({
      token: tokenName,
      status: response.status,
      errorCode: typeof body?.errorCode === "string" ? body.errorCode : undefined,
      responseFields: body && typeof body === "object" ? Object.keys(body).sort() : [],
      approval: summarizeApprovalTransaction(body?.approval, { wallet, token, amount: BigInt(amount) }),
      cancel: summarizeApprovalTransaction(body?.cancel, { wallet, token, amount: 0n }),
      hasGasFee: body?.gasFee != null,
      hasCancelGasFee: body?.cancelGasFee != null,
    }) + "\n");
    if (response.status === 401 || response.status === 429) break;
  } catch (error) {
    process.stdout.write(JSON.stringify({ token: tokenName, networkError: error instanceof Error ? error.name : "unknown" }) + "\n");
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
