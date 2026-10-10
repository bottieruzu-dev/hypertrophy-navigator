// Local verification only: do not load credentials or contact the cloud.
process.env.CODEX_SAFE_BUILD = '1';
const { build } = await import('vite');
await build({ configLoader: 'native' });
