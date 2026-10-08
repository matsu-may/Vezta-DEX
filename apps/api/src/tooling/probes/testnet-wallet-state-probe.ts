import { BASE_SEPOLIA_CANDIDATE as C, parseTestnetSwapIntent } from "@vezta-dex/core";
import { TestnetWalletStateError, type TestnetWalletStateReader } from "../../modules/wallet/testnet-wallet-state";

export async function runTestnetWalletStateProbe(wallet: unknown, createReader: () => TestnetWalletStateReader) {
  let intent;
  try { intent = parseTestnetSwapIntent({ chainId: 84532, wallet, tokenIn: C.USDC.address,
    tokenOut: C.WETH.address, amountIn: "1000000", slippageBps: 50 }); }
  catch { return { status: "testnet-wallet-state-unavailable", code: "TESTNET_INTENT_INVALID" }; }
  try {
    const state = await createReader().read(intent);
    return { status: "testnet-wallet-state-read-only", chainId: state.chainId, blockNumber: state.blockNumber,
      observedAt: state.observedAt, accountKind: state.accountKind, approvalKind: state.approvalKind,
      allowanceKind: state.tokenAllowance === "0" ? "zero" : state.approvalKind === "ready" ? "exact" : "other",
      funding: state.funding, executionEnabled: state.executionEnabled, verified: true };
  } catch (error) {
    return { status: "testnet-wallet-state-unavailable",
      code: error instanceof TestnetWalletStateError ? error.code : "TESTNET_RPC_UNAVAILABLE" };
  }
}
