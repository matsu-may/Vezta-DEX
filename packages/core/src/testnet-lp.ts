import { z } from "zod";
import { getAddress, isAddress } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C } from "./testnet";
import { TESTNET_SWAP_POLICY as P } from "./testnet-swap";
const address = z.string().refine(v => isAddress(v)).transform(v => getAddress(v));
const uint = (bits = 256) => z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(v => BigInt(v) < 2n ** BigInt(bits));
const positive = uint().refine(v => BigInt(v) > 0n);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v => BigInt(v) > 0n);
const tick = z.number().int().min(-887220).max(887220).refine(v => v % 60 === 0);
const amounts = z.object({ USDC: uint(), WETH: uint() }).strict();
export const testnetLpSnapshotSchema = z.object({ number: positive, hash, observedAt: z.iso.datetime() }).strict();
export const testnetLpRequestSchema = z.object({ chainId: z.literal(84532),
  owner: address.refine(v => !["0x0000000000000000000000000000000000000000", C.v3PositionManager, C.USDC.address, C.WETH.address, P.pool].some(a => a.toLowerCase() === v.toLowerCase())),
  cursor: uint().refine(v => BigInt(v) <= 1000000n), limit: z.number().int().min(1).max(5),
  snapshot: testnetLpSnapshotSchema.optional(),
}).strict().refine(v => v.cursor === "0" || v.snapshot !== undefined);
export const testnetLpPositionSchema = z.object({ tokenId: positive, tickLower: tick, tickUpper: tick,
  liquidity: uint(128), inRange: z.boolean(), state: z.enum(["active", "out-of-range", "empty"]),
  currentAmounts: amounts, newFeesSinceCheckpoint: amounts, storedOwed: amounts, collectable: amounts,
}).strict().superRefine((p, ctx) => {
  if (p.tickLower >= p.tickUpper || p.state !== (p.liquidity === "0" ? "empty" : p.inRange ? "active" : "out-of-range")) ctx.addIssue({ code: "custom", message: "Invalid LP state" });
  for (const token of ["USDC", "WETH"] as const) {
    if (BigInt(p.collectable[token]) !== BigInt(p.storedOwed[token]) + BigInt(p.newFeesSinceCheckpoint[token])
      || BigInt(p.collectable[token]) >= 2n ** 128n || (p.liquidity === "0" && (p.currentAmounts[token] !== "0" || p.newFeesSinceCheckpoint[token] !== "0"))) ctx.addIssue({ code: "custom", message: "Invalid LP amounts" });
  }
});
export const testnetLpPageSchema = z.object({ chainId: z.literal(84532), manager: address.refine(v => v === getAddress(C.v3PositionManager)),
  pool: address.refine(v => v === getAddress(P.pool)), owner: address, snapshot: testnetLpSnapshotSchema,
  source: z.literal("base-sepolia-rpc"), cursor: uint(), scanned: z.number().int().min(0).max(5),
  totalOwned: uint().refine(v => BigInt(v) <= 1000000n), nextCursor: uint().nullable(), incomplete: z.boolean(),
  poolTick: z.number().int().min(-887272).max(887271), sqrtPriceX96: positive,
  positions: z.array(testnetLpPositionSchema).max(5), runtimeVerified: z.literal(true), executionEnabled: z.literal(false),
}).strict().superRefine((p, ctx) => {
  const end = BigInt(p.cursor) + BigInt(p.scanned), count = BigInt(p.totalOwned);
  if (end > count || p.incomplete !== (end < count) || p.nextCursor !== (end < count ? end.toString() : null)
    || p.positions.length > p.scanned || new Set(p.positions.map(v => v.tokenId)).size !== p.positions.length
    || p.positions.some(v => v.inRange !== (p.poolTick >= v.tickLower && p.poolTick < v.tickUpper))) ctx.addIssue({ code: "custom", message: "Invalid LP page" });
});
export type TestnetLpRequest = z.infer<typeof testnetLpRequestSchema>;
export type TestnetLpPage = z.infer<typeof testnetLpPageSchema>;
export function parseTestnetLpPage(value: unknown, now = Date.now()): TestnetLpPage {
  const p = testnetLpPageSchema.parse(value); const observed = Date.parse(p.snapshot.observedAt);
  if (!Number.isSafeInteger(now) || observed > now + 10000 || now - observed >= 120000) throw new Error("Stale LP scan");
  return p;
}
