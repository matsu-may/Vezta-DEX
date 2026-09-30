// Read-only API shape probe. It never invokes a wallet or emits returned calldata.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { selectLpApiKey } from "./smoke-lp-pool-info.mjs";

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const POOL = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const API = "https://liquidity.api.uniswap.org/lp/";
const address = value => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
const sameAddress = (value, expected) => address(value) && value.toLowerCase() === expected.toLowerCase();
const uint = value => typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
const valueKind = value => {
  if (typeof value !== "string") return "wrong-type";
  if (/^(0|[1-9]\d{0,77})$/.test(value)) return BigInt(value) === 0n ? "zero-decimal" : "positive-decimal";
  if (/^0x[0-9a-fA-F]{1,64}$/.test(value)) return BigInt(value) === 0n ? "zero-hex" : "positive-hex";
  return "malformed";
};
const zeroValue = value => valueKind(value) === "zero-decimal" || valueKind(value) === "zero-hex";
const txShape = (tx, wallet, target) => tx && tx.chainId === 137 && sameAddress(tx.from, wallet)
  && (target ? sameAddress(tx.to, target) : address(tx.to)) && zeroValue(tx.value)
  && typeof tx.data === "string" && /^0x(?:[0-9a-fA-F]{2}){4,}$/.test(tx.data);
const errorKind = status => [401, 403].includes(status) ? "AUTH" : status === 429 ? "RATE_LIMIT" : status >= 500 ? "UPSTREAM" : "HTTP";

export async function probeLpUnsigned({ apiKey, wallet, fetcher = fetch, write = line => process.stdout.write(line + "\n") }) {
  if (typeof apiKey !== "string" || !apiKey.trim() || !address(wallet)) {
    write(JSON.stringify({ errorKind: "NOT_CONFIGURED" }));
    return false;
  }
  async function post(stage, body) {
    let response;
    try {
      response = await fetcher(API + stage, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-api-key": apiKey.trim() },
        body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      write(JSON.stringify({ stage, errorKind: error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "TIMEOUT" : "NETWORK" }));
      return null;
    }
    if (!response.ok) {
      write(JSON.stringify({ stage, status: response.status, errorKind: errorKind(response.status) }));
      return null;
    }
    try { return { status: response.status, body: await response.json() }; }
    catch {
      write(JSON.stringify({ stage, status: response.status, errorKind: "INVALID_RESPONSE" }));
      return null;
    }
  }

  const create = await post("create", { walletAddress: wallet, protocol: "V3", chainId: 137,
    existingPool: { token0Address: USDC, token1Address: WETH, poolReference: POOL },
    independentToken: { tokenAddress: USDC, amount: "1000000" },
    tickBounds: { tickLower: -887270, tickUpper: 887270 }, simulateTransaction: false });
  if (!create) return false;
  const { token0, token1 } = create.body ?? {};
  const tokenAmountsValid = sameAddress(token0?.tokenAddress, USDC) && token0?.amount === "1000000"
    && sameAddress(token1?.tokenAddress, WETH) && uint(token1?.amount) && BigInt(token1.amount) > 0n;
  const transactionShapeValid = Boolean(txShape(create.body?.create, wallet, MANAGER));
  const transaction = create.body?.create;
  const transactionChecks = transactionShapeValid ? undefined : {
    present: Boolean(transaction && typeof transaction === "object" && !Array.isArray(transaction)),
    chainMatches: transaction?.chainId === 137,
    chainType: typeof transaction?.chainId,
    fromMatchesWallet: sameAddress(transaction?.from, wallet),
    fromType: typeof transaction?.from,
    targetMatchesManager: sameAddress(transaction?.to, MANAGER),
    ...(address(transaction?.to) ? { targetAddress: transaction.to } : {}),
    valueZero: zeroValue(transaction?.value),
    valueType: typeof transaction?.value,
    valueKind: valueKind(transaction?.value),
    calldataShapeValid: typeof transaction?.data === "string" && /^0x(?:[0-9a-fA-F]{2}){4,}$/.test(transaction.data),
    calldataType: typeof transaction?.data,
  };
  const ticksValid = Number.isInteger(create.body?.tickLower) && Number.isInteger(create.body?.tickUpper)
    && create.body.tickLower === -887270 && create.body.tickUpper === 887270;
  const createShapeValid = Boolean(tokenAmountsValid && transactionShapeValid && ticksValid);
  write(JSON.stringify({ stage: "create", status: create.status, shapeValid: createShapeValid,
    tokenAmountsValid: Boolean(tokenAmountsValid), transactionShapeValid, ...(transactionChecks ? { transactionChecks } : {}) }));
  if (!createShapeValid) return false;

  const approval = await post("check_approval", { walletAddress: wallet, protocol: "V3", chainId: 137,
    lpTokens: [{ tokenAddress: USDC, amount: token0.amount }, { tokenAddress: WETH, amount: token1.amount }], action: "CREATE" });
  if (!approval) return false;
  const transactions = approval.body?.transactions;
  const approvalShapeValid = Array.isArray(transactions) && transactions.length <= 4
    && transactions.every(item => item?.action === "CREATE" && typeof item?.cancelApproval === "boolean"
      && txShape(item.transaction, wallet));
  write(JSON.stringify({ stage: "check_approval", status: approval.status, shapeValid: Boolean(approvalShapeValid),
    transactionCount: Array.isArray(transactions) ? transactions.length : null }));
  return Boolean(approvalShapeValid);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const success = await probeLpUnsigned({ apiKey: selectLpApiKey(process.env), wallet: process.env.DEX_SMOKE_WALLET });
  if (!success) process.exitCode = 1;
}
