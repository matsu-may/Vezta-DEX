export function ProductTokenIcon({token}:{token:"USDC"|"WETH"}) {
  return <span className={`product-token-icon ${token.toLowerCase()}`} aria-hidden="true">{token==="USDC"?"$":"Ξ"}</span>;
}
export function ProductPair(){return <span className="product-pair-icons"><ProductTokenIcon token="USDC"/><ProductTokenIcon token="WETH"/></span>;}
