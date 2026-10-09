export const ACTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['purpose', 'state', 'candidates'],
  properties: {
    purpose: { type: 'string', description: 'English decision purpose and criteria.' },
    state: { type: 'string', description: 'Current evidence and goal constraints. Do not invent observations.' },
    candidates: { type: 'array', minItems: 2, maxItems: 8, items: {
      type: 'object', additionalProperties: false, required: ['id', 'description', 'command'],
      properties: { id: { type: 'string' }, description: { type: 'string' }, command: { type: 'string' } }
    } },
    selected_id: { type: 'string', description: 'Baseline only: which candidate you choose.' }
  }
};

export function benchmarkTools(mode) {
  const schema = structuredClone(ACTION_SCHEMA);
  if (mode === 'jev') delete schema.properties.selected_id;
  else schema.required.push('selected_id');
  return [
    { name: 'act', description: mode === 'jev'
      ? 'Propose alternative shell actions for the current goal. Jev chooses one or abstains. Only its selected command runs inside the isolated /app container. All source writing, inspection and testing use this tool.'
      : 'Propose alternative shell actions, supply your selected_id, and run exactly that command in the isolated /app container. All source writing, inspection and testing use this tool.', inputSchema: schema },
    { name: 'finish', description: 'Submit completion evidence. Jev decides finish/continue/abstain in Jev mode. This is a completion claim, not evaluator success.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['purpose', 'state'], properties: { purpose: { type: 'string' }, state: { type: 'string' } } } },
    { name: 'status', description: 'Read remaining action/decision count without model inference.', inputSchema: { type: 'object', additionalProperties: false } }
  ];
}

export function createDispatcher(gate, mode, tools = benchmarkTools(mode)) {
  return async message => {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
    if (!Object.hasOwn(message, 'id')) return null;
    const reply = result => ({ jsonrpc: '2.0', id: message.id, result });
    if (message.method === 'initialize') return reply({ protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'jev-benchmark', version: '0.1.0' } });
    if (message.method === 'ping') return reply({});
    if (message.method === 'tools/list') return reply({ tools });
    if (message.method !== 'tools/call') return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
    const { name, arguments: args = {} } = message.params ?? {};
    if (!tools.some(tool=>tool.name===name)) return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Unknown tool' } };
    try {
      const value = await gate[name](args);
      return reply({ content: [{ type: 'text', text: JSON.stringify(value) }] });
    } catch (error) {
      const code = /^[A-Z_]{1,64}$/.test(error.code ?? '') ? error.code : 'BENCHMARK_STOPPED';
      return reply({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: code, status: gate.status(), automaticRetries: 0 }) }] });
    }
  };
}
