import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, parseTestnetSwapIntent,
  planTestnetTokenApproval, classifyTestnetWalletCode, type Address, type TestnetSwapIntent } from "@vezta-dex/core";
import type { BaseSepoliaPreflightSource } from "./base-sepolia-preflight";
import { verifyTestnetMetaMaskRuntime } from "./testnet-metamask-runtime";

export interface BaseSepoliaWalletSource extends Pick<BaseSepoliaPreflightSource,
  "getChainId" | "getLatestBlock" | "getBlockHash" | "getCode" | "getDecimals"> {
  getTokenBalance(token: Address, wallet: Address, block: bigint): Promise<bigint>;
  getNativeBalance(wallet: Address, block: bigint): Promise<bigint>;
  getTokenAllowance(token: Address, wallet: Address, spender: Address, block: bigint): Promise<bigint>;
  getAccountNonce(wallet: Address, block: bigint): Promise<bigint>;
  getPendingNonce(wallet: Address): Promise<bigint>;
}
type StateCode = "TESTNET_INTENT_INVALID" | "TESTNET_STATE_BUSY" | "TESTNET_STATE_TIMEOUT"
  | "TESTNET_RPC_UNAVAILABLE" | "TESTNET_WRONG_CHAIN" | "TESTNET_STATE_STALE"
  | "TESTNET_CONFIGURATION_INVALID" | "TESTNET_EOA_REQUIRED" | "TESTNET_NONCE_CHANGED"
  | "TESTNET_STATE_INVALID" | "TESTNET_BLOCK_CHANGED" | "TESTNET_METAMASK_RUNTIME_MISMATCH";
export class TestnetWalletStateError extends Error {
  constructor(readonly code: StateCode) { super(code); }
}
const fail = (code: StateCode): never => { throw new TestnetWalletStateError(code); };
const uint = (value: bigint, bits = 256) => typeof value === "bigint" && value >= 0n && value < 2n ** BigInt(bits);

export class TestnetWalletStateReader {
  private busy = false;
  constructor(private readonly createSource: (signal: AbortSignal) => BaseSepoliaWalletSource,
    private readonly now = Date.now) {}

  async read(value: unknown) {
    let intent: TestnetSwapIntent;
    try { intent = parseTestnetSwapIntent(value); } catch { return fail("TESTNET_INTENT_INVALID"); }
    if (this.busy) return fail("TESTNET_STATE_BUSY");
    this.busy = true;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new TestnetWalletStateError("TESTNET_STATE_TIMEOUT")); }, 25000);
      });
      return await Promise.race([this.probe(this.createSource(controller.signal), intent, controller.signal), timeout]);
    } catch (error) {
      if (error instanceof TestnetWalletStateError) throw error;
      return fail("TESTNET_RPC_UNAVAILABLE");
    } finally { clearTimeout(timer); controller.abort(); this.busy = false; }
  }

  private async probe(source: BaseSepoliaWalletSource, i: TestnetSwapIntent, signal: AbortSignal) {
    if (await source.getChainId() !== P.chainId) return fail("TESTNET_WRONG_CHAIN");
    signal.throwIfAborted();
    const block = await source.getLatestBlock();
    const fresh = () => {
      const now = this.now(); const time = Number(block.timestamp) * 1000;
      if (!Number.isSafeInteger(now) || now < 0 || block.number <= 0n || !Number.isSafeInteger(time)
        || time <= 0 || time > now + 10000 || now - time >= 30000
        || !/^0x[0-9a-fA-F]{64}$/.test(block.hash) || BigInt(block.hash) === 0n) return fail("TESTNET_STATE_STALE");
      signal.throwIfAborted();
    };
    fresh();
    const [code, dependencyCodes, decimals, usdc, weth, eth, allowance, nonce, pending] = await Promise.all([
      source.getCode(i.wallet, block.number),
      Promise.all([C.USDC.address, C.WETH.address, P.router].map(a => source.getCode(a, block.number))),
      Promise.all([source.getDecimals(C.USDC.address, block.number), source.getDecimals(C.WETH.address, block.number)]),
      source.getTokenBalance(C.USDC.address, i.wallet, block.number),
      source.getTokenBalance(C.WETH.address, i.wallet, block.number), source.getNativeBalance(i.wallet, block.number),
      source.getTokenAllowance(i.tokenIn, i.wallet, P.router, block.number),
      source.getAccountNonce(i.wallet, block.number), source.getPendingNonce(i.wallet),
    ]);
    fresh();
    let accountKind: ReturnType<typeof classifyTestnetWalletCode>;
    try { accountKind = classifyTestnetWalletCode(code); } catch { return fail("TESTNET_EOA_REQUIRED"); }
    if (accountKind === "metamask-delegated") {
      try { await verifyTestnetMetaMaskRuntime(source, block.number); }
      catch { return fail("TESTNET_METAMASK_RUNTIME_MISMATCH"); }
      fresh();
    }
    if (!dependencyCodes.every(c => /^0x(?:[0-9a-fA-F]{2})+$/.test(c)) || decimals[0] !== 6 || decimals[1] !== 18) {
      return fail("TESTNET_CONFIGURATION_INVALID");
    }
    if (![usdc, weth, eth, allowance].every(v => uint(v)) || !uint(nonce, 64) || !uint(pending, 64)) {
      return fail("TESTNET_STATE_INVALID");
    }
    if (nonce !== pending) return fail("TESTNET_NONCE_CHANGED");
    const [finalHash, finalPending] = await Promise.all([
      source.getBlockHash(block.number), source.getPendingNonce(i.wallet),
    ]);
    fresh();
    if (!uint(finalPending, 64) || finalPending !== nonce) return fail("TESTNET_NONCE_CHANGED");
    if (finalHash.toLowerCase() !== block.hash.toLowerCase()) return fail("TESTNET_BLOCK_CHANGED");
    const balance = i.tokenIn.toLowerCase() === C.USDC.address.toLowerCase() ? usdc : weth;
    return { chainId: P.chainId, wallet: i.wallet, accountKind,
      blockNumber: block.number.toString(), blockHash: block.hash,
      observedAt: new Date(Number(block.timestamp) * 1000).toISOString(), source: "base-sepolia-rpc" as const,
      accountNonce: nonce.toString(), balances: { USDC: usdc.toString(), WETH: weth.toString(), ETH: eth.toString() },
      tokenIn: i.tokenIn, amountIn: i.amountIn, spender: P.router, tokenAllowance: allowance.toString(),
      approvalKind: planTestnetTokenApproval(i, allowance).kind,
      funding: { inputBalanceSufficient: balance >= BigInt(i.amountIn), nativeEthPositive: eth > 0n },
      executionEnabled: false as const };
  }
}
