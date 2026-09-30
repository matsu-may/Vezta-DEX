import { describe, expect, it, vi } from "vitest";
import { TOKENS } from "@vezta-dex/core";
import { handleRequest } from "./server";
import type { PoolReader } from "./pools";
import type { WalletStateReader } from "./wallet-state";
import { WalletStateUnavailableError } from "./wallet-state";
import type { WalletObservationReader } from "./wallet-observation";
import type { SwapPreparer } from "./swap-preparation";
const intent = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
const hash = `0x${"11".repeat(32)}`;
const reader = {} as PoolReader;
function request(action: string, body: unknown) { return new Request(`http://local/api/v1/${action}`, { method: "POST", body: JSON.stringify(body) }); }
describe("read-only rehearsal endpoints", () => {
  it("serves pinned state and serializes receipt bigints without arbitrary RPC or payload leakage", async () => {
    const state = { getState: vi.fn(async () => ({ accountKind: "eoa" })) } as unknown as WalletStateReader;
    const receipt = { observe: vi.fn(async () => ({ observation: { receipt: { blockNumber: 123n } }, execution: null })) } as unknown as WalletObservationReader;
    const a = await handleRequest(request("wallet-state", intent), reader, undefined, undefined, undefined, undefined, undefined, state, receipt);
    expect(a.status).toBe(200); expect(a.headers.get("cache-control")).toBe("no-store");
    expect(state.getState).toHaveBeenCalledWith(intent);
    const b = await handleRequest(request("transaction-observation", { kind: "swap", intent, hash, dataHash: hash, minimumAmountOut: "995", submittedAt: 1000, submissionId: "11111111-1111-4111-8111-111111111111", afterBlock: "122", expectedNonce: "7" }), reader, undefined, undefined, undefined, undefined, undefined, state, receipt);
    expect(b.status).toBe(200); expect(await b.json()).toEqual({ observation: { receipt: { blockNumber: "123" } }, execution: null });
  });
  it("rejects malformed metadata/unknown fields and sanitizes state failures", async () => {
    const state = { getState: vi.fn(async () => { throw new Error("secret-rpc-key"); }) } as unknown as WalletStateReader;
    const receipt = { observe: vi.fn() } as unknown as WalletObservationReader;
    const a = await handleRequest(request("wallet-state", intent), reader, undefined, undefined, undefined, undefined, undefined, state, receipt);
    expect(a.status).toBe(503); expect(JSON.stringify(await a.json())).not.toContain("secret");
    const b = await handleRequest(request("transaction-observation", { kind: "swap", intent, hash, dataHash: hash, minimumAmountOut: "995", submittedAt: 1000, submissionId: "11111111-1111-4111-8111-111111111111", afterBlock: "122", expectedNonce: "7", arbitraryRpc: "eth_sendRawTransaction" }), reader, undefined, undefined, undefined, undefined, undefined, state, receipt);
    expect(b.status).toBe(400); expect(receipt.observe).not.toHaveBeenCalled();
  });
  it("returns only a safe wallet-state stage code on provider failure", async () => {
    const state = { getState: vi.fn(async () => { throw new WalletStateUnavailableError("WALLET_STATE_READS_UNAVAILABLE"); }) } as unknown as WalletStateReader;
    const response = await handleRequest(request("wallet-state", intent), reader, undefined, undefined, undefined, undefined, undefined, state);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Polygon observation is unavailable", code: "WALLET_STATE_READS_UNAVAILABLE" });
  });
  it("rechecks a prepared quote without calling prepare again", async () => {
    const swaps = { recheck: vi.fn(async () => ({ quoteId: "ab".repeat(24) })), prepare: vi.fn() } as unknown as SwapPreparer;
    const a = await handleRequest(request("swap-recheck", { ...intent, quoteId: "ab".repeat(24) }), reader, undefined, undefined, undefined, undefined, swaps);
    expect(a.status).toBe(200); expect(swaps.recheck).toHaveBeenCalledWith(intent, "ab".repeat(24)); expect(swaps.prepare).not.toHaveBeenCalled();
  });
});
