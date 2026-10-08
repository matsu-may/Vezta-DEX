import { describe, expect, it } from "vitest";
import { TOKENS, type Address } from "@vezta-dex/core";
import { LpPositionReader, type LpPositionSource } from "./lp-position";

const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const POOL = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";
const HASH = `0x${"a".repeat(64)}`;
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

function fixture(options: { reorg?: boolean; stale?: boolean; wrongOwner?: boolean; wrongPair?: boolean; count?: bigint } = {}) {
  const reads: Array<{ method: string; blockNumber?: bigint }> = [];
  const source: LpPositionSource = {
    getChainId: async () => 137,
    getPositionBlock: async request => {
      const blockNumber = "blockNumber" in request ? request.blockNumber : undefined;
      reads.push({ method: "block", blockNumber });
      return { number: 123n, timestamp: BigInt(NOW / 1000 - (options.stale ? 180 : 10)),
        hash: blockNumber && options.reorg ? `0x${"b".repeat(64)}` : HASH };
    },
    getPositionCount: async (_owner, blockNumber) => { reads.push({ method: "count", blockNumber }); return options.count ?? 2n; },
    getPositionId: async (_owner, index, blockNumber) => { reads.push({ method: `id-${index}`, blockNumber }); return index + 10n; },
    getPositionOwner: async (_id, blockNumber) => { reads.push({ method: "owner", blockNumber }); return options.wrongOwner ? TOKENS.WETH.address : OWNER; },
    getPosition: async (id, blockNumber) => {
      reads.push({ method: "position", blockNumber });
      return { token0: id === 11n || options.wrongPair ? TOKENS.WETH.address : TOKENS.USDC.address,
        token1: TOKENS.WETH.address, fee: 500, tickLower: -100, tickUpper: 200,
        liquidity: 1000n, tokensOwed0: 8n, tokensOwed1: 9n };
    },
    getPoolTick: async blockNumber => { reads.push({ method: "tick", blockNumber }); return 100; },
  };
  return { source, reads };
}

describe("read-only Polygon v3 LP positions", () => {
  it("returns only candidate-pool positions with an honest fee and amount state", async () => {
    const { source, reads } = fixture();
    const page = await new LpPositionReader(source, () => NOW).getPage({ owner: OWNER, cursor: 0n, limit: 2 });
    expect(page).toEqual({ chainId: 137, manager: MANAGER, pool: POOL, owner: OWNER,
      source: "polygon-rpc", blockNumber: "123", observedAt: new Date(NOW - 10_000).toISOString(),
      totalOwned: "2", nextCursor: null, incomplete: false,
      positions: [{ tokenId: "10", tickLower: -100, tickUpper: 200, inRange: true,
        liquidity: "1000", currentAmounts: null, uncollectedFees: null }] });
    expect(reads.filter(item => item.method !== "block").every(item => item.blockNumber === 123n)).toBe(true);
  });

  it("paginates all owner NFTs without implying a full portfolio", async () => {
    const { source } = fixture();
    const page = await new LpPositionReader(source, () => NOW).getPage({ owner: OWNER, cursor: 0n, limit: 1 });
    expect(page.positions.map(item => item.tokenId)).toEqual(["10"]);
    expect(page.nextCursor).toBe("1");
    expect(page.incomplete).toBe(true);
  });

  it("returns an empty owned-NFT page without a needless pool tick RPC", async () => {
    const { source, reads } = fixture({ count: 0n });
    source.getPoolTick = async () => { throw new Error("pool tick unavailable"); };
    const page = await new LpPositionReader(source, () => NOW).getPage({ owner: OWNER, cursor: 0n, limit: 5 });
    expect(page).toMatchObject({ totalOwned: "0", positions: [], nextCursor: null, incomplete: false });
    expect(reads.map(read => read.method)).toEqual(["block", "count", "block"]);
  });

  it("fails closed for stale or reorganized blocks and NFT owner mismatch", async () => {
    for (const options of [{ stale: true }, { reorg: true }, { wrongOwner: true }]) {
      const { source } = fixture(options);
      await expect(new LpPositionReader(source, () => NOW).getPage({ owner: OWNER, cursor: 0n, limit: 2 })).rejects.toThrow();
    }
  });

  it("does not present unrelated or malformed position data as the candidate pool", async () => {
    const { source } = fixture({ wrongPair: true });
    const page = await new LpPositionReader(source, () => NOW).getPage({ owner: OWNER, cursor: 0n, limit: 2 });
    expect(page.positions).toEqual([]);
  });
});
