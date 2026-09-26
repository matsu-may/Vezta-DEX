"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import {
  POLYGON_CHAIN_ID,
  TOKENS,
  parseExactInput,
  validateTradingQuoteSummary,
  type Address,
  type TradingQuoteSummary,
} from "@vezta-dex/core";

interface WalletProvider {
  request(args: { method: string }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

function provider(): WalletProvider | undefined {
  return (window as Window & { ethereum?: WalletProvider }).ethereum;
}

export function TradingQuotePanel({ direction, amount, slippageBps }: {
  direction: "USDC" | "WETH";
  amount: string;
  slippageBps: number;
}) {
  const [account, setAccount] = useState<Address | null>(null);
  const [quote, setQuote] = useState<TradingQuoteSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    setQuote(null);
    setLoading(false);
    setError("");
  }, [direction, amount, slippageBps]);

  useEffect(() => {
    const wallet = provider();
    if (!wallet?.on) return;
    const reset = () => {
      requestId.current += 1;
      setAccount(null);
      setQuote(null);
      setLoading(false);
      setError("Wallet account or chain changed. Connect again to request a new quote.");
    };
    wallet.on("accountsChanged", reset);
    wallet.on("chainChanged", reset);
    return () => {
      wallet.removeListener?.("accountsChanged", reset);
      wallet.removeListener?.("chainChanged", reset);
    };
  }, []);

  useEffect(() => {
    if (!quote) return;
    const timeLeft = Math.max(0, Date.parse(quote.quotedAt) + 30_000 - Date.now());
    const timer = setTimeout(() => {
      requestId.current += 1;
      setQuote(null);
      setError("Routed quote expired. Request a fresh quote.");
    }, timeLeft);
    return () => clearTimeout(timer);
  }, [quote]);

  async function connect() {
    const wallet = provider();
    if (!wallet) {
      setError("No browser wallet detected. Install or open an EVM wallet to request a routed quote.");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const accounts = await wallet.request({ method: "eth_requestAccounts" });
      const chain = await wallet.request({ method: "eth_chainId" });
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof first !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(first)) throw new Error("Wallet did not return a valid account.");
      if (typeof chain !== "string" || Number.parseInt(chain, 16) !== POLYGON_CHAIN_ID) {
        throw new Error("Switch your wallet to Polygon, then connect again.");
      }
      requestId.current += 1;
      setAccount(first as Address);
      setQuote(null);
    } catch (cause) {
      setAccount(null);
      setError(cause instanceof Error ? cause.message : "Wallet connection was rejected.");
    } finally {
      setConnecting(false);
    }
  }

  async function getRoutedQuote() {
    if (!account) return;
    requestId.current += 1;
    const currentRequest = requestId.current;
    setQuote(null);
    setError("");
    const inputToken = TOKENS[direction];
    const outputToken = direction === "USDC" ? TOKENS.WETH : TOKENS.USDC;
    let amountIn: bigint;
    try {
      amountIn = parseExactInput(amount, inputToken.decimals);
    } catch {
      setError(`Enter a positive ${inputToken.symbol} amount with at most ${inputToken.decimals} decimal places.`);
      return;
    }
    const intent = {
      chainId: POLYGON_CHAIN_ID,
      swapper: account,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      amountIn: amountIn.toString(),
      slippageBps,
    };
    setLoading(true);
    try {
      const response = await fetch("/api/trading-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 400 ? "Unsupported token or amount for this route." : "Best-route quote is unavailable. Check API access and try again.");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("quote" in body)) throw new Error("Invalid routed quote response.");
      const result = body.quote as TradingQuoteSummary;
      validateTradingQuoteSummary(result, intent, Date.now());
      if (requestId.current === currentRequest) setQuote(result);
    } catch (cause) {
      if (requestId.current === currentRequest) setError(cause instanceof Error ? cause.message : "Best-route quote is unavailable.");
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }

  const outputToken = direction === "USDC" ? TOKENS.WETH : TOKENS.USDC;
  return (
    <section className="section-card trading-card" aria-live="polite" aria-label="Uniswap best-route quote">
      <div className="section-heading"><div><div className="eyebrow">UNISWAP TRADING API</div><h2>Best-route quote</h2></div><span className="badge badge-fresh">Read only</span></div>
      <p className="section-note">Connect a Polygon wallet to request a quote for the amount and slippage at left. No transaction is submitted.</p>
      {account ? <p className="section-note mono">Connected: {account.slice(0, 6)}…{account.slice(-4)}</p> :
        <button className="button button-primary swap-submit" type="button" onClick={connect} disabled={connecting}>{connecting ? "Connecting…" : "Connect wallet for route"}</button>}
      {account && <button className="button button-primary swap-submit" type="button" onClick={getRoutedQuote} disabled={loading}>{loading ? "Finding route…" : "Get best-route quote"}</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {quote ? <div className="quote-details routed-details">
        <div><span>Estimated received</span><strong>{formatUnits(BigInt(quote.amountOut), outputToken.decimals)} {outputToken.symbol}</strong></div>
        <div><span>Minimum received</span><strong>{formatUnits(BigInt(quote.minimumAmountOut), outputToken.decimals)} {outputToken.symbol}</strong></div>
        <div><span>Route</span><strong>Uniswap AMM · Polygon · best price</strong></div>
        <div><span>Observed</span><strong>{quote.quotedAt}</strong></div>
        <p className="data-caveat">The Trading API may use v2, v3, v4 or several pools. This quote is bound to the connected wallet and expires after 30 seconds. Approval and swap are not enabled.</p>
      </div> : <p className="section-note routed-placeholder">The routed quote appears here after wallet connection.</p>}
    </section>
  );
}
