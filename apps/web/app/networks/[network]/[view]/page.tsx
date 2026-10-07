import {notFound} from "next/navigation";
import {parseProductRoute} from "../../../../lib/product-routes";
import {ProductPage} from "../../../../components/product-page";
export const dynamic="force-dynamic";
export default async function TestnetProductPage({params,searchParams}:{params:Promise<{network:string;view:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {network,view}=await params,route=parseProductRoute(network,view);
 if(!route)notFound();
 return <ProductPage route={route} search={await searchParams}/>;
}
