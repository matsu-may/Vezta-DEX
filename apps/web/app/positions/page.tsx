import {ProductEntry,type ProductSearch} from "../../features/workspace/components/product-entry";
export const dynamic="force-dynamic";
export default function Page({searchParams}:{searchParams:Promise<ProductSearch>}) {
 return <ProductEntry section="positions" searchParams={searchParams}/>;
}
