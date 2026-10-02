const messages: Record<string,string> = {
  TESTNET_LP_CONTEXT_UNAVAILABLE: "Original tracking context is unavailable or expired. Keep the hash and recovery record; ask for review before continuing.",
  TESTNET_LP_CONTEXT_HASH_CHANGED: "This hash differs from the original tracked transaction. Keep the original hash and ask for review.",
  TESTNET_LP_CONTEXT_ATTEMPTED: "This study already has an original transaction. Recover that transaction instead of sending again.",
  TESTNET_LP_TIMEOUT: "The Base Sepolia check timed out. Wait a moment, then retry the explicit check.",
  TESTNET_LP_BUSY: "Another LP check is running. Wait for it to finish, then retry explicitly.",
  TESTNET_LP_EXPIRED: "The LP review expired. Request and review a fresh study.",
  TESTNET_LP_STALE: "The chain snapshot is stale. Request a fresh LP study.",
  TESTNET_LP_NONCE_CHANGED: "Your wallet nonce changed. Request and review a fresh LP study.",
  TESTNET_LP_OWNER_CHANGED: "This wallet no longer owns the selected NFT. Check the owner and request a fresh study.",
  TESTNET_LP_EOA_REQUIRED: "Select a standard Base Sepolia account. Smart accounts are unavailable in this demo.",
  TESTNET_LP_TOKEN_BALANCE_LOW: "Your test token balance is too low for this deposit. Reduce the caps or fund the wallet, then study again.",
  TESTNET_LP_TOTAL_BUDGET_LOW: "Your Base Sepolia ETH balance does not cover the complete network fee budget. Fund test ETH, then study again.",
  TESTNET_LP_FEES_CHANGED: "Network fees changed beyond the reviewed budget. Request and review a fresh study.",
  TESTNET_LP_STATE_CHANGED: "The pool or position changed. Request a fresh study before signing.",
  TESTNET_LP_BLOCK_CHANGED: "The pinned chain block changed. Request a fresh study before signing.",
  TESTNET_LP_BURN_BLOCKED: "This NFT still has liquidity or owed tokens. Remove liquidity, collect tokens, then study closing again.",
  TESTNET_LP_LIQUIDITY_LOW: "This position has insufficient liquidity for the requested removal.",
  TESTNET_LP_WRONG_CHAIN: "Select Base Sepolia (84532) in MetaMask and connect again.",
  TESTNET_LP_RPC_UNAVAILABLE: "Base Sepolia RPC is unavailable. Check the API terminal and retry explicitly.",
  TESTNET_LP_RUNTIME_MISMATCH: "Contract runtime verification failed. Check local API configuration before continuing.",
  TESTNET_LP_STORAGE_UNAVAILABLE: "LP tracking storage is unavailable. Preserve the original hash and check local API storage.",
  TESTNET_LP_SIMULATION_FAILED: "The LP simulation failed. Check the selected NFT and balances, then request a fresh study.",
  TESTNET_LP_CONTEXT_CAPACITY: "LP tracking capacity is full. Resolve original transactions before starting another action.",
};
export const safeTestnetLpCode = (v: unknown) => typeof v === "string" && Object.hasOwn(messages,v) ? v : "TESTNET_BROWSER_UNAVAILABLE";
export function testnetLpMessage(code: string, recovery = false) {
  const message = messages[safeTestnetLpCode(code)] ?? (recovery ? "The original transaction check is unavailable. Keep its context and hash; retry the explicit receipt check later." : "The LP action is unavailable. Check wallet, balances and Base Sepolia, then request a fresh study.");
  return recovery ? `${message} Preserve the original transaction; do not resend.` : message;
}
