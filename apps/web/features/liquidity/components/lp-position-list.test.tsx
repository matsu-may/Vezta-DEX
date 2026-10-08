import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { V3_POOL_500 } from "@vezta-dex/core";
import { LpPositionList } from "./lp-position-list";
import type { LpPositionPage } from "../../legacy/polygon/lib/api";

const owner = "0x1111111111111111111111111111111111111111";
const page: LpPositionPage = { chainId: 137, manager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  pool: V3_POOL_500, owner, source: "polygon-rpc", blockNumber: "94738685",
  observedAt: "2026-10-01T00:00:00.000Z", totalOwned: "7", nextCursor: "5", incomplete: true,
  positions: [] };

describe("read-only LP position list", () => {
  it("does not call an empty filtered page a completed portfolio and offers the next cursor", () => {
    const markup = renderToStaticMarkup(<LpPositionList page={page} owner={owner} now={Date.parse("2026-10-01T00:00:20.000Z")} />);
    expect(markup).toContain("No matching positions on this page");
    expect(markup).toContain("cursor=5");
    expect(markup).not.toContain("No positions owned");
  });

  it("shows the NFT and range while marking unsupported economic values unavailable", () => {
    const markup = renderToStaticMarkup(<LpPositionList page={{ ...page, totalOwned: "1", nextCursor: null, incomplete: false,
      positions: [{ tokenId: "42", tickLower: -100, tickUpper: 100, inRange: true, liquidity: "123",
        currentAmounts: null, uncollectedFees: null }] }} owner={owner} now={Date.parse("2026-10-01T00:00:20.000Z")} />);
    expect(markup).toContain("#42");
    expect(markup).toContain("In range");
    expect(markup).toContain("Unavailable");
    expect(markup).not.toContain("APR");
    expect(markup).not.toContain("Claim");
  });
});
