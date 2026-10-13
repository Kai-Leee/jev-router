import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Minimal stdio MCP client used by the benchmark smoke check.
export async function connectMcp(launch, { timeoutMs = 35000 } = {}) {
  const child = spawn(launch.command, launch.args ?? [], { env: launch.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let nextId = 0;
  let closed = false;
  const fail = () => {
    closed = true;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('MCP process ended or returned invalid protocol data.')); }
    pending.clear();
  };
  child.on('error', fail);
  child.on('exit', fail);
  // Do not forward arbitrary server diagnostics or transport causes into chat/logs.
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { fail(); child.kill(); return; }
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);
    clearTimeout(p.timer);
    if (message.error) p.reject(new Error('MCP rejected the protocol request.'));
    else p.resolve(message.result);
  });
  child.stdin.on('error', fail);
  function request(method, params = {}) {
    if (closed) return Promise.reject(new Error('MCP connection is closed.'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('MCP deadline exceeded. A decision outcome may be uncertain; check account usage before repeating a POST.'));
        child.kill();
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  const close = () => { lines.close(); child.kill(); fail(); };
  try {
    const info = await request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'jev-ai-project-check', version: '0.1.0' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    return {
      info,
      request,
      async tool(name, args = {}) {
        const result = await request('tools/call', { name, arguments: args });
        if (result.isError) throw new Error(`MCP tool ${name} failed. No automatic retry was made; check credentials, limits and account usage before a decision retry.`);
        if (result.structuredContent !== undefined) return result.structuredContent;
        const content = result.content?.find(item => item.type === 'text');
        if (!content) throw new Error('MCP tool did not return structured output.');
        return JSON.parse(content.text);
      },
      close,
    };
  } catch (error) { close(); throw error; }
}
