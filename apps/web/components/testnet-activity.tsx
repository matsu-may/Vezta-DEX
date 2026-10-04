"use client";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { readTestnetActivity, subscribeTestnetActivity, type TestnetActivityEntry } from "../lib/testnet-activity";

export function TestnetActivity({ account }: { account: string | null }) {
  const [history, setHistory] = useState<{ available: boolean; entries: TestnetActivityEntry[] }>({ available: true, entries: [] });
  useEffect(() => {
    let mounted = true;
    const update = () => {
      if (!mounted) return;
      try { setHistory(account ? readTestnetActivity(window.localStorage, account) : { available: true, entries: [] }); }
      catch { setHistory({ available: false, entries: [] }); }
    };
    queueMicrotask(update); const unsubscribe = subscribeTestnetActivity(update);
    window.addEventListener("storage", update);
    return () => { mounted = false; unsubscribe(); window.removeEventListener("storage", update); };
  }, [account]);
  if (!account) return null;
  const visible = history.entries.filter(e => e.account.toLowerCase() === account.toLowerCase());
  return <details className="local-activity"><summary>Local activity</summary>
    <p className="form-help">Recorded in this browser for this wallet on Base Sepolia. This is not a complete on-chain history; status is the last observation.</p>
    {!history.available ? <p role="status">Local activity storage is unavailable. Original transaction recovery remains separate.</p>
      : visible.length === 0 ? <p>No activity recorded in this browser.</p>
      : <ol>{visible.map(e => <li key={`${e.flow}:${e.hash}`}>
        <div><strong>{e.flow === "lp" ? "LP " : ""}{e.kind}</strong><span className="badge">{e.status}</span></div>
        <time dateTime={e.observedAt}>{e.observedAt}</time>
        <a className="mono" href={`https://sepolia.basescan.org/tx/${e.hash}`} target="_blank" rel="noreferrer">Original transaction · {e.hash.slice(0, 10)}…{e.hash.slice(-6)}</a>
        {e.tokenId && <p>NFT #{e.tokenId}</p>}
        {e.kind === "swap" && e.amountIn && e.tokenIn && e.amountOut && e.tokenOut && <p>{formatUnits(BigInt(e.amountIn), e.tokenIn === "USDC" ? 6 : 18)} {e.tokenIn} → {formatUnits(BigInt(e.amountOut), e.tokenOut === "USDC" ? 6 : 18)} {e.tokenOut}</p>}
        {e.flow === "lp" && e.amount0 && e.amount1 && <p>Observed token amounts: {formatUnits(BigInt(e.amount0), 6)} USDC / {formatUnits(BigInt(e.amount1), 18)} WETH</p>}
        {e.l2GasCost && <p>L2 gas cost: {formatUnits(BigInt(e.l2GasCost), 18)} test ETH. L1/operator fees are not included.</p>}
        {e.gasPayer && <p className="mono">Gas payer: {e.gasPayer}</p>}
      </li>)}</ol>}
  </details>;
}
