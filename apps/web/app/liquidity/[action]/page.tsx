import {ProductEntry,type ProductSearch} from "../../../features/workspace/components/product-entry";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{action:string}>;searchParams:Promise<ProductSearch>}) {
 const {action}=await params;
 return <ProductEntry section="liquidity" segments={[action]} searchParams={searchParams}/>;
}
