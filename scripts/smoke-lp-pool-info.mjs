// One read-only Uniswap LP API request. No wallet, signature, transaction, or raw response logging.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const POOL = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";
const addressEquals = (value, expected) => typeof value === "string" && value.toLowerCase() === expected.toLowerCase();
const uintString = value => typeof value === "string" && /^\d+$/.test(value);
export const selectLpApiKey = env => env.UNISWAP_LP_API_KEY?.trim() || env.UNISWAP_API_KEY?.trim();

export async function probeLpPoolInfo({ apiKey, fetcher = fetch, write = line => process.stdout.write(line + "\n") }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    write(JSON.stringify({ errorKind: "NOT_CONFIGURED" }));
    return false;
  }
  let response;
  try {
    response = await fetcher("https://liquidity.api.uniswap.org/lp/pool_info", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-api-key": apiKey.trim() },
      body: JSON.stringify({ protocol: "V3", chainId: 137, poolParameters: { tokenAddressA: USDC, tokenAddressB: WETH, fee: 500 } }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    write(JSON.stringify({ errorKind: error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "TIMEOUT" : "NETWORK" }));
    return false;
  }
  if (!response.ok) {
    write(JSON.stringify({ status: response.status, errorKind: [401, 403].includes(response.status) ? "AUTH" : response.status === 429 ? "RATE_LIMIT" : response.status >= 500 ? "UPSTREAM" : "HTTP" }));
    return false;
  }
  let body;
  try { body = await response.json(); }
  catch { write(JSON.stringify({ status: response.status, errorKind: "INVALID_RESPONSE" })); return false; }
  const pools = Array.isArray(body?.pools) ? body.pools : [];
  const matches = pools.filter(pool => pool?.chainId === 137 && pool?.poolProtocol === "V3" && addressEquals(pool?.poolReferenceIdentifier, POOL)
    && (String(pool?.fee) === "500") && (
      (addressEquals(pool?.tokenAddressA, USDC) && addressEquals(pool?.tokenAddressB, WETH) && pool?.tokenDecimalsA === 6 && pool?.tokenDecimalsB === 18)
      || (addressEquals(pool?.tokenAddressA, WETH) && addressEquals(pool?.tokenAddressB, USDC) && pool?.tokenDecimalsA === 18 && pool?.tokenDecimalsB === 6)
    ));
  const poolMatches = matches.length === 1;
  const state = matches[0];
  const stateShapeValid = poolMatches && Number.isInteger(state?.currentTick) && Number.isInteger(state?.tickSpacing) && state.tickSpacing > 0
    && uintString(state?.poolLiquidity) && uintString(state?.sqrtRatioX96) && BigInt(state.sqrtRatioX96) > 0n;
  const activeLiquidityPositive = stateShapeValid && BigInt(state.poolLiquidity) > 0n;
  write(JSON.stringify({ status: response.status, poolCount: pools.length, poolMatches, stateShapeValid: Boolean(stateShapeValid), activeLiquidityPositive: Boolean(activeLiquidityPositive) }));
  return Boolean(poolMatches && stateShapeValid && activeLiquidityPositive);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (!await probeLpPoolInfo({ apiKey: selectLpApiKey(process.env) })) process.exitCode = 1;
}
