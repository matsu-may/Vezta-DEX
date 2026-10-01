import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseAbi, type Abi } from "viem";
import { assertTestnetArtifactAbi, inspectTestnetArtifactInputs, loadPinnedTestnetArtifacts,
  reviewTestnetArtifactBundle } from "./testnet-artifacts";

const require = createRequire(import.meta.url);
const files = [
  ["router", "@uniswap/swap-router-contracts", "artifacts/contracts/SwapRouter02.sol/SwapRouter02.json"],
  ["quoter", "@uniswap/swap-router-contracts", "artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json"],
  ["factory", "@uniswap/v3-core", "artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json"],
  ["pool", "@uniswap/v3-core", "artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json"],
  ["manager", "@uniswap/v3-periphery", "artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json"],
] as const;
function inputs() {
  return files.map(([role, pkg, path]) => ({ role, packageVersion: pkg === "@uniswap/swap-router-contracts" ? "1.1.0" : "1.0.0",
    bytes: readFileSync(require.resolve(`${pkg}/${path}`), "utf8") }));
}

it("checks the installed artifacts and both encodings without qualifying deployed runtime", () => {
  const report = reviewTestnetArtifactBundle(loadPinnedTestnetArtifacts());
  expect(report).toMatchObject({ status: "testnet-artifacts-abi-verified", fixtureOnly: true,
    abiCompatibilityVerified: true, runtimeVerified: false, executionEnabled: false,
    calldataChecks: [{ direction: "USDC_TO_WETH", canonicalMatches: true },
      { direction: "WETH_TO_USDC", canonicalMatches: true }] });
  expect(report.artifacts).toHaveLength(5);
  expect(report.artifacts.every(a => a.runtimeBytes > 0 && /^[a-f0-9]{64}$/.test(a.sha256))).toBe(true);
  expect(report.artifacts.every(a => a.immutableReferencesAvailable === false)).toBe(true);
});

it("rejects missing/duplicate roles, wrong versions, oversized and altered artifact content", () => {
  const original = inputs();
  for (const changed of [original.slice(1), [...original.slice(0, 4), original[0]],
    original.map((item, i) => i === 0 ? { ...item, packageVersion: "1.0.0" } : item),
    original.map((item, i) => i === 0 ? { ...item, bytes: item.bytes + " " } : item),
    original.map((item, i) => i === 0 ? { ...item, bytes: "x".repeat(2000001) } : item),
  ]) expect(() => inspectTestnetArtifactInputs(changed)).toThrow();
});

it("rejects original-router deadline tuples and wrong Quoter amount/fee order", () => {
  const bundle = loadPinnedTestnetArtifacts();
  const router = bundle.find(a => a.role === "router")!.abi;
  const quoter = bundle.find(a => a.role === "quoter")!.abi;
  const oldRouter = parseAbi([
    "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
    "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
  ]);
  const wrongQuoter = parseAbi([
    "function quoteExactInputSingle((address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  ]);
  expect(() => assertTestnetArtifactAbi(oldRouter, quoter)).toThrow();
  expect(() => assertTestnetArtifactAbi(router, wrongQuoter)).toThrow();
  const mutated = structuredClone(router) as unknown as Array<Record<string, unknown>>;
  const swap = mutated.find(i => i.name === "exactInputSingle")!; swap.stateMutability = "view";
  expect(() => assertTestnetArtifactAbi(mutated as unknown as Abi, quoter)).toThrow();
});
