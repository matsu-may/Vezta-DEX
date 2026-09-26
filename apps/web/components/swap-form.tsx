"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatUnits } from "viem";
import {
  POLYGON_CHAIN_ID,
  TOKENS,
  minimumOutput,
  parseExactInput,
  validateSwapQuote,
  type SwapQuote,
} from "@vezta-dex/core";

type Direction = "USDC" | "WETH";

export function SwapForm() {
  const [direction, setDirection] = useState<Direction>("USDC");
  const [amount, setAmount] = useState("100");
  const [slippageBps, setSlippageBps] = useState(50);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  function invalidate() {
    requestId.current += 1;
    setQuote(null);
    setError("");
    setLoading(false);
  }

  useEffect(() => {
    if (!quote) return;
    const timeLeft = Math.max(0, Date.parse(quote.observedAt) + 30_000 - Date.now());
    const timer = setTimeout(() => {
      requestId.current += 1;
      setQuote(null);
      setError("Quote expired. Request a fresh preview.");
    }, timeLeft);
    return () => clearTimeout(timer);
  }, [quote]);

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invalidate();
    const currentRequest = requestId.current;
    const inputToken = TOKENS[direction];
    const outputToken = direction === "USDC" ? TOKENS.WETH : TOKENS.USDC;
    let amountIn: bigint;
    try {
      amountIn = parseExactInput(amount, inputToken.decimals);
    } catch {
      setError(`Enter a positive ${inputToken.symbol} amount with at most ${inputToken.decimals} decimal places.`);
      return;
    }
    setLoading(true);
    try {
      const intent = {
        chainId: POLYGON_CHAIN_ID,
        tokenIn: inputToken.address,
        tokenOut: outputToken.address,
        amountIn: amountIn.toString(),
        slippageBps,
      };
      const query = new URLSearchParams({
        chainId: String(intent.chainId),
        tokenIn: intent.tokenIn,
        amountIn: intent.amountIn,
        slippageBps: String(slippageBps),
      });
      const response = await fetch(`/api/quote?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 400 ? "Unsupported token or amount for this pool." : "Live quote is unavailable. Try again shortly.");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("quote" in body)) throw new Error("Invalid quote response.");
      const result = body.quote as SwapQuote;
      validateSwapQuote(result, intent, Date.now());
      if (requestId.current === currentRequest) setQuote(result);
    } catch (cause) {
      if (requestId.current === currentRequest) setError(cause instanceof Error ? cause.message : "Live quote is unavailable.");
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }

  const outputToken = quote?.tokenOut.toLowerCase() === TOKENS.WETH.address.toLowerCase() ? TOKENS.WETH : TOKENS.USDC;

  return (
    <div className="swap-layout">
      <form className="section-card swap-card" onSubmit={preview}>
        <div className="section-heading"><div><div className="eyebrow">QUOTE</div><h2>Swap preview</h2></div><span className="network-pill"><span className="network-dot" /> Polygon</span></div>
        <label className="form-label" htmlFor="swap-direction">You sell</label>
        <select id="swap-direction" className="field" value={direction} onChange={(event) => { setDirection(event.target.value as Direction); invalidate(); }}>
          <option value="USDC">USDC (native) → WETH</option>
          <option value="WETH">WETH → USDC (native)</option>
        </select>
        <label className="form-label" htmlFor="swap-amount">Amount</label>
        <input id="swap-amount" className="field amount-field" type="text" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => { setAmount(event.target.value); invalidate(); }} aria-describedby="swap-limit" />
        <p id="swap-limit" className="form-help">Preview limit: 10,000 USDC or 5 WETH. Amounts use the token&apos;s on-chain decimals.</p>
        <label className="form-label" htmlFor="swap-slippage">Maximum slippage</label>
        <select id="swap-slippage" className="field" value={slippageBps} onChange={(event) => { setSlippageBps(Number(event.target.value)); invalidate(); }}>
          <option value={10}>0.1%</option><option value={50}>0.5%</option><option value={100}>1%</option><option value={300}>3%</option>
        </select>
        <button className="button button-primary swap-submit" type="submit" disabled={loading}>{loading ? "Reading Polygon…" : "Get fresh quote"}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>

      <section className="section-card quote-card" aria-live="polite" aria-label="Swap quote">
        <div className="eyebrow">TRADE DETAILS</div><h2>Single-pool route</h2>
        {quote ? <div className="quote-details">
          <div><span>Estimated received</span><strong>{formatUnits(BigInt(quote.amountOut), outputToken.decimals)} {outputToken.symbol}</strong></div>
          <div><span>Minimum received</span><strong>{formatUnits(minimumOutput(BigInt(quote.amountOut), slippageBps), outputToken.decimals)} {outputToken.symbol}</strong></div>
          <div><span>Pool fee</span><strong>0.05%</strong></div>
          <div><span>Route</span><strong>Uniswap v3 · Polygon · one pool</strong></div>
          <div><span>Observed</span><strong>{quote.observedAt} · block {quote.blockNumber}</strong></div>
          <p className="data-caveat">Quoter simulation gas: {quote.quoterGasEstimate} units. This is not a wallet transaction gas estimate. The quote expires 30 seconds after its block timestamp.</p>
        </div> : <div className="quote-placeholder">Enter an amount to request a current on-chain quote. No wallet connection is needed for a preview.</div>}
        <div className="write-gate">Wallet execution stays disabled until live Polygon approval, swap, gas and receipt checks are recorded.</div>
      </section>
    </div>
  );
}
