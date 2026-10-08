// Pure unsigned LP approval planner. It never calls a wallet or RPC.
import { createRequire } from "node:module";
import { qualifiedMintInputs } from "./lp-calldata-review.mjs";

const { encodeFunctionData, erc20Abi } = createRequire(new URL("../../apps/api/package.json", import.meta.url))("viem");
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const MAX = (1n << 256n) - 1n;
const sameAddress = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const zeroValue = value => typeof value === "string" && (/^0x[0-9a-fA-F]{1,64}$/.test(value) || /^(0|[1-9]\d{0,77})$/.test(value))
  && BigInt(value) === 0n;

export function planLpExactApprovals({ wallet, transaction, amounts, maxWethDesired, allowances, nowSeconds }) {
  if (typeof wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(wallet) || transaction?.chainId !== 137
    || !sameAddress(transaction.from, wallet) || !sameAddress(transaction.to, MANAGER) || !zeroValue(transaction.value)
    || amounts?.USDC !== "1000000" || typeof amounts?.WETH !== "string" || !/^[1-9]\d{0,77}$/.test(amounts.WETH)
    || typeof maxWethDesired !== "string" || !/^[1-9]\d{0,77}$/.test(maxWethDesired)
    || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error("Invalid LP approval input");
  const desired = qualifiedMintInputs(transaction.data, { wallet, amounts, nowSeconds });
  if (BigInt(maxWethDesired) > MAX || desired.WETH > BigInt(maxWethDesired)) throw new Error("LP WETH cap exceeded");
  for (const token of ["USDC", "WETH"]) {
    const allowance = allowances?.[token];
    if (typeof allowance !== "bigint" || allowance < 0n || allowance > MAX) throw new Error("Invalid LP allowance");
  }
  const blocked = ["USDC", "WETH"].filter(token => allowances[token] !== 0n && allowances[token] !== desired[token]);
  if (blocked.length) return { kind: "blocked-existing", transactions: [], tokens: blocked };
  const transactions = [["USDC", USDC], ["WETH", WETH]].filter(([token]) => allowances[token] === 0n)
    .map(([token, address]) => ({ chainId: 137, from: wallet, to: address, value: "0",
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [MANAGER, desired[token]] }) }));
  return { kind: transactions.length ? "approve" : "ready", transactions };
}
