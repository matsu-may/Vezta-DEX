import {ProductEntry,type ProductSearch} from "../../components/product-entry";
export const dynamic="force-dynamic";
export default function Page({searchParams}:{searchParams:Promise<ProductSearch>}) {
 return <ProductEntry section="explore" searchParams={searchParams}/>;
}
