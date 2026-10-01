import type { Address, TokenRecord } from "./index";

export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;

// Address provenance: Circle testnet USDC and Uniswap v3 Base deployments.
// This registry is a read-only candidate until live RPC and API checks pass.
export const BASE_SEPOLIA_CANDIDATE = {
  chainId: BASE_SEPOLIA_CHAIN_ID,
  USDC: {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    symbol: "USDC",
    name: "USD Coin (Base Sepolia testnet)",
    decimals: 6,
  },
  WETH: {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    name: "Wrapped Ether (Base Sepolia testnet)",
    decimals: 18,
  },
  v3Factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
  v3QuoterV2: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
  v3PositionManager: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
} as const satisfies {
  chainId: number;
  USDC: TokenRecord;
  WETH: TokenRecord;
  v3Factory: Address;
  v3QuoterV2: Address;
  v3PositionManager: Address;
};
