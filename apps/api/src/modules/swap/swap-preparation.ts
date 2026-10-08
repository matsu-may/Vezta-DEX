import { z } from "zod";
import { hashTypedData, keccak256, concat, type Hex } from "viem";
import {
  PERMIT2_POLICY, POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, UNIVERSAL_ROUTER_VERSION,
  validateTradingIntent, validateTradingQuoteSummary,
  type Address, type Permit2Data, type TradingIntent,
} from "@vezta-dex/core";
import { QuoteStore } from "./quote-store";
import { PermitReader, type PermitChainSource } from "./permit-reader";
import { verifyPermitSignature } from "./permit-signature";
import { validateSwapCalldata } from "./swap-calldata";
import { TradingApiClient } from "./trading-client";
import { readBoundedJson } from "./trading-api";

export interface UnsignedSwapTransaction {
  chainId: 137;
  from: Address;
  to: Address;
  data: Hex;
  value: "0";
}
export interface SwapPreparationChainSource extends PermitChainSource {
  getTokenAllowance(token: Address, owner: Address, spender: Address, blockNumber: bigint): Promise<bigint>;
  getTokenBalance(token: Address, owner: Address, blockNumber: bigint): Promise<bigint>;
  getNativeBalance(owner: Address, blockNumber: bigint): Promise<bigint>;
  /** Live RPC fee suggestion; eth_gasPrice has no block parameter. */
  getGasPrice(): Promise<bigint>;
  simulateSwap(transaction: UnsignedSwapTransaction, blockNumber: bigint): Promise<void>;
  estimateSwapGas(transaction: UnsignedSwapTransaction, blockNumber: bigint): Promise<bigint>;
}
export interface SwapPreparationResult {
  chainId: 137;
  quoteId: string;
  intent: TradingIntent;
  quoteExpiresAt: string;
  deadline: string;
  transaction: UnsignedSwapTransaction & { gas: string; gasPrice: string };
  simulation: { status: "success"; source: "polygon-rpc"; blockNumber: string; observedAt: string };
}
export class SwapPreparationInputError extends Error {}
export class SwapPreparationUnavailableError extends Error {}

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const responseSchema = z.object({
  requestId: z.string().min(1).max(256),
  txFailureReason: z.string().nullish(),
  txFailureReasons: z.array(z.unknown()).optional(),
  swap: z.object({
    chainId: z.literal(137), from: address, to: address,
    data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})+$/).max(256002),
    value: z.literal("0"),
  }),
});
function uint(value: bigint, bits = 256): bigint {
  if (typeof value !== "bigint" || value < 0n || value >= 1n << BigInt(bits)) throw new Error();
  return value;
}
function recent(block: { number: bigint; timestamp: bigint }, now: number): void {
  uint(block.number); uint(block.timestamp);
  const observed = Number(block.timestamp) * 1000;
  if (!Number.isSafeInteger(observed) || observed > now + 5000 || now - observed > 120000) throw new Error();
}

/** Generates unsigned data only. Never signs, retries signed requests, or broadcasts. */
export class SwapPreparer {
  private readonly preparations = new Map<string, { result: SwapPreparationResult; summary: import("@vezta-dex/core").TradingQuoteSummary; permit?: Permit2Data; signature?: Hex }>();
  constructor(
    private readonly chain: SwapPreparationChainSource,
    private readonly store: QuoteStore,
    private readonly client: TradingApiClient,
    private readonly now: () => number = Date.now,
  ) {}

  async prepare(intent: TradingIntent, quoteId: string, signature?: Hex): Promise<SwapPreparationResult> {
    // Copy caller-owned intent before asynchronous work can change its binding.
    intent = { ...intent };
    let saved: ReturnType<QuoteStore["read"]>;
    try {
      validateTradingIntent(intent);
      if (!/^[0-9a-f]{48}$/.test(quoteId)) throw new Error();
      saved = this.store.read(quoteId, intent, UNIVERSAL_ROUTER_VERSION);
    } catch { throw new SwapPreparationInputError("Invalid swap preparation request"); }

    try {
      const fresh = () => {
        validateTradingQuoteSummary(saved.summary, intent, this.now());
        if (this.now() >= saved.expiresAt) throw new Error();
      };
      const plan = await new PermitReader(this.chain, this.store, this.now).getPlan(intent, quoteId);
      fresh();
      let permitData: Permit2Data | undefined;
      let acceptedSignature: Hex | undefined;
      if (plan.permit.kind === "sign") {
        permitData = plan.permit.data;
        acceptedSignature = await verifyPermitSignature(permitData, signature, intent.swapper);
      } else if (plan.permit.kind !== "ready" || signature !== undefined) throw new Error();
      fresh();
      const initialBlock = { number: BigInt(plan.blockNumber), timestamp: BigInt(Date.parse(plan.observedAt) / 1000) };
      await this.checkBalances(intent, initialBlock);
      fresh();

      // Check the ID after every async preflight, then atomically delete it before dispatch.
      // A failed or timed-out signed request can never recover this ID.
      const permitUse = permitData ? {
        // Same message signed in compact/65-byte form, or with another ECDSA nonce, is still one use.
        key: keccak256(concat([intent.swapper, hashTypedData({
          domain: permitData.domain, types: permitData.types, primaryType: "PermitSingle",
          message: { details: { token: permitData.values.details.token, amount: BigInt(permitData.values.details.amount), expiration: Number(permitData.values.details.expiration), nonce: Number(permitData.values.details.nonce) }, spender: permitData.values.spender, sigDeadline: BigInt(permitData.values.sigDeadline) },
        })])).slice(2),
        expiresAt: Number(permitData.values.sigDeadline) * 1000,
      } : undefined;
      saved = { ...this.store.consume(quoteId, intent, UNIVERSAL_ROUTER_VERSION, permitUse), expiresAt: saved.expiresAt };
      fresh();
      const deadline = BigInt(Math.floor(saved.expiresAt / 1000));
      if (deadline <= BigInt(Math.floor(this.now() / 1000))) throw new Error();
      const raw = saved.payload as { quote: unknown };
      const response = await this.client.post("/swap", {
        quote: raw.quote,
        ...(permitData ? { permitData, signature: acceptedSignature } : {}),
        deadline: Number(deadline), simulateTransaction: true,
      }, "execution");
      fresh();
      if (!response.ok) throw new Error();
      const parsed = responseSchema.parse(await readBoundedJson(response));
      fresh();
      if (parsed.txFailureReason || parsed.txFailureReasons?.length ||
          parsed.swap.from.toLowerCase() !== intent.swapper.toLowerCase() ||
          parsed.swap.to.toLowerCase() !== POLYGON_UNIVERSAL_ROUTER_212.toLowerCase()) throw new Error();
      const transaction: UnsignedSwapTransaction = { chainId: 137, from: intent.swapper, to: POLYGON_UNIVERSAL_ROUTER_212, data: parsed.swap.data as Hex, value: "0" };
      const validate = () => {
        fresh();
        validateSwapCalldata(transaction.data, { intent, summary: saved.summary, permitData, signature: acceptedSignature, deadline, now: this.now() });
      };
      validate();

      const block = await this.chain.getBlock();
      recent(block, this.now());
      if (block.number < initialBlock.number) throw new Error();
      await this.checkState(intent, block, permitData);
      validate();
      await this.chain.simulateSwap(transaction, block.number);
      validate();
      let { gas, gasPrice } = await this.checkGas(intent, transaction, block.number);
      validate();

      // Do not return a successful result if state changed while simulation/fees were read.
      const finalBlock = await this.chain.getBlock();
      recent(finalBlock, this.now());
      if (finalBlock.number < block.number) throw new Error();
      await this.checkState(intent, finalBlock, permitData);
      if (finalBlock.number !== block.number) {
        // A new block is normal on Polygon. Revalidate simulation/gas without replaying /swap.
        await this.chain.simulateSwap(transaction, finalBlock.number);
        validate();
        ({ gas, gasPrice } = await this.checkGas(intent, transaction, finalBlock.number));
        await this.checkState(intent, finalBlock, permitData);
      }
      if (uint(await this.chain.getNativeBalance(intent.swapper, finalBlock.number)) < gas * gasPrice) throw new Error();
      validate(); recent(finalBlock, this.now());
      const result: SwapPreparationResult = {
        chainId: 137, quoteId, intent, quoteExpiresAt: new Date(saved.expiresAt).toISOString(), deadline: deadline.toString(),
        transaction: { ...transaction, gas: gas.toString(), gasPrice: gasPrice.toString() },
        simulation: { status: "success", source: "polygon-rpc", blockNumber: finalBlock.number.toString(), observedAt: new Date(Number(finalBlock.timestamp) * 1000).toISOString() },
      };
      this.prunePreparations();
      if (this.preparations.size >= 128) this.preparations.delete(this.preparations.keys().next().value!);
      this.preparations.set(quoteId, { result: structuredClone(result), summary: structuredClone(saved.summary), permit: permitData && structuredClone(permitData), signature: acceptedSignature });
      return result;
    } catch { throw new SwapPreparationUnavailableError("Swap preparation is unavailable"); }
  }

  private prunePreparations(): void {
    for (const [id, entry] of this.preparations) if (Date.parse(entry.result.quoteExpiresAt) <= this.now()) this.preparations.delete(id);
  }

  /** Read-only refresh; never re-dispatches the consumed signed Uniswap request. */
  async recheck(value: TradingIntent, quoteId: string): Promise<SwapPreparationResult> {
    const intent = { ...value };
    try {
      validateTradingIntent(intent); this.prunePreparations();
      const entry = this.preparations.get(quoteId);
      if (!entry) throw new Error();
      const { result, summary, permit, signature } = structuredClone(entry);
      const validate = () => {
        validateTradingQuoteSummary(summary, intent, this.now());
        if (Date.parse(result.quoteExpiresAt) <= this.now()) throw new Error();
        validateSwapCalldata(result.transaction.data, { intent, summary, permitData: permit, signature, deadline: BigInt(result.deadline), now: this.now() });
      };
      validate();
      let block = await this.chain.getBlock(); recent(block, this.now());
      if (block.number < BigInt(result.simulation.blockNumber)) throw new Error();
      await this.checkState(intent, block, permit); validate();
      await this.chain.simulateSwap(result.transaction, block.number); validate();
      let gas = await this.checkGas(intent, result.transaction, block.number); validate();
      const latest = await this.chain.getBlock(); recent(latest, this.now());
      if (latest.number < block.number) throw new Error();
      await this.checkState(intent, latest, permit); validate();
      if (latest.number !== block.number) {
        block = latest;
        await this.chain.simulateSwap(result.transaction, block.number); validate();
        gas = await this.checkGas(intent, result.transaction, block.number);
        await this.checkState(intent, block, permit);
      }
      validate(); recent(block, this.now());
      return { ...result, intent, transaction: { ...result.transaction, gas: gas.gas.toString(), gasPrice: gas.gasPrice.toString() }, simulation: { status: "success", source: "polygon-rpc", blockNumber: block.number.toString(), observedAt: new Date(Number(block.timestamp) * 1000).toISOString() } };
    } catch { throw new SwapPreparationUnavailableError("Swap preparation is unavailable"); }
  }

  private async checkGas(intent: TradingIntent, transaction: UnsignedSwapTransaction, blockNumber: bigint): Promise<{ gas: bigint; gasPrice: bigint }> {
    const [estimate, price, native] = await Promise.all([
      this.chain.estimateSwapGas(transaction, blockNumber),
      this.chain.getGasPrice(), this.chain.getNativeBalance(intent.swapper, blockNumber),
    ]);
    // Local RPC suggestion with 20% fee/gas headroom; never use untrusted upstream gas fields.
    if (uint(estimate) === 0n || estimate > 25000000n || uint(price) === 0n) throw new Error();
    const gas = (estimate * 120n + 99n) / 100n;
    const gasPrice = (price * 120n + 99n) / 100n;
    uint(gasPrice);
    if (uint(native) < gas * gasPrice) throw new Error();
    return { gas, gasPrice };
  }

  private async checkBalances(intent: TradingIntent, block: { number: bigint; timestamp: bigint }): Promise<void> {
    recent(block, this.now());
    const [allowance, balance] = await Promise.all([
      this.chain.getTokenAllowance(intent.tokenIn, intent.swapper, POLYGON_PERMIT2, block.number),
      this.chain.getTokenBalance(intent.tokenIn, intent.swapper, block.number),
    ]);
    if (uint(allowance) !== BigInt(intent.amountIn) || uint(balance) < BigInt(intent.amountIn)) throw new Error();
    recent(block, this.now());
  }

  private async checkState(intent: TradingIntent, block: { number: bigint; timestamp: bigint }, permit?: Permit2Data): Promise<void> {
    recent(block, this.now());
    if (await this.chain.getAccountCode(intent.swapper, block.number) !== "0x") throw new Error();
    const state = await this.chain.getPermitAllowance(intent.tokenIn, intent.swapper, POLYGON_UNIVERSAL_ROUTER_212, block.number);
    uint(state.amount, 160); uint(state.expiration, 48); uint(state.nonce, 48);
    const seconds = BigInt(Math.floor(this.now() / 1000));
    if (permit) {
      if (state.nonce !== BigInt(permit.values.details.nonce) ||
          BigInt(permit.values.details.expiration) <= block.timestamp || BigInt(permit.values.sigDeadline) <= block.timestamp) throw new Error();
    } else if (state.amount !== BigInt(intent.amountIn) || state.expiration <= seconds || state.expiration <= block.timestamp || state.expiration > seconds + BigInt(PERMIT2_POLICY.maxAllowanceSeconds)) throw new Error();
    await this.checkBalances(intent, block);
  }
}
