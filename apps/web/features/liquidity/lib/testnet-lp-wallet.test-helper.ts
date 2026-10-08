import { encodeFunctionData, erc20Abi } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, testnetLpWalletManagerAbi as abi, parseTestnetLpStudy, type TestnetLpStudy, type TestnetLpReceipt, type TestnetLpIntent } from "@vezta-dex/core";
export const LP_NOW = 1790800000000;
export const LP_HASH = `0x${"11".repeat(32)}`;
export function lpWalletFixture(kind: TestnetLpStudy["actionKind"] = "mint", percentage: 25 | 50 | 100 = 25) {
  const wallet = "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e"; const deadline = BigInt(LP_NOW / 1000 + 120);
  const action = kind === "approve" || kind === "reset" ? "mint" : kind;
  const intent = { chainId: 84532, wallet, kind: action, ...(action !== "mint" ? { tokenId: "42" } : {}),
    ...(action === "mint" || action === "increase" ? { amount0Cap: "1000000", amount1Cap: "1000000000000000" } : {}), ...(action === "decrease" ? { percentage } : {}) } as TestnetLpIntent;
  const deposit = action === "mint" || action === "increase"; const liquidity = action === "decrease" ? String(100n*BigInt(percentage)/100n) : deposit ? "100" : "0";
  const plan = { amount0Cap: deposit ? "1000000" : "0", amount1Cap: deposit ? "1000000000000000" : "0", amount0Desired: deposit ? "500000" : "0", amount1Desired: deposit ? "500000000000000" : "0", amount0Minimum: deposit ? "497500" : "0", amount1Minimum: deposit ? "497500000000000" : "0", liquidity,
    positionLiquidity: action === "mint" || action === "burn" ? "0" : "100", storedOwed0: "0", storedOwed1: "0", tickLower: -887220, tickUpper: 887220, deadline: action === "collect" || action === "burn" ? null : String(deadline) };
  let data: string;
  if (kind === "approve" || kind === "reset") data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [C.v3PositionManager, kind === "reset" ? 0n : 1000000n] });
  else if (kind === "mint") data = encodeFunctionData({ abi, functionName: "mint", args: [{ token0: C.USDC.address, token1: C.WETH.address, fee: 3000, tickLower: -887220, tickUpper: 887220, amount0Desired: 500000n, amount1Desired: 500000000000000n, amount0Min: 497500n, amount1Min: 497500000000000n, recipient: wallet, deadline }] });
  else if (kind === "increase") data = encodeFunctionData({ abi, functionName: "increaseLiquidity", args: [{ tokenId: 42n, amount0Desired: 500000n, amount1Desired: 500000000000000n, amount0Min: 497500n, amount1Min: 497500000000000n, deadline }] });
  else if (kind === "decrease") data = encodeFunctionData({ abi, functionName: "decreaseLiquidity", args: [{ tokenId: 42n, liquidity: BigInt(liquidity), amount0Min: 0n, amount1Min: 0n, deadline }] });
  else if (kind === "collect") data = encodeFunctionData({ abi, functionName: "collect", args: [{ tokenId: 42n, recipient: wallet, amount0Max: 2n**128n-1n, amount1Max: 2n**128n-1n }] });
  else data = encodeFunctionData({ abi, functionName: "burn", args: [42n] });
  const study = parseTestnetLpStudy({ contextId: "aa".repeat(24), intent, status: "prepared", reason: null, actionKind: kind, approvalToken: kind === "approve" || kind === "reset" ? "USDC" : null, plan,
    transaction: { chainId: 84532, from: wallet, to: kind === "approve" || kind === "reset" ? C.USDC.address : C.v3PositionManager, data, value: "0", nonce: "7", gas: "120000", gasPrice: "20000000" },
    gas: { estimatedGas: "100000", gasLimit: "120000", gasPrice: "20000000", l2FeeCeiling: "2400000000000", l1FeeUpperBound: "100", operatorFeeUpperBound: "0", totalFeeBudget: "2400000000200", totalFeeQualified: true, fork: "jovian" },
    balances: { USDC: "5000000", WETH: "50000000000000000", ETH: "10000000000000000" }, allowances: { USDC: kind === "reset" ? "12" : kind === "approve" ? "0" : "1000000", WETH: "1000000000000000" },
    blockNumber: "123", blockHash: `0x${"ab".repeat(32)}`, observedAt: new Date(LP_NOW).toISOString(), expiresAt: new Date(LP_NOW+120000).toISOString(), source: "base-sepolia-rpc", runtimeVerified: true, executionEnabled: true }, LP_NOW);
  const observation: TestnetLpReceipt = { contextId: study.contextId!, hash: LP_HASH, intent, actionKind: kind, approvalToken: study.approvalToken, chainId: 84532, source: "base-sepolia-rpc", observedAt: new Date(LP_NOW).toISOString(), blockNumber: "125", blockHash: `0x${"cd".repeat(32)}`, receiptBlockNumber: "124", receiptBlockHash: `0x${"ef".repeat(32)}`, status: "confirmed", confirmations: "2", diagnostic: null, verified: true, tokenId: action === "mint" && kind !== "mint" ? null : "42", amount0: kind === "mint" || kind === "increase" ? "500000" : "0", amount1: kind === "mint" || kind === "increase" ? "500000000000000" : "0", actualTotalFeeQualified: false, executionEnabled: false };
  return { study, observation, intent, now: LP_NOW };
}
