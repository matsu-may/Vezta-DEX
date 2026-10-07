import { expect, it } from "vitest";
import { handleTestnetRequest } from "./testnet-routes";
import { handleTestnetLpRequest } from "./testnet-lp-routes";
import { handleTestnetLpWalletRequest } from "./testnet-lp-wallet-routes";
import { testnetChainConfig } from "@vezta-dex/core";
const c = testnetChainConfig(1301).candidate, wallet = "0x1111111111111111111111111111111111111111";
const req = (path: string, body: unknown) => new Request(`http://127.0.0.1:3021/api/v1/testnet/unichain-sepolia/${path}`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
it("recognizes only the explicit chain namespace and rejects Base payloads there before RPC", async () => {
  const body = {chainId: 1301, wallet, tokenIn: c.USDC.address, tokenOut: c.WETH.address, amountIn: "1000000", slippageBps: 50};
  expect((await handleTestnetRequest(req("quote", body), undefined, undefined, undefined, undefined, undefined, undefined, undefined, false, 1301))?.status).toBe(503);
  expect((await handleTestnetRequest(req("quote", {...body, chainId: 84532}), undefined, undefined, undefined, undefined, undefined, undefined, undefined, false, 1301))?.status).toBe(400);
  expect(await handleTestnetRequest(req("quote", body))).toBeUndefined();
  expect((await handleTestnetLpRequest(req("lp/positions", {chainId: 1301, owner: wallet, cursor: "0", limit: 1}), undefined, 1301))?.status).toBe(503);
  expect((await handleTestnetLpWalletRequest(req("lp/study", {intent: {chainId: 1301, wallet, kind: "mint", amount0Cap: "1000000", amount1Cap: "1000000000000000"}}), undefined, undefined, false, undefined, 1301))?.status).toBe(503);
});
