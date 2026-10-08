import { validateTestnetFeeFields, type TestnetFeeFields } from "@vezta-dex/core";

export interface ObservedTestnetFees {
  type: string;
  gasPrice?: bigint | null;
  maxFeePerGas?: bigint | null;
  maxPriorityFeePerGas?: bigint | null;
  accessList?: readonly unknown[] | null;
  authorizationList?: readonly unknown[] | null;
}
export function matchesTestnetFeeEnvelope(observed: ObservedTestnetFees, reviewed: TestnetFeeFields): boolean {
  try {
    validateTestnetFeeFields(reviewed);
    if ((observed.accessList != null && (!Array.isArray(observed.accessList) || observed.accessList.length !== 0))
      || (observed.authorizationList != null && (!Array.isArray(observed.authorizationList) || observed.authorizationList.length !== 0))) return false;
    if (reviewed.feeModel === "eip1559") return observed.type === "eip1559"
      && observed.maxFeePerGas === BigInt(reviewed.maxFeePerGas!)
      && observed.maxPriorityFeePerGas === BigInt(reviewed.maxPriorityFeePerGas!);
    return observed.type === "legacy" && observed.gasPrice === BigInt(reviewed.gasPrice)
      && observed.maxFeePerGas == null && observed.maxPriorityFeePerGas == null;
  } catch { return false; }
}
export function matchesTestnetReceiptGasPrice(effective: bigint, reviewed: TestnetFeeFields, baseFee?: bigint): boolean {
  try {
    validateTestnetFeeFields(reviewed);
    if (typeof effective !== "bigint" || effective <= 0n) return false;
    const cap = BigInt(reviewed.gasPrice);
    if (reviewed.feeModel !== "eip1559") return effective === cap;
    if (typeof baseFee !== "bigint" || baseFee < 0n || baseFee > cap) return false;
    const sum = baseFee + BigInt(reviewed.maxPriorityFeePerGas!);
    return effective === (sum < cap ? sum : cap);
  } catch { return false; }
}
