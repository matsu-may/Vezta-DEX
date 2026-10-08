import { POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, TOKENS, validateTradingIntent, type TradingIntent } from "@vezta-dex/core";
import type { SwapPreparationChainSource, UnsignedSwapTransaction } from "../swap/swap-preparation";
import { planExactApproval } from "../swap/exact-approval";
export interface WalletStateSource extends Pick<SwapPreparationChainSource, "getBlock" | "getAccountCode" | "getTokenBalance" | "getNativeBalance" | "getTokenAllowance" | "getPermitAllowance" | "getGasPrice" | "estimateSwapGas"> {
  simulateApproval(transaction: UnsignedSwapTransaction, block: bigint): Promise<void>;
  getAccountNonce(owner: `0x${string}`, block: bigint): Promise<bigint>;
  getPendingNonce(owner: `0x${string}`): Promise<bigint>;
}
export interface WalletState {
  chainId: 137;
  account: `0x${string}`;
  accountKind: "eoa" | "blocked";
  blockNumber: string;
  observedAt: string;
  accountNonce: string;
  balances: {
    USDC: string;
    WETH: string;
    POL: string;
  };
  tokenAllowance: string;
  permitAllowance: {
    amount: string;
    expiration: string;
    nonce: string;
  };
  approvalGas: {
    gas: string;
    gasPrice: string;
  } | null;
}
export type WalletStateFailureCode =
  | "WALLET_STATE_BLOCK_UNAVAILABLE"
  | "WALLET_STATE_ACCOUNT_CODE_UNAVAILABLE"
  | "WALLET_STATE_READS_UNAVAILABLE"
  | "WALLET_STATE_STALE_BLOCK"
  | "WALLET_STATE_NONCE_UNAVAILABLE"
  | "WALLET_STATE_APPROVAL_SIMULATION_UNAVAILABLE"
  | "WALLET_STATE_APPROVAL_GAS_UNAVAILABLE";
export class WalletStateUnavailableError extends Error {
  constructor(readonly code: WalletStateFailureCode) { super("Polygon wallet state is unavailable"); }
}
async function providerRead<T>(code: WalletStateFailureCode, read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch { throw new WalletStateUnavailableError(code); }
}
function uint(n: bigint, bits = 256): bigint {
  if (typeof n !== "bigint" || n < 0n || n >= 1n << BigInt(bits))
    throw new Error("Invalid wallet state");
  return n;
}
export class WalletStateReader {
  constructor(private readonly source: WalletStateSource, private readonly now: () => number = Date.now) { }
  async getState(value: TradingIntent): Promise<WalletState> {
    const intent = { ...value };
    validateTradingIntent(intent);
    const block = await providerRead("WALLET_STATE_BLOCK_UNAVAILABLE", () => this.source.getBlock());
    const fresh = () => {
      uint(block.number);
      uint(block.timestamp);
      const observed = Number(block.timestamp) * 1000;
      const now = this.now();
      if (!Number.isSafeInteger(observed) || !Number.isSafeInteger(now) || observed > now + 5000 || now - observed > 120000)
        throw new WalletStateUnavailableError("WALLET_STATE_STALE_BLOCK");
    };
    fresh();
    const code = await providerRead("WALLET_STATE_ACCOUNT_CODE_UNAVAILABLE", () => this.source.getAccountCode(intent.swapper, block.number));
    fresh();
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code))
      throw new Error("Invalid account code");
    const [usdc, weth, native, allowance, permit, nonce, pendingNonce] = await providerRead("WALLET_STATE_READS_UNAVAILABLE", () => Promise.all([
      this.source.getTokenBalance(TOKENS.USDC.address, intent.swapper, block.number),
      this.source.getTokenBalance(TOKENS.WETH.address, intent.swapper, block.number),
      this.source.getNativeBalance(intent.swapper, block.number),
      this.source.getTokenAllowance(intent.tokenIn, intent.swapper, POLYGON_PERMIT2, block.number),
      this.source.getPermitAllowance(intent.tokenIn, intent.swapper, POLYGON_UNIVERSAL_ROUTER_212, block.number),
      this.source.getAccountNonce(intent.swapper, block.number),
      this.source.getPendingNonce(intent.swapper),
    ]));
    fresh();
    try {
      if (uint(nonce) > BigInt(Number.MAX_SAFE_INTEGER) || uint(pendingNonce) !== nonce)
        throw new Error("Account has pending or changed nonce");
    } catch { throw new WalletStateUnavailableError("WALLET_STATE_NONCE_UNAVAILABLE"); }
    const plan = planExactApproval(intent, uint(allowance).toString());
    let approvalGas: WalletState["approvalGas"] = null;
    if (code === "0x" && plan.kind === "approve") {
      await providerRead("WALLET_STATE_APPROVAL_SIMULATION_UNAVAILABLE", () => this.source.simulateApproval(plan.transaction, block.number));
      fresh();
      const [estimate, price] = await providerRead("WALLET_STATE_APPROVAL_GAS_UNAVAILABLE", () => Promise.all([this.source.estimateSwapGas(plan.transaction, block.number), this.source.getGasPrice()]));
      fresh();
      if (!uint(estimate) || estimate > 25000000n || !uint(price))
        throw new Error("Invalid approval gas");
      const gas = (estimate * 120n + 99n) / 100n;
      const gasPrice = (price * 120n + 99n) / 100n;
      uint(gasPrice);
      approvalGas = { gas: gas.toString(), gasPrice: gasPrice.toString() };
    }
    return {
      chainId: 137, account: intent.swapper, accountKind: code === "0x" ? "eoa" : "blocked", blockNumber: block.number.toString(), observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
      accountNonce: nonce.toString(),
      balances: { USDC: uint(usdc).toString(), WETH: uint(weth).toString(), POL: uint(native).toString() },
      tokenAllowance: allowance.toString(), permitAllowance: { amount: uint(permit.amount, 160).toString(), expiration: uint(permit.expiration, 48).toString(), nonce: uint(permit.nonce, 48).toString() }, approvalGas,
    };
  }
}
