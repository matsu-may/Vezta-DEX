import { POLYGON_CHAIN_ID, TOKENS, V3_POOL_500, type Address } from "@vezta-dex/core";
import type { PositionPageReader } from "./server";

export const V3_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
export const V3_LP_POOL = V3_POOL_500;
const UINT128_MAX = (1n << 128n) - 1n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

interface PositionBlock { number: bigint; timestamp: bigint; hash: string }
interface PositionState {
  token0: Address; token1: Address; fee: number; tickLower: number; tickUpper: number;
  liquidity: bigint; tokensOwed0: bigint; tokensOwed1: bigint;
}

export interface LpPositionSource {
  getChainId(): Promise<number>;
  getPositionBlock(request: { blockTag: "latest" } | { blockNumber: bigint }): Promise<PositionBlock>;
  getPositionCount(owner: Address, blockNumber: bigint): Promise<bigint>;
  getPositionId(owner: Address, index: bigint, blockNumber: bigint): Promise<bigint>;
  getPositionOwner(id: bigint, blockNumber: bigint): Promise<Address>;
  getPosition(id: bigint, blockNumber: bigint): Promise<PositionState>;
  getPoolTick(blockNumber: bigint): Promise<number>;
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const validTick = (tick: number) => Number.isInteger(tick) && Math.abs(tick) <= 887272;
const validUint128 = (value: bigint) => typeof value === "bigint" && value >= 0n && value <= UINT128_MAX;

export class LpPositionReader implements PositionPageReader {
  constructor(private readonly chain: LpPositionSource, private readonly now: () => number = Date.now) {}

  async getPage({ owner, cursor, limit }: { owner: Address; cursor: bigint; limit: number }) {
    if (!ADDRESS.test(owner) || typeof cursor !== "bigint" || cursor < 0n || cursor > 1_000_000n
      || !Number.isInteger(limit) || limit < 1 || limit > 5) throw new Error("Invalid LP page");
    if (await this.chain.getChainId() !== POLYGON_CHAIN_ID) throw new Error("Wrong Polygon chain");
    const before = await this.chain.getPositionBlock({ blockTag: "latest" });
    const observedMs = Number(before.timestamp) * 1000;
    const fresh = () => {
      const checkedAt = this.now();
      return Number.isSafeInteger(observedMs) && Number.isSafeInteger(checkedAt)
        && observedMs <= checkedAt + 5_000 && checkedAt - observedMs <= 120_000;
    };
    if (typeof before.number !== "bigint" || before.number <= 0n || !HASH.test(before.hash) || !fresh()) {
      throw new Error("Stale or invalid Polygon block");
    }
    const blockNumber = before.number;
    const count = await this.chain.getPositionCount(owner, blockNumber);
    if (typeof count !== "bigint" || count < 0n || count > 1_000_000n) throw new Error("Invalid NFT count");
    const end = cursor + BigInt(limit) < count ? cursor + BigInt(limit) : count;
    const tick = end > cursor ? await this.chain.getPoolTick(blockNumber) : null;
    if (tick !== null && !validTick(tick)) throw new Error("Invalid pool tick");
    const positions = [];
    for (let index = cursor; index < end; index++) {
      const id = await this.chain.getPositionId(owner, index, blockNumber);
      if (typeof id !== "bigint" || id <= 0n) throw new Error("Invalid NFT ID");
      const [actualOwner, position] = await Promise.all([
        this.chain.getPositionOwner(id, blockNumber), this.chain.getPosition(id, blockNumber),
      ]);
      if (!ADDRESS.test(actualOwner) || !sameAddress(actualOwner, owner)) throw new Error("NFT owner changed");
      if (!ADDRESS.test(position.token0) || !ADDRESS.test(position.token1)) throw new Error("Invalid position tokens");
      if (!sameAddress(position.token0, TOKENS.USDC.address) || !sameAddress(position.token1, TOKENS.WETH.address)
        || position.fee !== 500) continue;
      if (!validTick(position.tickLower) || !validTick(position.tickUpper)
        || position.tickLower >= position.tickUpper || position.tickLower % 10 !== 0 || position.tickUpper % 10 !== 0
        || !validUint128(position.liquidity) || !validUint128(position.tokensOwed0)
        || !validUint128(position.tokensOwed1)) throw new Error("Invalid position state");
      positions.push({ tokenId: id.toString(), tickLower: position.tickLower, tickUpper: position.tickUpper,
        inRange: tick !== null && tick >= position.tickLower && tick < position.tickUpper,
        liquidity: position.liquidity.toString(), currentAmounts: null, uncollectedFees: null });
    }
    const after = await this.chain.getPositionBlock({ blockNumber });
    if (after.number !== blockNumber || after.timestamp !== before.timestamp
      || !HASH.test(after.hash) || !sameAddress(after.hash, before.hash) || !fresh()) {
      throw new Error("Polygon block changed");
    }
    return { chainId: POLYGON_CHAIN_ID, manager: V3_POSITION_MANAGER, pool: V3_LP_POOL, owner, source: "polygon-rpc" as const,
      blockNumber: blockNumber.toString(), observedAt: new Date(observedMs).toISOString(), totalOwned: count.toString(),
      nextCursor: end < count ? end.toString() : null, incomplete: end < count, positions };
  }
}
