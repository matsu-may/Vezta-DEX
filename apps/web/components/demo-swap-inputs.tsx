"use client";
import {useState} from "react";
import { formatUnits } from "viem";
import {ProductTokenIcon} from "./product-token";
type Direction = "forward" | "reverse";
function TokenPicker({token,disabled,label,onPick}:{token:"USDC"|"WETH";disabled:boolean;label:string;onPick:(token:"USDC"|"WETH")=>void}) {
 const [open,setOpen]=useState(false);
 return <div className="product-token-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}} onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}}><button type="button" disabled={disabled} className="product-token-trigger" aria-label={label} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><ProductTokenIcon token={token}/>{token}<span aria-hidden="true">⌄</span></button>{open&&!disabled&&<div className="product-token-options">{(["USDC","WETH"] as const).map(t=><button type="button" key={t} aria-label={`Choose ${t}`} onClick={()=>{onPick(t);setOpen(false);}}><ProductTokenIcon token={t}/>{t}<small>Supported testnet asset</small></button>)}</div>}</div>;
}
/** Presentation only. The parent invalidates the controller before changing any input. */
export function DemoSwapInputs({ direction, amount, disabled, amountOut, inputBalance, onDirection, onAmount }: {
 direction:Direction;amount:string;disabled:boolean;amountOut?:string;inputBalance?:string;onDirection:(direction:Direction)=>void;onAmount:(amount:string)=>void;
}) {
 const input=direction==="forward"?"USDC":"WETH",output=direction==="forward"?"WETH":"USDC";
 const received=amountOut?formatUnits(BigInt(amountOut),direction==="forward"?18:6):"0";
 return <div className="swap-inputs">
 <div className="swap-direction" hidden><label htmlFor="testnet-direction">Direction</label><select id="testnet-direction" value={direction} disabled={disabled} onChange={e=>onDirection(e.target.value as Direction)}><option value="forward">USDC → WETH</option><option value="reverse">WETH → USDC</option></select></div>
 <div className="swap-token-block"><label className="swap-block-label" htmlFor="testnet-amount">Sell <span className="sr-only">· Input amount</span></label><div className="swap-token-line"><input id="testnet-amount" aria-label="Input amount" inputMode="decimal" autoComplete="off" maxLength={80} value={amount} disabled={disabled} onChange={e=>onAmount(e.target.value)}/><TokenPicker token={input} disabled={disabled} label="Select input token" onPick={token=>{if(token!==input)onDirection(direction==="forward"?"reverse":"forward");}}/></div><span className="swap-block-caption">Test token · maximum {direction==="forward"?"5 USDC":"0.001 WETH"}{inputBalance!==undefined&&<> · Balance at review: {formatUnits(BigInt(inputBalance),direction==="forward"?6:18)} {input}</>}</span></div>
 <div className="swap-reverse-row"><button type="button" className="swap-reverse" aria-label="Reverse token pair" disabled={disabled} onClick={()=>onDirection(direction==="forward"?"reverse":"forward")}><span aria-hidden="true">↓</span></button></div>
 <div className="swap-token-block swap-output-block"><span className="swap-block-label">Buy</span><div className="swap-token-line"><output className={`swap-output ${received.length>16?"swap-output-long":""}`} aria-label="Quoted token output">{received}</output><TokenPicker token={output} disabled={disabled} label="Select output token" onPick={token=>{if(token!==output)onDirection(direction==="forward"?"reverse":"forward");}}/></div><span className="swap-block-caption">{amountOut?"Estimated received · minimum shown below":"Request a quote to see the estimated output"}</span></div>
 </div>;
}
