import { keccak256, toHex, type Hex } from "viem";
import { validateTradingQuoteSummary, verifyPermitSignature, type Address, type TradingIntent, type TradingQuoteSummary } from "@vezta-dex/core";
import { applyReceiptObservation, startReceiptTracking, type ReceiptTrackingState } from "./receipt-tracking";
import { parseApproval, parseObservation, parsePermit, parsePreparation, parseQuote, parseState, validateRehearsalIntent, hashSchema, type Approval, type Execution, type PermitPlan, type Preparation, type SubmissionRecord, type WalletState } from "./rehearsal-contracts";
import { readSubmission, saveSubmission, clearSubmission, sameSubmission, type SubmissionStorage } from "./rehearsal-storage";
import { browserCoordination, type RehearsalCoordination } from "./rehearsal-coordination";
export type RehearsalAction = "quote" | "approval" | "state" | "permit" | "prepare" | "recheck" | "receipt";
export interface RehearsalApi {
  call(action: RehearsalAction, body: unknown): Promise<unknown>;
}
export interface RehearsalWallet {
  request(args: {
    method: string;
    params?: unknown[];
  }): Promise<unknown>;
  on?(name: string, listener: (...args: unknown[]) => void): void;
  removeListener?(name: string, listener: (...args: unknown[]) => void): void;
}
export type RehearsalStage = "disconnected" | "connected" | "quote-review" | "permit-review" | "permit-signed" | "swap-review" | "pending" | "confirming" | "delayed" | "unavailable" | "uncertain" | "requote" | "confirmed" | "reverted" | "verification-needed" | "invalidated" | "error" | "recovery-blocked";
export interface RehearsalSnapshot {
  stage: RehearsalStage;
  busy: boolean;
  message: string;
  account: Address | null;
  intent: TradingIntent | null;
  quote: TradingQuoteSummary | null;
  quoteId: string | null;
  approval: Approval | null;
  walletState: WalletState | null;
  permit: PermitPlan | null;
  preparation: Preparation | null;
  submission: SubmissionRecord | null;
  execution: Execution | null;
}
class FlowError extends Error {
}
function firstAccount(value: unknown): Address {
  if (!Array.isArray(value) || typeof value[0] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value[0]))
    throw new FlowError("Wallet account unavailable. Connect again.");
  return value[0] as Address;
}
const initial: RehearsalSnapshot = { stage: "disconnected", busy: false, message: "", account: null, intent: null, quote: null, quoteId: null, approval: null, walletState: null, permit: null, preparation: null, submission: null, execution: null };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Each method is one explicit UI action. No automatic signing or broadcast. */
export class RehearsalController {
  private state: RehearsalSnapshot = { ...initial };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private locked = false;
  private disposed = false;
  private signature: Hex | undefined;
  private tracking: ReceiptTrackingState | null = null;
  private connecting = false;
  private grantAccount: Address | null = null;
  private readonly accountEvent = (accounts: unknown) => {
    try {
      const next = firstAccount(accounts);
      if (this.connecting && !this.grantAccount) {
        this.grantAccount = next;
        return;
      }
      if (this.connecting && this.grantAccount && same(next, this.grantAccount))
        return;
      if (this.state.account && same(next, this.state.account))
        return;
    }
    catch { /* Invalid event invalidates context. */ }
    this.invalidate();
  };
  private readonly resetEvent = () => this.invalidate();
  constructor(private readonly wallet: RehearsalWallet, private readonly api: RehearsalApi, private readonly storage: SubmissionStorage, private readonly now: () => number = Date.now, private readonly coordination: RehearsalCoordination = browserCoordination) {
    const saved = readSubmission(storage);
    if (saved.kind === "invalid")
      this.state = { ...initial, stage: "recovery-blocked", message: "Stored submission cannot be verified. Inspect wallet history before clearing local recovery data." };
    if (saved.kind === "record") {
      this.state = { ...initial, stage: saved.record.hash ? "pending" : "uncertain", submission: saved.record, message: "Recovered original submission. Check its status; do not submit it again." };
      this.track(saved.record);
    }
    wallet.on?.("accountsChanged", this.accountEvent);
    wallet.on?.("chainChanged", this.resetEvent);
    wallet.on?.("disconnect", this.resetEvent);
  }
  snapshot = (): RehearsalSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(patch: Partial<RehearsalSnapshot>): void { this.state = { ...this.state, ...patch }; for (const fn of this.listeners)
    fn(); }
  invalidate(): void {
    this.generation++;
    this.signature = undefined;
    this.grantAccount = null;
    this.publish({ account: null, intent: null, quote: null, quoteId: null, approval: null, permit: null, preparation: null, walletState: null, stage: this.state.submission ? (this.state.submission.hash ? "pending" : "uncertain") : "invalidated", message: "Wallet or input changed. Original submissions remain tracked; reconnect for a fresh intent." });
  }
  dispose(): void { this.disposed = true; this.invalidate(); this.wallet.removeListener?.("accountsChanged", this.accountEvent); this.wallet.removeListener?.("chainChanged", this.resetEvent); this.wallet.removeListener?.("disconnect", this.resetEvent); this.listeners.clear(); }
  private assertGeneration(generation: number): void { if (this.disposed || generation !== this.generation)
    throw new FlowError("Wallet or input changed. Review a fresh quote."); }
  private async walletCheck(owner: Address, generation: number): Promise<void> {
    const accounts = await this.wallet.request({ method: "eth_accounts" });
    this.assertGeneration(generation);
    const chain = await this.wallet.request({ method: "eth_chainId" });
    this.assertGeneration(generation);
    if (!same(firstAccount(accounts), owner) || typeof chain !== "string" || !/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== 137n)
      throw new FlowError("Wallet account or chain changed. Connect on Polygon again.");
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.locked || this.disposed)
      return;
    this.locked = true;
    this.publish({ busy: true, message: "" });
    try {
      await this.coordination.run(async () => {
        this.synchronizeRecovery();
        if (this.disposed || this.state.stage === "recovery-blocked")
          throw new FlowError("Recovery changed or is unavailable. Inspect wallet history before continuing.");
        await action();
      });
    }
    catch (error) {
      if (this.state.stage === "recovery-blocked") {
        this.publish({ message: "Recovery changed or is unavailable. Preserve original hashes and investigate before continuing." });
      }
      else if (this.state.submission) {
        this.publish({ stage: this.state.submission.hash ? "unavailable" : "uncertain", message: error instanceof FlowError ? error.message : "Submission status is uncertain. Check the original transaction; do not send again." });
      }
      else
        this.publish({ stage: "error", message: error instanceof FlowError ? error.message : "Action unavailable or rejected. Request and review a fresh quote." });
    }
    finally {
      this.locked = false;
      this.publish({ busy: false });
    }
  }
  synchronizeRecovery(): void {
    const saved = readSubmission(this.storage);
    const record = saved.kind === "record" ? saved.record : null;
    if (saved.kind !== "invalid" && sameSubmission(record, this.state.submission)) return;
    this.generation++;
    this.signature = undefined;
    if (saved.kind === "invalid" || this.state.submission) {
      this.publish({ stage: "recovery-blocked", quote: null, quoteId: null, permit: null, preparation: null,
        message: "Recovery record changed. Preserve the original hash and inspect wallet history before continuing." });
      return;
    }
    if (record) {
      this.track(record);
      this.publish({ ...initial, busy: this.state.busy, submission: record, stage: record.hash ? "pending" : "uncertain",
        message: "Another tab recorded a submission. Follow its original identity; do not submit again." });
    }
  }
  private free(): void { if (this.state.stage === "recovery-blocked" || this.state.submission)
    throw new FlowError("Resolve the original submission before starting another action."); }
  private current(): {
    intent: TradingIntent;
    quote: TradingQuoteSummary;
    quoteId: string;
    generation: number;
  } {
    const { intent, quote, quoteId } = this.state;
    if (!intent || !quote || !quoteId || !this.state.account || !same(this.state.account, intent.swapper))
      throw new FlowError("Request and review a fresh quote first.");
    validateRehearsalIntent(intent);
    validateTradingQuoteSummary(quote, intent, this.now());
    if (this.now() >= Date.parse(quote.quotedAt) + 30000)
      throw new FlowError("Quote expired. Request a fresh quote.");
    return { intent: { ...intent }, quote: { ...quote }, quoteId, generation: this.generation };
  }
  private async live(intent: TradingIntent, generation: number, ready: boolean): Promise<WalletState> {
    const state = parseState(await this.api.call("state", intent), intent, this.now());
    this.assertGeneration(generation);
    if (state.accountKind !== "eoa")
      throw new FlowError("Only an EOA without account code is supported.");
    if (BigInt(state.balances.USDC) < BigInt(intent.amountIn))
      throw new FlowError("Insufficient native USDC balance.");
    if (state.tokenAllowance !== "0" && state.tokenAllowance !== intent.amountIn)
      throw new FlowError("Different existing allowance. No automatic revoke or reuse.");
    if (ready && state.tokenAllowance !== intent.amountIn)
      throw new FlowError("Exact approval changed. Request a fresh quote.");
    return state;
  }
  async connect(): Promise<void> {
    return this.run(async () => {
      if (this.state.stage === "recovery-blocked")
        throw new FlowError("Inspect stored submission recovery first.");
      const generation = this.generation;
      this.connecting = true;
      this.grantAccount = null;
      try {
        const requested = firstAccount(await this.wallet.request({ method: "eth_requestAccounts" }));
        this.assertGeneration(generation);
        if (this.grantAccount && !same(requested, this.grantAccount))
          throw new FlowError("Wallet changed during connection.");
        await this.walletCheck(requested, generation);
        this.publish({ account: requested, stage: this.state.submission ? this.state.stage : "connected" });
      }
      finally {
        this.connecting = false;
        this.grantAccount = null;
      }
    });
  }
  async quote(value: TradingIntent): Promise<void> {
    return this.run(async () => {
      this.free();
      validateRehearsalIntent(value);
      const intent = structuredClone(value);
      const generation = ++this.generation;
      this.signature = undefined;
      if (!this.state.account || !same(this.state.account, intent.swapper))
        throw new FlowError("Connect the selected account first.");
      this.publish({ intent, quote: null, quoteId: null, permit: null, preparation: null, execution: null });
      await this.walletCheck(intent.swapper, generation);
      const quote = parseQuote(await this.api.call("quote", intent), intent, this.now());
      this.assertGeneration(generation);
      const state = await this.live(intent, generation, false);
      const approval = parseApproval(await this.api.call("approval", intent), intent, this.now());
      this.assertGeneration(generation);
      await this.walletCheck(intent.swapper, generation);
      validateTradingQuoteSummary(quote.quote, intent, this.now());
      if (approval.plan.kind.startsWith("blocked") || approval.currentAllowance !== state.tokenAllowance)
        throw new FlowError("Approval state changed or unsupported. Review current allowance.");
      this.publish({ stage: "quote-review", quote: quote.quote, quoteId: quote.quoteId, approval, walletState: state });
    });
  }
  private track(record: SubmissionRecord): void {
    this.tracking = record.hash ? startReceiptTracking({ kind: record.kind, intent: record.intent, hash: record.hash }, { requiredConfirmations: 2, timeoutMs: 60000 }, record.submittedAt) : null;
  }
  private async broadcast(record: SubmissionRecord, transaction: Preparation["transaction"]): Promise<void> {
    // Storage failure aborts before any wallet prompt. The marker also survives reload mid-prompt.
    saveSubmission(this.storage, record);
    this.publish({ submission: record, stage: "uncertain" });
    let result: unknown;
    try {
      result = await this.wallet.request({ method: "eth_sendTransaction", params: [{ from: transaction.from, to: transaction.to, data: transaction.data, value: "0x0", chainId: "0x89", gas: toHex(BigInt(transaction.gas)), gasPrice: toHex(BigInt(transaction.gasPrice)), nonce: toHex(BigInt(record.expectedNonce)) }] });
    }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 4001) {
        clearSubmission(this.storage, record);
        this.publish({ submission: null });
      }
      throw error;
    }
    const hash = hashSchema.parse(result);
    const submitted = { ...record, hash };
    // Do not discard a sent hash when the form, account or component changed while wallet was open.
    this.track(submitted);
    this.publish({ submission: submitted, stage: "pending", message: "Submitted. Following the original Polygon transaction." });
    try {
      saveSubmission(this.storage, submitted, record);
    }
    catch {
      this.publish({ message: "Submitted hash retained in this page. Copy it now; recovery storage could not be updated." });
    }
    this.signature = undefined;
    this.publish({ quote: null, quoteId: null, permit: null, preparation: null });
  }
  async approve(): Promise<void> {
    return this.run(async () => {
      this.free();
      if (this.state.stage !== "quote-review" || this.state.approval?.plan.kind !== "approve")
        throw new FlowError("Review an exact approval first.");
      const c = this.current();
      const state = await this.live(c.intent, c.generation, false);
      const approval = parseApproval(await this.api.call("approval", c.intent), c.intent, this.now());
      this.assertGeneration(c.generation);
      if (approval.plan.kind !== "approve" || state.tokenAllowance !== "0" || !state.approvalGas)
        throw new FlowError("Allowance changed. Refresh the quote and review again.");
      if (BigInt(state.balances.POL) < BigInt(state.approvalGas.gas) * BigInt(state.approvalGas.gasPrice))
        throw new FlowError("Insufficient POL for approval gas.");
      const reviewed = this.state.walletState?.approvalGas;
      if (!reviewed || BigInt(state.approvalGas.gas) * BigInt(state.approvalGas.gasPrice) > BigInt(reviewed.gas) * BigInt(reviewed.gasPrice)) {
        this.publish({ walletState: state, message: "Approval gas increased. Review the updated estimate and click again." });
        return;
      }
      await this.walletCheck(c.intent.swapper, c.generation);
      this.current();
      const tx = { ...approval.plan.transaction, ...state.approvalGas };
      await this.broadcast({ kind: "approval", intent: c.intent, hash: null, submissionId: crypto.randomUUID(), afterBlock: state.blockNumber, expectedNonce: state.accountNonce, dataHash: keccak256(tx.data), minimumAmountOut: "0", submittedAt: this.now() }, tx);
    });
  }
  async reviewPermit(): Promise<void> {
    return this.run(async () => {
      this.free();
      if (this.state.stage !== "quote-review" || this.state.approval?.plan.kind !== "ready")
        throw new FlowError("An exact approval and fresh quote are required.");
      const c = this.current();
      const state = await this.live(c.intent, c.generation, true);
      const permit = parsePermit(await this.api.call("permit", { ...c.intent, quoteId: c.quoteId }), c.intent, c.quoteId, c.quote, state.permitAllowance.nonce, this.now());
      this.assertGeneration(c.generation);
      if (permit.permit.kind !== "sign" && permit.permit.kind !== "ready")
        throw new FlowError("Permit allowance or account unsupported.");
      if (permit.permit.kind === "ready" && (state.permitAllowance.amount !== c.intent.amountIn || BigInt(state.permitAllowance.expiration) <= BigInt(Math.floor(this.now() / 1000))))
        throw new FlowError("Permit allowance changed.");
      this.current();
      this.publish({ permit, walletState: state, stage: "permit-review" });
    });
  }
  async sign(): Promise<void> {
    return this.run(async () => {
      this.free();
      const c = this.current();
      const reviewed = this.state.permit;
      if (this.state.stage !== "permit-review" || reviewed?.permit.kind !== "sign")
        throw new FlowError("Review the Permit2 message first.");
      const state = await this.live(c.intent, c.generation, true);
      const fresh = parsePermit(await this.api.call("permit", { ...c.intent, quoteId: c.quoteId }), c.intent, c.quoteId, c.quote, state.permitAllowance.nonce, this.now());
      this.assertGeneration(c.generation);
      if (fresh.permit.kind !== "sign" || JSON.stringify(fresh.permit.data) !== JSON.stringify(reviewed.permit.data))
        throw new FlowError("Permit message changed. Request a fresh quote.");
      await this.walletCheck(c.intent.swapper, c.generation);
      this.current();
      const data = fresh.permit.data;
      const signature = await this.wallet.request({ method: "eth_signTypedData_v4", params: [c.intent.swapper, JSON.stringify({ domain: data.domain, types: { ...data.types, EIP712Domain: [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] }, primaryType: "PermitSingle", message: data.values })] });
      this.assertGeneration(c.generation);
      await this.walletCheck(c.intent.swapper, c.generation);
      this.current();
      this.signature = await verifyPermitSignature(data, signature, c.intent.swapper);
      this.assertGeneration(c.generation);
      this.current();
      this.publish({ stage: "permit-signed" });
    });
  }
  async prepare(): Promise<void> {
    return this.run(async () => {
      this.free();
      const c = this.current();
      const plan = this.state.permit?.permit;
      if (!plan || !((plan.kind === "ready" && this.state.stage === "permit-review") || (plan.kind === "sign" && this.signature && this.state.stage === "permit-signed")))
        throw new FlowError("A reviewed permit is required.");
      await this.walletCheck(c.intent.swapper, c.generation);
      this.current();
      const preparation = parsePreparation(await this.api.call("prepare", { ...c.intent, quoteId: c.quoteId, ...(this.signature ? { signature: this.signature } : {}) }), c.intent, c.quoteId, c.quote, plan.kind === "sign" ? plan.data : undefined, this.signature, this.now());
      this.assertGeneration(c.generation);
      this.current();
      this.publish({ preparation, stage: "swap-review" });
    });
  }
  async submit(): Promise<void> {
    return this.run(async () => {
      this.free();
      const c = this.current();
      const reviewed = this.state.preparation;
      const plan = this.state.permit?.permit;
      if (this.state.stage !== "swap-review" || !reviewed || !plan)
        throw new FlowError("Review the simulated swap first.");
      const state = await this.live(c.intent, c.generation, true);
      const fresh = parsePreparation(await this.api.call("recheck", { ...c.intent, quoteId: c.quoteId }), c.intent, c.quoteId, c.quote, plan.kind === "sign" ? plan.data : undefined, this.signature, this.now());
      this.assertGeneration(c.generation);
      if (fresh.transaction.data !== reviewed.transaction.data)
        throw new FlowError("Prepared calldata changed.");
      const cost = BigInt(fresh.transaction.gas) * BigInt(fresh.transaction.gasPrice);
      if (BigInt(state.balances.POL) < cost)
        throw new FlowError("Insufficient POL for swap gas.");
      if (cost > BigInt(reviewed.transaction.gas) * BigInt(reviewed.transaction.gasPrice)) {
        this.publish({ preparation: fresh, walletState: state, message: "Gas estimate increased. Review the updated cost and click again." });
        return;
      }
      await this.walletCheck(c.intent.swapper, c.generation);
      this.current();
      await this.broadcast({ kind: "swap", intent: c.intent, hash: null, submissionId: crypto.randomUUID(), afterBlock: state.blockNumber, expectedNonce: state.accountNonce, dataHash: keccak256(fresh.transaction.data), minimumAmountOut: c.quote.minimumAmountOut, submittedAt: this.now() }, fresh.transaction);
    });
  }
  private executionMatches(record: SubmissionRecord, evidence: Execution | null, expected: "verified" | "reverted"): boolean {
    if (evidence?.status !== expected || !evidence.balances || !evidence.gasCost
      || evidence.nonce !== record.expectedNonce || evidence.tokenAllowance === undefined || !evidence.permitAllowance) return false;
    if (expected === "verified" && (record.kind === "approval" ? evidence.tokenAllowance !== record.intent.amountIn
      : evidence.amountIn !== record.intent.amountIn || !evidence.amountOut || BigInt(evidence.amountOut) < BigInt(record.minimumAmountOut))) return false;
    return true;
  }
  async recover(hash: unknown): Promise<void> {
    return this.run(async () => {
      const marker = this.state.submission;
      if (!marker || marker.hash)
        throw new FlowError("No uncertain submission to recover.");
      const record = { ...marker, hash: hashSchema.parse(hash) };
      // A manually supplied hash is only a read-only candidate until identity and execution are proven.
      const response = parseObservation(await this.api.call("receipt", record));
      const tracking = startReceiptTracking({ kind: record.kind, intent: record.intent, hash: record.hash }, { requiredConfirmations: 2, timeoutMs: 60000 }, record.submittedAt);
      const update = applyReceiptObservation(tracking, response.observation, this.now());
      const expected = update.state.status === "reverted" ? "reverted" : "verified";
      if (!["confirmed", "reverted"].includes(update.state.status) || !this.executionMatches(record, response.execution, expected))
        throw new FlowError("Candidate hash is not yet verified. Check wallet activity, correct it or retry this read; never resend.");
      saveSubmission(this.storage, record, marker);
      this.tracking = update.state;
      this.publish({ submission: record, execution: response.execution,
        stage: record.kind === "approval" && expected === "verified" ? "requote" : update.state.status,
        message: "Original candidate verified against its nonce, inclusion and execution. No wallet action was requested." });
    });
  }
  async checkReceipt(): Promise<void> {
    return this.run(async () => {
      const record = this.state.submission;
      if (!record?.hash || !this.tracking)
        throw new FlowError("A validated transaction hash is required.");
      const response = parseObservation(await this.api.call("receipt", record));
      if (this.state.submission?.hash !== record.hash)
        return;
      const update = applyReceiptObservation(this.tracking, response.observation, this.now());
      if (update.state === this.tracking)
        return;
      this.tracking = update.state;
      if (update.state.status === "confirmed" || update.state.status === "reverted") {
        const expected = update.state.status === "reverted" ? "reverted" : "verified";
        const evidence = response.execution;
        if (!this.executionMatches(record, evidence, expected)) {
          this.publish({ stage: "verification-needed", execution: evidence, message: "Receipt observed, but execution/nonce/allowance evidence is not verified. Do not repeat the transaction." });
          return;
        }
        const approval = record.kind === "approval" && expected === "verified";
        this.publish({ execution: evidence, stage: approval ? "requote" : update.state.status, message: approval ? "Exact approval verified. Clear this verified record, then fetch and review a fresh quote." : "Canonical receipt and execution observed with two confirmations. This is not irreversible finality." });
      }
      else
        this.publish({ stage: update.state.status, message: update.state.status === "delayed" ? "Receipt delayed. Follow the same hash; do not resubmit." : "Following the original Polygon transaction." });
    });
  }
  async clearVerified(): Promise<void> {
    return this.run(async () => {
      if (!this.state.submission || !this.state.execution || !["requote", "confirmed", "reverted"].includes(this.state.stage))
        throw new FlowError("Only a verified record can be cleared.");
      clearSubmission(this.storage, this.state.submission);
      this.tracking = null;
      this.signature = undefined;
      const account = this.state.account;
      this.generation++;
      this.publish({ ...initial, account, stage: account ? "connected" : "disconnected", busy: true, message: "Verified record cleared. A new quote and explicit review are required." });
    });
  }
}
