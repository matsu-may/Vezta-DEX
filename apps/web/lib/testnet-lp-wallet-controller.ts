import { saveTestnetActivity } from "./testnet-activity";
import { getAddress, toHex, type Address } from "viem";
import { classifyTestnetWalletCode, testnetRpcFeeFields, testnetLpIntentSchema, parseTestnetLpStudy, type TestnetLpIntent, type TestnetLpStudy, type TestnetLpReceipt } from "@vezta-dex/core";
import { TestnetBrowserError } from "./testnet-wallet-client";
import { type TestnetWallet, type TestnetWalletCoordination, testnetWalletCoordination } from "./testnet-wallet-controller";
import { readTestnetManualReview, type TestnetSubmissionStorage } from "./testnet-wallet-storage";
import { testnetLpMessage } from "./testnet-lp-wallet-errors";
import { OtherTestnetSubmissionError, requireNoOtherTestnetSubmission } from "./testnet-cross-flow";
import { walletHash } from "./testnet-wallet-contracts";
import { parseTestnetLpReview, parseTestnetLpSubmission, parseTestnetLpObservation, type TestnetLpSubmission } from "./testnet-lp-wallet-contracts";
import { readTestnetLpSubmission, writeTestnetLpSubmission, clearTestnetLpSubmission, sameTestnetLpSubmission } from "./testnet-lp-wallet-storage";
export interface TestnetLpWalletApi { call(action: "study" | "recheck" | "receipt", body: unknown): Promise<unknown> }
type Stage = "disconnected" | "connected" | "review" | "blocked" | "error" | "invalidated" | "uncertain" | "pending" | "confirming" | "confirmed" | "reverted" | "reorged" | "unverified" | "recovery-blocked";
export interface TestnetLpWalletSnapshot { stage: Stage; busy: boolean; account: Address | null; study: TestnetLpStudy | null; submission: TestnetLpSubmission | null; observation: TestnetLpReceipt | null; message: string }
const initial = (): TestnetLpWalletSnapshot => ({ stage: "disconnected", busy: false, account: null, study: null, submission: null, observation: null, message: "" });
const bound = (v: unknown) => { if (!v) throw new Error("LP action unavailable"); };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const account = (v: unknown): Address => { bound(Array.isArray(v) && typeof v[0] === "string"); return getAddress((v as string[])[0]); };
export class TestnetLpWalletController {
  private state = initial(); private generation = 0; private active = false; private disposed = false; private connecting = false; private grant: Address | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly changedAccounts = (v: unknown) => {
    try { const next = account(v); if (this.connecting && (!this.grant || same(next, this.grant))) { this.grant = next; return; }
      if (this.state.account && same(next, this.state.account)) return;
    } catch { /* Malformed provider events invalidate a review. */ } this.invalidate();
  };
  private readonly changed = () => this.invalidate();
  constructor(private readonly wallet: TestnetWallet, private readonly api: TestnetLpWalletApi, private readonly storage: TestnetSubmissionStorage,
    private readonly now = Date.now, private readonly coordination: TestnetWalletCoordination = testnetWalletCoordination, private readonly executionAllowed: () => boolean = () => false) {
    const saved = readTestnetLpSubmission(storage);
    if (saved.kind === "invalid") this.state.stage = "recovery-blocked";
    else if (saved.kind === "record") { this.state.submission = saved.record; this.state.stage = saved.record.hash ? "pending" : "uncertain"; }
    try { readTestnetManualReview(storage); } catch { this.state.stage = "recovery-blocked"; }
    wallet.on?.("accountsChanged", this.changedAccounts); for (const e of ["chainChanged", "disconnect"]) wallet.on?.(e, this.changed);
  }
  snapshot = () => structuredClone(this.state);
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private publish(patch: Partial<TestnetLpWalletSnapshot>) { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) { try { fn(); } catch { /* UI observers cannot interrupt persistence. */ } } }
  invalidate() { this.generation++; this.publish({ account: null, study: null, observation: null, stage: this.state.submission ? this.state.submission.hash ? "pending" : "uncertain" : "invalidated" }); }
  invalidateInput() { this.generation++; this.publish({ study: null, observation: null, message: "", stage: this.state.submission ? this.state.submission.hash ? "pending" : "uncertain" : this.state.account ? "connected" : "disconnected" }); }
  dispose() { this.disposed = true; this.generation++; this.wallet.removeListener?.("accountsChanged", this.changedAccounts); for (const e of ["chainChanged", "disconnect"]) this.wallet.removeListener?.(e, this.changed); this.listeners.clear(); }
  private generationCheck(g: number) { bound(!this.disposed && g === this.generation); }
  private synchronize() {
    try { readTestnetManualReview(this.storage); } catch { this.publish({ stage: "recovery-blocked" }); throw new Error("Invalid archive"); }
    const saved = readTestnetLpSubmission(this.storage);
    if (saved.kind === "invalid") { this.publish({ stage: "recovery-blocked" }); throw new Error("Invalid recovery"); }
    const current = saved.kind === "record" ? saved.record : null;
    if (sameTestnetLpSubmission(current, this.state.submission)) return;
    if (current && current.hash === null && this.state.submission?.hash && sameTestnetLpSubmission(current, { ...this.state.submission, hash: null })) {
      writeTestnetLpSubmission(this.storage, this.state.submission, current); return;
    }
    this.generation++;
    if (this.state.submission) { this.publish({ stage: "recovery-blocked" }); throw new Error("Recovery conflict"); }
    this.publish({ submission: current, study: null, observation: null, stage: current ? current.hash ? "pending" : "uncertain" : this.state.account ? "connected" : "disconnected" });
  }
  private async run(fn: () => Promise<void>) {
    if (this.active || this.disposed) return; this.active = true; this.publish({ busy: true, message: "" });
    try { await this.coordination.run(async () => { this.synchronize(); bound(this.state.stage !== "recovery-blocked"); await fn(); }); }
    catch (e) { this.publish({ study: null, observation: null, stage: this.state.stage === "recovery-blocked" ? "recovery-blocked" : this.state.submission ? this.state.submission.hash ? "pending" : "uncertain" : "error",
      message: e instanceof OtherTestnetSubmissionError ? e.message : e instanceof TestnetBrowserError ? testnetLpMessage(e.code, !!this.state.submission)
        : this.state.submission ? "Preserve the original context and hash. Check its receipt; do not resend."
          : e && typeof e === "object" && "code" in e && e.code === 4001 ? "Wallet request rejected. Request a fresh study when you are ready."
          : e instanceof Error && e.message === "Unsupported wallet" ? "Use a standard account or the supported MetaMask delegation on Base Sepolia. Reconcile any archived unresolved approval first."
          : e instanceof Error && e.message === "Wrong chain" ? "Select Base Sepolia (84532) in MetaMask and connect again."
            : "Action unavailable or rejected. Check wallet, recovery history and Base Sepolia, then request a fresh study." }); }
    finally { this.active = false; this.publish({ busy: false }); }
  }
  private free() { bound(!this.state.submission && this.state.stage !== "recovery-blocked"); requireNoOtherTestnetSubmission(this.storage, "lp"); }
  private async walletCheck(owner: string, g: number) {
    const a = await this.wallet.request({ method: "eth_accounts" }); this.generationCheck(g); bound(same(account(a), owner));
    const chain = await this.wallet.request({ method: "eth_chainId" }); this.generationCheck(g);
    if (typeof chain !== "string" || !/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== 84532n) throw new Error("Wrong chain");
    if (readTestnetManualReview(this.storage).some(r => same(r.intent.wallet, owner))) throw new Error("Unsupported wallet");
    const code = await this.wallet.request({ method: "eth_getCode", params: [owner, "latest"] }); this.generationCheck(g);
    // The API separately verifies the runtime behind the recognized delegation indicator.
    try { classifyTestnetWalletCode(code); } catch { throw new Error("Unsupported wallet"); }
  }
  async connect() { return this.run(async () => { this.free(); const g = this.generation; this.connecting = true; this.grant = null;
    try { const owner = account(await this.wallet.request({ method: "eth_requestAccounts" })); this.generationCheck(g); bound(!this.grant || same(owner, this.grant));
      await this.walletCheck(owner, g); this.publish({ account: owner, stage: "connected" });
    } finally { this.connecting = false; this.grant = null; }
  }); }
  async study(value: TestnetLpIntent) { return this.run(async () => { this.free(); const intent = testnetLpIntentSchema.parse(value); bound(this.state.account && same(this.state.account, intent.wallet));
    const g = ++this.generation; this.publish({ study: null, observation: null }); await this.walletCheck(intent.wallet, g);
    const raw = await this.api.call("study", { intent }); this.generationCheck(g); const study = parseTestnetLpReview(raw, intent, this.now());
    this.publish({ study, stage: study.status === "prepared" ? "review" : "blocked" });
  }); }
  async submit() { return this.run(async () => {
    this.free(); bound(this.state.study && this.state.account); const original = parseTestnetLpStudy(this.state.study, this.now()); const g = this.generation;
    bound(original.status === "prepared" && original.executionEnabled && this.executionAllowed() && same(original.intent.wallet, this.state.account!));
    await this.walletCheck(original.intent.wallet, g);
    const raw = await this.api.call("recheck", { contextId: original.contextId }); this.generationCheck(g);
    const checked = parseTestnetLpReview(raw, original.intent, this.now(), original); await this.walletCheck(original.intent.wallet, g);
    this.free(); bound(checked.executionEnabled && this.executionAllowed()); parseTestnetLpStudy(checked, this.now());
    const marker = parseTestnetLpSubmission({ version: 1, study: checked, attemptedAt: this.now(), hash: null });
    requireNoOtherTestnetSubmission(this.storage, "lp"); writeTestnetLpSubmission(this.storage, marker);
    this.publish({ submission: marker, study: null, observation: null, stage: "uncertain" }); let result: unknown;
    try { this.generationCheck(g); parseTestnetLpStudy(marker.study, this.now()); bound(this.executionAllowed()); requireNoOtherTestnetSubmission(this.storage, "lp");
      const tx = marker.study.transaction!; result = await this.wallet.request({ method: "eth_sendTransaction", params: [{ from: tx.from, to: tx.to, data: tx.data, chainId: "0x14a34", value: "0x0", nonce: toHex(BigInt(tx.nonce)), gas: toHex(BigInt(tx.gas)), ...testnetRpcFeeFields(tx) }] });
    } catch (e) { if (e && typeof e === "object" && "code" in e && e.code === 4001) { clearTestnetLpSubmission(this.storage, marker); this.publish({ submission: null }); } throw e; }
    const sent = { ...marker, hash: walletHash.parse(result) }; this.publish({ submission: sent, stage: "pending" });
    try { writeTestnetLpSubmission(this.storage, sent, marker); } catch { this.publish({ message: "Copy the original hash now. Recovery storage could not be updated." }); }
    saveTestnetActivity(this.storage, { chainId: 84532, account: sent.study.intent.wallet, flow: "lp", kind: sent.study.actionKind, hash: sent.hash, status: "pending", observedAt: new Date(this.now()).toISOString() });
  }); }
  private tracked() { const rec = this.state.submission; bound(rec); if (this.now() - rec!.attemptedAt >= 86400000) throw new TestnetBrowserError(410, "TESTNET_CONTEXT_UNAVAILABLE"); return rec!; }
  private apply(o: TestnetLpReceipt) {
    const r = this.state.submission;
    if (r?.hash && same(r.hash, o.hash)) saveTestnetActivity(this.storage, {
      chainId: 84532, account: r.study.intent.wallet, flow: "lp", kind: r.study.actionKind, hash: r.hash, status: o.status, observedAt: o.observedAt,
      ...(o.verified ? { amount0: o.amount0, amount1: o.amount1, tokenId: o.tokenId ?? undefined,
        l2GasCost: o.l2GasCost, gasPayer: o.gasPayer ?? r.study.intent.wallet } : {}),
    });
    this.publish({ observation: o, stage: o.status === "unknown" ? "uncertain" : o.status }); }
  async observe() { return this.run(async () => { const rec = this.tracked(); bound(rec.hash); this.publish({ observation: null });
    const raw = await this.api.call("receipt", { contextId: rec.study.contextId, hash: rec.hash }); this.apply(parseTestnetLpObservation(raw, rec, this.now()));
  }); }
  async recoverHash(value: string) { return this.run(async () => { const rec = this.tracked(); bound(!rec.hash); const candidate = { ...rec, hash: walletHash.parse(value) }; this.publish({ observation: null });
    const raw = await this.api.call("receipt", { contextId: rec.study.contextId, hash: candidate.hash }); const o = parseTestnetLpObservation(raw, candidate, this.now());
    if (["pending", "confirming", "confirmed", "reverted"].includes(o.status)) { writeTestnetLpSubmission(this.storage, candidate, rec); this.publish({ submission: candidate }); } this.apply(o);
  }); }
  async acknowledge() { return this.run(async () => { const rec = this.tracked(); const o = this.state.observation;
    bound(o && o.verified && ["confirmed", "reverted"].includes(o.status) && ["confirmed", "reverted"].includes(this.state.stage));
    parseTestnetLpObservation({ observation: o }, rec, this.now()); clearTestnetLpSubmission(this.storage, rec);
    this.publish({ submission: null, observation: null, study: null, stage: this.state.account ? "connected" : "disconnected" });
  }); }
}
