import { createPublicClient, erc20Abi, http, toHex, type Address } from "viem";
import { polygon } from "viem/chains";
import { POLYGON_CHAIN_ID, POLYGON_PERMIT2, TOKENS, V3_FACTORY, V3_QUOTER } from "@vezta-dex/core";
import type { PoolChainSource } from "../../modules/discovery/pools";
import type { QuoteChainSource } from "../../modules/swap/quote";
import type { AllowanceChainSource } from "../../modules/swap/allowance-reader";
import type { PermitChainSource } from "../../modules/swap/permit-reader";
import type { WalletStateSource } from "../../modules/wallet/wallet-state";
import type { WalletObservationSource } from "../../modules/wallet/wallet-observation";
import type { SwapPreparationChainSource } from "../../modules/swap/swap-preparation";
import { V3_LP_POOL, V3_POSITION_MANAGER, type LpPositionSource } from "../../modules/liquidity/lp-position";

const permit2Abi = [{
  type: "function", name: "allowance", stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }, { name: "token", type: "address" }, { name: "spender", type: "address" }],
  outputs: [{ name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
}] as const;

const factoryAbi = [{
  type: "function",
  name: "getPool",
  stateMutability: "view",
  inputs: [
    { name: "tokenA", type: "address" },
    { name: "tokenB", type: "address" },
    { name: "fee", type: "uint24" },
  ],
  outputs: [{ name: "pool", type: "address" }],
}] as const;

const poolAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
] as const;

const positionManagerAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" },
    { type: "uint24" }, { type: "int24" }, { type: "int24" }, { type: "uint128" },
    { type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" },
  ] },
] as const;

const lpPoolAbi = [{ type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
  { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" },
  { type: "uint16" }, { type: "uint8" }, { type: "bool" },
] }] as const;

const quoterAbi = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{
    name: "params",
    type: "tuple",
    components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
  }],
  outputs: [
    { name: "amountOut", type: "uint256" },
    { name: "sqrtPriceX96After", type: "uint160" },
    { name: "initializedTicksCrossed", type: "uint32" },
    { name: "gasEstimate", type: "uint256" },
  ],
}] as const;

export function createPolygonPoolSource(rpcUrl: string): PoolChainSource & QuoteChainSource & AllowanceChainSource & PermitChainSource & SwapPreparationChainSource & WalletStateSource & WalletObservationSource & LpPositionSource {
  const url = new URL(rpcUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("POLYGON_RPC_URL must be HTTPS or local HTTP");
  }
  const client = createPublicClient({ chain: polygon, transport: http(rpcUrl, { timeout: 8_000, retryCount: 1 }) });

  return {
    receiptClient: client,
    getChainId() { return client.getChainId(); },
    async getPositionBlock(request) {
      const block = await client.getBlock(request);
      return { number: block.number, timestamp: block.timestamp, hash: block.hash ?? "" };
    },
    getPositionCount(owner, blockNumber) {
      return client.readContract({ address: V3_POSITION_MANAGER, abi: positionManagerAbi,
        functionName: "balanceOf", args: [owner], blockNumber });
    },
    getPositionId(owner, index, blockNumber) {
      return client.readContract({ address: V3_POSITION_MANAGER, abi: positionManagerAbi,
        functionName: "tokenOfOwnerByIndex", args: [owner, index], blockNumber });
    },
    getPositionOwner(id, blockNumber) {
      return client.readContract({ address: V3_POSITION_MANAGER, abi: positionManagerAbi,
        functionName: "ownerOf", args: [id], blockNumber });
    },
    async getPosition(id, blockNumber) {
      const result = await client.readContract({ address: V3_POSITION_MANAGER, abi: positionManagerAbi,
        functionName: "positions", args: [id], blockNumber });
      return { token0: result[2], token1: result[3], fee: result[4], tickLower: result[5], tickUpper: result[6],
        liquidity: result[7], tokensOwed0: result[10], tokensOwed1: result[11] };
    },
    async getPoolTick(blockNumber) {
      const result = await client.readContract({ address: V3_LP_POOL, abi: lpPoolAbi, functionName: "slot0", blockNumber });
      return result[1];
    },
    async getAccountNonce(owner, blockNumber) {
      const nonce = await client.getTransactionCount({ address: owner, blockNumber });
      if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error("Invalid account nonce");
      return BigInt(nonce);
    },
    async getPendingNonce(owner) {
      const nonce = await client.getTransactionCount({ address: owner, blockTag: "pending" });
      if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error("Invalid pending nonce");
      return BigInt(nonce);
    },
    async simulateApproval(transaction, blockNumber) {
      const result = await client.request({ method: "eth_call", params: [{ from: transaction.from, to: transaction.to, data: transaction.data, value: "0x0" }, toHex(blockNumber)] });
      if (result.toLowerCase() !== `0x${"0".repeat(63)}1`) throw new Error("Approval simulation failed");
    },
    getTokenBalance(token, owner, blockNumber) {
      return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber });
    },
    getNativeBalance(owner, blockNumber) {
      return client.getBalance({ address: owner, blockNumber });
    },
    getGasPrice() { return client.getGasPrice(); },
    async simulateSwap(transaction, blockNumber) {
      const result = await client.request({ method: "eth_call", params: [{ from: transaction.from, to: transaction.to, data: transaction.data, value: "0x0" }, toHex(blockNumber)] });
      if (result !== "0x") throw new Error("Unexpected router simulation response");
    },
    async estimateSwapGas(transaction, blockNumber) {
      const result = await client.request({ method: "eth_estimateGas", params: [{ from: transaction.from, to: transaction.to, data: transaction.data, value: "0x0" }, toHex(blockNumber)] });
      if (!/^0x[0-9a-fA-F]+$/.test(result)) throw new Error("Invalid Polygon gas estimate");
      return BigInt(result);
    },
    getAccountCode(owner, blockNumber) {
      // viem.getCode maps an empty result to undefined, losing the fail-closed distinction.
      return client.request({ method: "eth_getCode", params: [owner, toHex(blockNumber)] });
    },
    async getPermitAllowance(token, owner, spender, blockNumber) {
      const [amount, expiration, nonce] = await client.readContract({
        address: POLYGON_PERMIT2, abi: permit2Abi, functionName: "allowance", args: [owner, token, spender], blockNumber,
      });
      return { amount, expiration: BigInt(expiration), nonce: BigInt(nonce) };
    },
    async getBlock() {
      const chainId = await client.getChainId();
      if (chainId !== POLYGON_CHAIN_ID) throw new Error("RPC returned a different chain");
      const block = await client.getBlock({ blockTag: "latest" });
      return { number: block.number, timestamp: block.timestamp };
    },
    getPoolAddress(feeTier, blockNumber) {
      return client.readContract({
        address: V3_FACTORY,
        abi: factoryAbi,
        functionName: "getPool",
        args: [TOKENS.USDC.address, TOKENS.WETH.address, feeTier],
        blockNumber,
      });
    },
    async getPoolState(address: Address, blockNumber) {
      const [token0, token1, liquidity] = await Promise.all([
        client.readContract({ address, abi: poolAbi, functionName: "token0", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "token1", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "liquidity", blockNumber }),
      ]);
      return { token0, token1, liquidity };
    },
    async quoteExactInput(tokenIn, tokenOut, amountIn, feeTier, blockNumber) {
      const { result } = await client.simulateContract({
        address: V3_QUOTER,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee: feeTier, sqrtPriceLimitX96: 0n }],
        blockNumber,
      });
      return { amountOut: result[0], gasEstimate: result[3] };
    },
    getTokenAllowance(token, owner, spender, blockNumber) {
      return client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
        blockNumber,
      });
    },
  };
}
