import { parseHistoricalTestnetApproval, type HistoricalTestnetApproval } from "./testnet-wallet-historical";
import { OtherTestnetSubmissionError, requireNoOtherTestnetSubmission } from "./testnet-cross-flow";
import { TestnetBrowserError } from "./testnet-wallet-client";
import { testnetActionMessage } from "./testnet-browser-errors";
import { getAddress, toHex, type Address } from "viem";
import { classifyTestnetWalletCode, testnetRpcFeeFields, parseTestnetSwapIntent, parseTestnetSwapQuote, TESTNET_SWAP_POLICY as P, type TestnetSwapIntent } from "@vezta-dex/core";
import { parseTestnetWalletQuote, parseTestnetWalletReview, parseTestnetWalletObservation, parseTestnetSubmission, walletHash,
  type TestnetWalletQuote, type TestnetWalletAction, type TestnetSubmission } from "./testnet-wallet-contracts";
import { TESTNET_SUBMISSION_KEY, readTestnetSubmission, writeTestnetSubmission, clearTestnetSubmission,
  sameTestnetSubmission, readTestnetManualReview, readTestnetHistoricalAcknowledgments, acknowledgeTestnetHistoricalApproval, archiveTestnetApproval, type TestnetSubmissionStorage } from "./testnet-wallet-storage";
export interface TestnetWallet { request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (value: unknown) => void): void; removeListener?(event: string, listener: (value: unknown) => void): void }
export interface TestnetWalletApi { call(action: "quote" | "recheck" | "receipt" | "historical-approval", body: unknown): Promise<unknown> }
export interface TestnetWalletCoordination { run(action: () => Promise<void>): Promise<void> }
export const testnetWalletCoordination: TestnetWalletCoordination = { async run(action) {
  if (typeof navigator === "undefined" || !navigator.locks?.request) throw new Error("Coordination unavailable");
  await navigator.locks.request(TESTNET_SUBMISSION_KEY, { mode: "exclusive", ifAvailable: true }, async lock => {
    if (!lock) throw new Error("Another testnet action is active"); await action();
  });
} };
type Stage = "disconnected" | "connected" | "quote-review" | "action-review" | "blocked" | "invalidated" | "error"
  | "uncertain" | "pending" | "confirming" | "reorged" | "unverified" | "confirmed" | "reverted" | "recovery-blocked";
type Review = ReturnType<typeof parseTestnetWalletReview>["study"];
type Observation = ReturnType<typeof parseTestnetWalletObservation>;
export interface TestnetWalletSnapshot { stage: Stage; busy: boolean; message: string; account: Address | null;
  historical?: HistoricalTestnetApproval | null; historicalRecord?: TestnetSubmission | null; resolvedHistory?: ReturnType<typeof readTestnetHistoricalAcknowledgments>;
  contextUnavailable?: boolean; archived?: TestnetSubmission[]; review: Review | null; quote: TestnetWalletQuote | null; action: TestnetWalletAction | null; submission: TestnetSubmission | null; observation: Observation | null }
const initial = (): TestnetWalletSnapshot => ({ stage: "disconnected", busy: false, message: "", account: null,
  review: null, quote: null, action: null, submission: null, observation: null });
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
class WrongTestnetNetwork extends Error {}
class UnsupportedDemoWallet extends Error {}
function connectionMessage(error: unknown) {
  if (error instanceof UnsupportedDemoWallet) return "This account uses an unsupported contract or has an unresolved archived approval. Use the supported MetaMask delegation or reconcile its historical approval first.";
  if (error instanceof WrongTestnetNetwork) return "Wrong wallet network. Select Base Sepolia (chain 84532), then connect again.";
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === 4001) return "Wallet connection rejected. Open MetaMask and connect again when ready.";
  if (code === -32002) return "A wallet request is already pending. Open MetaMask and complete or reject that request first.";
  return "Unable to connect wallet. Unlock MetaMask, select Base Sepolia (chain 84532), and connect again.";
}
const require = (condition: unknown) => { if (!condition) throw new Error("Testnet review unavailable"); };
function account(value: unknown): Address {
  require(Array.isArray(value) && typeof value[0] === "string"); return getAddress((value as string[])[0]);
}
/** Explicit wallet actions; read-only unless both server and local consumer gates permit execution. */
export class TestnetWalletController {
  private state = initial(); private generation = 0; private disposed = false; private active = false;
  private readonly listeners = new Set<() => void>();
  private connecting = false; private grantAccount: Address | null = null;
  private readonly accountsChanged = (value: unknown) => {
    try {
      const next = account(value);
      if (this.connecting && !this.grantAccount) { this.grantAccount = next; return; }
      if (this.connecting && this.grantAccount && same(next, this.grantAccount)) return;
      if (this.state.account && same(next, this.state.account)) return;
    } catch { /* Malformed events invalidate the reviewed context. */ }
    this.invalidate();
  };
  private readonly walletChanged = () => this.invalidate();
  constructor(private readonly wallet: TestnetWallet, private readonly api: TestnetWalletApi, private readonly storage: TestnetSubmissionStorage,
    private readonly now = Date.now, private readonly coordination = testnetWalletCoordination,
    private readonly executionAllowed: () => boolean = () => false) {
    try { this.state.archived = readTestnetManualReview(storage); this.state.resolvedHistory = readTestnetHistoricalAcknowledgments(storage); this.state.historical = null; } catch { this.state.stage = "recovery-blocked"; }
    const saved = readTestnetSubmission(storage);
    if (saved.kind === "invalid") this.state.stage = "recovery-blocked";
    if (saved.kind === "record" && this.state.stage !== "recovery-blocked") { this.state.submission = saved.record; this.state.stage = saved.record.hash ? "pending" : "uncertain"; }
    wallet.on?.("accountsChanged", this.accountsChanged);
    for (const event of ["chainChanged", "disconnect"]) wallet.on?.(event, this.walletChanged);
  }
  snapshot = () => structuredClone(this.state);
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<TestnetWalletSnapshot>) {
    this.state = { ...this.state, ...patch }; for (const listener of this.listeners) { try { listener(); } catch { /* Observers cannot interrupt a send/recovery boundary. */ } }
  }
  invalidate() { this.generation++; this.publish({ account: null, review: null, quote: null, action: null,
    stage: this.state.submission ? (this.state.submission.hash ? "pending" : "uncertain") : "invalidated" }); }
  invalidateInput() { this.generation++; this.publish({ review: null, quote: null, action: null, message: "",
    stage: this.state.submission ? (this.state.submission.hash ? "pending" : "uncertain") : this.state.account ? "connected" : "disconnected" }); }
  dispose() { this.disposed = true; this.invalidate(); this.wallet.removeListener?.("accountsChanged", this.accountsChanged);
    for (const event of ["chainChanged", "disconnect"]) this.wallet.removeListener?.(event, this.walletChanged); this.listeners.clear(); }
  private generationCheck(g: number) { require(!this.disposed && g === this.generation); }
  private async walletCheck(owner: string, g: number) {
    const accounts = await this.wallet.request({ method: "eth_accounts" }); this.generationCheck(g);
    const chain = await this.wallet.request({ method: "eth_chainId" }); this.generationCheck(g);
    require(same(account(accounts), owner) && typeof chain === "string" && /^0x[0-9a-f]+$/i.test(chain));
    if (BigInt(chain as string) !== BigInt(P.chainId)) throw new WrongTestnetNetwork();
    if (readTestnetManualReview(this.storage).some(record => same(record.intent.wallet, owner))) throw new UnsupportedDemoWallet();
    const code = await this.wallet.request({ method: "eth_getCode", params: [owner, "latest"] }); this.generationCheck(g);
    // Recognize the pinned indicator only; the API independently qualifies delegate runtime.
    try { classifyTestnetWalletCode(code); } catch { throw new UnsupportedDemoWallet(); }
  }
  private synchronize() {
    try { this.publish({ archived: readTestnetManualReview(this.storage), resolvedHistory: readTestnetHistoricalAcknowledgments(this.storage) }); }
    catch { this.publish({ stage: "recovery-blocked" }); throw new Error("Invalid archive"); }
    const saved = readTestnetSubmission(this.storage);
    if (saved.kind === "invalid") { this.publish({ stage: "recovery-blocked", review: null, quote: null, action: null }); throw new Error("Invalid recovery"); }
    const current = saved.kind === "record" ? saved.record : null;
    if (sameTestnetSubmission(current, this.state.submission)) return;
    if (current?.hash === null && this.state.submission?.hash
      && sameTestnetSubmission(current, { ...this.state.submission, hash: null })) {
      // A sent hash was retained in memory after only its persistence failed.
      // Repair the same original marker under the lock; never repair by sending.
      writeTestnetSubmission(this.storage, this.state.submission, current);
      this.publish({ stage: "pending", observation: null }); return;
    }
    this.generation++;
    if (this.state.submission) { this.publish({ stage: "recovery-blocked", review: null, quote: null, action: null }); throw new Error("Recovery conflict"); }
    this.publish({ submission: current, review: null, quote: null, action: null, observation: null, stage: current?.hash ? "pending" : "uncertain" });
  }
  private async run(action: () => Promise<void>, purpose: "connect" | "action" = "action") {
    if (this.active || this.disposed) return;
    this.active = true; this.publish({ busy: true, message: "" });
    try { await this.coordination.run(async () => { this.synchronize(); require(this.state.stage !== "recovery-blocked"); await action(); }); }
    catch (error) {
      const stage = this.state.stage === "recovery-blocked" ? "recovery-blocked" : this.state.submission
        ? (this.state.submission.hash ? "pending" : "uncertain") : this.state.stage === "invalidated" ? "invalidated" : "error";
      this.publish({ stage, contextUnavailable: !!this.state.submission && (this.state.contextUnavailable || (error instanceof TestnetBrowserError && error.status === 410 && error.code === "TESTNET_CONTEXT_UNAVAILABLE")), review: null, quote: null, action: null, message: this.state.submission
        ? error instanceof TestnetBrowserError ? testnetActionMessage(error.code, true) : "Preserve the original context and hash. Check its receipt; do not send again." : error instanceof OtherTestnetSubmissionError ? error.message : purpose === "connect" ? connectionMessage(error)
          : (error instanceof WrongTestnetNetwork || error instanceof UnsupportedDemoWallet) ? connectionMessage(error) : error instanceof TestnetBrowserError ? testnetActionMessage(error.code, false) : "Action unavailable or rejected. Request a fresh Base Sepolia quote." });
    } finally { this.active = false; this.publish({ busy: false }); }
  }
  private free() { requireNoOtherTestnetSubmission(this.storage, "swap"); require(!this.state.submission && this.state.stage !== "recovery-blocked"); }
  private current() { require(this.state.quote && this.state.account); const q = this.state.quote!;
    parseTestnetSwapQuote(q.quote, this.now()); require(same(this.state.account!, q.quote.wallet)); return q; }
  async connect() { return this.run(async () => {
    const g = this.generation; this.connecting = true; this.grantAccount = null;
    try {
      const owner = account(await this.wallet.request({ method: "eth_requestAccounts" })); this.generationCheck(g);
      require(!this.grantAccount || same(owner, this.grantAccount));
      await this.walletCheck(owner, g); this.publish({ account: owner, stage: this.state.submission ? this.state.stage : "connected" });
    } finally { this.connecting = false; this.grantAccount = null; }
  }, "connect"); }
  async quote(value: TestnetSwapIntent) { return this.run(async () => {
    this.free(); const intent = parseTestnetSwapIntent(value); require(this.state.account && same(this.state.account, intent.wallet));
    const g = ++this.generation; this.publish({ review: null, quote: null, action: null, observation: null });
    await this.walletCheck(intent.wallet, g); const raw = await this.api.call("quote", intent); this.generationCheck(g);
    const quoted = parseTestnetWalletQuote(raw, intent, this.now()); this.publish({ quote: quoted, stage: "quote-review" });
  }); }
  async review(kind: "approval" | "swap") { return this.run(async () => {
    this.free(); require(kind === "approval" || kind === "swap"); const q = this.current(); const g = this.generation;
    const intent = parseTestnetSwapIntent({ chainId: q.quote.chainId, wallet: q.quote.wallet, tokenIn: q.quote.tokenIn,
      tokenOut: q.quote.tokenOut, amountIn: q.quote.amountIn, slippageBps: q.quote.slippageBps });
    this.publish({ action: null, review: null }); await this.walletCheck(intent.wallet, g);
    const raw = await this.api.call("recheck", { kind, intent, quoteId: q.quoteId }); this.generationCheck(g);
    const checked = parseTestnetWalletReview(raw, q, kind, this.now());
    this.publish({ review: checked.study, action: checked.action, stage: checked.action ? "action-review" : "blocked" });
  }); }
  async submit() { return this.run(async () => {
    this.free(); const q = this.current(); const action = this.state.action; const g = this.generation;
    if (!action || !this.state.review) throw new Error("Missing reviewed action");
    require(q.executionEnabled && action.executionEnabled && this.executionAllowed());
    const reviewed = this.state.review;
    const checkReview = () => parseTestnetWalletReview({ study: reviewed, action }, q,
      action.kind === "swap" ? "swap" : "approval", this.now());
    checkReview();
    await this.walletCheck(q.quote.wallet, g); this.current(); checkReview(); require(this.executionAllowed());
    const intent = parseTestnetSwapIntent({ chainId: q.quote.chainId, wallet: q.quote.wallet, tokenIn: q.quote.tokenIn,
      tokenOut: q.quote.tokenOut, amountIn: q.quote.amountIn, slippageBps: q.quote.slippageBps });
    const original = parseTestnetSubmission({ version: 1, intent, quote: q.quote, action, attemptedAt: this.now(), hash: null });
    requireNoOtherTestnetSubmission(this.storage, "swap");
    writeTestnetSubmission(this.storage, original); this.publish({ submission: original, review: null, quote: null, action: null, stage: "uncertain" });
    let raw: unknown;
    try {
      this.generationCheck(g); parseTestnetSwapQuote(original.quote, this.now()); checkReview(); require(this.executionAllowed());
      const tx = original.action.transaction;
      raw = await this.wallet.request({ method: "eth_sendTransaction", params: [{ from: tx.from, to: tx.to, data: tx.data,
        chainId: toHex(P.chainId), value: "0x0", nonce: toHex(BigInt(tx.nonce)), gas: toHex(BigInt(tx.gas)), ...testnetRpcFeeFields(tx) }] });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 4001) {
        clearTestnetSubmission(this.storage, original); this.publish({ submission: null });
      }
      throw error;
    }
    const sent = { ...original, hash: walletHash.parse(raw) }; this.publish({ submission: sent, stage: "pending" });
    try { writeTestnetSubmission(this.storage, sent, original); }
    catch { this.publish({ message: "Copy the original hash now. Recovery storage could not be updated." }); }
  }); }
  private tracked() { const record = this.state.submission; require(record);
    if (this.now() >= Date.parse(record!.action.trackingExpiresAt)) throw new TestnetBrowserError(410, "TESTNET_CONTEXT_UNAVAILABLE");
    return record!; }
  private applyObservation(o: Observation) { this.publish({ observation: o, contextUnavailable: false, stage: o.status === "unknown-original" ? "uncertain" : o.status }); }
  async observe() { return this.run(async () => {
    const original = this.tracked(); require(original.hash);
    const raw = await this.api.call("receipt", { contextId: original.action.contextId, hash: original.hash });
    const o = parseTestnetWalletObservation(raw, original, this.now()); this.applyObservation(o);
  }); }
  async recoverHash(value: string) { return this.run(async () => {
    const original = this.tracked(); require(!original.hash); const hash = walletHash.parse(value);
    const candidate = { ...original, hash }; const raw = await this.api.call("receipt", { contextId: original.action.contextId, hash });
    const o = parseTestnetWalletObservation(raw, candidate, this.now());
    if (["pending", "confirming", "confirmed", "reverted"].includes(o.status)) {
      writeTestnetSubmission(this.storage, candidate, original); this.publish({ submission: candidate });
    }
    this.applyObservation(o);
  }); }
  async reconcileHistoricalApproval(hash?: string) { return this.run(async () => {
    const record = hash ? readTestnetManualReview(this.storage).find(r => r.hash && same(r.hash,hash)) : this.state.submission;
    require(record && record.hash && record.action.kind !== "swap");
    this.publish({historical:null,historicalRecord:null});
    const raw = await this.api.call("historical-approval",{wallet:record!.intent.wallet,hash:record!.hash});
    const historical = parseHistoricalTestnetApproval(raw,record!,this.now());
    this.publish({historical,historicalRecord:record!,message:"Historical approval verified from signed chain execution. The original API review is unavailable; acknowledge this separate result to continue."});
  }); }
  async acknowledgeHistoricalApproval() { return this.run(async () => {
    require(this.state.historical && this.state.historicalRecord);
    acknowledgeTestnetHistoricalApproval(this.storage,this.state.historicalRecord!,this.state.historical!,this.now());
    const saved = readTestnetSubmission(this.storage); require(saved.kind !== "invalid");
    this.generation++;this.publish({historical:null,historicalRecord:null,resolvedHistory:readTestnetHistoricalAcknowledgments(this.storage),archived:readTestnetManualReview(this.storage),
      submission:saved.kind === "record" ? saved.record : null,observation:null,contextUnavailable:false,review:null,quote:null,action:null,account:null,stage:"disconnected",message:"Historical approval acknowledged. Original hash retained in history. Reconnect and request a fresh quote."});
  }); }
  async archiveUnverifiedApproval() { return this.run(async () => {
    const original = this.state.submission; require(original && original.hash && original.action.kind !== "swap");
    if (!this.state.contextUnavailable) {
      require(this.state.stage === "unverified" && this.state.observation?.status === "unverified");
      parseTestnetWalletObservation({ observation: this.state.observation }, original!, this.now());
    }
    const archived = archiveTestnetApproval(this.storage, original!);
    this.generation++; this.publish({ archived, submission: null, observation: null, contextUnavailable: false, account: null,
      review: null, quote: null, action: null, stage: "disconnected",
      message: "Original approval archived for manual review, not verified. Continue only with a different standard account." });
  }); }
  async acknowledge() { return this.run(async () => {
    const original = this.tracked(); require(original.hash && this.state.observation
      && (this.state.stage === "confirmed" || this.state.stage === "reverted")
      && (this.state.observation.status === "confirmed" || this.state.observation.status === "reverted"));
    parseTestnetWalletObservation({ observation: this.state.observation }, original, this.now());
    clearTestnetSubmission(this.storage, original); this.publish({ submission: null, observation: null, review: null, quote: null, action: null,
      stage: this.state.account ? "connected" : "disconnected" });
  }); }
}
