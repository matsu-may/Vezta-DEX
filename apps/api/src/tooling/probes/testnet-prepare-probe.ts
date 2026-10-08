import { BASE_SEPOLIA_CANDIDATE as C, parseTestnetSwapIntent } from "@vezta-dex/core";
import { TestnetPreparationError, type TestnetSwapPreparer } from "../../modules/swap/testnet-swap-preparation";
import { TestnetQuoteError, type TestnetSwapQuoteReader } from "../../modules/swap/testnet-swap-quote";
import type { TestnetRpcDiagnosticSnapshot } from "../../infrastructure/rpc/testnet-rpc-diagnostics";

export async function runTestnetPrepareProbe(wallet: unknown,
  create: () => { quotes: TestnetSwapQuoteReader; preparer: TestnetSwapPreparer },
  readDiagnostics?: () => TestnetRpcDiagnosticSnapshot) {
  const inputs = [
    { direction: "USDC_TO_WETH", tokenIn: C.USDC.address, tokenOut: C.WETH.address, amountIn: "1000000" },
    { direction: "WETH_TO_USDC", tokenIn: C.WETH.address, tokenOut: C.USDC.address, amountIn: "100000000000000" },
  ];
  let intents;
  try { intents = inputs.map(({ tokenIn, tokenOut, amountIn }) => parseTestnetSwapIntent({
    chainId: 84532, wallet, tokenIn, tokenOut, amountIn, slippageBps: 50,
  })); } catch { return [{ status: "testnet-swap-preparation-unavailable", code: "TESTNET_INTENT_INVALID" }]; }
  const rows: object[] = [];
  for (const [index, intent] of intents.entries()) {
    try {
      const { quotes, preparer } = create();
      const quote = await quotes.read(intent);
      const result = await preparer.read({ intent, quoteId: quote.quoteId });
      rows.push({ status: "testnet-swap-preparation-study", direction: inputs[index].direction, chainId: result.chainId,
        blockNumber: result.blockNumber, observedAt: result.observedAt, expiresAt: result.expiresAt,
        studyStatus: result.status, reason: result.reason, approvalKind: result.approvalKind,
        funding: result.funding, runtimeVerified: result.runtimeVerified,
        simulationSucceeded: result.simulation?.status === "success", gasEstimated: result.gas !== null,
        totalFeeQualified: result.gas?.totalFeeQualified ?? false, transactionPresent: result.transaction !== null,
        quoteIdMatches: result.quoteId === quote.quoteId, executionEnabled: result.executionEnabled });
    } catch (error) {
      rows.push({ status: "testnet-swap-preparation-unavailable", direction: inputs[index].direction,
        code: error instanceof TestnetPreparationError || error instanceof TestnetQuoteError ? error.code : "TESTNET_RPC_UNAVAILABLE",
        ...(readDiagnostics ? { rpcDiagnostics: readDiagnostics() } : {}) });
      break;
    }
  }
  return rows;
}
