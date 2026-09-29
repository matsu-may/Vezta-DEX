import { describe, expect, it, vi } from "vitest";
import { TOKENS, type Address, type TradingIntent } from "@vezta-dex/core";
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

function source(allowance: bigint, timestamp = 1_000n): AllowanceChainSource & { getAccountCode(owner: Address, blockNumber: bigint): Promise<string> } {
  return {
    getBlock: vi.fn(async () => ({ number: 123n, timestamp })),
    getAccountCode: vi.fn(async () => "0x"),
    getTokenAllowance: vi.fn(async () => allowance),
  };
}

describe("Polygon allowance reader", () => {
  it("reads the selected token's Permit2 allowance at a pinned recent block", async () => {
    const chain = source(0n);
    const result = await new AllowanceReader(chain, () => 1_000_000).getPlan(intent);
    expect(chain.getAccountCode).toHaveBeenCalledWith(intent.swapper, 123n);
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

  it.each(["0x6000", "0xef01001111111111111111111111111111111111111111"])("blocks deployed/delegated account code %s before reading allowance", async (code) => {
    const chain = source(0n);
    chain.getAccountCode = vi.fn(async () => code);
    const result = await new AllowanceReader(chain, () => 1_000_000).getPlan(intent);
    expect(result).toMatchObject({ chainId: 137, blockNumber: "123", currentAllowance: null, plan: { kind: "blocked-account" } });
    expect(chain.getTokenAllowance).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(code);
    expect(JSON.stringify(result)).not.toContain("095ea7b3");
  });

  it.each([undefined, null, 0, "", "0x0", "0X", "0xgg"])("rejects missing or malformed account code %s", async (code) => {
    const chain = source(0n);
    chain.getAccountCode = vi.fn(async () => code as string);
    await expect(new AllowanceReader(chain, () => 1_000_000).getPlan(intent)).rejects.toThrow();
    expect(chain.getTokenAllowance).not.toHaveBeenCalled();
  });

  it("rejects a code-read failure instead of assuming an EOA", async () => {
    const chain = source(0n);
    chain.getAccountCode = vi.fn(async () => { throw new Error("RPC account code unavailable"); });
    await expect(new AllowanceReader(chain, () => 1_000_000).getPlan(intent)).rejects.toThrow();
    expect(chain.getTokenAllowance).not.toHaveBeenCalled();
  });

  it("rejects a block that becomes stale during the account-code read", async () => {
    let now = 1_000_000;
    const chain = source(0n);
    chain.getAccountCode = vi.fn(async () => { now = 1_120_001; return "0x"; });
    await expect(new AllowanceReader(chain, () => now).getPlan(intent)).rejects.toThrow();
    expect(chain.getTokenAllowance).not.toHaveBeenCalled();
  });

  it("rejects a block that becomes stale during the allowance read", async () => {
    let now = 1_000_000;
    const chain = source(0n);
    chain.getTokenAllowance = vi.fn(async () => { now = 1_120_001; return 0n; });
    await expect(new AllowanceReader(chain, () => now).getPlan(intent)).rejects.toThrow();
  });

  it("uses a snapshot if caller intent changes during RPC", async () => {
    const submitted = { ...intent };
    const chain = source(0n);
    chain.getBlock = vi.fn(async () => {
      submitted.tokenIn = TOKENS.WETH.address;
      submitted.tokenOut = TOKENS.USDC.address;
      submitted.amountIn = "1000000000000000";
      return { number: 123n, timestamp: 1_000n };
    });
    const result = await new AllowanceReader(chain, () => 1_000_000).getPlan(submitted);
    expect(chain.getTokenAllowance).toHaveBeenCalledWith(TOKENS.USDC.address, intent.swapper, POLYGON_PERMIT2, 123n);
    expect(result.plan).toMatchObject({ kind: "approve", transaction: { to: TOKENS.USDC.address } });
  });

  it.each([-1n, 1n << 256n, 0])("rejects malformed on-chain allowance %s", async (value) => {
    const chain = source(value as bigint);
    await expect(new AllowanceReader(chain, () => 1_000_000).getPlan(intent)).rejects.toThrow();
  });

  it.each([{ number: -1n, timestamp: 1_000n }, { number: 123n, timestamp: -1n }])("rejects malformed pinned blocks %o", async (block) => {
    const chain = source(0n);
    chain.getBlock = vi.fn(async () => block);
    await expect(new AllowanceReader(chain, () => 1_000_000).getPlan(intent)).rejects.toThrow();
    expect(chain.getAccountCode).not.toHaveBeenCalled();
  });
});
