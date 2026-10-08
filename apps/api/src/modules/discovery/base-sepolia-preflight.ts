import { BASE_SEPOLIA_CANDIDATE, V3_FEE_TIERS, type Address } from "@vezta-dex/core";

export { BASE_SEPOLIA_CANDIDATE };

const C = BASE_SEPOLIA_CANDIDATE;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_AGE_SECONDS = 600n;
const FUTURE_TOLERANCE_SECONDS = 60n;

export interface BaseSepoliaPreflightSource {
  getChainId(): Promise<number>;
  getLatestBlock(): Promise<{ number: bigint; timestamp: bigint; hash: `0x${string}` }>;
  getBlockHash(number: bigint): Promise<`0x${string}`>;
  getCode(address: Address, blockNumber: bigint): Promise<`0x${string}`>;
  getDecimals(token: Address, blockNumber: bigint): Promise<number>;
  getPool(feeTier: number, blockNumber: bigint): Promise<Address>;
  getPoolState(pool: Address, blockNumber: bigint): Promise<{
    token0: Address; token1: Address; factory: Address; fee: number;
    liquidity: bigint; sqrtPriceX96: bigint;
  }>;
  quoteOneUsdc(feeTier: number, blockNumber: bigint): Promise<{
    amountOut: bigint; gasEstimate: bigint;
  }>;
}

export type PreflightCode = "WRONG_CHAIN" | "STALE_BLOCK" | "MISSING_CODE" |
  "TOKEN_DECIMALS" | "POOL_IDENTITY" | "BLOCK_CHANGED";

export class BaseSepoliaPreflightError extends Error {
  constructor(readonly code: PreflightCode) { super(code); this.name = "BaseSepoliaPreflightError"; }
}

export interface BaseSepoliaPreflightResult {
  chainId: typeof C.chainId;
  blockNumber: string;
  blockHash: `0x${string}`;
  observedAt: string;
  pools: Array<{ feeTier: number; address: Address; initialized: boolean; activeLiquidityPositive: boolean;
    quoteAvailable: boolean; oneUsdcAmountOut: string | null; gasEstimate: string | null }>;
  readOnlyQualified: boolean;
}

function sameAddress(a: string, b: string): boolean { return a.toLowerCase() === b.toLowerCase(); }

export async function qualifyBaseSepoliaPools(source: BaseSepoliaPreflightSource,
  nowMs = Date.now()): Promise<BaseSepoliaPreflightResult> {
  if (await source.getChainId() !== C.chainId) throw new BaseSepoliaPreflightError("WRONG_CHAIN");
  const block = await source.getLatestBlock();
  const nowSeconds = BigInt(Math.floor(nowMs / 1000));
  if (block.number <= 0n || block.timestamp <= 0n || block.timestamp < nowSeconds - MAX_AGE_SECONDS
    || block.timestamp > nowSeconds + FUTURE_TOLERANCE_SECONDS || !/^0x[0-9a-fA-F]{64}$/.test(block.hash)) {
    throw new BaseSepoliaPreflightError("STALE_BLOCK");
  }
  const deploymentAddresses = [C.USDC.address, C.WETH.address,
    C.v3Factory, C.v3QuoterV2, C.v3PositionManager];
  for (const address of deploymentAddresses) {
    const code = await source.getCode(address, block.number);
    if (!/^0x[0-9a-fA-F]+$/.test(code) || code === "0x") {
      throw new BaseSepoliaPreflightError("MISSING_CODE");
    }
  }
  const [usdcDecimals, wethDecimals] = await Promise.all([
    source.getDecimals(C.USDC.address, block.number),
    source.getDecimals(C.WETH.address, block.number),
  ]);
  if (usdcDecimals !== C.USDC.decimals || wethDecimals !== C.WETH.decimals) {
    throw new BaseSepoliaPreflightError("TOKEN_DECIMALS");
  }

  const pools: BaseSepoliaPreflightResult["pools"] = [];
  for (const feeTier of V3_FEE_TIERS) {
    const address = await source.getPool(feeTier, block.number);
    if (sameAddress(address, ZERO_ADDRESS)) continue;
    const code = await source.getCode(address, block.number);
    if (!/^0x[0-9a-fA-F]+$/.test(code) || code === "0x") {
      throw new BaseSepoliaPreflightError("MISSING_CODE");
    }
    const state = await source.getPoolState(address, block.number);
    if (!sameAddress(state.token0, C.USDC.address) || !sameAddress(state.token1, C.WETH.address)
      || !sameAddress(state.factory, C.v3Factory) || state.fee !== feeTier
      || state.liquidity < 0n || state.sqrtPriceX96 < 0n) {
      throw new BaseSepoliaPreflightError("POOL_IDENTITY");
    }
    const initialized = state.sqrtPriceX96 > 0n;
    const activeLiquidityPositive = state.liquidity > 0n;
    if (!initialized || !activeLiquidityPositive) {
      pools.push({ feeTier, address, initialized, activeLiquidityPositive,
        quoteAvailable: false, oneUsdcAmountOut: null, gasEstimate: null });
      continue;
    }
    let quote: Awaited<ReturnType<BaseSepoliaPreflightSource["quoteOneUsdc"]>> | null = null;
    try {
      const candidate = await source.quoteOneUsdc(feeTier, block.number);
      if (candidate.amountOut > 0n && candidate.gasEstimate > 0n) quote = candidate;
    } catch { /* A pool with a reverted quote is not qualified. */ }
    pools.push({ feeTier, address, initialized, activeLiquidityPositive,
      quoteAvailable: quote !== null, oneUsdcAmountOut: quote?.amountOut.toString() ?? null,
      gasEstimate: quote?.gasEstimate.toString() ?? null });
  }
  const confirmedHash = await source.getBlockHash(block.number);
  if (!sameAddress(confirmedHash, block.hash)) throw new BaseSepoliaPreflightError("BLOCK_CHANGED");
  return { chainId: C.chainId, blockNumber: block.number.toString(), blockHash: block.hash,
    observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
    pools, readOnlyQualified: pools.some(pool => pool.quoteAvailable) };
}
