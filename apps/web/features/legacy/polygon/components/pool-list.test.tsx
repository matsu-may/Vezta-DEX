import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TOKENS, poolKey, type PoolRecord } from "@vezta-dex/core";
import { PoolList } from "./pool-list";

const pool: PoolRecord = {
  id: poolKey(137, "v3", "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9"),
  chainId: 137,
  protocol: "v3",
  reference: "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9",
  token0: TOKENS.USDC,
  token1: TOKENS.WETH,
  feeTier: 500,
  activeLiquidity: "40754944770195441",
  tvlUsd: null,
  volume24hUsd: null,
  source: "polygon-rpc",
  observedAt: "2026-09-26T19:26:59.000Z",
  blockNumber: "94497119",
};

describe("PoolList", () => {
  it("labels raw liquidity and stale data without inventing TVL or APR", () => {
    const markup = renderToStaticMarkup(<PoolList pools={[pool]} now={Date.parse("2026-09-26T19:30:00.000Z")} />);
    expect(markup).toContain("0.05%");
    expect(markup).toContain("Stale");
    expect(markup).toContain("Active liquidity (raw)");
    expect(markup).not.toContain("APR");
    expect(markup).not.toContain("TVL");
  });

  it("shows an explicit empty state", () => {
    expect(renderToStaticMarkup(<PoolList pools={[]} now={0} />)).toContain("No curated pools found");
  });
});
