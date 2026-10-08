import { BASE_SEPOLIA_CANDIDATE } from "./testnet";
import { TESTNET_DIRECT_POOLS } from "../swap/testnet-swap-pools";

export const TESTNET_SWAP_POLICY = Object.freeze({
  chainId: 84532, router: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  pool: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad", feeTier: 3000,
  slippageBps: 50, minimumSlippageBps: 5, maximumSlippageBps: 100,
  maximumUsdcInput: "5000000", maximumWethInput: "1000000000000000",
  quoteTtlSeconds: 30, demoQuoteTtlSeconds: 120,
} as const);

const token = <I extends 84532 | 1301>(chainId: I, address: `0x${string}`, symbol: "USDC" | "WETH", decimals: number) =>
  Object.freeze({ chainId, address, symbol, decimals, name: `${symbol} (Unichain Sepolia testnet)` });
const unichainCandidate = Object.freeze({
  chainId: 1301 as const,
  USDC: token(1301, "0x31d0220469e10c4E71834a79b1f276d740d3768F", "USDC", 6),
  WETH: token(1301, "0x4200000000000000000000000000000000000006", "WETH", 18),
  v3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  v3QuoterV2: "0x6Dd37329A1A225a6Fca658265D460423DCafBF89",
  v3PositionManager: "0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075",
} as const);
export const TESTNET_CHAIN_CONFIGS = Object.freeze({
  84532: Object.freeze({
    candidate: BASE_SEPOLIA_CANDIDATE, policy: TESTNET_SWAP_POLICY, pools: TESTNET_DIRECT_POOLS,
    label: "Base Sepolia", source: "base-sepolia-rpc", explorer: "https://sepolia.basescan.org",
    rpcEnvironment: "BASE_SEPOLIA_RPC_URL",
    inclusionConfirmations: 2, walletProfile: "eoa-and-qualified-metamask",
  } as const),
  1301: Object.freeze({
    candidate: unichainCandidate,
    policy: Object.freeze({ ...TESTNET_SWAP_POLICY, chainId: 1301 as const,
      router: "0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166" as const,
      pool: "0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e" as const }),
    pools: Object.freeze([Object.freeze({pool:"0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e",feeTier:3000,tickSpacing:60} as const)]),
    label: "Unichain Sepolia", source: "unichain-sepolia-rpc", explorer: "https://unichain-sepolia.blockscout.com",
    rpcEnvironment: "UNICHAIN_SEPOLIA_RPC_URL",
    // Testnet inclusion policy, not Ethereum finality; independently observed canonical receipt blocks.
    inclusionConfirmations: 2, walletProfile: "eoa-only",
  } as const),
});
export type TestnetChainId = keyof typeof TESTNET_CHAIN_CONFIGS;
export type TestnetChainConfig = typeof TESTNET_CHAIN_CONFIGS[TestnetChainId];
// Configuration is identity, never an execution or deployment proof.
export function testnetChainConfig(chainId: unknown): TestnetChainConfig {
  if (chainId !== 84532 && chainId !== 1301) throw new Error("Unsupported testnet chain");
  return TESTNET_CHAIN_CONFIGS[chainId];
}
