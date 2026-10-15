// Connection proof only. No database, file access, credentials or AI API calls.
export const DEMO_ID = 'nutrition-connection-demo-v1';
export const DEMO_MEAL = Object.freeze({
  id: DEMO_ID, revision: 1, test: true,
  foods: [{ id: 'demo-a', name: 'テスト食材A', quantity: 100, unit: 'g' },
    { id: 'demo-b', name: 'テスト食材B', quantity: 1, unit: 'piece' }],
});
const empty = { type: 'object', properties: {}, additionalProperties: false };
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const TOOLS = [
  { name: 'get_demo_meal', description: 'Read the single fictional connection-test meal. Never returns real food or user data.', inputSchema: empty, annotations: readOnly },
  { name: 'save_demo_draft', description: 'Save a draft for the fixed fictional meal. All nutrition must remain null. Does not affect the training app or daily totals.',
    inputSchema: { type: 'object', properties: {
      requestId: { type: 'string', const: DEMO_ID }, revision: { type: 'integer', const: 1 },
      nutrients: { type: 'null' },
    }, required: ['requestId', 'revision', 'nutrients'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_demo_draft', description: 'Check whether the fictional draft was saved. This is not a real nutrition record.', inputSchema: empty, annotations: readOnly },
];
function exactObject(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
const toolResult = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
export function createDemo() {
  let draft = null;
  let initialized = false;
  function callTool(name, args) {
    if (name === 'save_demo_draft') {
      if (!exactObject(args, ['requestId', 'revision', 'nutrients']) || args.requestId !== DEMO_ID || args.revision !== 1 || args.nutrients !== null) {
        return { isError: true, content: [{ type: 'text', text: 'Only the fixed demo request, revision 1 and nutrients:null are accepted. Nothing was saved.' }] };
      }
      draft ??= { test: true, requestId: DEMO_ID, revision: 1, status: 'awaiting_confirmation', nutrients: null };
      return toolResult({ saved: true, draft: structuredClone(draft) });
    }
    if (!exactObject(args, [])) return { isError: true, content: [{ type: 'text', text: 'No arguments are accepted.' }] };
    if (name === 'get_demo_meal') return toolResult(structuredClone(DEMO_MEAL));
    if (name === 'get_demo_draft') return toolResult({ test: true, draft: structuredClone(draft) });
    return { isError: true, content: [{ type: 'text', text: 'Unknown demo tool.' }] };
  }
  return {
    snapshot: () => ({ test: true, meal: structuredClone(DEMO_MEAL), draft: structuredClone(draft), storage: 'memory-only; lost when this process stops' }),
    handle(message) {
      const validId = typeof message?.id === 'string' || Number.isSafeInteger(message?.id);
      const error = (code, text) => ({ jsonrpc: '2.0', id: validId ? message.id : null, error: { code, message: text } });
      if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return error(-32600, 'Invalid JSON-RPC request');
      if (!Object.hasOwn(message, 'id')) return undefined; // Notifications have no response.
      if (!validId) return error(-32600, 'Invalid request id');
      let result;
      if (message.method === 'initialize') {
        const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
        initialized = true;
        result = { protocolVersion: versions.includes(message.params?.protocolVersion) ? message.params.protocolVersion : versions[0],
          capabilities: { tools: {} }, serverInfo: { name: 'nutrition-connection-demo', version: '0.1.0' },
          instructions: 'Fictional connection test only. Call get_demo_meal, save_demo_draft with its id and revision and nutrients:null, then get_demo_draft. Do not estimate nutrients or use real personal records.' };
      } else if (message.method === 'ping') result = {};
      else if (!initialized) return error(-32000, 'Initialize first');
      else if (message.method === 'tools/list') result = { tools: TOOLS };
      else if (message.method === 'tools/call') result = callTool(message.params?.name, message.params?.arguments ?? {});
      else return error(-32601, 'Method not found');
      return { jsonrpc: '2.0', id: message.id, result };
    },
  };
}
