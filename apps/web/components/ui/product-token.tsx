import Image from "next/image";
import {testnetChainConfig, type TestnetChainId} from "@vezta-dex/core";
const images = {USDC:"/tokens/usdc.svg", WETH:"/tokens/weth.png"} as const;
export function ProductTokenIcon({token,chainId=84532}:{token:"USDC"|"WETH";chainId?:TestnetChainId}) {
  const address = testnetChainConfig(chainId).candidate[token].address;
  return <span className={`product-token-icon ${token.toLowerCase()}`} data-token-id={`${chainId}:${address.toLowerCase()}`} aria-hidden="true"><Image src={images[token]} width={32} height={32} alt="" unoptimized/></span>;
}
export function ProductNetworkIcon({chainId}:{chainId:TestnetChainId}) {
  return <Image className="product-network-icon" src={`/networks/${chainId===84532?"base":"unichain"}.png`} width={20} height={20} alt="" unoptimized/>;
}
export function ProductPair({chainId=84532}:{chainId?:TestnetChainId}) {
  return <span className="product-pair-icons"><ProductTokenIcon chainId={chainId} token="USDC"/><ProductTokenIcon chainId={chainId} token="WETH"/></span>;
}
