import { isAddress, serializeTransaction, type Hex } from "viem";
import { testnetChainConfig, validateTestnetFeeFields, type TestnetFeeFields, type TestnetSwapTransaction, type TestnetChainId } from "@vezta-dex/core";

export const TESTNET_FEE_ORACLE = "0x420000000000000000000000000000000000000F" as const;
export interface TestnetAdditionalFees { l1FeeUpperBound: bigint; operatorFeeUpperBound: bigint; fork: "jovian" }
export interface TestnetFeeSource {
  getEip1559Fees?(block: bigint): Promise<{ baseFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  getBlockBaseFee?(block: bigint): Promise<bigint>;
  getAdditionalFees(transaction: TestnetSwapTransaction<TestnetChainId> & Partial<TestnetFeeFields>, nonce: bigint, gas: bigint,
    gasPrice: bigint, block: bigint): Promise<TestnetAdditionalFees>;
}
export interface TestnetGasPlan {
  estimatedGas: bigint; gasLimit: bigint; gasPrice: bigint;
  feeModel?: "eip1559"; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint;
}
export async function planTestnetSourceGas(source: Pick<TestnetFeeSource, "getEip1559Fees"> & { getGasPrice(): Promise<bigint> },
  block: bigint, estimate: bigint, kind: "approval" | "swap" | "lp"): Promise<TestnetGasPlan> {
  if (!source.getEip1559Fees) return planTestnetGas(estimate, await source.getGasPrice(), kind);
  const quote = await source.getEip1559Fees(block);
  if (!uint(quote.baseFeePerGas) || quote.baseFeePerGas > 1000000000000n
    || !uint(quote.maxPriorityFeePerGas) || quote.maxPriorityFeePerGas === 0n) throw new TestnetFeeError();
  const maxFee = 2n * quote.baseFeePerGas + quote.maxPriorityFeePerGas;
  const bounded = planTestnetGas(estimate, (maxFee + 1n) / 2n, kind);
  return { ...bounded, gasPrice: maxFee, feeModel: "eip1559", maxFeePerGas: maxFee, maxPriorityFeePerGas: quote.maxPriorityFeePerGas };
}
export function testnetGasFeeFields(plan: TestnetGasPlan): TestnetFeeFields {
  const fields: TestnetFeeFields = { gasPrice: plan.gasPrice.toString(), ...(plan.feeModel === "eip1559"
    ? { feeModel: plan.feeModel, maxFeePerGas: plan.maxFeePerGas?.toString(), maxPriorityFeePerGas: plan.maxPriorityFeePerGas?.toString() } : {}) };
  validateTestnetFeeFields(fields); return fields;
}
export class TestnetFeeError extends Error {
  constructor(readonly code: "TESTNET_FEE_INVALID" | "TESTNET_FEE_MODEL_UNAVAILABLE" = "TESTNET_FEE_INVALID") { super(code); }
}
const uint = (value: bigint) => typeof value === "bigint" && value >= 0n && value < 2n ** 256n;

export function planTestnetGas(estimate: bigint, price: bigint, kind: "approval" | "swap" | "lp") {
  if (!uint(estimate) || estimate < 21000n || estimate > (kind === "approval" ? 200000n : kind === "lp" ? 833333n : 500000n)
    || !uint(price) || price === 0n || price > 1000000000000n) throw new TestnetFeeError();
  const gasLimit = (estimate * 120n + 99n) / 100n;
  if (gasLimit > (kind === "approval" ? 250000n : kind === "lp" ? 1000000n : 650000n)) throw new TestnetFeeError();
  return { estimatedGas: estimate, gasLimit, gasPrice: price * 2n };
}

export function serializeTestnetFeeEnvelope(transaction: TestnetSwapTransaction<TestnetChainId> & Partial<TestnetFeeFields>, nonce: bigint, gas: bigint, price: bigint): Hex {
  let config;
  try { config=testnetChainConfig(transaction.chainId); } catch { throw new TestnetFeeError(); }
  const C=config.candidate,P=config.policy;
  if (transaction.chainId !== P.chainId || transaction.value !== "0" || !isAddress(transaction.from)
    || ![C.USDC.address, C.WETH.address, P.router, C.v3PositionManager].some(a => a.toLowerCase() === transaction.to.toLowerCase())
    || !/^0x(?:[0-9a-fA-F]{2})+$/.test(transaction.data) || transaction.data.length > 4096
    || !uint(nonce) || nonce > BigInt(Number.MAX_SAFE_INTEGER) || !uint(gas) || gas < 21000n || gas > (transaction.to.toLowerCase() === C.v3PositionManager.toLowerCase() ? 1000000n : 650000n)
    || !uint(price) || price === 0n || price > 2000000000000n) throw new TestnetFeeError();
  const fields = { gasPrice: price.toString(), feeModel: transaction.feeModel, maxFeePerGas: transaction.maxFeePerGas,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas };
  if (transaction.gasPrice !== undefined && transaction.gasPrice !== fields.gasPrice) throw new TestnetFeeError();
  try { validateTestnetFeeFields(fields); } catch { throw new TestnetFeeError(); }
  const base = { chainId: P.chainId, nonce: Number(nonce), to: transaction.to, data: transaction.data, value: 0n, gas };
  return fields.feeModel === "eip1559"
    ? serializeTransaction({ ...base, type: "eip1559", maxFeePerGas: price, maxPriorityFeePerGas: BigInt(fields.maxPriorityFeePerGas!), accessList: [] })
    : serializeTransaction({ ...base, type: "legacy", gasPrice: price });
}

export function completeTestnetFeeBudget(plan: TestnetGasPlan, additional: TestnetAdditionalFees) {
  const { l1FeeUpperBound: l1, operatorFeeUpperBound: operator, fork } = additional;
  if (fork !== "jovian" || !uint(l1) || l1 === 0n || l1 > 10n ** 17n || !uint(operator) || operator > 10n ** 17n) {
    throw new TestnetFeeError();
  }
  const l2 = plan.gasLimit * plan.gasPrice; const total = l2 + 2n * (l1 + operator);
  if (total <= 0n || total >= 10n ** 18n) throw new TestnetFeeError();
  return { estimatedGas: plan.estimatedGas.toString(), gasLimit: plan.gasLimit.toString(), ...testnetGasFeeFields(plan),
    l2FeeCeiling: l2.toString(), l1FeeUpperBound: l1.toString(), operatorFeeUpperBound: operator.toString(),
    totalFeeBudget: total.toString(), totalFeeQualified: true as const, fork };
}
