import { z } from "zod";
import { getAddress, isAddress } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { walletHash, walletUint, type TestnetSubmission } from "./testnet-wallet-contracts";
const address = z.string().refine(v => isAddress(v)).transform(v => getAddress(v));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const bound = (v: unknown) => { if (!v) throw new Error("Historical approval binding unavailable"); };
export const historicalTestnetApprovalRequestSchema = z.object({ wallet: address, hash: walletHash }).strict();
export const historicalTestnetApprovalSchema = z.object({ wallet: address, hash: walletHash, chainId: z.literal(84532),
  kind: z.enum(["approve", "reset"]), token: address.refine(v => same(v,C.USDC.address) || same(v,C.WETH.address)),
  spender: address.refine(v => same(v,P.router)), approvedAmount: walletUint, receiptBlockNumber: walletUint.refine(v => BigInt(v) > 0n),
  receiptBlockHash: walletHash, observedAt: z.iso.datetime(), confirmations: walletUint.refine(v => BigInt(v) >= 2n), currentAllowance: walletUint,
  originalReviewAvailable: z.literal(false), status: z.literal("verified-historical-approval"), executionModel: z.literal("metamask-delegation"),
  gasPayer: address.refine(v => BigInt(v) > 0n), actualTotalFeeQualified: z.literal(false), executionEnabled: z.literal(false) }).strict()
  .refine(v => v.kind === "reset" ? v.approvedAmount === "0" : BigInt(v.approvedAmount) > 0n);
export const historicalTestnetApprovalResponseSchema = z.object({ reconciliation: historicalTestnetApprovalSchema }).strict();
export type HistoricalTestnetApproval = z.infer<typeof historicalTestnetApprovalSchema>;
export function parseHistoricalTestnetApprovalResponse(value: unknown, request: z.infer<typeof historicalTestnetApprovalRequestSchema>, now: number) {
  const { reconciliation: r } = historicalTestnetApprovalResponseSchema.parse(value);
  bound(same(r.wallet,request.wallet) && same(r.hash,request.hash));
  const observed = Date.parse(r.observedAt); bound(Number.isSafeInteger(now) && now >= 0 && observed <= now + 10000 && now - observed < 30000);
  return r;
}
export function parseHistoricalTestnetApproval(value: unknown, record: TestnetSubmission, now: number) {
  bound(record.hash && record.action.kind !== "swap");
  const r = parseHistoricalTestnetApprovalResponse(value, { wallet: record.intent.wallet, hash: record.hash! }, now);
  bound(r.kind === record.action.kind && same(r.token,record.intent.tokenIn) && same(r.spender,P.router)
    && r.approvedAmount === (record.action.kind === "reset" ? "0" : record.intent.amountIn)
    && BigInt(r.receiptBlockNumber) > BigInt(record.quote.blockNumber));
  return r;
}
