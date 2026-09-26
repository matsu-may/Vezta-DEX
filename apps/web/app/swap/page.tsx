import { SwapForm } from "../../components/swap-form";

export default function SwapPage() {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div className="eyebrow">EXACT INPUT · SINGLE POOL</div>
        <h1>Preview a Polygon swap</h1>
        <p>Compare a live Uniswap v3 0.05% quote for native USDC and WETH. This preview uses one pool and does not search for the best route.</p>
      </section>
      <SwapForm />
    </div>
  );
}
