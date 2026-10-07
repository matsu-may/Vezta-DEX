import {ProductEntry,type ProductSearch} from "../../../components/product-entry";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{poolId:string}>;searchParams:Promise<ProductSearch>}) {
 const {poolId}=await params;
 return <ProductEntry section="pools" segments={[poolId]} searchParams={searchParams}/>;
}
