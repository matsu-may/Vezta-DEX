import {notFound} from "next/navigation";
import {parseProductRoute} from "../../../../../lib/product-routes";
import {ProductPage} from "../../../../../features/workspace/components/product-page";
export const dynamic="force-dynamic";
export default async function ProductDeepPage({params,searchParams}:{params:Promise<{network:string;view:string;segments:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {network,view,segments}=await params,route=parseProductRoute(network,view,segments);
 if(!route)notFound();
 return <ProductPage route={route} search={await searchParams}/>;
}
