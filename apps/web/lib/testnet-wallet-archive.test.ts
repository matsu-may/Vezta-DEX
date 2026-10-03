import { expect, it } from "vitest";
import fixtures from "./fixtures/testnet-wallet-browser.json";
import { parseTestnetSubmission } from "./testnet-wallet-contracts";
import { memoryStorage } from "./testnet-wallet.test-helper";
import { TestnetWalletController } from "./testnet-wallet-controller";
import { TESTNET_SUBMISSION_KEY } from "./testnet-wallet-storage";
const hash = `0x${"11".repeat(32)}`;
function setup(kind: "approve" | "swap" = "approve") {
  const f = fixtures[kind === "approve" ? "forward-approve" : "forward-swap"];
  const record = parseTestnetSubmission({ version: 1, intent: f.intent, quote: f.quote.quote, action: f.checked.action, attemptedAt: f.now, hash });
  const storage = memoryStorage(); storage.setItem(TESTNET_SUBMISSION_KEY, JSON.stringify(record));
  let lost = false; let owner = record.intent.wallet; let code = "0x"; const methods: string[] = [];
  const wallet = { async request({ method }: { method: string }) { methods.push(method); return method === "eth_chainId" ? "0x14a34" : method === "eth_getCode" ? code : [owner]; } };
  const api = { async call() { if (lost) { const { TestnetBrowserError } = await import("./testnet-wallet-client"); throw new TestnetBrowserError(410, "TESTNET_CONTEXT_UNAVAILABLE"); } return { observation: { contextId: record.action.contextId, hash, kind, chainId: 84532, source: "base-sepolia-rpc", observedAt: new Date(f.now).toISOString(), executionEnabled: false, status: "unverified", confirmations: "0", execution: null } }; } };
  const make = () => new TestnetWalletController(wallet, api, storage, () => f.now, { async run(fn) { await fn(); } });
  return { make, storage, methods, record, loseContext: () => { lost = true; }, changeOwner: () => { owner = "0x1111111111111111111111111111111111111111"; }, delegate: () => { code = "0xef01001111111111111111111111111111111111111111"; } };
}
it("archives only an explicitly unverified approval, preserves it on reload and blocks that original wallet", async () => {
  const s = setup(); const c = s.make();
  await c.archiveUnverifiedApproval(); expect(c.snapshot().submission).not.toBeNull();
  await c.observe(); await c.archiveUnverifiedApproval();
  expect(c.snapshot().submission).toBeNull(); expect(c.snapshot().archived).toEqual([s.record]);
  const reload = s.make(); expect(reload.snapshot().archived).toEqual([s.record]);
  await reload.connect(); expect(reload.snapshot().account).toBeNull(); expect(reload.snapshot().message).toContain("unresolved archived approval");
  s.changeOwner(); await reload.connect(); expect(reload.snapshot().stage).toBe("connected");
  expect(s.methods).not.toContain("eth_sendTransaction");
});
it("cannot archive a swap or lose the original when archive storage fails", async () => {
  const s = setup("swap"); const c = s.make(); await c.observe(); await c.archiveUnverifiedApproval(); expect(c.snapshot().submission).not.toBeNull();
  const a = setup(); const b = a.make(); await b.observe(); a.storage.setItem = () => { throw new Error("full"); };
  await b.archiveUnverifiedApproval(); expect(b.snapshot().submission).not.toBeNull(); expect(a.storage.getItem(TESTNET_SUBMISSION_KEY)).not.toBeNull();
});
it("rejects an unknown delegation indicator before a quote or send and fails closed on corrupt archive", async () => {
  const s = setup(); s.storage.removeItem(TESTNET_SUBMISSION_KEY); s.delegate(); const c = s.make();
  await c.connect(); expect(c.snapshot().account).toBeNull(); expect(c.snapshot().message).toContain("unsupported contract");
  s.storage.setItem("vezta-dex:base-sepolia-manual-review:v1", "bad"); expect(s.make().snapshot().stage).toBe("recovery-blocked");
});

it("quarantines an approval with unavailable context but never permits the same for swaps", async () => {
  for (const kind of ["approve", "swap"] as const) {
    const s = setup(kind); s.loseContext(); const c = s.make(); await c.observe();
    expect(c.snapshot().contextUnavailable).toBe(true);
    await c.archiveUnverifiedApproval();
    if (kind === "swap") expect(c.snapshot().submission).not.toBeNull();
    else { expect(c.snapshot().archived).toEqual([s.record]); await c.connect(); expect(c.snapshot().account).toBeNull(); }
    expect(s.methods).not.toContain("eth_sendTransaction");
  }
});
