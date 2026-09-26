import {
  POLYGON_CHAIN_ID,
  TOKENS,
  V3_FEE_TIERS,
  parsePoolKey,
  poolKey,
  type Address,
  type PoolRecord,
} from "@vezta-dex/core";

export interface PoolChainSource {
  getBlock(): Promise<{ number: bigint; timestamp: bigint }>;
  getPoolAddress(feeTier: number, blockNumber: bigint): Promise<Address>;
  getPoolState(address: Address, blockNumber: bigint): Promise<{
    token0: Address;
    token1: Address;
    liquidity: bigint;
  }>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export class PoolReader {
  constructor(private readonly chain: PoolChainSource) {}

  async listCuratedPools(): Promise<PoolRecord[]> {
    const block = await this.chain.getBlock();
    const observedAt = new Date(Number(block.timestamp) * 1000).toISOString();
    const addresses = await Promise.all(
      V3_FEE_TIERS.map(async (feeTier) => ({
        feeTier,
        address: await this.chain.getPoolAddress(feeTier, block.number),
      })),
    );
    const existing = addresses.filter(({ address }) => address.toLowerCase() !== ZERO_ADDRESS);

    return Promise.all(existing.map(async ({ feeTier, address }) => {
      const state = await this.chain.getPoolState(address, block.number);
      if (
        state.token0.toLowerCase() !== TOKENS.USDC.address.toLowerCase() ||
        state.token1.toLowerCase() !== TOKENS.WETH.address.toLowerCase()
      ) {
        throw new Error("Unexpected pool tokens");
      }
      return {
        id: poolKey(POLYGON_CHAIN_ID, "v3", address),
        chainId: POLYGON_CHAIN_ID,
        protocol: "v3" as const,
        reference: address,
        token0: TOKENS.USDC,
        token1: TOKENS.WETH,
        feeTier,
        activeLiquidity: state.liquidity.toString(),
        tvlUsd: null,
        volume24hUsd: null,
        source: "polygon-rpc" as const,
        observedAt,
        blockNumber: block.number.toString(),
      };
    }));
  }

  async getPool(id: string): Promise<PoolRecord | null> {
    const identity = parsePoolKey(id);
    if (identity.protocol !== "v3") return null;
    const pools = await this.listCuratedPools();
    return pools.find((pool) => pool.id === poolKey(identity.chainId, identity.protocol, identity.reference)) ?? null;
  }
}
