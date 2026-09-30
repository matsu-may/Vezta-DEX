import test from "node:test";
import assert from "node:assert/strict";
import { probeLpPoolInfo, selectLpApiKey } from "./smoke-lp-pool-info.mjs";

const pool = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";

test("an empty optional LP key falls back to the configured Trading API key", () => {
  assert.equal(selectLpApiKey({ UNISWAP_LP_API_KEY: "", UNISWAP_API_KEY: "trading-key" }), "trading-key");
  assert.equal(selectLpApiKey({ UNISWAP_LP_API_KEY: "lp-key", UNISWAP_API_KEY: "trading-key" }), "lp-key");
});

test("validates the fixed Polygon v3 pool without exposing key or raw pool data", async () => {
  const lines = [];
  const requests = [];
  const result = await probeLpPoolInfo({
    apiKey: "private-key",
    fetcher: async (url, options) => {
      requests.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
      return Response.json({ requestId: "private-request", pools: [{
        chainId: 137, poolProtocol: "V3", poolReferenceIdentifier: pool,
        tokenAddressA: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", tokenAddressB: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
        tokenDecimalsA: 6, tokenDecimalsB: 18, fee: "500", tickSpacing: 10,
        poolLiquidity: "123", sqrtRatioX96: "456", currentTick: 22, secret: "hidden",
      }] });
    },
    write: line => lines.push(JSON.parse(line)),
  });
  assert.equal(result, true);
  assert.deepEqual(requests.map(({ url, body }) => ({ url, body })), [{
    url: "https://liquidity.api.uniswap.org/lp/pool_info",
    body: { protocol: "V3", chainId: 137, poolParameters: {
      tokenAddressA: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      tokenAddressB: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", fee: 500,
    } },
  }]);
  assert.equal(requests[0].headers["x-api-key"], "private-key");
  assert.deepEqual(lines, [{ status: 200, poolCount: 1, poolMatches: true, stateShapeValid: true, activeLiquidityPositive: true }]);
  assert.ok(!JSON.stringify(lines).includes("private"));
  assert.ok(!JSON.stringify(lines).includes("hidden"));
});

test("a mismatched pool and upstream auth error fail without claiming LP readiness", async () => {
  const lines = [];
  const wrong = await probeLpPoolInfo({
    apiKey: "secret", fetcher: async () => Response.json({ pools: [{ poolReferenceIdentifier: "0x1111111111111111111111111111111111111111", chainId: 137 }] }),
    write: line => lines.push(JSON.parse(line)),
  });
  const unauthorized = await probeLpPoolInfo({
    apiKey: "secret", fetcher: async () => new Response(JSON.stringify({ message: "secret" }), { status: 401 }),
    write: line => lines.push(JSON.parse(line)),
  });
  assert.equal(wrong, false);
  assert.equal(unauthorized, false);
  const [{ poolChecks, ...mismatch }, auth] = lines;
  assert.deepEqual(mismatch, { status: 200, poolCount: 1, poolMatches: false, stateShapeValid: false, activeLiquidityPositive: false });
  assert.equal(poolChecks.length, 1);
  assert.deepEqual(auth, { status: 401, errorKind: "AUTH" });
});

test("a mismatch reports only bounded public identity checks, never upstream details", async () => {
  const lines = [];
  const returnedPool = "0x1111111111111111111111111111111111111111";
  const matched = await probeLpPoolInfo({
    apiKey: "private-key",
    fetcher: async () => Response.json({ requestId: "private-request", pools: [{
      chainId: "137", poolProtocol: "V3", poolReferenceIdentifier: returnedPool,
      tokenAddressA: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      tokenAddressB: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
      tokenDecimalsA: "6", tokenDecimalsB: "18", fee: "500", tickSpacing: 10,
      poolLiquidity: "123", sqrtRatioX96: "456", currentTick: 22,
      secret: "hidden",
    }] }),
    write: line => lines.push(JSON.parse(line)),
  });
  assert.equal(matched, false);
  assert.deepEqual(lines, [{
    status: 200, poolCount: 1, poolMatches: false, stateShapeValid: false, activeLiquidityPositive: false,
    poolChecks: [{
      chainIdMatches: false, chainIdType: "string", protocolMatches: true,
      poolAddressMatches: false, poolAddress: returnedPool,
      tokenPairMatches: true, tokenDecimalsMatch: false, tokenDecimalsTypes: ["string", "string"],
      feeMatches: true, currentTickValid: true, tickSpacingValid: true,
      liquidityShapeValid: true, sqrtRatioShapeValid: true,
    }],
  }]);
  assert.ok(!JSON.stringify(lines).includes("private"));
  assert.ok(!JSON.stringify(lines).includes("hidden"));
});

test("a matching pool with zero active liquidity is not marked ready", async () => {
  const lines = [];
  const ready = await probeLpPoolInfo({
    apiKey: "secret", fetcher: async () => Response.json({ pools: [{
      chainId: 137, poolProtocol: "V3", poolReferenceIdentifier: pool,
      tokenAddressA: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", tokenAddressB: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
      tokenDecimalsA: 6, tokenDecimalsB: 18, fee: "500", tickSpacing: 10,
      poolLiquidity: "0", sqrtRatioX96: "456", currentTick: 22,
    }] }), write: line => lines.push(JSON.parse(line)),
  });
  assert.equal(ready, false);
  assert.deepEqual(lines, [{ status: 200, poolCount: 1, poolMatches: true, stateShapeValid: true, activeLiquidityPositive: false }]);
});
