import {notFound} from "next/navigation";
import {parsePrimaryProductRoute} from "../../../lib/product-routes";
import {ProductPage} from "./product-page";
export type ProductSearch = Record<string,string|string[]|undefined>;
export async function ProductEntry({section,segments=[],searchParams}:{section:string;segments?:string[];searchParams:Promise<ProductSearch>}) {
 const search=await searchParams,route=parsePrimaryProductRoute(section,search,segments);
 if(!route)notFound();
 return <ProductPage route={route} search={search}/>;
}
