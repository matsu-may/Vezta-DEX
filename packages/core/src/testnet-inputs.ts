import { parseUnits } from "viem";
import { testnetChainConfig, type TestnetChainId } from "./testnet-chain-config";
import { TESTNET_SWAP_POLICY as P } from "./testnet-swap";

function decimal(value: string, places: number): bigint {
  if (value.length > 80 || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)
    || (value.split(".")[1]?.length ?? 0) > places) throw new Error("Invalid decimal input");
  return parseUnits(value, places);
}

export function parseTestnetSwapAmount(value: string, tokenIn: string, chainId: TestnetChainId = 84532): string {
  const {candidate: C} = testnetChainConfig(chainId);
  const usdc = tokenIn.toLowerCase() === C.USDC.address.toLowerCase();
  if (!usdc && tokenIn.toLowerCase() !== C.WETH.address.toLowerCase()) throw new Error("Unsupported input token");
  const amount = decimal(value, usdc ? 6 : 18);
  if (amount <= 0n || amount > BigInt(usdc ? P.maximumUsdcInput : P.maximumWethInput)) throw new Error("Amount exceeds testnet limits");
  return amount.toString();
}

export function parseTestnetSlippage(value: string): number {
  const bps = decimal(value, 2);
  if (bps < BigInt(P.minimumSlippageBps) || bps > BigInt(P.maximumSlippageBps)) throw new Error("Slippage exceeds testnet limits");
  return Number(bps);
}
