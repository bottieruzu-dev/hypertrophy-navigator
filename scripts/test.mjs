import { rolldown } from 'rolldown';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
await mkdir('node_modules/.tmp',{recursive:true});
for (const name of ['planner','nutrition','cloudPolicy']) {
  const bundle=await rolldown({input:`tests/${name}.test.ts`,platform:'node',external:['node:test','node:assert/strict']});
  const file=`node_modules/.tmp/${name}.test.mjs`;
  await bundle.write({file,format:'esm'});
  await bundle.close();
  const result=spawnSync(process.execPath,[file],{stdio:'inherit'});
  if(result.status!==0) { process.exitCode=result.status??1; break; }
}
