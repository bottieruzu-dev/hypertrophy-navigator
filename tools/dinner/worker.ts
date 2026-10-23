// Called by a local ChatGPT task; no API key, auth token, or direct network access.
import { readFile, writeFile } from 'node:fs/promises';
import { dinnerDate, dinnerPrompt, dinnerStartAllowed, parseDinnerProposal, type DinnerContext } from '../../src/engine/dinner';
const [command, input, output] = process.argv.slice(2);
if (!['prepare','validate'].includes(command) || !input || !output) throw new Error('Usage: worker.mjs prepare|validate INPUT.json OUTPUT.json');
const date = dinnerDate();
if (command === 'prepare') {
  if (!dinnerStartAllowed(new Date())) {
    await writeFile(output, JSON.stringify({ skip: 'outside-start-window' }));
  } else {
    const context = JSON.parse(await readFile(input,'utf8')) as DinnerContext & { skip?: string };
    if (context.skip) await writeFile(output,JSON.stringify({ skip: context.skip }));
    else {
      if (context.date !== date) throw new Error('Wrong day; never backfill');
      await writeFile(output,JSON.stringify({ date, sourceToken: context.token, prompt: dinnerPrompt(context) }));
    }
  }
} else {
  const proposal = parseDinnerProposal(JSON.parse(await readFile(input,'utf8')),date);
  await writeFile(output,JSON.stringify(proposal));
}
