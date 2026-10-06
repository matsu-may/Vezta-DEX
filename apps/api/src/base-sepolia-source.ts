import { BaseError, ContractFunctionRevertedError, erc20Abi, parseAbi, size, TransactionNotFoundError, TransactionReceiptNotFoundError,
  type Address } from "viem";
import { createTestnetReadClient } from "./testnet-read-client";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_CANDIDATE, TESTNET_SWAP_POLICY } from "@vezta-dex/core";
import type { BaseSepoliaSwapSource } from "./testnet-swap-quote";
import type { BaseSepoliaWalletSource } from "./testnet-wallet-state";
import type { BaseSepoliaApprovalSource } from "./testnet-approval";
import type { BaseSepoliaPreparationSource } from "./testnet-swap-preparation";
import type { BaseSepoliaLpReceiptSource } from "./testnet-lp-wallet-receipt";
import type { BaseSepoliaLpWalletSource } from "./testnet-lp-wallet";
import type { BaseSepoliaLpSource } from "./testnet-lp-position";
import type { BaseSepoliaReceiptSource } from "./testnet-receipt";
import { TESTNET_FEE_ORACLE, serializeTestnetFeeEnvelope, TestnetFeeError } from "./testnet-fees";
import { parseBaseSepoliaRpcRps } from "./testnet-rpc-pacer";

const C = BASE_SEPOLIA_CANDIDATE;
const factoryAbi = [{ type: "function", name: "getPool", stateMutability: "view", inputs: [
  { type: "address" }, { type: "address" }, { type: "uint24" },
], outputs: [{ type: "address" }] }] as const;
const poolAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
    { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" },
    { type: "uint16" }, { type: "uint8" }, { type: "bool" },
  ] },
] as const;
const quoterAbi = [{ type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{ type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }], outputs: [{ type: "uint256" }, { type: "uint160" }, { type: "uint32" }, { type: "uint256" }],
}] as const;

const configurationAbi = parseAbi(["function factory() view returns (address)",
  "function WETH9() view returns (address)", "function positionManager() view returns (address)"]);
const positionAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner,uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
]);
const growthAbi = parseAbi([
  "function feeGrowthGlobal0X128() view returns (uint256)",
  "function feeGrowthGlobal1X128() view returns (uint256)",
  "function ticks(int24 tick) view returns (uint128 liquidityGross,int128 liquidityNet,uint256 feeGrowthOutside0X128,uint256 feeGrowthOutside1X128,int56 tickCumulativeOutside,uint160 secondsPerLiquidityOutsideX128,uint32 secondsOutside,bool initialized)",
]);
const spacingAbi = parseAbi(["function tickSpacing() view returns (int24)"]);
const feeOracleAbi = parseAbi(["function isFjord() view returns (bool)", "function isJovian() view returns (bool)",
  "function getL1FeeUpperBound(uint256 unsignedSize) view returns (uint256)",
  "function getOperatorFee(uint256 gasUsed) view returns (uint256)"]);

export function createBaseSepoliaPreflightSource(rpcUrl: string, signal?: AbortSignal): BaseSepoliaSwapSource & BaseSepoliaWalletSource & BaseSepoliaApprovalSource & BaseSepoliaPreparationSource & BaseSepoliaReceiptSource & BaseSepoliaLpSource & BaseSepoliaLpWalletSource & BaseSepoliaLpReceiptSource {
  let url: URL;
  try { url = new URL(rpcUrl); } catch { throw new Error("Invalid Base Sepolia RPC URL"); }
  if (url.protocol !== "https:" && !(url.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Base Sepolia RPC requires HTTPS or loopback HTTP");
  }
  const client = createTestnetReadClient(rpcUrl, baseSepolia, signal, parseBaseSepoliaRpcRps(process.env.BASE_SEPOLIA_RPC_RPS));
  const quoteExactInput: BaseSepoliaSwapSource["quoteExactInput"] = async (tokenIn, tokenOut, amountIn, fee, blockNumber) => {
    const { result } = await client.simulateContract({ address: C.v3QuoterV2,
      abi: quoterAbi, functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }], blockNumber });
    return { amountOut: result[0], sqrtPriceX96After: result[1],
      initializedTicksCrossed: result[2], gasEstimate: result[3] };
  };
  return {
    async getLpBlock(number) {
      const block = await client.getBlock({ blockNumber: number });
      return { number: block.number, timestamp: block.timestamp, hash: block.hash ?? "0x" };
    },
    getPositionCount(owner, blockNumber) {
      return client.readContract({ address: C.v3PositionManager, abi: positionAbi, functionName: "balanceOf", args: [owner], blockNumber });
    },
    getPositionId(owner, index, blockNumber) {
      return client.readContract({ address: C.v3PositionManager, abi: positionAbi, functionName: "tokenOfOwnerByIndex", args: [owner, index], blockNumber });
    },
    async getPositionOwnerOrNull(id, blockNumber) {
      try { return await client.readContract({ address: C.v3PositionManager, abi: positionAbi, functionName: "ownerOf", args: [id], blockNumber }); }
      catch (error) {
        const reverted = error instanceof BaseError ? error.walk(e => e instanceof ContractFunctionRevertedError) : undefined;
        if (reverted instanceof ContractFunctionRevertedError && reverted.reason === "ERC721: owner query for nonexistent token") return null;
        throw error;
      }
    },
    getPositionOwner(id, blockNumber) {
      return client.readContract({ address: C.v3PositionManager, abi: positionAbi, functionName: "ownerOf", args: [id], blockNumber });
    },
    async getPosition(id, blockNumber) {
      const p = await client.readContract({ address: C.v3PositionManager, abi: positionAbi, functionName: "positions", args: [id], blockNumber });
      return { token0: p[2], token1: p[3], fee: p[4], tickLower: p[5], tickUpper: p[6], liquidity: p[7],
        feeGrowthInside0LastX128: p[8], feeGrowthInside1LastX128: p[9], tokensOwed0: p[10], tokensOwed1: p[11] };
    },
    async getLpPoolState(blockNumber) {
      const address = TESTNET_SWAP_POLICY.pool;
      const [token0, token1, factory, fee, liquidity, slot0, feeGrowthGlobal0X128, feeGrowthGlobal1X128] = await Promise.all([
        client.readContract({ address, abi: poolAbi, functionName: "token0", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "token1", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "factory", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "fee", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "liquidity", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "slot0", blockNumber }),
        client.readContract({ address, abi: growthAbi, functionName: "feeGrowthGlobal0X128", blockNumber }),
        client.readContract({ address, abi: growthAbi, functionName: "feeGrowthGlobal1X128", blockNumber }),
      ]);
      return { token0, token1, factory, fee, liquidity, sqrtPriceX96: slot0[0], tick: slot0[1], feeGrowthGlobal0X128, feeGrowthGlobal1X128 };
    },
    async getFeeGrowthOutside(tick, blockNumber) {
      const row = await client.readContract({ address: TESTNET_SWAP_POLICY.pool, abi: growthAbi, functionName: "ticks", args: [tick], blockNumber });
      return { feeGrowthOutside0X128: row[2], feeGrowthOutside1X128: row[3] };
    },
    async getTransaction(hash) {
      try { return await client.getTransaction({ hash }); }
      catch (error) { if (error instanceof TransactionNotFoundError) return null; throw error; }
    },
    async getBlockTransactions(blockNumber) {
      const block = await client.getBlock({ blockNumber, includeTransactions: true });
      if (block.number !== blockNumber || block.transactions.length > 4096) throw new Error("Invalid canonical transaction block");
      return block.transactions;
    },
    async getReceipt(hash) {
      try { return await client.getTransactionReceipt({ hash }); }
      catch (error) { if (error instanceof TransactionReceiptNotFoundError) return null; throw error; }
    },
    async simulateTestnetLp(transaction, blockNumber) {
      const result = await client.call({ account: transaction.from, to: transaction.to, data: transaction.data as `0x${string}`,
        value: 0n, gas: BigInt(transaction.gas), ...(transaction.feeModel === "eip1559"
          ? { type: "eip1559" as const, maxFeePerGas: BigInt(transaction.maxFeePerGas!), maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas!) }
          : { type: "legacy" as const, gasPrice: BigInt(transaction.gasPrice) }), blockNumber });
      return result.data ?? "0x";
    },
    async simulateTestnetSwap(transaction, blockNumber) {
      const result = await client.call({ account: transaction.from, to: transaction.to,
        data: transaction.data, value: 0n, blockNumber });
      return result.data ?? "0x";
    },
    estimateTestnetSwapGas(transaction, blockNumber) {
      return client.estimateGas({ account: transaction.from, to: transaction.to,
        data: transaction.data, value: 0n, blockNumber });
    },
    async getAdditionalFees(transaction, nonce, gas, gasPrice, blockNumber) {
      const serialized = serializeTestnetFeeEnvelope(transaction, nonce, gas, gasPrice);
      const [code, fjord, jovian] = await Promise.all([
        client.getCode({ address: TESTNET_FEE_ORACLE, blockNumber }),
        client.readContract({ address: TESTNET_FEE_ORACLE, abi: feeOracleAbi, functionName: "isFjord", blockNumber }),
        client.readContract({ address: TESTNET_FEE_ORACLE, abi: feeOracleAbi, functionName: "isJovian", blockNumber }),
      ]);
      if (!code || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || !fjord || !jovian) {
        throw new TestnetFeeError("TESTNET_FEE_MODEL_UNAVAILABLE");
      }
      const [l1FeeUpperBound, operatorFeeUpperBound] = await Promise.all([
        client.readContract({ address: TESTNET_FEE_ORACLE, abi: feeOracleAbi, functionName: "getL1FeeUpperBound",
          args: [BigInt(size(serialized))], blockNumber }),
        client.readContract({ address: TESTNET_FEE_ORACLE, abi: feeOracleAbi, functionName: "getOperatorFee", args: [gas], blockNumber }),
      ]);
      return { l1FeeUpperBound, operatorFeeUpperBound, fork: "jovian" as const };
    },
    async simulateApproval(transaction, blockNumber) {
      const result = await client.call({ account: transaction.from, to: transaction.to,
        data: transaction.data, value: 0n, blockNumber });
      return result.data ?? "0x";
    },
    estimateApprovalGas(transaction, blockNumber) {
      return client.estimateGas({ account: transaction.from, to: transaction.to,
        data: transaction.data, value: 0n, blockNumber });
    },
    getGasPrice() { return client.getGasPrice(); },
    async getBlockBaseFee(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      if (block.number !== blockNumber || typeof block.baseFeePerGas !== "bigint" || block.baseFeePerGas < 0n
        || block.baseFeePerGas > 2000000000000n) throw new TestnetFeeError();
      return block.baseFeePerGas;
    },
    async getEip1559Fees(blockNumber) {
      const [block, priority] = await Promise.all([
        client.getBlock({ blockNumber }), client.request({ method: "eth_maxPriorityFeePerGas" }),
      ]);
      const maxPriorityFeePerGas = BigInt(priority);
      if (block.number !== blockNumber || typeof block.baseFeePerGas !== "bigint" || block.baseFeePerGas < 0n
        || block.baseFeePerGas > 1000000000000n || maxPriorityFeePerGas <= 0n || maxPriorityFeePerGas > 2000000000000n) throw new TestnetFeeError();
      return { baseFeePerGas: block.baseFeePerGas, maxPriorityFeePerGas };
    },
    getTokenBalance(address, wallet, blockNumber) {
      return client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [wallet], blockNumber });
    },
    getTokenAllowance(address, wallet, spender, blockNumber) {
      return client.readContract({ address, abi: erc20Abi, functionName: "allowance", args: [wallet, spender], blockNumber });
    },
    getNativeBalance(address, blockNumber) { return client.getBalance({ address, blockNumber }); },
    async getAccountNonce(address, blockNumber) {
      const nonce = await client.getTransactionCount({ address, blockNumber });
      if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error("Invalid account nonce");
      return BigInt(nonce);
    },
    async getPendingNonce(address) {
      const nonce = await client.getTransactionCount({ address, blockTag: "pending" });
      if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error("Invalid pending nonce");
      return BigInt(nonce);
    },
    getTickSpacing(address, blockNumber) {
      return client.readContract({ address, abi: spacingAbi, functionName: "tickSpacing", blockNumber });
    },
    async getDependencyConfiguration(blockNumber) {
      const periphery = async (address: Address) => {
        const [factory, weth] = await Promise.all([
          client.readContract({ address, abi: configurationAbi, functionName: "factory", blockNumber }),
          client.readContract({ address, abi: configurationAbi, functionName: "WETH9", blockNumber }),
        ]);
        return { factory, weth };
      };
      const [router, positionManager, quoter, manager] = await Promise.all([
        periphery(TESTNET_SWAP_POLICY.router),
        client.readContract({ address: TESTNET_SWAP_POLICY.router, abi: configurationAbi,
          functionName: "positionManager", blockNumber }),
        periphery(C.v3QuoterV2), periphery(C.v3PositionManager),
      ]);
      return { router: { ...router, positionManager }, quoter, manager };
    },
    getChainId() { return client.getChainId(); },
    async getLatestBlock() {
      const block = await client.getBlock({ blockTag: "latest" });
      return { number: block.number, timestamp: block.timestamp, hash: block.hash ?? "0x" };
    },
    async getBlockHash(number) {
      const block = await client.getBlock({ blockNumber: number });
      return block.hash ?? "0x";
    },
    async getCode(address, blockNumber) {
      return await client.getCode({ address, blockNumber }) ?? "0x";
    },
    getDecimals(token, blockNumber) {
      return client.readContract({ address: token, abi: erc20Abi,
        functionName: "decimals", blockNumber });
    },
    getPool(feeTier, blockNumber) {
      return client.readContract({ address: C.v3Factory, abi: factoryAbi,
        functionName: "getPool", args: [C.USDC.address, C.WETH.address, feeTier], blockNumber });
    },
    async getPoolState(address: Address, blockNumber) {
      const [token0, token1, factory, fee, liquidity, slot0] = await Promise.all([
        client.readContract({ address, abi: poolAbi, functionName: "token0", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "token1", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "factory", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "fee", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "liquidity", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "slot0", blockNumber }),
      ]);
      return { token0, token1, factory, fee, liquidity, sqrtPriceX96: slot0[0] };
    },
    async quoteOneUsdc(feeTier, blockNumber) {
      const result = await quoteExactInput(C.USDC.address, C.WETH.address, 1_000_000n, feeTier, blockNumber);
      return { amountOut: result.amountOut, gasEstimate: result.gasEstimate };
    },
    quoteExactInput,
  };
}
