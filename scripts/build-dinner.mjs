import { rolldown } from 'rolldown';
import { readFile, writeFile } from 'node:fs/promises';
const bundle = await rolldown({input:'tools/dinner/worker.ts', platform:'node', external:['node:fs/promises']});
await bundle.write({file:'tools/dinner/worker.mjs',format:'esm'});
await bundle.close();
const file='tools/dinner/worker.mjs';
await writeFile(file,(await readFile(file,'utf8')).replace(/\nexport \{\};?\s*$/,'\n'));
