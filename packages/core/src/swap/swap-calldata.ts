import { decodeAbiParameters, decodeFunctionData, encodeAbiParameters, encodeFunctionData, type AbiParameter, type Hex } from "viem";
import { POLYGON_UNIVERSAL_ROUTER_212, validatePermit2Data, validateTradingQuoteSummary, type Permit2Data, type TradingIntent, type TradingQuoteSummary } from "../index";
import { currencyAmountAbi, executeAbi, permitAbi, settleAbi, sweepAbi, takeAbi, v2InputAbi, v3InputAbi, v4ActionsAbi, v4MultiAbi, v4SingleAbi } from "./swap-abi";

const ZERO = "0x0000000000000000000000000000000000000000";
const SENDER = "0x0000000000000000000000000000000000000001";
const THIS = "0x0000000000000000000000000000000000000002";
const MAX_BYTES = 128_000;

export interface SwapCalldataContext {
  intent: TradingIntent;
  summary: TradingQuoteSummary;
  /** Already nonce-checked and signature-verified by the preparation caller. */
  permitData?: Permit2Data;
  signature?: Hex;
  deadline: bigint;
  now: number;
}
interface Leg { amount: bigint; minimum: bigint; recipient: "wallet" | "router" }
const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const requirePolicy = (value: unknown) => { if (!value) throw new Error("Invalid swap policy"); };

function word(data: Hex, byte: number): bigint {
  requirePolicy(Number.isSafeInteger(byte) && byte >= 0 && byte % 32 === 0 && 2 + (byte + 32) * 2 <= data.length);
  return BigInt(`0x${data.slice(2 + byte * 2, 2 + (byte + 32) * 2)}`);
}
function offset(data: Hex, byte: number): number {
  const value = word(data, byte);
  requirePolicy(value % 32n === 0n && value < BigInt((data.length - 2) / 2));
  return Number(value);
}
/** Bound attacker-supplied counts before viem allocates dynamic arrays. */
function boundArray(data: Hex, slot: number, max: number, base = 0): void {
  requirePolicy(word(data, base + offset(data, base + slot * 32)) <= BigInt(max));
}
function canonical<const T extends readonly AbiParameter[]>(abi: T, data: Hex) {
  const values = decodeAbiParameters(abi, data);
  requirePolicy(equal(encodeAbiParameters(abi, values as never), data));
  return values;
}
function currency(value: string): string {
  requirePolicy(/^0x[0-9a-fA-F]{40}$/.test(value) && !equal(value, ZERO));
  return value.toLowerCase();
}
function recipient(value: string, intent: TradingIntent): Leg["recipient"] {
  if (equal(value, THIS) || equal(value, POLYGON_UNIVERSAL_ROUTER_212)) return "router";
  requirePolicy(equal(value, SENDER) || equal(value, intent.swapper));
  return "wallet";
}
function pathCurrencies(path: readonly string[], intent: TradingIntent): void {
  requirePolicy(path.length >= 2 && path.length <= 17);
  const addresses = path.map(currency);
  requirePolicy(equal(addresses[0], intent.tokenIn) && equal(addresses.at(-1)!, intent.tokenOut));
  requirePolicy(addresses.every((token, index) => index === 0 || token !== addresses[index - 1]));
}
function prices(length: number, hops: number): void { requirePolicy(length === 0 || length === hops); }

function v2Leg(input: Hex, intent: TradingIntent): Leg {
  boundArray(input, 3, 17);
  boundArray(input, 5, 16);
  const [to, amount, minimum, path, payer, guards] = canonical(v2InputAbi, input);
  requirePolicy(payer === true);
  pathCurrencies(path, intent);
  prices(guards.length, path.length - 1);
  return { amount, minimum, recipient: recipient(to, intent) };
}
function v3Leg(input: Hex, intent: TradingIntent): Leg {
  boundArray(input, 5, 16);
  const [to, amount, minimum, path, payer, guards] = canonical(v3InputAbi, input);
  const bytes = (path.length - 2) / 2;
  requirePolicy(payer === true && bytes >= 43 && (bytes - 20) % 23 === 0 && bytes <= 20 + 23 * 16);
  const tokens = [path.slice(0, 42)];
  for (let byte = 20; byte < bytes; byte += 23) {
    const fee = Number.parseInt(path.slice(2 + byte * 2, 2 + (byte + 3) * 2), 16);
    requirePolicy(fee < 1_000_000);
    tokens.push(`0x${path.slice(2 + (byte + 3) * 2, 2 + (byte + 23) * 2)}`);
  }
  pathCurrencies(tokens, intent);
  prices(guards.length, tokens.length - 1);
  return { amount, minimum, recipient: recipient(to, intent) };
}
function pool(key: { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string }): void {
  requirePolicy(currency(key.currency0) < currency(key.currency1));
  requirePolicy(key.fee >= 0 && key.fee < 1_000_000 && key.tickSpacing >= 1 && key.tickSpacing <= 32_767 && equal(key.hooks, ZERO));
}
function v4Swap(action: number, input: Hex, intent: TradingIntent): { amount: bigint; minimum: bigint } {
  if (action === 0x06) {
    const [params] = canonical(v4SingleAbi, input);
    pool(params.poolKey);
    const { currency0, currency1 } = params.poolKey;
    pathCurrencies(params.zeroForOne ? [currency0, currency1] : [currency1, currency0], intent);
    requirePolicy(params.hookData === "0x");
    return { amount: params.amountIn, minimum: params.amountOutMinimum };
  }
  requirePolicy(action === 0x07);
  const base = offset(input, 0);
  boundArray(input, 1, 16, base);
  boundArray(input, 2, 16, base);
  const [params] = canonical(v4MultiAbi, input);
  const tokens = [params.currencyIn, ...params.path.map((hop) => hop.intermediateCurrency)];
  pathCurrencies(tokens, intent);
  prices(params.minHopPriceX36.length, params.path.length);
  params.path.forEach((hop, index) => {
    const [currency0, currency1] = [currency(tokens[index]), currency(tokens[index + 1])].sort();
    pool({ currency0, currency1, ...hop });
    requirePolicy(hop.hookData === "0x");
  });
  return { amount: params.amountIn, minimum: params.amountOutMinimum };
}
function v4Leg(input: Hex, intent: TradingIntent): Leg {
  boundArray(input, 1, 3);
  const [actions, params] = canonical(v4ActionsAbi, input);
  requirePolicy(actions.length === 8 && params.length === 3);
  const action = Number.parseInt(actions.slice(2, 4), 16);
  const settlement = Number.parseInt(actions.slice(4, 6), 16);
  const delivery = Number.parseInt(actions.slice(6, 8), 16);
  const result = v4Swap(action, params[0], intent);
  if (settlement === 0x0b) {
    const [token, amount, payer] = canonical(settleAbi, params[1]);
    requirePolicy(equal(token, intent.tokenIn) && payer === true && (amount === 0n || amount === result.amount));
  } else {
    requirePolicy(settlement === 0x0c);
    const [token, maximum] = canonical(currencyAmountAbi, params[1]);
    requirePolicy(equal(token, intent.tokenIn) && maximum === result.amount);
  }
  if (delivery === 0x0e) {
    const [token, to, amount] = canonical(takeAbi, params[2]);
    requirePolicy(equal(token, intent.tokenOut) && amount === 0n);
    return { ...result, recipient: recipient(to, intent) };
  }
  requirePolicy(delivery === 0x0f);
  const [token, minimum] = canonical(currencyAmountAbi, params[2]);
  requirePolicy(equal(token, intent.tokenOut));
  return { amount: result.amount, minimum: minimum > result.minimum ? minimum : result.minimum, recipient: "wallet" };
}
function boundPermit(input: Hex, data: Permit2Data, signature: Hex): void {
  const [permit, sig] = canonical(permitAbi, input);
  const expected = data.values;
  requirePolicy(equal(sig, signature) && equal(permit.spender, expected.spender) && BigInt(permit.sigDeadline) === BigInt(expected.sigDeadline));
  requirePolicy(equal(permit.details.token, expected.details.token));
  for (const key of ["amount", "expiration", "nonce"] as const) requirePolicy(BigInt(permit.details[key]) === BigInt(expected.details[key]));
}

/** Internal source-pinned monetary policy only: not deployment, signature, nonce, simulation or receipt verification. */
export function validateSwapCalldata(data: Hex, context: SwapCalldataContext): void {
  try {
    const { intent, summary, now, deadline } = context;
    requirePolicy(Number.isSafeInteger(now) && now >= 0 && typeof deadline === "bigint");
    validateTradingQuoteSummary(summary, intent, now);
    const quoted = Date.parse(summary.quotedAt);
    requirePolicy(quoted <= now && now < quoted + 30_000 && deadline > BigInt(Math.floor(now / 1_000)) && deadline <= BigInt(Math.floor((quoted + 30_000) / 1_000)));
    requirePolicy(!equal(intent.swapper, POLYGON_UNIVERSAL_ROUTER_212) && !equal(intent.swapper, THIS));
    requirePolicy(typeof data === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(data) && data.length <= 2 + MAX_BYTES * 2 && data.slice(0, 10).toLowerCase() === "0x3593564c");
    const body = `0x${data.slice(10)}` as Hex;
    boundArray(body, 1, 64);
    const decoded = decodeFunctionData({ abi: executeAbi, data });
    requirePolicy(equal(encodeFunctionData({ abi: executeAbi, functionName: "execute", args: decoded.args }), data));
    const [commands, inputs, end] = decoded.args;
    requirePolicy(end === deadline && commands.length > 2 && (commands.length - 2) / 2 === inputs.length);
    const hasPermit = context.permitData !== undefined;
    requirePolicy(hasPermit === (context.signature !== undefined));
    if (hasPermit) {
      const permit = validatePermit2Data(context.permitData, intent, BigInt(context.permitData!.values.details.nonce), now);
      requirePolicy(/^0x(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/.test(context.signature!));
      requirePolicy(deadline <= BigInt(permit.values.sigDeadline) && deadline <= BigInt(permit.values.details.expiration));
    }
    let permitSeen = false;
    let swaps = 0;
    let declaredInput = 0n;
    let walletMinimum = 0n;
    let custody = false;
    let swept = false;
    for (let index = 0; index < inputs.length; index++) {
      const command = Number.parseInt(commands.slice(2 + index * 2, 4 + index * 2), 16);
      if (command === 0x0a) {
        requirePolicy(hasPermit && index === 0 && !permitSeen);
        boundPermit(inputs[index], context.permitData!, context.signature!);
        permitSeen = true;
        continue;
      }
      if (command === 0x04) {
        requirePolicy(custody && !swept && index === inputs.length - 1);
        const [token, to, minimum] = canonical(sweepAbi, inputs[index]);
        // Dispatcher narrows this uint256 to uint160 before calling Payments.sweep.
        requirePolicy(equal(token, intent.tokenOut) && recipient(to, intent) === "wallet" && minimum < 1n << 160n);
        walletMinimum += minimum;
        swept = true;
        continue;
      }
      requirePolicy(!swept);
      let leg: Leg;
      if (command === 0x00) leg = v3Leg(inputs[index], intent);
      else if (command === 0x08) leg = v2Leg(inputs[index], intent);
      else { requirePolicy(command === 0x10); leg = v4Leg(inputs[index], intent); }
      requirePolicy(leg.amount > 0n && leg.amount <= BigInt(intent.amountIn) && ++swaps <= 32);
      declaredInput += leg.amount;
      if (leg.recipient === "wallet") walletMinimum += leg.minimum;
      else custody = true;
    }
    requirePolicy(permitSeen === hasPermit && swaps > 0 && declaredInput === BigInt(intent.amountIn) && (!custody || swept) && walletMinimum >= BigInt(summary.minimumAmountOut));
  } catch {
    throw new Error("Unsupported or invalid swap calldata");
  }
}
