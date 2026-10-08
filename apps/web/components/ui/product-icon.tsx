import type {SVGProps} from "react";

type IconName = "chevron" | "down" | "close" | "check" | "search" | "plus" | "external";
const paths: Record<IconName, string> = {
  chevron: "m6 9 6 6 6-6", down: "M12 4v16m-7-7 7 7 7-7", close: "m6 6 12 12M18 6 6 18",
  check: "m5 12 4 4L19 6", search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14", external: "M7 17 17 7M7 7h10v10",
};
export function ProductIcon({name,size=20,...props}:SVGProps<SVGSVGElement>&{name:IconName;size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}><path d={paths[name]}/></svg>;
}
