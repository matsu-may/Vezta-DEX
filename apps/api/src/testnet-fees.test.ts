import { expect, it } from "vitest";
import { parseTransaction, type Hex } from "viem";
import { TESTNET_SWAP_POLICY as P, BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";

const transaction = { chainId: 84532 as const, from: "0x1111111111111111111111111111111111111111" as const,
  to: C.USDC.address, value: "0" as const, data: `0x095ea7b3${P.router.slice(2).padStart(64, "0")}${"f4240".padStart(64, "0")}` as Hex };

it("covers all three snapshot fee components and rounds execution gas upward", async () => {
  const { planTestnetGas, completeTestnetFeeBudget } = await import("./testnet-fees");
  const plan = planTestnetGas(50001n, 10000000n, "approval");
  expect(plan).toEqual({ estimatedGas: 50001n, gasLimit: 60002n, gasPrice: 20000000n });
  expect(completeTestnetFeeBudget(plan, { l1FeeUpperBound: 3000000000n, operatorFeeUpperBound: 1000000000n, fork: "jovian" }))
    .toMatchObject({ l2FeeCeiling: "1200040000000", totalFeeBudget: "1208040000000",
      l1FeeUpperBound: "3000000000", operatorFeeUpperBound: "1000000000", totalFeeQualified: true });
  expect(completeTestnetFeeBudget(plan, { l1FeeUpperBound: 1n, operatorFeeUpperBound: 0n, fork: "jovian" }).totalFeeBudget)
    .toBe("1200040000002");
});

it("serializes the actual zero-value legacy transaction without inventing nonce/gas/fees", async () => {
  const { serializeTestnetFeeEnvelope } = await import("./testnet-fees");
  const serialized = serializeTestnetFeeEnvelope(transaction, 7n, 60000n, 20000000n);
  const decoded = parseTransaction(serialized);
  expect(decoded).toMatchObject({ type: "legacy", chainId: 84532, nonce: 7,
    to: C.USDC.address.toLowerCase(), data: transaction.data.toLowerCase(), gas: 60000n, gasPrice: 20000000n });
  expect(decoded.value ?? 0n).toBe(0n);
  for (const nonce of [-1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n])
    expect(() => serializeTestnetFeeEnvelope(transaction, nonce, 60000n, 20000000n)).toThrow();
  expect(() => serializeTestnetFeeEnvelope({ ...transaction, chainId: 137 } as unknown as typeof transaction,
    7n, 60000n, 20000000n)).toThrow();
});

it("rejects invalid or excessive gas, unsupported model and unavailable additional-fee values", async () => {
  const { planTestnetGas, completeTestnetFeeBudget } = await import("./testnet-fees");
  for (const [gas, price, kind] of [[0n, 1n, "approval"], [200001n, 1n, "approval"],
    [500001n, 1n, "swap"], [21000n, 0n, "swap"], [21000n, 1000000000001n, "swap"]] as const)
    expect(() => planTestnetGas(gas, price, kind)).toThrow();
  const plan = planTestnetGas(50000n, 10000000n, "approval");
  for (const fees of [{ l1FeeUpperBound: 0n, operatorFeeUpperBound: 0n, fork: "jovian" },
    { l1FeeUpperBound: 1n, operatorFeeUpperBound: -1n, fork: "jovian" },
    { l1FeeUpperBound: 10n ** 17n + 1n, operatorFeeUpperBound: 0n, fork: "jovian" },
    { l1FeeUpperBound: 1n, operatorFeeUpperBound: 0n, fork: "unknown" }])
    expect(() => completeTestnetFeeBudget(plan, fees as Parameters<typeof completeTestnetFeeBudget>[1])).toThrow();
});
