import { toHex, type Hex } from "viem";
import { z } from "zod";

/** gasPrice is the reviewed per-gas budget ceiling, including for type-2 plans. */
export type TestnetFeeFields = {
  gasPrice: string;
  feeModel?: "eip1559";
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

const feePattern = /^[1-9][0-9]{0,12}$/;
const fee = z.string().regex(feePattern).refine(v => feePattern.test(v) && BigInt(v) <= 2000000000000n);
/** Passthrough permits validating the fee descriptor on a larger reviewed DTO. */
export const testnetFeeFieldsSchema = z.object({
  gasPrice: fee,
  feeModel: z.literal("eip1559").optional(),
  maxFeePerGas: fee.optional(),
  maxPriorityFeePerGas: fee.optional(),
}).passthrough().superRefine((v, ctx) => {
  const fields = [v.feeModel, v.maxFeePerGas, v.maxPriorityFeePerGas];
  if (fields.every(f => f === undefined)) return;
  if (fields.some(f => f === undefined) || v.maxFeePerGas !== v.gasPrice
    || !feePattern.test(v.maxPriorityFeePerGas!) || !feePattern.test(v.maxFeePerGas!)
    || BigInt(v.maxPriorityFeePerGas!) > BigInt(v.maxFeePerGas!)) {
    ctx.addIssue({ code: "custom", message: "Invalid coupled testnet fee descriptor" });
  }
});

export function validateTestnetFeeFields(value: unknown): void {
  testnetFeeFieldsSchema.parse(value);
}

export function testnetRpcFeeFields(value: unknown):
  { type: "0x0"; gasPrice: Hex } | { type: "0x2"; maxFeePerGas: Hex; maxPriorityFeePerGas: Hex } {
  const fees = testnetFeeFieldsSchema.parse(value);
  return fees.feeModel === "eip1559"
    ? { type: "0x2", maxFeePerGas: toHex(BigInt(fees.maxFeePerGas!)), maxPriorityFeePerGas: toHex(BigInt(fees.maxPriorityFeePerGas!)) }
    : { type: "0x0", gasPrice: toHex(BigInt(fees.gasPrice)) };
}

export function sameTestnetFeeFields(a: unknown, b: unknown): boolean {
  const first = testnetFeeFieldsSchema.safeParse(a), second = testnetFeeFieldsSchema.safeParse(b);
  if (!first.success || !second.success) return false;
  return first.data.gasPrice === second.data.gasPrice && first.data.feeModel === second.data.feeModel
    && first.data.maxFeePerGas === second.data.maxFeePerGas
    && first.data.maxPriorityFeePerGas === second.data.maxPriorityFeePerGas;
}
