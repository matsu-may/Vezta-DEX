import {ProductEntry,type ProductSearch} from "../../../features/workspace/components/product-entry";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{position:string}>;searchParams:Promise<ProductSearch>}) {
 const {position}=await params;
 return <ProductEntry section="positions" segments={[position]} searchParams={searchParams}/>;
}
