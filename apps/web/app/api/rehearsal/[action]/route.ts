import { createRehearsalProxy } from "../../../../features/legacy/rehearsal/lib/rehearsal-gate";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{action:string}>}):Promise<Response>{return createRehearsalProxy()(request,(await context.params).action);}
