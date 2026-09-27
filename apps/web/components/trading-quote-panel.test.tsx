// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("does not revive an old quote after the amount changes and changes back", async () => {
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
    rerender(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    expect(screen.queryByText("0.1 WETH")).toBeNull();
  });

  it("ignores a pending quote when its input changes before the response arrives", async () => {
    const swapper = "0x1111111111111111111111111111111111111111";
    vi.stubGlobal("ethereum", { request: vi.fn(async ({ method }) => method === "eth_chainId" ? "0x89" : [swapper]) });
    let resolveResponse!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    const { rerender } = render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    fireEvent.click(await screen.findByRole("button", { name: "Get best-route quote" }));
    rerender(<TradingQuotePanel direction="USDC" amount="200" slippageBps={50} />);
    rerender(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    await act(async () => resolveResponse(Response.json({ quote: {
      chainId: 137, swapper, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address,
      amountIn: "100000000", amountOut: "100000000000000000", minimumAmountOut: "99500000000000000",
      slippageBps: 50, routing: "CLASSIC", routerVersion: "2.1.2", requestId: "request-1",
      quotedAt: new Date().toISOString(), source: "uniswap-trading-api",
    } })));
    expect(screen.getByRole("button", { name: "Get best-route quote" })).toBeTruthy();
    expect(screen.queryByText("0.1 WETH")).toBeNull();
  });
});
