import { formatUnits } from "viem";

type Direction = "forward" | "reverse";
const choices = { forward: ["0.1", "1", "5"], reverse: ["0.00001", "0.0001", "0.001"] };

/** Presentation only. The parent invalidates the controller before changing any input. */
export function DemoSwapInputs({ direction, amount, disabled, amountOut, onDirection, onAmount }: {
  direction: Direction; amount: number; disabled: boolean; amountOut?: string;
  onDirection: (direction: Direction) => void; onAmount: (amount: number) => void;
}) {
  const input = direction === "forward" ? "USDC" : "WETH";
  const output = direction === "forward" ? "WETH" : "USDC";
  return <div className="swap-inputs">
    <div className="swap-direction"><label htmlFor="testnet-direction">Direction</label>
      <select id="testnet-direction" value={direction} disabled={disabled} onChange={e => onDirection(e.target.value as Direction)}>
        <option value="forward">USDC → WETH</option><option value="reverse">WETH → USDC</option>
      </select>
    </div>
    <div className="swap-token-block">
      <label className="swap-block-label" htmlFor="testnet-amount">You pay <span className="sr-only">· Input amount</span></label>
      <div className="swap-token-line"><select id="testnet-amount" aria-label="Input amount" value={amount} disabled={disabled} onChange={e => onAmount(Number(e.target.value))}>
        {choices[direction].map((label, index) => <option value={index} key={label}>{label}</option>)}
      </select><span className="swap-token-name"><TokenIcon token={input} />{input}</span></div>
      <span className="swap-block-caption">Testnet token · select a demo amount</span>
    </div>
    <div className="swap-reverse-row"><button type="button" className="swap-reverse" aria-label="Reverse token pair" disabled={disabled} onClick={() => onDirection(direction === "forward" ? "reverse" : "forward")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4" /></svg>
    </button></div>
    <div className="swap-token-block swap-output-block"><span className="swap-block-label">You receive</span>
      <div className="swap-token-line"><output className="swap-output" aria-label="Quoted token output">{amountOut ? formatUnits(BigInt(amountOut), direction === "forward" ? 18 : 6) : "—"}</output>
        <span className="swap-token-name"><TokenIcon token={output} />{output}</span></div>
      <span className="swap-block-caption">{amountOut ? "Estimated received · minimum shown below" : "Get a quote to see the estimated output"}</span>
    </div>
  </div>;
}

function TokenIcon({ token }: { token: "USDC" | "WETH" }) {
  return <span className={`swap-token-icon ${token === "WETH" ? "swap-token-eth" : ""}`} aria-hidden="true">{token === "USDC" ? "$" : "Ξ"}</span>;
}
