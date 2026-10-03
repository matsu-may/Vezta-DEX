import { formatUnits } from "viem";
import type { TestnetFeeFields } from "@vezta-dex/core";

/** Display the already validated reviewed fee envelope; caps are not charged prices. */
export function TestnetFeeReview({ fees }: { fees: TestnetFeeFields }) {
  const gwei = (value: string) => `${formatUnits(BigInt(value), 9)} gwei`;
  return <>
    <div><dt>Fee model</dt><dd>{fees.feeModel === "eip1559" ? "EIP-1559" : "Legacy"}</dd></div>
    {fees.feeModel === "eip1559" ? <>
      <div><dt>Maximum fee per gas</dt><dd>{gwei(fees.maxFeePerGas!)}</dd></div>
      <div><dt>Maximum priority fee per gas</dt><dd>{gwei(fees.maxPriorityFeePerGas!)}</dd></div>
    </> : <div><dt>Gas price</dt><dd>{gwei(fees.gasPrice)}</dd></div>}
  </>;
}
