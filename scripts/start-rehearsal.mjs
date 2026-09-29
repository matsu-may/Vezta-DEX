import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// This is the supported opt-in entrypoint. Do not copy its flags into a public server.
if(process.argv.length!==2)throw new Error("Rehearsal launcher accepts no arguments");
if(process.env.NODE_ENV==="production")throw new Error("Rehearsal cannot run in production");
const require=createRequire(new URL("../apps/web/package.json",import.meta.url));
const child=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"dev","-H","127.0.0.1","-p","3020"],{
 cwd:fileURLToPath(new URL("../apps/web",import.meta.url)),stdio:"inherit",env:{...process.env,NODE_ENV:"development",DEX_REHEARSAL_ENABLED:"1",DEX_REHEARSAL_BOUND_HOST:"127.0.0.1"},
});
child.on("error",()=>{process.stderr.write("Unable to start local rehearsal\n");process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
