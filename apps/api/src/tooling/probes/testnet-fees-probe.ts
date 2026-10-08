import { BASE_SEPOLIA_CANDIDATE as C, planTestnetTokenApproval } from "@vezta-dex/core";
import { completeTestnetFeeBudget, planTestnetGas, TestnetFeeError, type TestnetFeeSource } from "../../modules/transaction/testnet-fees";
import type { BaseSepoliaWalletSource } from "../../modules/wallet/testnet-wallet-state";
import type { TestnetRpcDiagnosticSnapshot } from "../../infrastructure/rpc/testnet-rpc-diagnostics";

type Source = Pick<BaseSepoliaWalletSource, "getChainId" | "getLatestBlock" | "getBlockHash">
  & TestnetFeeSource & { getGasPrice(): Promise<bigint> };
class ProbeError extends Error { constructor(readonly code: string) { super(code); } }

export async function runTestnetFeesProbe(createSource: (signal: AbortSignal) => Source, now = Date.now,
  diagnostics?: () => TestnetRpcDiagnosticSnapshot) {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = async () => {
      const source = createSource(controller.signal);
      if (await source.getChainId() !== 84532) throw new ProbeError("TESTNET_WRONG_CHAIN");
      const block = await source.getLatestBlock();
      const fresh = () => {
        controller.signal.throwIfAborted(); const time = Number(block.timestamp) * 1000; const clock = now();
        if (!Number.isSafeInteger(clock) || !Number.isSafeInteger(time) || time <= 0 || block.number <= 0n
          || time > clock + 10000 || clock - time >= 30000 || !/^0x[0-9a-fA-F]{64}$/.test(block.hash)
          || BigInt(block.hash) === 0n) throw new ProbeError("TESTNET_FEES_STALE");
      };
      fresh();
      const plan = planTestnetTokenApproval({ chainId: 84532, wallet: "0x1111111111111111111111111111111111111111",
        tokenIn: C.USDC.address, tokenOut: C.WETH.address, amountIn: "1000000", slippageBps: 50 }, 0n);
      if (plan.kind === "ready") throw new ProbeError("TESTNET_FEE_INVALID");
      const gas = planTestnetGas(50000n, await source.getGasPrice(), "approval");
      const fees = await source.getAdditionalFees(plan.transaction, 0n, gas.gasLimit, gas.gasPrice, block.number);
      const budget = completeTestnetFeeBudget(gas, fees);
      if ((await source.getBlockHash(block.number)).toLowerCase() !== block.hash.toLowerCase()) throw new ProbeError("TESTNET_BLOCK_CHANGED");
      fresh();
      return { status: "testnet-fee-model-read-only", chainId: 84532, blockNumber: block.number.toString(),
        observedAt: new Date(Number(block.timestamp) * 1000).toISOString(), referenceOnly: true,
        referenceGasLimit: budget.gasLimit, model: fees.fork, l1FeeUpperBound: budget.l1FeeUpperBound,
        operatorFeeUpperBound: budget.operatorFeeUpperBound, totalFeeBudget: budget.totalFeeBudget, executionEnabled: false };
    };
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ProbeError("TESTNET_FEES_TIMEOUT")); }, 25000);
    });
    return await Promise.race([work(), timeout]);
  } catch (error) {
    return { status: "testnet-fee-model-unavailable", code: error instanceof ProbeError || error instanceof TestnetFeeError
      ? error.code : "TESTNET_RPC_UNAVAILABLE", ...(diagnostics ? { rpcDiagnostics: diagnostics() } : {}) };
  } finally { clearTimeout(timer); controller.abort(); }
}
