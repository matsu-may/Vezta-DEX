import { notFound } from "next/navigation";
import { rehearsalEnabled } from "../../features/legacy/rehearsal/lib/rehearsal-gate";
import { RehearsalPanelHost } from "../../features/legacy/rehearsal/components/rehearsal-panel";
export const dynamic="force-dynamic";
export default function RehearsalPage(){
  if(!rehearsalEnabled())notFound();
  return <div className="page-stack"><section className="page-heading"><div className="eyebrow">LOCAL REHEARSAL · POLYGON</div><h1>Review a small wallet swap</h1><p>Native USDC → WETH, at most 1 USDC. Each wallet action needs your explicit confirmation. This development rehearsal uses real Polygon funds when you submit in your wallet.</p></section><RehearsalPanelHost/></div>;
}
