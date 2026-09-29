import { encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, TOKENS, type Permit2Data, type TradingIntent } from "@vezta-dex/core";

// Public deterministic fixture key. Only mocked wallet actions use it.
export const testAccount = privateKeyToAccount(`0x${"01".repeat(32)}`);
export const testNow = Date.parse("2026-09-29T00:00:00Z");
export const testHash = `0x${"11".repeat(32)}` as Hex;
export const testBlockHash = `0x${"22".repeat(32)}` as Hex;
export const testIntent: TradingIntent = { chainId: 137, swapper: testAccount.address, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
export function testPermit(now = testNow): Permit2Data {
  const seconds = Math.floor(now / 1000);
  return { domain: { name: "Permit2", chainId: 137, verifyingContract: POLYGON_PERMIT2 }, types: { PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }], PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] }, values: { details: { token: testIntent.tokenIn, amount: "1000000", expiration: seconds + 2592000, nonce: 7 }, spender: POLYGON_UNIVERSAL_ROUTER_212, sigDeadline: seconds + 1800 } };
}
export async function testSignature(data = testPermit()) {
  return testAccount.signTypedData({ domain: data.domain, types: data.types, primaryType: "PermitSingle", message: { details: { token: data.values.details.token, amount: BigInt(data.values.details.amount), expiration: Number(data.values.details.expiration), nonce: Number(data.values.details.nonce) }, spender: data.values.spender, sigDeadline: BigInt(data.values.sigDeadline) } });
}
export function testQuote(now = testNow) {
  return { ...testIntent, amountOut: "1000", minimumAmountOut: "995", routing: "CLASSIC" as const, routerVersion: "2.1.2" as const, requestId: "fixture", quotedAt: new Date(now).toISOString(), source: "uniswap-trading-api" as const };
}
export function testWalletState(now = testNow, allowance = "1000000") {
  return { chainId: 137 as const, account: testAccount.address, accountKind: "eoa" as "eoa" | "blocked", blockNumber: "123", observedAt: new Date(now).toISOString(), balances: { USDC: "2000000", WETH: "0", POL: "1000000000000000000" }, tokenAllowance: allowance, permitAllowance: { amount: "0", expiration: "0", nonce: "7" }, approvalGas: allowance === "0" ? { gas: "60000", gasPrice: "36000000000" } : null };
}
export function testPlan(now = testNow) {
  return { chainId: 137, quoteId: "ab".repeat(24), quoteExpiresAt: new Date(now + 30000).toISOString(), blockNumber: "123", observedAt: new Date(now).toISOString(), permit: { kind: "sign", data: testPermit(now), allowanceExpiresAt: new Date((Math.floor(now/1000)+2592000)*1000).toISOString(), signatureDeadline: new Date((Math.floor(now/1000)+1800)*1000).toISOString() } };
}
export function testPreparation(signature: Hex, now = testNow) {
  const data = testPermit(now);
  const signed = encodeAbiParameters(parseAbiParameters("((address,uint160,uint48,uint48),address,uint256),bytes"), [[[testIntent.tokenIn, 1000000n, Number(data.values.details.expiration), 7], POLYGON_UNIVERSAL_ROUTER_212, BigInt(data.values.sigDeadline)], signature]);
  const path = `0x${testIntent.tokenIn.slice(2)}0001f4${testIntent.tokenOut.slice(2)}` as Hex;
  const swap = encodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"), [testIntent.swapper, 1000000n, 995n, path, true, []]);
  return { chainId: 137, quoteId: "ab".repeat(24), intent: testIntent, quoteExpiresAt: new Date(now+30000).toISOString(), deadline: String(Math.floor(now/1000)+30), transaction: { chainId: 137, from: testIntent.swapper, to: POLYGON_UNIVERSAL_ROUTER_212 as Hex, data: encodeFunctionData({ abi: parseAbi(["function execute(bytes,bytes[],uint256) payable"]), functionName: "execute", args: ["0x0a00", [signed,swap], BigInt(Math.floor(now/1000)+30)] }), value: "0", gas: "120000", gasPrice: "36000000000" }, simulation: { status: "success", source: "polygon-rpc", blockNumber: "123", observedAt: new Date(now).toISOString() } };
}
