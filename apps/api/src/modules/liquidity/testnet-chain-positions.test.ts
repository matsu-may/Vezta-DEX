import { expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { testnetChainConfig, createTestnetLpPositionDomain } from "@vezta-dex/core";
import { TestnetLpPositionReader } from "./testnet-lp-position";
import { lpSource, wallet, pool, position } from "./testnet-lp.test-helper";
import { TESTNET_NOW } from "../swap/testnet-quote.test-helper";
const cfg = testnetChainConfig(1301), C = cfg.candidate, P = cfg.policy;
it("scans Unichain positions with its manager, canonical block and token domain", async () => {
  const codes = JSON.parse(gunzipSync(readFileSync(new URL("../../fixtures/unichain-sepolia-runtime.json.gz", import.meta.url))).toString()).contracts as {address: string; code: `0x${string}`}[];
  const s = {...lpSource(), getChainId: async () => 1301, getPool: async () => P.pool,
    getDecimals: async (a: string) => a.toLowerCase() === C.USDC.address.toLowerCase() ? 6 : 18,
    getCode: async (a: string) => codes.find(c => c.address.toLowerCase() === a.toLowerCase())?.code ?? "0x6001" as const,
    getLpPoolState: async () => ({...pool(), token0: C.USDC.address, token1: C.WETH.address, factory: C.v3Factory}),
    getPosition: async () => ({...position(), token0: C.USDC.address, token1: C.WETH.address}),
    getDependencyConfiguration: async () => ({router: {factory: C.v3Factory, weth: C.WETH.address, positionManager: C.v3PositionManager},
      quoter: {factory: C.v3Factory, weth: C.WETH.address}, manager: {factory: C.v3Factory, weth: C.WETH.address}})};
  const r = new TestnetLpPositionReader(() => s, () => TESTNET_NOW, 1301);
  const request = {chainId: 1301, owner: wallet, cursor: "0", limit: 1};
  const page = await r.read(request);
  expect(page).toMatchObject({chainId: 1301, source: cfg.source, manager: C.v3PositionManager, pool: P.pool, positions: [{tokenId: "42", state: "active"}]});
  expect(() => createTestnetLpPositionDomain(84532).parseTestnetLpPage(page, TESTNET_NOW)).toThrow();
  await expect(r.read({...request, chainId: 84532})).rejects.toMatchObject({code: "TESTNET_LP_REQUEST_INVALID"});
  s.getPositionCount = async () => 0n;
  expect((await r.read(request)).positions).toEqual([]);
});
