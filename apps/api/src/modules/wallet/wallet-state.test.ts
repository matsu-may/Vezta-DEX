import { describe, expect, it, vi } from "vitest";
import { TOKENS, POLYGON_PERMIT2, type TradingIntent } from "@vezta-dex/core";
import { WalletStateReader, WalletStateUnavailableError, type WalletStateSource } from "./wallet-state";

const intent: TradingIntent = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
function setup() {
  const source: WalletStateSource = {
    getBlock: vi.fn(async () => ({ number: 123n, timestamp: 1000n })),
    getAccountCode: vi.fn(async () => "0x"),
    getAccountNonce: vi.fn(async () => 7n),
    getPendingNonce: vi.fn(async () => 7n),
    getTokenBalance: vi.fn(async () => 2000000n),
    getNativeBalance: vi.fn(async () => 10000000000000000n),
    getTokenAllowance: vi.fn(async () => 0n),
    getPermitAllowance: vi.fn(async () => ({ amount: 0n, expiration: 0n, nonce: 7n })),
    getGasPrice: vi.fn(async () => 30000000000n),
    estimateSwapGas: vi.fn(async () => 50000n),
    simulateApproval: vi.fn(async () => {}),
  };
  return { source, reader: new WalletStateReader(source, () => 1000000) };
}
describe("pinned wallet state", () => {
  it("returns curated balances, permit nonce and simulated local approval gas at one block", async () => {
    const s = setup(); const result = await s.reader.getState(intent);
    expect(result).toMatchObject({ chainId: 137, account: intent.swapper, accountKind: "eoa", blockNumber: "123", balances: { USDC: "2000000", WETH: "2000000", POL: "10000000000000000" }, tokenAllowance: "0", permitAllowance: { nonce: "7" }, approvalGas: { gas: "60000", gasPrice: "36000000000" } });
    expect(s.source.getTokenAllowance).toHaveBeenCalledWith(intent.tokenIn, intent.swapper, POLYGON_PERMIT2, 123n);
    expect(s.source.simulateApproval).toHaveBeenCalledWith(expect.objectContaining({ to: intent.tokenIn, value: "0" }), 123n);
  });
  it("blocks deployed/delegated accounts before any approval simulation", async () => {
    const s = setup(); s.source.getAccountCode = async () => "0xef0100";
    expect((await s.reader.getState(intent)).accountKind).toBe("blocked");
    expect(s.source.simulateApproval).not.toHaveBeenCalled();
  });
  it.each(["0x0", "", undefined])("fails closed on malformed code %s", async code => {
    const s = setup(); s.source.getAccountCode = async () => code as string;
    await expect(s.reader.getState(intent)).rejects.toThrow();
  });
  it("does not produce approval gas for different nonzero allowance", async () => {
    const s = setup(); s.source.getTokenAllowance = async () => 5n;
    expect((await s.reader.getState(intent)).approvalGas).toBeNull();
    expect(s.source.simulateApproval).not.toHaveBeenCalled();
  });
  it("rejects failed simulation and impossible gas/uint values", async () => {
    for (const fault of ["revert", "gas", "balance"]) {
      const s = setup();
      if (fault === "revert") s.source.simulateApproval = async () => { throw new Error("secret-provider"); };
      if (fault === "gas") s.source.estimateSwapGas = async () => 0n;
      if (fault === "balance") s.source.getNativeBalance = async () => -1n;
      await expect(s.reader.getState(intent)).rejects.toThrow();
    }
  });
  it("rechecks freshness after slow reads", async () => {
    const s = setup(); let now = 1000000;
    s.source.getGasPrice = async () => { now += 120001; return 1n; };
    await expect(new WalletStateReader(s.source, () => now).getState(intent)).rejects.toMatchObject({ code: "WALLET_STATE_STALE_BLOCK" });
  });
});


it("includes pinned account transaction nonce for broadcast provenance", async () => {
  const s = setup();
  Object.assign(s.source, { getAccountNonce: vi.fn(async () => 7n), getPendingNonce: vi.fn(async () => 7n) });
  expect(await s.reader.getState(intent)).toMatchObject({ accountNonce: "7" });
});

it("blocks pending or malformed account nonce before approval simulation", async () => {
  for (const nonce of [8n, -1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n]) {
    const s = setup(); s.source.getPendingNonce = async () => nonce;
    await expect(s.reader.getState(intent)).rejects.toMatchObject({ code: "WALLET_STATE_NONCE_UNAVAILABLE" });
    expect(s.source.simulateApproval).not.toHaveBeenCalled();
  }
});

it.each([
  ["getBlock", "WALLET_STATE_BLOCK_UNAVAILABLE"],
  ["getAccountCode", "WALLET_STATE_ACCOUNT_CODE_UNAVAILABLE"],
  ["getNativeBalance", "WALLET_STATE_READS_UNAVAILABLE"],
  ["simulateApproval", "WALLET_STATE_APPROVAL_SIMULATION_UNAVAILABLE"],
  ["getGasPrice", "WALLET_STATE_APPROVAL_GAS_UNAVAILABLE"],
] as const)("classifies %s provider failure without exposing provider details", async (method, code) => {
  const s = setup();
  Object.assign(s.source, { [method]: async () => { throw new Error("secret-provider-url"); } });
  let failure: unknown;
  try { await s.reader.getState(intent); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(WalletStateUnavailableError);
  expect((failure as WalletStateUnavailableError).code).toBe(code);
  expect(JSON.stringify(failure)).not.toContain("secret-provider-url");
});
