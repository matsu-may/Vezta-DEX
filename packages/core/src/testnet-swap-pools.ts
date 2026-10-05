import { z } from "zod";
// Curated identities only. Execution separately requires independently pinned runtime
// and fresh configuration, depth, simulation and original-transaction verification.
export const TESTNET_DIRECT_POOLS = Object.freeze([
  Object.freeze({ pool: "0x57183717A087d2fe3Ad890873877244c3B96156c", feeTier: 100, tickSpacing: 1 }),
  Object.freeze({ pool: "0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0", feeTier: 500, tickSpacing: 10 }),
  Object.freeze({ pool: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad", feeTier: 3000, tickSpacing: 60 }),
  Object.freeze({ pool: "0x4664755562152EDDa3a3073850FB62835451926a", feeTier: 10000, tickSpacing: 200 }),
] as const);
export function testnetDirectPool(fee: number) {
  const selected = TESTNET_DIRECT_POOLS.find(p => p.feeTier === fee);
  if (!selected) throw new Error("Unsupported testnet direct pool");
  return selected;
}

const fee = z.union([z.literal(100), z.literal(500), z.literal(3000), z.literal(10000)]);
export const testnetRouteComparisonSchema = z.object({
  attemptedPoolCount: z.literal(4), qualifiedPoolCount: z.number().int().min(1).max(4),
  candidates: z.array(z.discriminatedUnion("status", [
    z.object({ feeTier: fee, status: z.literal("qualified"),
      amountOut: z.string().regex(/^[1-9][0-9]{0,77}$/).refine(v => BigInt(v) < 2n ** 256n),
      priceImpactBps: z.number().int().min(0).max(100) }).strict(),
    z.object({ feeTier: fee, status: z.literal("unavailable") }).strict(),
  ])).length(4),
}).strict().refine(r => new Set(r.candidates.map(c => c.feeTier)).size === 4
  && r.candidates.filter(c => c.status === "qualified").length === r.qualifiedPoolCount);
export type TestnetRouteComparison = z.infer<typeof testnetRouteComparisonSchema>;
