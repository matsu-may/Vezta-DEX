import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { encodeFunctionData, keccak256, parseAbi, toFunctionSelector,
  type Abi, type AbiFunction, type AbiParameter, type Address, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, buildTestnetSwapTransaction } from "@vezta-dex/core";

export const TESTNET_ARTIFACT_MANIFEST = [
  { role: "router", address: P.router, packageName: "@uniswap/swap-router-contracts", version: "1.1.0",
    sourceName: "contracts/SwapRouter02.sol", contractName: "SwapRouter02",
    sha256: "210a7bf29f26de9f45d35dac1214943eca41c3a002007dd6a0e1aa870bf2d2d1" },
  { role: "quoter", address: C.v3QuoterV2, packageName: "@uniswap/swap-router-contracts", version: "1.1.0",
    sourceName: "contracts/lens/QuoterV2.sol", contractName: "QuoterV2",
    sha256: "9d0b8700b8b144aced9b5dd95bce4a68e03eb9a809eac53ac2e3ce739cc7d289" },
  { role: "factory", address: C.v3Factory, packageName: "@uniswap/v3-core", version: "1.0.0",
    sourceName: "contracts/UniswapV3Factory.sol", contractName: "UniswapV3Factory",
    sha256: "599479f60ebb056804aff7b2d05bdd0830ddbb1fdfaa0b6c62c02294ca7188b0" },
  { role: "pool", address: P.pool, packageName: "@uniswap/v3-core", version: "1.0.0",
    sourceName: "contracts/UniswapV3Pool.sol", contractName: "UniswapV3Pool",
    sha256: "204fb2fa7ad1a639b1df5601f035f9924b064b721b97adf60c7d5d4712643e34" },
  { role: "manager", address: C.v3PositionManager, packageName: "@uniswap/v3-periphery", version: "1.0.0",
    sourceName: "contracts/NonfungiblePositionManager.sol", contractName: "NonfungiblePositionManager",
    sha256: "bb4f9f1ca393293831e73db52c5425cc336b49dbda2cd9cd2708c4c885221675" },
] as const;
export type TestnetArtifactRole = typeof TESTNET_ARTIFACT_MANIFEST[number]["role"];
export class TestnetArtifactError extends Error {
  constructor(readonly code: "ARTIFACT_INVALID" | "ARTIFACT_VERSION_MISMATCH" | "ARTIFACT_BYTES_CHANGED"
    | "ARTIFACT_ABI_MISMATCH" | "ARTIFACT_CALLDATA_MISMATCH" | "ARTIFACT_NOT_INSTALLED" | "ARTIFACT_READ_UNAVAILABLE") {
    super(code);
  }
}
export interface TestnetArtifactInput { role: string; packageVersion: string; bytes: string }
export interface PinnedTestnetArtifact {
  role: TestnetArtifactRole; address: Address; packageName: string; version: string;
  sha256: string; abi: Abi; runtimeBytecode: Hex;
}

export function inspectTestnetArtifactInputs(inputs: readonly TestnetArtifactInput[]): PinnedTestnetArtifact[] {
  if (inputs.length !== 5 || new Set(inputs.map(i => i.role)).size !== 5) throw new TestnetArtifactError("ARTIFACT_INVALID");
  return TESTNET_ARTIFACT_MANIFEST.map(definition => {
    const input = inputs.find(i => i.role === definition.role);
    if (!input || Buffer.byteLength(input.bytes) > 2000000) throw new TestnetArtifactError("ARTIFACT_INVALID");
    if (input.packageVersion !== definition.version) throw new TestnetArtifactError("ARTIFACT_VERSION_MISMATCH");
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    if (sha256 !== definition.sha256) throw new TestnetArtifactError("ARTIFACT_BYTES_CHANGED");
    const artifact = JSON.parse(input.bytes);
    if (artifact._format !== "hh-sol-artifact-1" || artifact.contractName !== definition.contractName
      || artifact.sourceName !== definition.sourceName || !Array.isArray(artifact.abi) || artifact.abi.length > 256
      || typeof artifact.deployedBytecode !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(artifact.deployedBytecode)) {
      throw new TestnetArtifactError("ARTIFACT_INVALID");
    }
    return { role: definition.role, address: definition.address, packageName: definition.packageName,
      version: definition.version, sha256, abi: artifact.abi as Abi, runtimeBytecode: artifact.deployedBytecode as Hex };
  });
}

export function loadPinnedTestnetArtifacts(): PinnedTestnetArtifact[] {
  const require = createRequire(import.meta.url);
  const read = (path: string) => {
    if (statSync(path).size > 2000000) throw new TestnetArtifactError("ARTIFACT_INVALID");
    return readFileSync(path, "utf8");
  };
  try {
    return inspectTestnetArtifactInputs(TESTNET_ARTIFACT_MANIFEST.map(definition => {
      const pkg = JSON.parse(read(require.resolve(`${definition.packageName}/package.json`)));
      if (pkg.name !== definition.packageName) throw new TestnetArtifactError("ARTIFACT_INVALID");
      return { role: definition.role, packageVersion: pkg.version,
        bytes: read(require.resolve(`${definition.packageName}/artifacts/${definition.sourceName}/${definition.contractName}.json`)) };
    }));
  } catch (error) {
    if (error instanceof TestnetArtifactError) throw error;
    throw new TestnetArtifactError(error instanceof Error && "code" in error && error.code === "MODULE_NOT_FOUND"
      ? "ARTIFACT_NOT_INSTALLED" : "ARTIFACT_READ_UNAVAILABLE");
  }
}

const expectedSwap = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])",
]);
const expectedQuoter = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
function parameterShape(parameter: AbiParameter, names: boolean): unknown {
  return { type: parameter.type, ...(names ? { name: parameter.name ?? "" } : {}),
    ...("components" in parameter ? { components: parameter.components.map(p => parameterShape(p, names)) } : {}) };
}
function checkFunctions(actual: Abi, expected: readonly AbiFunction[]): void {
  for (const wanted of expected) {
    const candidates = actual.filter((entry): entry is AbiFunction => entry.type === "function" && entry.name === wanted.name);
    const found = candidates.find(entry => toFunctionSelector(entry) === toFunctionSelector(wanted));
    if (!found || found.stateMutability !== wanted.stateMutability
      || JSON.stringify(found.inputs.map(p => parameterShape(p, true))) !== JSON.stringify(wanted.inputs.map(p => parameterShape(p, true)))
      || JSON.stringify(found.outputs.map(p => parameterShape(p, false))) !== JSON.stringify(wanted.outputs.map(p => parameterShape(p, false)))) {
      throw new TestnetArtifactError("ARTIFACT_ABI_MISMATCH");
    }
  }
}
export function assertTestnetArtifactAbi(router: Abi, quoter: Abi): void {
  try { checkFunctions(router, expectedSwap); checkFunctions(quoter, expectedQuoter); }
  catch { throw new TestnetArtifactError("ARTIFACT_ABI_MISMATCH"); }
}

export function reviewTestnetArtifactBundle(bundle: readonly PinnedTestnetArtifact[]) {
  const router = bundle.find(a => a.role === "router"); const quoter = bundle.find(a => a.role === "quoter");
  if (!router || !quoter || bundle.length !== 5) throw new TestnetArtifactError("ARTIFACT_INVALID");
  assertTestnetArtifactAbi(router.abi, quoter.abi);
  // Deterministic fixture encoding only; no live execution quote is manufactured or stored.
  const calldataChecks = [false, true].map(reverse => {
    const quote = { chainId: 84532, wallet: "0x1111111111111111111111111111111111111111",
      tokenIn: reverse ? C.WETH.address : C.USDC.address, tokenOut: reverse ? C.USDC.address : C.WETH.address,
      amountIn: reverse ? "100000000000000" : "1000000", slippageBps: 50, protocol: "v3", pool: P.pool,
      feeTier: 3000, amountOut: reverse ? "15673" : "6341123394523806",
      minimumAmountOut: reverse ? "15594" : "6309417777551186", blockNumber: "123",
      blockHash: `0x${"ab".repeat(32)}`, observedAt: "2026-10-01T09:59:58.000Z", source: "base-sepolia-rpc" };
    const transaction = buildTestnetSwapTransaction(quote, Date.parse("2026-10-01T10:00:00.000Z"));
    const swap = encodeFunctionData({ abi: router.abi, functionName: "exactInputSingle", args: [{
      tokenIn: quote.tokenIn, tokenOut: quote.tokenOut, fee: 3000, recipient: quote.wallet,
      amountIn: BigInt(quote.amountIn), amountOutMinimum: BigInt(quote.minimumAmountOut), sqrtPriceLimitX96: 0n,
    }] });
    const canonical = encodeFunctionData({ abi: router.abi, functionName: "multicall", args: [1790848828n, [swap]] });
    if (transaction.data !== canonical) throw new TestnetArtifactError("ARTIFACT_CALLDATA_MISMATCH");
    return { direction: reverse ? "WETH_TO_USDC" : "USDC_TO_WETH", canonicalMatches: true };
  });
  return { status: "testnet-artifacts-abi-verified", fixtureOnly: true, abiCompatibilityVerified: true,
    artifacts: bundle.map(({ abi: _abi, runtimeBytecode, ...summary }) => ({ ...summary,
      runtimeBytes: (runtimeBytecode.length - 2) / 2, runtimeHash: keccak256(runtimeBytecode), immutableReferencesAvailable: false })),
    calldataChecks, runtimeVerified: false, executionEnabled: false };
}
