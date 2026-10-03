import { afterEach, expect, it, vi } from "vitest";
import { TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { TestnetWalletStateReader, type BaseSepoliaWalletSource } from "./testnet-wallet-state";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";
import { delegatedWalletCodeReader } from "./testnet-metamask-wallet.test-helper";

it("returns the MetaMask delegated account kind only after proving the pinned runtimes", async () => {
  const s = stateSource();
  s.getCode = delegatedWalletCodeReader(s.getCode, testnetIntent().wallet);
  expect(await new TestnetWalletStateReader(() => s, () => TESTNET_NOW).read(testnetIntent()))
    .toMatchObject({ accountKind: "metamask-delegated", accountNonce: "7", executionEnabled: false });
  s.getCode = delegatedWalletCodeReader(s.getCode, testnetIntent().wallet, true);
  await expect(new TestnetWalletStateReader(() => s, () => TESTNET_NOW).read(testnetIntent()))
    .rejects.toMatchObject({ code: "TESTNET_METAMASK_RUNTIME_MISMATCH" });
});

afterEach(() => vi.useRealTimers());
export function stateSource(): BaseSepoliaWalletSource {
  return { ...testnetQuoteSource(),
    async getTokenBalance() { return 0n; }, async getNativeBalance() { return 0n; },
    async getTokenAllowance() { return 0n; }, async getAccountNonce() { return 7n; },
    async getPendingNonce() { return 7n; },
  };
}

it("returns valid unfunded EOA state with pinned reads and exact/reset/ready approval kinds", async () => {
  const source = stateSource(); const allowance = vi.spyOn(source, "getTokenAllowance");
  const token = vi.spyOn(source, "getTokenBalance"); const native = vi.spyOn(source, "getNativeBalance");
  for (const [amount, kind] of [[0n, "approve"], [1000000n, "ready"], [1000001n, "reset"]] as const) {
    allowance.mockResolvedValue(amount);
    const state = await new TestnetWalletStateReader(() => source, () => TESTNET_NOW).read(testnetIntent());
    expect(state).toMatchObject({ chainId: 84532, accountKind: "eoa", blockNumber: "123", accountNonce: "7",
      funding: { inputBalanceSufficient: false, nativeEthPositive: false }, approvalKind: kind,
      executionEnabled: false });
    expect(JSON.stringify(state)).not.toContain("transaction");
    expect(allowance.mock.calls.every(c => c[2] === P.router && c[3] === 123n)).toBe(true);
    expect(token.mock.calls.every(c => c[2] === 123n)).toBe(true);
    expect(native.mock.calls.every(c => c[1] === 123n)).toBe(true);
  }
  source.getTokenBalance = async () => 1000000n; source.getNativeBalance = async () => 1n;
  expect((await new TestnetWalletStateReader(() => source, () => TESTNET_NOW).read(testnetIntent())).funding)
    .toEqual({ inputBalanceSufficient: true, nativeEthPositive: true });
});

it("rejects wrong chain, deployed wallet, missing token code and invalid uint reads", async () => {
  const mutations = [
    (s: BaseSepoliaWalletSource) => { s.getChainId = async () => 137; },
    (s: BaseSepoliaWalletSource) => { s.getCode = async () => "0x6000"; },
    (s: BaseSepoliaWalletSource) => { s.getCode = async () => "0x"; },
    (s: BaseSepoliaWalletSource) => { s.getDecimals = async () => 0; },
    (s: BaseSepoliaWalletSource) => { s.getTokenBalance = async () => -1n; },
    (s: BaseSepoliaWalletSource) => { s.getNativeBalance = async () => 2n ** 256n; },
    (s: BaseSepoliaWalletSource) => { s.getTokenAllowance = async () => 2n ** 256n; },
    (s: BaseSepoliaWalletSource) => { s.getAccountNonce = async () => 2n ** 64n; },
  ];
  for (const mutate of mutations) {
    const s = stateSource(); mutate(s);
    await expect(new TestnetWalletStateReader(() => s, () => TESTNET_NOW).read(testnetIntent())).rejects.toThrow();
  }
});

it("rejects pending nonce at entry or a nonce change during reads, reorg and late state", async () => {
  for (const pending of [[8n], [7n, 8n]]) {
    const s = stateSource(); let call = 0;
    s.getPendingNonce = async () => pending[Math.min(call++, pending.length - 1)];
    await expect(new TestnetWalletStateReader(() => s, () => TESTNET_NOW).read(testnetIntent()))
      .rejects.toMatchObject({ code: "TESTNET_NONCE_CHANGED" });
  }
  const changed = stateSource(); changed.getBlockHash = async () => `0x${"cd".repeat(32)}`;
  await expect(new TestnetWalletStateReader(() => changed, () => TESTNET_NOW).read(testnetIntent()))
    .rejects.toMatchObject({ code: "TESTNET_BLOCK_CHANGED" });
  let now = TESTNET_NOW; const slow = stateSource();
  slow.getNativeBalance = async () => { now += 28000; return 0n; };
  await expect(new TestnetWalletStateReader(() => slow, () => now).read(testnetIntent()))
    .rejects.toMatchObject({ code: "TESTNET_STATE_STALE" });
});

it("rejects invalid intent before source creation and aborts hung/busy state reads", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = []; const s = stateSource(); s.getChainId = () => new Promise(() => {});
  const create = vi.fn((signal: AbortSignal) => { signals.push(signal); return s; });
  const r = new TestnetWalletStateReader(create, () => TESTNET_NOW);
  await expect(r.read({ ...testnetIntent(), chainId: 137 })).rejects.toMatchObject({ code: "TESTNET_INTENT_INVALID" });
  expect(create).not.toHaveBeenCalled();
  const pending = expect(r.read(testnetIntent())).rejects.toMatchObject({ code: "TESTNET_STATE_TIMEOUT" });
  await expect(r.read(testnetIntent())).rejects.toMatchObject({ code: "TESTNET_STATE_BUSY" });
  await vi.advanceTimersByTimeAsync(25000); await pending;
  expect(signals[0].aborted).toBe(true);
  s.getChainId = async () => 84532;
  expect((await r.read(testnetIntent())).accountKind).toBe("eoa");
});
