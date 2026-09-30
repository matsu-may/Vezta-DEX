// Local, read-only semantic review of selected v3 calldata. Never return raw calldata.
import { createRequire } from "node:module";

const { decodeFunctionData } = createRequire(new URL("../apps/api/package.json", import.meta.url))("viem");
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UINT256_MAX = (1n << 256n) - 1n;
const sameAddress = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const amountDifference = (desired, quoted) => {
  if (desired === quoted) return { relation: "equal", differenceBand: "equal" };
  const difference = desired > quoted ? desired - quoted : quoted - desired;
  return { relation: desired > quoted ? "higher" : "lower",
    differenceBand: difference === 1n ? "one-unit"
      : quoted > 0n && difference * 10000n <= quoted * 50n ? "within-50-bps" : "over-50-bps" };
};

const mintAbi = [{ type: "function", name: "mint", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [
  { name: "token0", type: "address" }, { name: "token1", type: "address" }, { name: "fee", type: "uint24" },
  { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" },
  { name: "amount0Desired", type: "uint256" }, { name: "amount1Desired", type: "uint256" },
  { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" },
  { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" },
] }], outputs: [] }];
const approveAbi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [
  { name: "spender", type: "address" }, { name: "amount", type: "uint256" },
], outputs: [{ type: "bool" }] }];

export function reviewCreateCalldata(data, { wallet, amounts, nowSeconds }) {
  if (typeof data !== "string") return { callKind: "unknown", decodedChecksPassed: false };
  if (data.slice(0, 10).toLowerCase() === "0xac9650d8") return { callKind: "multicall", decodedChecksPassed: false };
  if (data.slice(0, 10).toLowerCase() !== "0x88316456") return { callKind: "unknown", decodedChecksPassed: false };
  try {
    const { args } = decodeFunctionData({ abi: mintAbi, data });
    const p = args[0];
    const amount0 = BigInt(amounts.USDC);
    const amount1 = BigInt(amounts.WETH);
    const now = BigInt(nowSeconds);
    const desiredAmountsMatch = p.amount0Desired === amount0 && p.amount1Desired === amount1;
    const checks = {
      tokenPairMatches: sameAddress(p.token0, USDC) && sameAddress(p.token1, WETH),
      feeMatches: p.fee === 500,
      ticksMatch: p.tickLower === -887270 && p.tickUpper === 887270,
      inputCapsRespected: p.amount0Desired === amount0 && p.amount1Desired > 0n
        && p.amount1Desired <= amount1 && (amount1 - p.amount1Desired) * 10000n <= amount1 * 50n,
      minimumsBounded: p.amount0Min > 0n && p.amount0Min <= p.amount0Desired
        && p.amount1Min > 0n && p.amount1Min <= p.amount1Desired,
      minimumsWithin50Bps: p.amount0Min * 10000n >= p.amount0Desired * 9950n
        && p.amount1Min * 10000n >= p.amount1Desired * 9950n,
      minimumsWithinDisplayed50Bps: p.amount0Min * 10000n >= amount0 * 9950n
        && p.amount1Min * 10000n >= amount1 * 9950n,
      recipientMatchesWallet: sameAddress(p.recipient, wallet),
      deadlineValid: p.deadline > now && p.deadline <= now + 3600n,
    };
    return { callKind: "mint", decodedChecksPassed: Object.values(checks).every(Boolean), checks,
      ...(!desiredAmountsMatch ? { desiredAmountDiagnostics: {
        USDC: amountDifference(p.amount0Desired, amount0), WETH: amountDifference(p.amount1Desired, amount1),
      } } : {}) };
  } catch {
    return { callKind: "mint", decodedChecksPassed: false, decodeFailed: true };
  }
}

/** Internal preparation input: the caller must keep these raw ceilings out of diagnostic output. */
export function qualifiedMintInputs(data, context) {
  if (!reviewCreateCalldata(data, context).decodedChecksPassed) throw new Error("Unqualified LP mint");
  const { args } = decodeFunctionData({ abi: mintAbi, data });
  return { USDC: args[0].amount0Desired, WETH: args[0].amount1Desired };
}

export function reviewApprovalCalldata(transaction, amounts) {
  const token = sameAddress(transaction?.to, USDC) ? "USDC" : sameAddress(transaction?.to, WETH) ? "WETH" : "unknown";
  if (typeof transaction?.data !== "string" || transaction.data.slice(0, 10).toLowerCase() !== "0x095ea7b3") {
    return { token, callKind: "unknown", exactPolicyMatches: false };
  }
  try {
    const { args } = decodeFunctionData({ abi: approveAbi, data: transaction.data });
    const [spender, amount] = args;
    const expected = token === "unknown" ? null : BigInt(amounts[token]);
    const spenderMatchesManager = sameAddress(spender, MANAGER);
    const amountKind = amount === 0n ? "zero" : amount === UINT256_MAX ? "unlimited"
      : expected !== null && amount === expected ? "exact"
        : expected !== null && amount > expected ? "greater-than-request" : "other";
    return { token, callKind: "approve", spenderMatchesManager, amountKind,
      exactPolicyMatches: token !== "unknown" && spenderMatchesManager && amountKind === "exact" };
  } catch {
    return { token, callKind: "approve", exactPolicyMatches: false, decodeFailed: true };
  }
}
