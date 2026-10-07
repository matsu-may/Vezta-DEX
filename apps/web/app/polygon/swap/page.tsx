import { SwapForm } from "../../../components/swap-form";

export default function SwapPage() {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div className="eyebrow">EXACT INPUT · POLYGON</div>
        <h1>Preview a Polygon swap</h1>
        <p>Compare a wallet-bound Uniswap AMM route with the researched v3 0.05% pool for native USDC and WETH. Quotes are read only; wallet execution is still gated.</p>
      </section>
      <SwapForm />
    </div>
  );
}
