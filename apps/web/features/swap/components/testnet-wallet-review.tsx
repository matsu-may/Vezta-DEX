import { formatUnits } from "viem";
import { testnetChainConfig, type TestnetChainId } from "@vezta-dex/core";
import type { TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";
import { TestnetFeeReview } from "../../../components/transaction/testnet-fee-review";
export function testnetAmount(raw: string, token: string, chainId: TestnetChainId = 84532) {
  const C = testnetChainConfig(chainId).candidate;
  if (![C.USDC.address.toLowerCase(),C.WETH.address.toLowerCase()].includes(token.toLowerCase())) throw new Error("Unsupported token");
  const usdc = token.toLowerCase() === C.USDC.address.toLowerCase();
  return `${formatUnits(BigInt(raw), usdc ? 6 : 18)} ${usdc ? "USDC" : "WETH"}`;
}
const eth = (raw: string) => `${formatUnits(BigInt(raw), 18)} test ETH`;
export function TestnetWalletReview({ state, compact = false, showQuote = true, showTransaction = true, modal = false }: { state: TestnetWalletSnapshot; compact?: boolean; showQuote?: boolean; showTransaction?: boolean; modal?: boolean }) {
  const config = testnetChainConfig(state.quote?.quote.chainId ?? state.action?.chainId ?? 84532), P = config.policy;
  const amount = (raw: string, token: string) => testnetAmount(raw, token, P.chainId);
  const q = state.quote?.quote; const study = state.review; const a = state.action;
  const feeDetails = study?.gas && <><div><dt>Gas limit</dt><dd>{study.gas.gasLimit}</dd></div>
    <TestnetFeeReview fees={study.gas} />
    <div><dt>L2 fee ceiling</dt><dd>{eth(study.gas.l2FeeCeiling)}</dd></div>
    <div><dt>L1 fee upper bound</dt><dd>{eth(study.gas.l1FeeUpperBound)}</dd></div>
    <div><dt>Operator fee upper bound</dt><dd>{eth(study.gas.operatorFeeUpperBound)}</dd></div></>;
  return <>
    {q && showQuote && <section className="testnet-review" aria-label="Wallet quote">
      {!compact && <h3>Quote · {config.label}</h3>}<dl className="demo-preview">
        {(!compact || modal) && <div><dt>Input</dt><dd>{amount(q.amountIn, q.tokenIn)}</dd></div>}
        <div><dt>Estimated received</dt><dd>{amount(q.amountOut, q.tokenOut)}</dd></div>
        {modal && <div><dt>Recipient</dt><dd className="mono">{q.wallet}</dd></div>}
        <div className="quote-minimum"><dt>Minimum received</dt><dd>{amount(q.minimumAmountOut, q.tokenOut)}</dd></div>
        <div><dt>Pool fee</dt><dd>{q.feeTier / 10000}%</dd></div>
        <div><dt>Slippage</dt><dd>{q.slippageBps / 100}%</dd></div>{!compact && <><div><dt>Observed</dt><dd>{q.observedAt}</dd></div>
        <div><dt>Block</dt><dd>{q.blockNumber}</dd></div></>}
      </dl>
      {compact && <details className="quote-provenance"><summary>Quote source and block</summary><p>{config.label} RPC · block {q.blockNumber}</p><p className="mono">{q.observedAt}</p></details>}
      <details className="quote-provenance"><summary>Selected route{state.quote?.comparison ? ` · ${state.quote.comparison.qualifiedPoolCount}/4 pools qualified` : " · pinned pool"}</summary>
        <p>Uniswap v3 · {config.label} · {q.feeTier / 10000}% fee</p>
        <a className="mono" href={`${config.explorer}/address/${q.pool}`} target="_blank" rel="noreferrer">{q.pool}</a>
        {state.quote?.comparison && <><p>Greatest quoted output among qualified direct pools at this block, before gas. {state.quote.comparison.qualifiedPoolCount < 4 && "Partial comparison: unavailable candidates were excluded."}</p>
          <dl className="demo-preview">{state.quote.comparison.candidates.map(c => <div key={c.feeTier}><dt>{c.feeTier / 10000}% pool</dt>
            <dd>{c.status === "qualified" ? amount(c.amountOut, q.tokenOut) : "Unavailable / did not qualify"}</dd></div>)}</dl></>}
      </details>
    </section>}
    {study && showTransaction && <section className="testnet-review" aria-label="Transaction review">
      <h3>{a ? `${a.kind === "reset" ? "Reset allowance to zero" : a.kind === "approve" ? "Exact token approval" : "Simulated swap"}` : "Action needs review"}</h3>
      {study.reason && <p role="status">{study.reason === "TESTNET_INPUT_BALANCE_LOW" ? "Insufficient input tokens. Fund this wallet with testnet tokens." : "Insufficient test ETH for the complete fee budget."}</p>}
      {study.status === "allowance-ready" && <p>Allowance is ready. Review swap next.</p>}
      {study.status === "approval-required" && <p>Review approval before reviewing the swap.</p>}
      <dl className="demo-preview">
        <div><dt>Input balance</dt><dd>{amount(study.inputBalance, state.quote!.quote.tokenIn)}</dd></div>
        <div><dt>Gas balance</dt><dd>{eth(study.nativeBalance)}</dd></div>
        {a && <><div><dt>Action amount</dt><dd>{amount(a.kind === "reset" ? "0" : state.quote!.quote.amountIn, state.quote!.quote.tokenIn)}</dd></div>
          <div><dt>{a.kind === "swap" ? "Router" : "Approval spender"}</dt><dd className="mono">{P.router}</dd></div>
          <div><dt>Transaction target</dt><dd className="mono">{a.transaction.to}</dd></div>
          {!compact && <div><dt>Nonce</dt><dd>{a.transaction.nonce}</dd></div>}</>}
        {study.gas && <>{!compact && feeDetails}
          <div><dt>Complete snapshot fee budget</dt><dd>{eth(study.gas.totalFeeBudget)}</dd></div></>}
      </dl><p className="form-help">Fee budget includes a buffer for L1 and operator fees. It is an estimate, not the final charged fee.</p>
      {compact && (a || study.gas) && <details className="quote-provenance"><summary>Transaction and fee details</summary><dl className="demo-preview">{a && <><div><dt>Nonce</dt><dd>{a.transaction.nonce}</dd></div><div><dt>Transaction sender</dt><dd className="mono">{a.transaction.from}</dd></div><div><dt>Calldata</dt><dd className="mono">{a.transaction.data}</dd></div></>}{feeDetails}</dl></details>}
    </section>}
  </>;
}
