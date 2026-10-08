export function ProductTransactionProgress({approval,liquidity=false}:{approval:boolean;liquidity?:boolean}) {
  return <ol className="product-transaction-progress" aria-label="Transaction steps">
    <li aria-current={approval?"step":undefined}><span>1</span>{liquidity?"Authorize tokens":"Token approval"}</li>
    <li aria-current={!approval?"step":undefined}><span>2</span>{liquidity?"Liquidity action":"Swap"}</li>
    <li><span>3</span>Confirmation</li>
  </ol>;
}
