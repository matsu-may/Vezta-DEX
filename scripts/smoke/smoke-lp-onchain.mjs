// Read-only Polygon v3 pool cross-check. Never prints the RPC URL or provider responses.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const POOL = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";
const sameAddress = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const sameHash = (a, b) => typeof a === "string" && /^0x[0-9a-fA-F]{64}$/.test(a) && a.toLowerCase() === b?.toLowerCase();
const abi = {
  factory: [
    { type: "function", name: "getPool", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] },
    { type: "function", name: "feeAmountTickSpacing", stateMutability: "view", inputs: [{ type: "uint24" }], outputs: [{ type: "int24" }] },
  ],
  pool: [
    ...["factory", "token0", "token1"].map(name => ({ type: "function", name, stateMutability: "view", inputs: [], outputs: [{ type: "address" }] })),
    { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
    { type: "function", name: "tickSpacing", stateMutability: "view", inputs: [], outputs: [{ type: "int24" }] },
    { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
    { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
      { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" },
      { type: "uint16" }, { type: "uint8" }, { type: "bool" },
    ] },
  ],
  token: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }],
};

export async function probeLpOnchain({ client, now = Date.now, write = line => process.stdout.write(line + "\n") }) {
  let stage = "chain";
  try {
    if (await client.getChainId() !== 137) {
      write(JSON.stringify({ errorKind: "WRONG_CHAIN" }));
      return false;
    }
    stage = "block";
    const before = await client.getBlock({ blockTag: "latest" });
    const blockNumber = before.number;
    if (typeof blockNumber !== "bigint" || blockNumber <= 0n) throw new Error("Invalid block");
    const read = (address, contractAbi, functionName, args = []) => client.readContract({ address, abi: contractAbi, functionName, args, blockNumber });
    stage = "factory";
    const factoryPool = await read(FACTORY, abi.factory, "getPool", [USDC, WETH, 500]);
    const factoryTickSpacing = await read(FACTORY, abi.factory, "feeAmountTickSpacing", [500]);
    stage = "pool";
    const poolFactory = await read(POOL, abi.pool, "factory");
    const token0 = await read(POOL, abi.pool, "token0");
    const token1 = await read(POOL, abi.pool, "token1");
    const fee = await read(POOL, abi.pool, "fee");
    const tickSpacing = await read(POOL, abi.pool, "tickSpacing");
    const liquidity = await read(POOL, abi.pool, "liquidity");
    const slot0 = await read(POOL, abi.pool, "slot0");
    stage = "tokens";
    const usdcDecimals = await read(USDC, abi.token, "decimals");
    const wethDecimals = await read(WETH, abi.token, "decimals");
    stage = "confirmation";
    const after = await client.getBlock({ blockNumber });
    stage = "validation";
    const timestampMs = Number(before.timestamp) * 1000;
    const checkedAt = now();
    const checks = {
      blockFresh: Number.isSafeInteger(timestampMs) && Number.isSafeInteger(checkedAt)
        && timestampMs <= checkedAt + 5_000 && checkedAt - timestampMs <= 120_000,
      blockStable: after.number === blockNumber && after.timestamp === before.timestamp && sameHash(before.hash, after.hash),
      factoryPoolMatches: sameAddress(factoryPool, POOL),
      poolFactoryMatches: sameAddress(poolFactory, FACTORY),
      tokensMatch: sameAddress(token0, USDC) && sameAddress(token1, WETH),
      decimalsMatch: usdcDecimals === 6 && wethDecimals === 18,
      feeMatches: fee === 500,
      tickSpacingMatches: factoryTickSpacing === 10 && tickSpacing === factoryTickSpacing,
      initialized: Array.isArray(slot0) && typeof slot0[0] === "bigint" && slot0[0] > 0n
        && Number.isInteger(slot0[1]) && Math.abs(slot0[1]) <= 887272 && slot0[6] === true,
      activeLiquidityPositive: typeof liquidity === "bigint" && liquidity > 0n,
    };
    const verified = Object.values(checks).every(Boolean);
    write(JSON.stringify({ chainId: 137, blockNumber: blockNumber.toString(), observedAt: new Date(timestampMs).toISOString(), checks, verified }));
    return verified;
  } catch {
    write(JSON.stringify({ errorKind: "RPC_UNAVAILABLE", stage }));
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  let success = false;
  try {
    const rpcUrl = process.env.POLYGON_RPC_URL;
    if (!rpcUrl) throw new Error("No RPC URL");
    const url = new URL(rpcUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid RPC URL");
    const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
    const { createPublicClient, http } = require("viem");
    const { polygon } = require("viem/chains");
    success = await probeLpOnchain({ client: createPublicClient({ chain: polygon, transport: http(rpcUrl, { timeout: 8_000, retryCount: 1 }) }) });
  } catch {
    process.stdout.write(JSON.stringify({ errorKind: "NOT_CONFIGURED" }) + "\n");
  }
  if (!success) process.exitCode = 1;
}
