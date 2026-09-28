// Read-only local quote → validated Permit2 plan. Never signs, submits, or prints typed data.
const apiUrl = process.env.DEX_API_URL ?? "http://127.0.0.1:3021";
const swapper = process.env.DEX_SMOKE_WALLET ?? "0x1111111111111111111111111111111111111111";
if (!/^0x[0-9a-fA-F]{40}$/.test(swapper)) throw new Error("DEX_SMOKE_WALLET must be an EVM address");
const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const router = "0xDc264714F68d84CF29BC605589405E78bDBE7C9f";
const pairs = [
  ["USDC_TO_WETH", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "1000000"],
  ["WETH_TO_USDC", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "1000000000000000"],
];
const same = (value, expected) => typeof value === "string" && value.toLowerCase() === expected.toLowerCase();
const uint = (value) => {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  return typeof value === "string" && /^(0|[1-9]\d{0,77})$/.test(value) ? BigInt(value) : null;
};
const post = async (path, body) => {
  const response = await fetch(new URL(path, apiUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  return { response, payload };
};

for (const [direction, tokenIn, tokenOut, amountIn] of pairs) {
  try {
    const intent = { chainId: 137, swapper, tokenIn, tokenOut, amountIn, slippageBps: 50 };
    const { response: quoteResponse, payload: quoted } = await post("/api/v1/trading-quote", intent);
    if (!quoteResponse.ok || !/^[0-9a-f]{48}$/.test(quoted?.quoteId ?? "")) {
      process.stdout.write(JSON.stringify({ direction, stage: "quote", status: quoteResponse.status, quoteAvailable: false }) + "\n");
      process.exitCode = 1;
      break;
    }
    const { response, payload } = await post("/api/v1/permit-plan", { ...intent, quoteId: quoted.quoteId });
    const plan = payload?.permitPlan;
    const signing = plan?.permit?.kind === "sign";
    const data = plan?.permit?.data;
    const seconds = BigInt(Math.floor(Date.now() / 1_000));
    const expiration = uint(data?.values?.details?.expiration);
    const deadline = uint(data?.values?.sigDeadline);
    const checks = {
      quoteIdMatches: plan?.quoteId === quoted.quoteId,
      chainMatches: plan?.chainId === 137,
      quoteFresh: Date.parse(plan?.quoteExpiresAt ?? "") > Date.now(),
      hasProvenance: typeof plan?.blockNumber === "string" && /^\d+$/.test(plan.blockNumber) && Number.isFinite(Date.parse(plan?.observedAt ?? "")),
      domainMatches: signing ? data?.domain?.name === "Permit2" && uint(data?.domain?.chainId) === 137n && same(data?.domain?.verifyingContract, permit2) : undefined,
      spenderMatches: signing ? same(data?.values?.spender, router) : undefined,
      amountMatches: signing ? same(data?.values?.details?.token, tokenIn) && uint(data?.values?.details?.amount) === BigInt(amountIn) : undefined,
      allowanceWindowValid: signing ? expiration !== null && expiration > seconds && expiration <= seconds + 2_592_000n : undefined,
      signatureWindowValid: signing ? deadline !== null && deadline > seconds && deadline <= seconds + 1_800n : undefined,
      leaksRawQuote: Boolean(payload?.quote || payload?.route || payload?.permitData || plan?.quote),
    };
    process.stdout.write(JSON.stringify({ direction, status: response.status, permitKind: plan?.permit?.kind, blockNumber: plan?.blockNumber, observedAt: plan?.observedAt, ...checks }) + "\n");
    const valid = response.ok && ["sign", "ready"].includes(plan?.permit?.kind) && Object.entries(checks).every(([key, value]) => value === undefined || value === (key !== "leaksRawQuote"));
    if (!valid) { process.exitCode = 1; break; }
  } catch (error) {
    process.stdout.write(JSON.stringify({ direction, networkError: error instanceof Error ? error.name : "unknown" }) + "\n");
    process.exitCode = 1;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
