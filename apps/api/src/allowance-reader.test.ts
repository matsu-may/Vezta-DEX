import { describe, expect, it, vi } from "vitest";
import { TOKENS, type TradingIntent } from "@vezta-dex/core";
import { AllowanceReader, type AllowanceChainSource } from "./allowance-reader";
import { POLYGON_PERMIT2 } from "./exact-approval";

const intent: TradingIntent = {
  chainId: 137,
  swapper: "0x1111111111111111111111111111111111111111",
  tokenIn: TOKENS.USDC.address,
  tokenOut: TOKENS.WETH.address,
  amountIn: "1000000",
  slippageBps: 50,
};

function source(allowance: bigint, timestamp = 1_000n): AllowanceChainSource {
  return {
    getBlock: vi.fn(async () => ({ number: 123n, timestamp })),
    getTokenAllowance: vi.fn(async () => allowance),
  };
}

describe("Polygon allowance reader", () => {
  it("reads the selected token's Permit2 allowance at a pinned recent block", async () => {
    const chain = source(0n);
    const result = await new AllowanceReader(chain, () => 1_000_000).getPlan(intent);
    expect(chain.getTokenAllowance).toHaveBeenCalledWith(intent.tokenIn, intent.swapper, POLYGON_PERMIT2, 123n);
    expect(result).toMatchObject({ chainId: 137, blockNumber: "123", currentAllowance: "0", plan: { kind: "approve" } });
    expect(result.observedAt).toBe("1970-01-01T00:16:40.000Z");
  });

  it("blocks a standing allowance larger than the selected swap amount", async () => {
    const result = await new AllowanceReader(source((1n << 256n) - 1n), () => 1_000_000).getPlan(intent);
    expect(result.plan.kind).toBe("blocked-existing");
    expect(JSON.stringify(result)).not.toContain("095ea7b3");
  });

  it("rejects stale chain data and invalid intent before preparing an approval", async () => {
    await expect(new AllowanceReader(source(0n, 800n), () => 1_000_000).getPlan(intent)).rejects.toThrow();
    const chain = source(0n);
    await expect(new AllowanceReader(chain, () => 1_000_000).getPlan({ ...intent, chainId: 1 })).rejects.toThrow();
    expect(chain.getBlock).not.toHaveBeenCalled();
  });
});
