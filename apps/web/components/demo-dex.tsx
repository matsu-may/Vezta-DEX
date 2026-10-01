"use client";

import { useRef, useState, type FormEvent } from "react";
import { formatUnits } from "viem";
import {
  closeDemoPosition, collectDemoPosition, commitDemoSwap, createDemoPosition,
  creditDemoFees, decreaseDemoPosition, increaseDemoPosition, initialDemoState,
  previewDemoSwap, type DemoDirection, type DemoState, type DemoSwapPreview,
} from "../lib/demo-engine";

function amount(value: bigint, decimals: number): string {
  const [whole, fraction] = formatUnits(value, decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function tokenAmount(value: bigint, token: "USDC" | "WETH"): string {
  return `${amount(value, token === "USDC" ? 6 : 18)} ${token}`;
}

const actionName = {
  swap: "swap", create: "position creation", increase: "liquidity increase",
  decrease: "liquidity removal", "example-fee": "example fee credit",
  collect: "collect", close: "close",
} as const;

export function DemoDex() {
  const [state, setState] = useState<DemoState>(initialDemoState);
  const stateRef = useRef(state);
  const [direction, setDirection] = useState<DemoDirection>("USDC_TO_WETH");
  const [input, setInput] = useState("10");
  const [slippageBps, setSlippageBps] = useState(50);
  const [preview, setPreview] = useState<DemoSwapPreview | null>(null);
  const [error, setError] = useState("");

  function act(transition: (current: DemoState) => DemoState) {
    try {
      const next = transition(stateRef.current);
      stateRef.current = next;
      setState(next);
      setPreview(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo action unavailable.");
    }
  }

  function requestPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setPreview(previewDemoSwap(stateRef.current, direction, input, slippageBps));
      setError("");
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "Demo quote unavailable.");
    }
  }

  function invalidate() { setPreview(null); setError(""); }

  function reset() {
    const fresh = initialDemoState();
    stateRef.current = fresh;
    setState(fresh);
    setDirection("USDC_TO_WETH");
    setInput("10");
    setSlippageBps(50);
    invalidate();
  }

  const position = state.position;
  const owed = position ? position.owedPrincipalUSDC + position.owedPrincipalWETH
    + position.owedFeeUSDC + position.owedFeeWETH : 0n;
  const inputToken = direction === "USDC_TO_WETH" ? "USDC" : "WETH";
  const outputToken = direction === "USDC_TO_WETH" ? "WETH" : "USDC";
  const receipt = state.lastReceipt;

  return (
    <div className="demo-stack">
      <section className="demo-banner" aria-label="Simulation disclosure">
        <div><div className="eyebrow">SELF-CONTAINED WORKFLOW DEMO</div>
          <h2>Practice every step with virtual assets.</h2>
          <p>Simulated amounts only. No wallet or real transaction is used. The swap is an illustrative AMM fixture, not a live Uniswap v3 quote. Example LP fees are manually credited for this walkthrough.</p></div>
        <button className="button demo-reset" type="button" onClick={reset}>Reset demo</button>
      </section>

      <section className="demo-balance-grid" aria-label="Simulated wallet balances">
        <div className="demo-balance"><span>VIRTUAL WALLET · USDC</span><strong className="mono">{tokenAmount(state.balances.USDC, "USDC")}</strong></div>
        <div className="demo-balance"><span>VIRTUAL WALLET · WETH</span><strong className="mono">{tokenAmount(state.balances.WETH, "WETH")}</strong></div>
        <div className="demo-balance"><span>POSITION</span><strong>{position ? "1 simulated LP" : "No demo position"}</strong></div>
      </section>

      <div className="demo-grid">
        <section className="section-card demo-card" aria-labelledby="demo-swap-title">
          <div className="eyebrow">01 / SWAP WORKFLOW</div><h2 id="demo-swap-title">Swap virtual tokens</h2>
          <p className="demo-copy">A synthetic constant-product pool illustrates fee, price impact and a reviewed minimum. Balances change only after you simulate.</p>
          <form onSubmit={requestPreview}>
            <label className="form-label" htmlFor="demo-direction">Direction</label>
            <select id="demo-direction" className="field" value={direction} onChange={event => {
              setDirection(event.target.value as DemoDirection); invalidate();
            }}>
              <option value="USDC_TO_WETH">USDC → WETH</option>
              <option value="WETH_TO_USDC">WETH → USDC</option>
            </select>
            <label className="form-label" htmlFor="demo-amount">Demo swap amount</label>
            <input id="demo-amount" className="field amount-field" value={input} inputMode="decimal" autoComplete="off"
              onChange={event => { setInput(event.target.value); invalidate(); }} />
            <p className="form-help">Available: {tokenAmount(state.balances[inputToken], inputToken)} · virtual</p>
            <label className="form-label" htmlFor="demo-slippage">Maximum slippage</label>
            <select id="demo-slippage" className="field" value={slippageBps} onChange={event => {
              setSlippageBps(Number(event.target.value)); invalidate();
            }}>
              <option value={10}>0.1%</option><option value={50}>0.5%</option>
              <option value={100}>1%</option><option value={300}>3%</option>
            </select>
            <button className="button button-primary demo-action" type="submit">Preview simulated swap</button>
          </form>
          {preview ? <div className="demo-preview" aria-live="polite">
            <div><span>Estimated simulated output</span><strong className="mono">{tokenAmount(preview.amountOut, outputToken)}</strong></div>
            <div><span>Minimum simulated output</span><strong className="mono">{tokenAmount(preview.minimumAmountOut, outputToken)}</strong></div>
            <div><span>Illustrative pool fee</span><strong className="mono">{tokenAmount(preview.feeAmount, inputToken)} · 0.05%</strong></div>
            <button className="button button-primary demo-action" type="button" onClick={() => act(current => commitDemoSwap(current, preview))}>Simulate swap</button>
          </div> : <p className="demo-empty">Preview a virtual swap to inspect its output and minimum.</p>}
        </section>

        <section className="section-card demo-card" aria-labelledby="demo-lp-title">
          <div className="eyebrow">02 / LIQUIDITY WORKFLOW</div><h2 id="demo-lp-title">Manage an example LP</h2>
          <p className="demo-copy">This separate fixed fixture demonstrates NFT ownership, liquidity changes, owed principal, an example fee and collection. Its values are not tied to the swap pool.</p>
          {position ? <div className="demo-position">
            <strong>Demo position #1</strong><span className="mono">{position.liquidity.toString()} demo liquidity units</span>
            <div><span>Current illustrative principal</span><strong className="mono">{tokenAmount(position.principalUSDC, "USDC")} + {tokenAmount(position.principalWETH, "WETH")}</strong></div>
            <div><span>Principal owed, not yet in wallet</span><strong className="mono">{tokenAmount(position.owedPrincipalUSDC, "USDC")} + {tokenAmount(position.owedPrincipalWETH, "WETH")}</strong></div>
            <div><span>Separate example fee owed</span><strong className="mono">{tokenAmount(position.owedFeeUSDC, "USDC")} + {tokenAmount(position.owedFeeWETH, "WETH")}</strong></div>
          </div> : <div className="demo-empty">Create a fixed example position with 100 USDC and 0.04 WETH from the virtual wallet.</div>}
          <div className="demo-actions">
            {!position ? <button className="button button-primary" type="button" onClick={() => act(createDemoPosition)}>Create demo position</button> : <>
              <button className="button button-primary" type="button" disabled={position.liquidity === 0n}
                onClick={() => act(increaseDemoPosition)}>Increase demo liquidity</button>
              <button className="button" type="button" disabled={position.liquidity === 0n || position.exampleFeeCredited}
                onClick={() => act(creditDemoFees)}>Credit example fee</button>
              <button className="button" type="button" disabled={position.liquidity === 0n}
                onClick={() => act(current => decreaseDemoPosition(current, "half"))}>Remove half</button>
              <button className="button" type="button" disabled={position.liquidity === 0n}
                onClick={() => act(current => decreaseDemoPosition(current, "all"))}>Remove all</button>
              <button className="button" type="button" disabled={owed === 0n}
                onClick={() => act(collectDemoPosition)}>Collect owed tokens</button>
              <button className="button" type="button" disabled={position.liquidity !== 0n || owed !== 0n}
                onClick={() => act(closeDemoPosition)}>Close demo position</button>
            </>}
          </div>
        </section>
      </div>

      {error && <p className="form-error demo-error" role="alert">{error}</p>}
      <section className="section-card demo-receipt" aria-live="polite" aria-label="Last simulated action">
        <div className="eyebrow">LOCAL RECEIPT · NO TRANSACTION HASH</div>
        {receipt ? <><h2>Local action #{receipt.sequence} · simulated {actionName[receipt.action]}</h2>
          {receipt.swap ? <>
            <p className="mono">Sent {tokenAmount(receipt.swap.amountIn, receipt.swap.input)}</p>
            <p className="mono">Received {tokenAmount(receipt.swap.amountOut, receipt.swap.output)}</p>
            <p className="mono">Illustrative fee {tokenAmount(receipt.swap.feeAmount, receipt.swap.input)}</p>
          </> : <>
            <p className="mono">{tokenAmount(receipt.principalUSDC, "USDC")} principal + {tokenAmount(receipt.feeUSDC, "USDC")} example fee</p>
            <p className="mono">{tokenAmount(receipt.principalWETH, "WETH")} principal + {tokenAmount(receipt.feeWETH, "WETH")} example fee</p>
          </>}</>
          : <p>No simulated action yet. No chain transaction will be created here.</p>}
      </section>
    </div>
  );
}
