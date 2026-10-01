import { encodeFunctionData, getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";
import { z } from "zod";
import { BASE_SEPOLIA_CANDIDATE as C } from "./testnet";
import { TESTNET_DEPTH_INPUTS } from "./testnet-depth";

// Separate direct-v3 testnet adapter. This is not the Polygon Universal Router/Permit2 policy.
export const TESTNET_SWAP_POLICY = Object.freeze({
  chainId: 84532, router: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  pool: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad", feeTier: 3000,
  slippageBps: 50, quoteTtlSeconds: 30,
} as const);

const swapAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);
const approvalAbi = parseAbi(["function approve(address spender,uint256 value) returns (bool)"]);
const uint = z.string().regex(/^[1-9][0-9]{0,77}$/).refine(value => BigInt(value) < 2n ** 256n);
const address = z.string().refine(value => isAddress(value)).transform(value => getAddress(value));
const reservedWallets = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  TESTNET_SWAP_POLICY.router, TESTNET_SWAP_POLICY.pool,
  C.USDC.address, C.WETH.address, C.v3Factory, C.v3QuoterV2, C.v3PositionManager,
].map(value => value.toLowerCase()));
const intentShape = {
  chainId: z.literal(TESTNET_SWAP_POLICY.chainId),
  wallet: address.refine(value => !reservedWallets.has(value.toLowerCase())),
  tokenIn: address, tokenOut: address, amountIn: uint,
  slippageBps: z.literal(TESTNET_SWAP_POLICY.slippageBps),
};
function supportedIntent(i: { tokenIn: Address; tokenOut: Address; amountIn: string }): boolean {
  const forward = i.tokenIn === getAddress(C.USDC.address) && i.tokenOut === getAddress(C.WETH.address);
  const reverse = i.tokenIn === getAddress(C.WETH.address) && i.tokenOut === getAddress(C.USDC.address);
  return (forward || reverse) && TESTNET_DEPTH_INPUTS.slice(forward ? 0 : 3, forward ? 3 : 6)
    .some(amount => amount === i.amountIn);
}
const intentSchema = z.object(intentShape).strict().refine(supportedIntent);
const quoteSchema = z.object({
  ...intentShape, protocol: z.literal("v3"), pool: address.refine(value => value === getAddress(TESTNET_SWAP_POLICY.pool)),
  feeTier: z.literal(TESTNET_SWAP_POLICY.feeTier), amountOut: uint, minimumAmountOut: uint,
  blockNumber: uint, blockHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(value => BigInt(value) !== 0n),
  observedAt: z.iso.datetime(), source: z.literal("base-sepolia-rpc"),
}).strict().refine(supportedIntent);

export type TestnetSwapIntent = z.infer<typeof intentSchema>;
export type TestnetSwapQuote = z.infer<typeof quoteSchema>;
export interface TestnetSwapTransaction {
  chainId: typeof TESTNET_SWAP_POLICY.chainId;
  from: Address;
  to: Address;
  data: Hex;
  value: "0";
}

function reviewedQuote(value: unknown, nowMs: number): { quote: TestnetSwapQuote; deadline: bigint } {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Invalid testnet clock");
  const quote = quoteSchema.parse(value);
  const observedMs = Date.parse(quote.observedAt);
  const deadline = Math.floor(observedMs / 1000) + TESTNET_SWAP_POLICY.quoteTtlSeconds;
  if (observedMs > nowMs + 10000 || nowMs - observedMs >= 30000
    || Math.floor(nowMs / 1000) >= deadline) throw new Error("Expired or future testnet quote");
  const minimum = BigInt(quote.amountOut) * 9950n / 10000n;
  if (minimum === 0n || minimum !== BigInt(quote.minimumAmountOut)) throw new Error("Invalid testnet minimum output");
  return { quote, deadline: BigInt(deadline) };
}

// Only validates binding/encoding. Trusted pinned reads, bytecode and simulation are separate gates.
export function buildTestnetSwapTransaction(value: unknown, nowMs = Date.now()): TestnetSwapTransaction {
  const { quote, deadline } = reviewedQuote(value, nowMs);
  const swap = encodeFunctionData({ abi: swapAbi, functionName: "exactInputSingle", args: [{
    tokenIn: quote.tokenIn, tokenOut: quote.tokenOut, fee: quote.feeTier, recipient: quote.wallet,
    amountIn: BigInt(quote.amountIn), amountOutMinimum: BigInt(quote.minimumAmountOut), sqrtPriceLimitX96: 0n,
  }] });
  return { chainId: TESTNET_SWAP_POLICY.chainId, from: quote.wallet, to: TESTNET_SWAP_POLICY.router, value: "0",
    data: encodeFunctionData({ abi: swapAbi, functionName: "multicall", args: [deadline, [swap]] }) };
}

const transactionSchema = z.object({
  chainId: z.literal(TESTNET_SWAP_POLICY.chainId), from: address, to: address, value: z.literal("0"),
  data: z.string().max(4096).regex(/^0x(?:[0-9a-fA-F]{2})+$/),
}).strict();

export function inspectTestnetSwapTransaction(value: unknown, quote: unknown, nowMs = Date.now()): void {
  const actual = transactionSchema.parse(value);
  const expected = buildTestnetSwapTransaction(quote, nowMs);
  if (actual.from !== expected.from || actual.to !== expected.to
    || actual.data.toLowerCase() !== expected.data.toLowerCase()) throw new Error("Testnet swap transaction mismatch");
}

export type TestnetApprovalPlan = { kind: "ready" }
  | { kind: "approve" | "reset"; transaction: TestnetSwapTransaction };

// A reset must confirm and allowance must be read again before producing an exact approval.
export function planTestnetTokenApproval(value: unknown, currentAllowance: bigint): TestnetApprovalPlan {
  const intent = intentSchema.parse(value);
  if (typeof currentAllowance !== "bigint" || currentAllowance < 0n || currentAllowance >= 2n ** 256n) {
    throw new Error("Invalid testnet token allowance");
  }
  const amount = BigInt(intent.amountIn);
  if (currentAllowance === amount) return { kind: "ready" };
  const reset = currentAllowance !== 0n;
  return { kind: reset ? "reset" : "approve", transaction: {
    chainId: TESTNET_SWAP_POLICY.chainId, from: intent.wallet, to: intent.tokenIn, value: "0",
    data: encodeFunctionData({ abi: approvalAbi, functionName: "approve", args: [TESTNET_SWAP_POLICY.router, reset ? 0n : amount] }),
  } };
}
