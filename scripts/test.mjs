import { rolldown } from 'rolldown';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
await mkdir('node_modules/.tmp',{recursive:true});
const bundle=await rolldown({input:'tests/planner.test.ts',platform:'node',external:['node:test','node:assert/strict']});
await bundle.write({file:'node_modules/.tmp/planner.test.mjs',format:'esm'});
await bundle.close();
const result=spawnSync(process.execPath,['node_modules/.tmp/planner.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
