import { POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, TOKENS, validateTradingIntent, type TradingIntent } from "@vezta-dex/core";
import type { SwapPreparationChainSource, UnsignedSwapTransaction } from "./swap-preparation";
import { planExactApproval } from "./exact-approval";

export interface WalletStateSource extends Pick<SwapPreparationChainSource, "getBlock" | "getAccountCode" | "getTokenBalance" | "getNativeBalance" | "getTokenAllowance" | "getPermitAllowance" | "getGasPrice" | "estimateSwapGas"> {
  simulateApproval(transaction: UnsignedSwapTransaction, block: bigint): Promise<void>;
}
export interface WalletState {
  chainId: 137; account: `0x${string}`; accountKind: "eoa" | "blocked";
  blockNumber: string; observedAt: string;
  balances: { USDC: string; WETH: string; POL: string };
  tokenAllowance: string;
  permitAllowance: { amount: string; expiration: string; nonce: string };
  approvalGas: { gas: string; gasPrice: string } | null;
}
function uint(n: bigint, bits = 256): bigint {
  if (typeof n !== "bigint" || n < 0n || n >= 1n << BigInt(bits)) throw new Error("Invalid wallet state");
  return n;
}
export class WalletStateReader {
  constructor(private readonly source: WalletStateSource, private readonly now: () => number = Date.now) {}
  async getState(value: TradingIntent): Promise<WalletState> {
    const intent = { ...value }; validateTradingIntent(intent);
    const block = await this.source.getBlock();
    const fresh = () => {
      uint(block.number); uint(block.timestamp);
      const observed = Number(block.timestamp) * 1000; const now = this.now();
      if (!Number.isSafeInteger(observed) || !Number.isSafeInteger(now) || observed > now + 5000 || now - observed > 120000) throw new Error("Stale wallet state");
    };
    fresh();
    const code = await this.source.getAccountCode(intent.swapper, block.number); fresh();
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) throw new Error("Invalid account code");
    const [usdc, weth, native, allowance, permit] = await Promise.all([
      this.source.getTokenBalance(TOKENS.USDC.address, intent.swapper, block.number),
      this.source.getTokenBalance(TOKENS.WETH.address, intent.swapper, block.number),
      this.source.getNativeBalance(intent.swapper, block.number),
      this.source.getTokenAllowance(intent.tokenIn, intent.swapper, POLYGON_PERMIT2, block.number),
      this.source.getPermitAllowance(intent.tokenIn, intent.swapper, POLYGON_UNIVERSAL_ROUTER_212, block.number),
    ]); fresh();
    const plan = planExactApproval(intent, uint(allowance).toString());
    let approvalGas: WalletState["approvalGas"] = null;
    if (code === "0x" && plan.kind === "approve") {
      await this.source.simulateApproval(plan.transaction, block.number); fresh();
      const [estimate, price] = await Promise.all([this.source.estimateSwapGas(plan.transaction, block.number), this.source.getGasPrice()]); fresh();
      if (!uint(estimate) || estimate > 25000000n || !uint(price)) throw new Error("Invalid approval gas");
      const gas = (estimate * 120n + 99n) / 100n; const gasPrice = (price * 120n + 99n) / 100n;
      uint(gasPrice); approvalGas = { gas: gas.toString(), gasPrice: gasPrice.toString() };
    }
    return {
      chainId: 137, account: intent.swapper, accountKind: code === "0x" ? "eoa" : "blocked", blockNumber: block.number.toString(), observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
      balances: { USDC: uint(usdc).toString(), WETH: uint(weth).toString(), POL: uint(native).toString() },
      tokenAllowance: allowance.toString(), permitAllowance: { amount: uint(permit.amount, 160).toString(), expiration: uint(permit.expiration, 48).toString(), nonce: uint(permit.nonce, 48).toString() }, approvalGas,
    };
  }
}
