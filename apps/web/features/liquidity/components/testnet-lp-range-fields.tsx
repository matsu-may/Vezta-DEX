"use client";
import { TESTNET_LP_FULL_RANGE, lpRangePrices, type TestnetLpRange } from "@vezta-dex/core";
export function TestnetLpRangeFields({ mode, lower, upper, range, error, disabled, onMode, onLower, onUpper, product = false }: {
  product?:boolean; mode:"full"|"custom"; lower:string; upper:string; range:TestnetLpRange|null; error:string|null; disabled:boolean;
  onMode:(value:"full"|"custom")=>void; onLower:(value:string)=>void; onUpper:(value:string)=>void;
}) {
  const actual = range ? lpRangePrices(range) : null;
  return <>
    {product && <div className="product-segmented" role="group" aria-label="Position range">{(["full","custom"] as const).map(value=><button key={value} type="button" disabled={disabled} aria-pressed={mode===value} onClick={()=>onMode(value)}>{value==="full"?"Full range":"Custom range"}</button>)}</div>}
    <div className="testnet-fields" hidden={product}><div><label className="form-label" htmlFor="lp-range-mode">Position range</label>
      <select id="lp-range-mode" className="field" value={mode} disabled={disabled} onChange={e=>onMode(e.target.value as "full"|"custom")}>
        <option value="full">Full range</option><option value="custom">Custom price range</option>
      </select></div></div>
    {mode === "custom" && <><div className="testnet-fields">
      <div><label className="form-label" htmlFor="lp-range-lower">Lower price · USDC per WETH</label><input id="lp-range-lower" className="field mono" inputMode="decimal" autoComplete="off" value={lower} disabled={disabled} onChange={e=>onLower(e.target.value)} /></div>
      <div><label className="form-label" htmlFor="lp-range-upper">Upper price · USDC per WETH</label><input id="lp-range-upper" className="field mono" inputMode="decimal" autoComplete="off" value={upper} disabled={disabled} onChange={e=>onUpper(e.target.value)} /></div>
    </div><p className="form-help">Bounds snap outward to spacing-60 ticks. Outside the range, deposits use one token and liquidity earns no swap fees until price enters the range. Study checks the required tokens at the current price.</p></>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {mode === "full" ? <p className="form-help">Full usable range · ticks {TESTNET_LP_FULL_RANGE.tickLower} → {TESTNET_LP_FULL_RANGE.tickUpper}.</p>
      : actual && range && <p className="form-help">Actual snapped bounds · USDC per WETH: ≈{actual.lower} → ≈{actual.upper}. Ticks: {range.tickLower} → {range.tickUpper}.</p>}
  </>;
}
