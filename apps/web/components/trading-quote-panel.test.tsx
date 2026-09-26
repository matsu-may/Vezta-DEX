// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TOKENS } from "@vezta-dex/core";
import { TradingQuotePanel } from "./trading-quote-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TradingQuotePanel", () => {
  it("binds a routed quote to the connected Polygon account and clears it on input change", async () => {
    const swapper = "0x1111111111111111111111111111111111111111";
    vi.stubGlobal("ethereum", { request: vi.fn(async ({ method }) => method === "eth_chainId" ? "0x89" : [swapper]) });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ quote: {
      chainId: 137, swapper, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address,
      amountIn: "100000000", amountOut: "100000000000000000", minimumAmountOut: "99500000000000000",
      slippageBps: 50, routing: "CLASSIC", routerVersion: "2.1.2", requestId: "request-1",
      quotedAt: new Date().toISOString(), source: "uniswap-trading-api",
    } })));
    const { rerender } = render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    fireEvent.click(await screen.findByRole("button", { name: "Get best-route quote" }));
    expect(await screen.findByText("0.1 WETH")).toBeTruthy();
    rerender(<TradingQuotePanel direction="USDC" amount="200" slippageBps={50} />);
    expect(screen.queryByText("0.1 WETH")).toBeNull();
  });

  it("rejects a wallet connected to another chain before requesting a quote", async () => {
    vi.stubGlobal("ethereum", { request: vi.fn(async ({ method }) => method === "eth_chainId" ? "0x1" : ["0x1111111111111111111111111111111111111111"]) });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Switch your wallet to Polygon, then connect again.");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
