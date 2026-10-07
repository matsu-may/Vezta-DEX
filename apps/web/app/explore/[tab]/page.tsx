import {ProductEntry,type ProductSearch} from "../../../components/product-entry";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{tab:string}>;searchParams:Promise<ProductSearch>}) {
 const {tab}=await params;
 return <ProductEntry section="explore" segments={[tab]} searchParams={searchParams}/>;
}
