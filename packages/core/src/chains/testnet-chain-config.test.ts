import { expect, it } from "vitest";
import { BASE_SEPOLIA_CANDIDATE as B } from "./testnet";

it("resolves only curated chains with independent token/pool/router identities", async () => {
  const m = await import("./testnet-chain-config");
  const base = m.testnetChainConfig(84532), uni = m.testnetChainConfig(1301);
  expect(base.candidate).toEqual(B);
  expect(base.policy.router).toBe("0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4");
  expect(uni.candidate.USDC).toMatchObject({chainId:1301,decimals:6,address:"0x31d0220469e10c4E71834a79b1f276d740d3768F"});
  expect(uni.candidate.WETH.address).toBe(base.candidate.WETH.address);
  expect(uni.candidate.WETH.chainId).not.toBe(base.candidate.WETH.chainId);
  expect(uni.pools).toHaveLength(1);
  expect(uni.policy.pool).toBe("0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e");
  expect(uni.source).toBe("unichain-sepolia-rpc");
  for (const id of [1,137,8453,11155111,"1301",null]) expect(() => m.testnetChainConfig(id)).toThrow();
  expect(Object.isFrozen(uni.candidate.USDC)).toBe(true);
  expect(Object.isFrozen(uni.policy)).toBe(true);
});
