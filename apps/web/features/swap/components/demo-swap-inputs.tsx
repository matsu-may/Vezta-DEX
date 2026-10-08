"use client";
import {ProductIcon} from "../../../components/ui/product-icon";
import type {TestnetChainId} from "@vezta-dex/core";
import { formatUnits } from "viem";
import {ProductTokenPicker} from "../../../components/ui/product-token-picker";
type Direction = "forward" | "reverse";
/** Presentation only. The parent invalidates the controller before changing any input. */
export function DemoSwapInputs({ direction, amount, disabled, amountOut, inputBalance, onDirection, onAmount, chainId=84532 }: {
 chainId?:TestnetChainId;direction:Direction;amount:string;disabled:boolean;amountOut?:string;inputBalance?:string;onDirection:(direction:Direction)=>void;onAmount:(amount:string)=>void;
}) {
 const input=direction==="forward"?"USDC":"WETH",output=direction==="forward"?"WETH":"USDC";
 const received=amountOut?formatUnits(BigInt(amountOut),direction==="forward"?18:6):"0";
 return <div className="swap-inputs">
 <div className="swap-direction" hidden><label htmlFor="testnet-direction">Direction</label><select id="testnet-direction" value={direction} disabled={disabled} onChange={e=>onDirection(e.target.value as Direction)}><option value="forward">USDC → WETH</option><option value="reverse">WETH → USDC</option></select></div>
 <div className="swap-token-block"><label className="swap-block-label" htmlFor="testnet-amount">Sell <span className="sr-only">· Input amount</span></label><div className="swap-token-line"><input id="testnet-amount" aria-label="Input amount" inputMode="decimal" autoComplete="off" maxLength={80} value={amount} disabled={disabled} onChange={e=>onAmount(e.target.value)}/><ProductTokenPicker chainId={chainId} token={input} disabled={disabled} label="Select input token" onPick={token=>{if(token!==input)onDirection(direction==="forward"?"reverse":"forward");}}/></div><span className="swap-block-caption">Test token · maximum {direction==="forward"?"5 USDC":"0.001 WETH"}{inputBalance!==undefined&&<> · Balance at review: {formatUnits(BigInt(inputBalance),direction==="forward"?6:18)} {input}</>}</span></div>
 <div className="swap-reverse-row"><button type="button" className="swap-reverse" aria-label="Reverse token pair" disabled={disabled} onClick={()=>onDirection(direction==="forward"?"reverse":"forward")}><ProductIcon name="down" size={24}/></button></div>
 <div className="swap-token-block swap-output-block"><span className="swap-block-label">Buy</span><div className="swap-token-line"><output className={`swap-output ${received.length>16?"swap-output-long":""}`} aria-label="Quoted token output">{received}</output><ProductTokenPicker chainId={chainId} token={output} disabled={disabled} label="Select output token" onPick={token=>{if(token!==output)onDirection(direction==="forward"?"reverse":"forward");}}/></div><span className="swap-block-caption">{amountOut?"Estimated received · minimum shown below":"Request a quote to see the estimated output"}</span></div>
 </div>;
}
