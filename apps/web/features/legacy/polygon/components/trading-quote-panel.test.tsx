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
    const quoteButton = await screen.findByRole("button", { name: "Get best-route quote" });
    await act(async () => fireEvent.click(quoteButton));
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

  it("rejects malformed chain IDs instead of accepting a Polygon prefix", async () => {
    vi.stubGlobal("ethereum", { request: vi.fn(async ({ method }) => method === "eth_chainId" ? "0x89junk" : ["0x1111111111111111111111111111111111111111"]) });
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Switch your wallet to Polygon, then connect again.");
    expect(screen.queryByRole("button", { name: "Get best-route quote" })).toBeNull();
  });

  it("rejects a stale account returned by an open connection prompt", async () => {
    const oldAccount = "0x1111111111111111111111111111111111111111";
    const newAccount = "0x2222222222222222222222222222222222222222";
    let resolveAccounts!: (accounts: string[]) => void;
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("ethereum", {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") return new Promise<string[]>((resolve) => { resolveAccounts = resolve; });
        if (method === "eth_accounts") return [newAccount];
        return "0x89";
      }),
      on: (event: string, listener: () => void) => listeners.set(event, listener),
      removeListener: (event: string) => listeners.delete(event),
    });
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    await act(async () => { listeners.get("accountsChanged")?.(); resolveAccounts([oldAccount]); });
    expect(screen.queryByRole("button", { name: "Get best-route quote" })).toBeNull();
    expect(screen.getByRole("button", { name: "Connect wallet for route" })).toHaveProperty("disabled", false);
  });

  it("ignores a chain snapshot invalidated while connection checks are pending", async () => {
    let resolveChain!: (chain: string) => void;
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("ethereum", {
      request: vi.fn(async ({ method }) => method === "eth_chainId"
        ? new Promise<string>((resolve) => { resolveChain = resolve; })
        : ["0x1111111111111111111111111111111111111111"]),
      on: (event: string, listener: () => void) => listeners.set(event, listener),
      removeListener: (event: string) => listeners.delete(event),
    });
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" })));
    await act(async () => { listeners.get("chainChanged")?.(); resolveChain("0x89"); });
    expect(screen.queryByRole("button", { name: "Get best-route quote" })).toBeNull();
  });

  it("rechecks the current wallet account before requesting a quote", async () => {
    let currentAccount = "0x1111111111111111111111111111111111111111";
    vi.stubGlobal("ethereum", { request: vi.fn(async ({ method }) => method === "eth_chainId" ? "0x89" : [currentAccount]) });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    const quoteButton = await screen.findByRole("button", { name: "Get best-route quote" });
    currentAccount = "0x2222222222222222222222222222222222222222";
    await act(async () => fireEvent.click(quoteButton));
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Get best-route quote" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/wallet.*changed/i);
  });

  it("accepts the account-access event emitted by a successful connection prompt", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const listeners = new Map<string, (...args: unknown[]) => void>();
    vi.stubGlobal("ethereum", {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") listeners.get("accountsChanged")?.([account]);
        return method === "eth_chainId" ? "0x89" : [account];
      }),
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
      removeListener: (event: string) => listeners.delete(event),
    });
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    expect(await screen.findByRole("button", { name: "Get best-route quote" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["eth_accounts", "eth_chainId"])("accepts a matching account-access event during %s verification", async (eventMethod) => {
    const account = "0x1111111111111111111111111111111111111111";
    const listeners = new Map<string, (...args: unknown[]) => void>();
    vi.stubGlobal("ethereum", {
      request: vi.fn(async ({ method }) => {
        if (method === eventMethod) listeners.get("accountsChanged")?.([account]);
        return method === "eth_chainId" ? "0x89" : [account];
      }),
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
      removeListener: (event: string) => listeners.delete(event),
    });
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    expect(await screen.findByRole("button", { name: "Get best-route quote" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not restore a pending connection after accounts change away and back", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const changedAccount = "0x2222222222222222222222222222222222222222";
    let resolveChain!: (chain: string) => void;
    const listeners = new Map<string, (...args: unknown[]) => void>();
    vi.stubGlobal("ethereum", {
      request: vi.fn(async ({ method }) => method === "eth_chainId"
        ? new Promise<string>((resolve) => { resolveChain = resolve; })
        : [account]),
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
      removeListener: (event: string) => listeners.delete(event),
    });
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" })));
    await act(async () => {
      listeners.get("accountsChanged")?.([changedAccount]);
      listeners.get("accountsChanged")?.([account]);
      resolveChain("0x89");
    });
    expect(screen.queryByRole("button", { name: "Get best-route quote" })).toBeNull();
    expect(screen.getByRole("button", { name: "Connect wallet for route" })).toHaveProperty("disabled", false);
  });

  it.each(["accountsChanged", "chainChanged"])("does not restore an interrupted permission prompt after %s", async (event) => {
    const account = "0x1111111111111111111111111111111111111111";
    let resolveAccounts!: (accounts: string[]) => void;
    const listeners = new Map<string, (...args: unknown[]) => void>();
    vi.stubGlobal("ethereum", {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") return new Promise<string[]>((resolve) => { resolveAccounts = resolve; });
        return method === "eth_chainId" ? "0x89" : [account];
      }),
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
      removeListener: (event: string) => listeners.delete(event),
    });
    render(<TradingQuotePanel direction="USDC" amount="100" slippageBps={50} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet for route" }));
    await act(async () => {
      if (event === "accountsChanged") {
        listeners.get(event)?.(["0x2222222222222222222222222222222222222222"]);
        listeners.get(event)?.([account]);
      } else {
        listeners.get(event)?.("0x1");
        listeners.get(event)?.("0x89");
      }
      resolveAccounts([account]);
    });
    expect(screen.queryByRole("button", { name: "Get best-route quote" })).toBeNull();
    expect(screen.getByRole("button", { name: "Connect wallet for route" })).toHaveProperty("disabled", false);
  });
});
