import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters, type Hex } from "viem";
import { POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, TOKENS, type Permit2Data, type TradingIntent, type TradingQuoteSummary } from "@vezta-dex/core";
import { validateSwapCalldata } from "./swap-calldata";

// Test encoders use independent ABI literals taken from the pinned Solidity sources.
const executeAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
const v2Abi = parseAbiParameters("address recipient,uint256 amountIn,uint256 amountOutMin,address[] path,bool payerIsUser,uint256[] minHopPriceX36");
const v3Abi = parseAbiParameters("address recipient,uint256 amountIn,uint256 amountOutMin,bytes path,bool payerIsUser,uint256[] minHopPriceX36");
const singleAbi = parseAbiParameters("((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)");
const multiAbi = parseAbiParameters("(address currencyIn,(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)[] path,uint256[] minHopPriceX36,uint128 amountIn,uint128 amountOutMinimum)");
const zero = "0x0000000000000000000000000000000000000000" as const;
const sender = "0x0000000000000000000000000000000000000001" as const;
const router = "0x0000000000000000000000000000000000000002" as const;
const other = "0x2222222222222222222222222222222222222222" as const;
const now = Date.parse("2026-09-28T00:00:00Z");
const deadline = BigInt(now / 1000 + 30);
const intent: TradingIntent = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
const summary: TradingQuoteSummary = { ...intent, chainId: 137, amountOut: "1000", minimumAmountOut: "995", routing: "CLASSIC", routerVersion: "2.1.2", requestId: "test", source: "uniswap-trading-api", quotedAt: new Date(now).toISOString() };
const context = { intent, summary, now, deadline };
const path = `0x${intent.tokenIn.slice(2)}0001f4${intent.tokenOut.slice(2)}` as Hex;
const poolKey = { currency0: intent.tokenIn, currency1: intent.tokenOut, fee: 500, tickSpacing: 10, hooks: zero };
const single = { poolKey, zeroForOne: true, amountIn: 1_000_000n, amountOutMinimum: 995n, minHopPriceX36: 0n, hookData: "0x" as Hex };
const multi = { currencyIn: intent.tokenIn, path: [{ intermediateCurrency: intent.tokenOut, fee: 500, tickSpacing: 10, hooks: zero, hookData: "0x" as Hex }], minHopPriceX36: [] as bigint[], amountIn: 1_000_000n, amountOutMinimum: 995n };
const encode = (commands: Hex, inputs: readonly Hex[], end = deadline) => encodeFunctionData({ abi: executeAbi, functionName: "execute", args: [commands, inputs, end] });
const v2 = (amount = 1_000_000n, minimum = 995n, recipient: `0x${string}` = sender, payer = true, route = [intent.tokenIn, intent.tokenOut], prices: bigint[] = []) => encodeAbiParameters(v2Abi, [recipient, amount, minimum, route, payer, prices]);
const v3 = (amount = 1_000_000n, minimum = 995n, recipient: `0x${string}` = sender, payer = true, route = path, prices: bigint[] = []) => encodeAbiParameters(v3Abi, [recipient, amount, minimum, route, payer, prices]);
const settle = (token = intent.tokenIn, amount = 0n, payer = true) => encodeAbiParameters(parseAbiParameters("address,uint256,bool"), [token, amount, payer]);
const take = (recipient: `0x${string}` = sender, amount = 0n, token = intent.tokenOut) => encodeAbiParameters(parseAbiParameters("address,address,uint256"), [token, recipient, amount]);
const v4 = (swap = encodeAbiParameters(singleAbi, [single]), action: Hex = "0x06", payment = settle(), delivery = take()) => encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [`${action}0b0e` as Hex, [swap, payment, delivery]]);
const sweep = (minimum = 995n, recipient: `0x${string}` = sender, token = intent.tokenOut) => encodeAbiParameters(parseAbiParameters("address,address,uint256"), [token, recipient, minimum]);

describe("Universal Router 2.1.2 calldata policy", () => {
  it("accepts exact-input V2/V3 and isolated hook-free V4 in both directions", () => {
    for (const [commands, input] of [["0x08", v2()], ["0x00", v3()], ["0x10", v4()], ["0x10", v4(encodeAbiParameters(multiAbi, [multi]), "0x07")]] as const) {
      expect(() => validateSwapCalldata(encode(commands, [input]), context)).not.toThrow();
    }
    const reverseIntent = { ...intent, tokenIn: intent.tokenOut, tokenOut: intent.tokenIn };
    const reverseSummary = { ...summary, tokenIn: intent.tokenOut, tokenOut: intent.tokenIn };
    const reverse = { ...single, zeroForOne: false };
    const input = v4(encodeAbiParameters(singleAbi, [reverse]), "0x06", settle(reverseIntent.tokenIn), take(sender, 0n, reverseIntent.tokenOut));
    expect(() => validateSwapCalldata(encode("0x10", [input]), { ...context, intent: reverseIntent, summary: reverseSummary })).not.toThrow();
  });

  it("accepts aggregate output custody only with a final bounded wallet sweep", () => {
    expect(() => validateSwapCalldata(encode("0x000804", [v3(500_000n, 0n, router), v2(500_000n, 0n, router), sweep()]), context)).not.toThrow();
    expect(() => validateSwapCalldata(encode("0x001004", [v3(500_000n, 495n), v4(encodeAbiParameters(singleAbi, [{ ...single, amountIn: 500_000n, amountOutMinimum: 0n }]), "0x06", settle(), take(router)), sweep(500n)]), context)).not.toThrow();
  });

  it("allows multi-hop paths with correctly sized price guards", () => {
    const multiV3 = `0x${intent.tokenIn.slice(2)}0001f4${other.slice(2)}000bb8${intent.tokenOut.slice(2)}` as Hex;
    expect(() => validateSwapCalldata(encode("0x00", [v3(1_000_000n, 995n, intent.swapper, true, multiV3, [1n, 2n])]), context)).not.toThrow();
    expect(() => validateSwapCalldata(encode("0x08", [v2(1_000_000n, 995n, sender, true, [intent.tokenIn, other, intent.tokenOut], [1n, 2n])]), context)).not.toThrow();
    const hops = [{ ...multi.path[0], intermediateCurrency: other }, multi.path[0]];
    expect(() => validateSwapCalldata(encode("0x10", [v4(encodeAbiParameters(multiAbi, [{ ...multi, path: hops, minHopPriceX36: [1n, 2n] }]), "0x07")]), context)).not.toThrow();
  });

  it.each([0n, 999_999n, 1_000_001n, 1n << 255n])("rejects non-exact or sentinel input %s", (amount) => {
    expect(() => validateSwapCalldata(encode("0x00", [v3(amount)]), context)).toThrow();
  });
  it("rejects duplicate spending and deficient aggregate minima", () => {
    expect(() => validateSwapCalldata(encode("0x0000", [v3(), v3()]), context)).toThrow();
    expect(() => validateSwapCalldata(encode("0x0000", [v3(500_000n, 497n), v3(500_000n, 497n)]), context)).toThrow();
    expect(() => validateSwapCalldata(encode("0x0000", [v3(500_000n, 497n), v3(500_000n, 498n)]), context)).not.toThrow();
  });
  it("rejects missing, weak, early, duplicate or redirected output sweeps", () => {
    for (const calldata of [encode("0x00", [v3(1_000_000n, 995n, router)]), encode("0x0004", [v3(1_000_000n, 0n, router), sweep(994n)]), encode("0x0400", [sweep(), v3(1_000_000n, 0n, router)]), encode("0x000404", [v3(1_000_000n, 0n, router), sweep(), sweep()]), encode("0x0004", [v3(1_000_000n, 0n, router), sweep(995n, other)]), encode("0x0004", [v3(1_000_000n, 0n, router), sweep(995n, sender, intent.tokenIn)]), encode("0x0004", [v3(1_000_000n, 0n, router), sweep(1n << 160n)])]) {
      expect(() => validateSwapCalldata(calldata, context)).toThrow();
    }
  });
  it.each(["0x80", "0x01", "0x02", "0x03", "0x05", "0x06", "0x07", "0x09", "0x0b", "0x0c", "0x0d", "0x0e", "0x11", "0x14", "0x21", "0x40", "0x7f"] as Hex[])("rejects unsafe or unsupported command %s", (command) => {
    expect(() => validateSwapCalldata(encode(command, [v3()]), context)).toThrow();
  });
  it("rejects wrong recipients, tokens, missing hops, malformed path and price lengths", () => {
    for (const input of [v3(1_000_000n, 995n, other), v3(1_000_000n, 995n, sender, false), v3(1_000_000n, 995n, sender, true, "0x00"), v3(1_000_000n, 995n, sender, true, `0x${intent.tokenOut.slice(2)}0001f4${intent.tokenIn.slice(2)}`), v3(1_000_000n, 995n, sender, true, path, [1n, 2n])]) {
      expect(() => validateSwapCalldata(encode("0x00", [input]), context)).toThrow();
    }
    expect(() => validateSwapCalldata(encode("0x08", [v2(1_000_000n, 995n, sender, true, [intent.tokenIn])]), context)).toThrow();
  });
  it("rejects V4 hooks, hook data, unsorted keys, dynamic fees, native currencies and open-credit input", () => {
    for (const value of [{ ...single, poolKey: { ...poolKey, hooks: other } }, { ...single, hookData: "0x1234" as Hex }, { ...single, poolKey: { ...poolKey, currency0: poolKey.currency1, currency1: poolKey.currency0 } }, { ...single, poolKey: { ...poolKey, fee: 0x800000 } }, { ...single, poolKey: { ...poolKey, currency0: zero } }, { ...single, amountIn: 0n }, { ...single, poolKey: { ...poolKey, tickSpacing: 0 } }]) {
      expect(() => validateSwapCalldata(encode("0x10", [v4(encodeAbiParameters(singleAbi, [value]))]), context)).toThrow();
    }
    const hooked = { ...multi, path: [{ ...multi.path[0], hooks: other }] };
    expect(() => validateSwapCalldata(encode("0x10", [v4(encodeAbiParameters(multiAbi, [hooked]), "0x07")]), context)).toThrow();
  });
  it("requires wallet payment and full output delivery for each isolated V4 unlock", () => {
    for (const input of [v4(undefined, undefined, settle(intent.tokenOut)), v4(undefined, undefined, settle(intent.tokenIn, 1n)), v4(undefined, undefined, settle(intent.tokenIn, 0n, false)), v4(undefined, undefined, settle(), take(other)), v4(undefined, undefined, settle(), take(sender, 1n)), v4(undefined, undefined, settle(), take(sender, 0n, intent.tokenIn))]) {
      expect(() => validateSwapCalldata(encode("0x10", [input]), context)).toThrow();
    }
    const actions = encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), ["0x060c0f", [encodeAbiParameters(singleAbi, [single]), encodeAbiParameters(parseAbiParameters("address,uint256"), [intent.tokenIn, 1_000_000n]), encodeAbiParameters(parseAbiParameters("address,uint256"), [intent.tokenOut, 995n])]]);
    expect(() => validateSwapCalldata(encode("0x10", [actions]), context)).not.toThrow();
  });
  it("rejects V4 action flags, extra actions, reordered settlement and old tuple layouts", () => {
    const swap = encodeAbiParameters(singleAbi, [single]);
    for (const [actions, inputs] of [["0x860b0e", [swap, settle(), take()]], ["0x060b0e0e", [swap, settle(), take(), take()]], ["0x0b060e", [settle(), swap, take()]] ] as const) {
      expect(() => validateSwapCalldata(encode("0x10", [encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [actions, inputs])]), context)).toThrow();
    }
    const old = encodeAbiParameters(parseAbiParameters("((address,address,uint24,int24,address),bool,uint128,uint128,bytes)"), [[Object.values(poolKey) as never, true, 1_000_000n, 995n, "0x"]]);
    expect(() => validateSwapCalldata(encode("0x10", [v4(old)]), context)).toThrow();
  });
  it("rejects unbound, expired, oversized or noncanonical execute payloads", () => {
    const valid = encode("0x00", [v3()]);
    for (const value of ["0x", `${valid}00`, `0x${"00".repeat(128_001)}`] as Hex[]) expect(() => validateSwapCalldata(value, context)).toThrow();
    expect(() => validateSwapCalldata(encode("0x0000", [v3()]), context)).toThrow();
    expect(() => validateSwapCalldata(encode("0x00", [v3()], deadline + 1n), context)).toThrow();
    expect(() => validateSwapCalldata(valid, { ...context, now: now + 30_000 })).toThrow();
    expect(() => validateSwapCalldata(valid, { ...context, deadline: deadline + 1n })).toThrow();
    expect(() => validateSwapCalldata(valid, { ...context, summary: { ...summary, amountIn: "1" } })).toThrow();
    const old = encodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool"), [sender, 1_000_000n, 995n, path, true]);
    expect(() => validateSwapCalldata(encode("0x00", [old]), context)).toThrow();
    const noDeadline = encodeFunctionData({ abi: parseAbi(["function execute(bytes,bytes[]) payable"]), args: ["0x00", [v3()]], functionName: "execute" });
    expect(() => validateSwapCalldata(noDeadline, context)).toThrow();
  });

  const permit: Permit2Data = {
    domain: { name: "Permit2", chainId: 137, verifyingContract: POLYGON_PERMIT2 },
    types: { PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }], PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] },
    values: { details: { token: intent.tokenIn, amount: intent.amountIn, expiration: now / 1000 + 2_592_000, nonce: 7 }, spender: POLYGON_UNIVERSAL_ROUTER_212, sigDeadline: now / 1000 + 1800 },
  };
  // Placeholder bytes only for testing command binding; ECDSA verification is a separate prerequisite.
  const signature = `0x${"11".repeat(64)}1b` as Hex;
  const permitAbi = parseAbiParameters("((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline),bytes");
  const permitInput = (data = permit, sig = signature) => encodeAbiParameters(permitAbi, [{ details: { token: data.values.details.token, amount: BigInt(data.values.details.amount), expiration: Number(data.values.details.expiration), nonce: Number(data.values.details.nonce) }, spender: data.values.spender, sigDeadline: BigInt(data.values.sigDeadline) }, sig]);
  it("requires the exact bound PermitSingle command and unchanged signature first", () => {
    const bound = { ...context, permitData: permit, signature };
    expect(() => validateSwapCalldata(encode("0x0a00", [permitInput(), v3()]), bound)).not.toThrow();
    expect(() => validateSwapCalldata(encode("0x00", [v3()]), bound)).toThrow();
    expect(() => validateSwapCalldata(encode("0x0a00", [permitInput(), v3()]), context)).toThrow();
    expect(() => validateSwapCalldata(encode("0x000a", [v3(), permitInput()]), bound)).toThrow();
    expect(() => validateSwapCalldata(encode("0x0a0a00", [permitInput(), permitInput(), v3()]), bound)).toThrow();
    const nonce = { ...permit, values: { ...permit.values, details: { ...permit.values.details, nonce: 8 } } };
    expect(() => validateSwapCalldata(encode("0x0a00", [permitInput(nonce), v3()]), bound)).toThrow();
    expect(() => validateSwapCalldata(encode("0x0a00", [permitInput(permit, `0x${"22".repeat(64)}1b`), v3()]), bound)).toThrow();
    expect(() => validateSwapCalldata(encode("0x00", [v3()]), { ...context, signature })).toThrow();
  });
});
