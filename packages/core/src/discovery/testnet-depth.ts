import { z } from "zod";
import { BASE_SEPOLIA_CHAIN_ID } from "../chains/testnet";

const uint = z.string().regex(/^[1-9][0-9]{0,77}$/).refine(value => BigInt(value) < 2n ** 256n);
const sampleSchema = z.object({
  direction: z.enum(["USDC_TO_WETH", "WETH_TO_USDC"]), amountIn: uint,
  available: z.boolean(), amountOut: uint.nullable(), spotAmountOutAfterFee: uint.nullable(),
  priceImpactBps: z.number().int().min(0).max(10000).nullable(),
  quoterGasEstimate: uint.nullable(), initializedTicksCrossed: z.number().int().min(0).max(1774544).nullable(),
  withinImpactLimit: z.boolean(), code: z.enum(["QUOTE_UNAVAILABLE", "QUOTE_INVALID"]).optional(),
}).strict().refine(sample => {
  if (!sample.available) return sample.code !== undefined && !sample.withinImpactLimit
    && sample.amountOut === null && sample.spotAmountOutAfterFee === null
    && sample.priceImpactBps === null && sample.quoterGasEstimate === null && sample.initializedTicksCrossed === null;
  if (sample.code !== undefined || sample.amountOut === null || sample.spotAmountOutAfterFee === null
    || sample.priceImpactBps === null || sample.quoterGasEstimate === null || sample.initializedTicksCrossed === null) return false;
  const out = BigInt(sample.amountOut); const spot = BigInt(sample.spotAmountOutAfterFee);
  if (out > spot) return false;
  const impact = Number(((spot - out) * 10000n + spot - 1n) / spot);
  return impact === sample.priceImpactBps && sample.withinImpactLimit === (impact <= 100);
});

export const TESTNET_DEPTH_INPUTS = ["100000", "1000000", "5000000",
  "10000000000000", "100000000000000", "1000000000000000"] as const;

const poolSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(value => BigInt(value) !== 0n),
  feeTier: z.union([z.literal(100), z.literal(500), z.literal(3000), z.literal(10000)]),
  depthQualified: z.boolean(), samples: z.array(sampleSchema).length(6),
}).strict().refine(pool => pool.samples.every((sample, i) => sample.amountIn === TESTNET_DEPTH_INPUTS[i]
  && sample.direction === (i < 3 ? "USDC_TO_WETH" : "WETH_TO_USDC"))
  && pool.depthQualified === pool.samples.every(sample => sample.available && sample.withinImpactLimit));

export const testnetDepthSchema = z.object({
  chainId: z.literal(BASE_SEPOLIA_CHAIN_ID), source: z.literal("base-sepolia-rpc"),
  blockNumber: uint, blockHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), observedAt: z.iso.datetime(),
  maxPriceImpactBps: z.literal(100), pools: z.array(poolSchema).max(4),
  candidateFeeTiers: z.array(z.number().int()).max(4), depthQualified: z.boolean(),
}).strict().refine(report => {
  const fees = report.pools.map(pool => pool.feeTier);
  const addresses = report.pools.map(pool => pool.address.toLowerCase());
  const candidates = report.pools.filter(pool => pool.depthQualified).map(pool => pool.feeTier);
  return new Set(fees).size === fees.length && new Set(addresses).size === addresses.length
    && report.depthQualified === (candidates.length > 0)
    && candidates.length === report.candidateFeeTiers.length
    && candidates.every((fee, i) => fee === report.candidateFeeTiers[i]);
});

export type TestnetDepthReport = z.infer<typeof testnetDepthSchema>;
export function parseTestnetDepth(value: unknown, nowMs = Date.now()): TestnetDepthReport {
  const report = testnetDepthSchema.parse(value);
  const age = nowMs - Date.parse(report.observedAt);
  if (!Number.isFinite(nowMs) || age > 600000 || age < -60000) throw new Error("Stale testnet depth report");
  return report;
}
