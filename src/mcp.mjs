import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { BASE_URL, DEFAULT_MODEL, describeConfig, loadConfig } from './config.mjs';

export const MCP_BINARY = fileURLToPath(new URL('../vendor/jev-mcp/0.3.1/darwin-arm64/jev-mcp', import.meta.url));
export const MCP_BINARY_SHA256 = '955384ed3d1d3c9f8131fb4f3deed6c87d0400113c610367af2b44a899dd8bbc';

export function mcpConfig(config = loadConfig()) {
  return { ...describeConfig(config), transport: 'freepik-company/jev-mcp stdio', upstreamVersion: '0.3.1', binary: MCP_BINARY };
}

export function mcpLaunch(config = loadConfig()) {
  if (!config.apiKey || /\s/.test(config.apiKey)) throw new Error('Set JEV_AI_API_KEY in the server environment or ~/workspace/.env.');
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This local MCP binary is for macOS ARM64. Install the matching upstream release on another platform.');
  let digest;
  try { digest = createHash('sha256').update(readFileSync(MCP_BINARY)).digest('hex'); }
  catch { throw new Error('Pinned Jev MCP binary is missing or unreadable.'); }
  if (digest !== MCP_BINARY_SHA256) throw new Error('Pinned Jev MCP binary checksum mismatch.');
  // Pass only the Jev AI credential. No inherited provider key or URL can change the destination.
  return {
    command: MCP_BINARY,
    args: [],
    env: { PATH: process.env.PATH ?? '', JEV_PROVIDER: 'typesafe', BASE_URL, JEV_MODEL: DEFAULT_MODEL, API_KEY: config.apiKey },
  };
}

// A small client for verification and the explicit paid demo; the server is the upstream binary.
export async function connectMcp(launch, { timeoutMs = 35000 } = {}) {
  const child = spawn(launch.command, launch.args ?? [], { env: launch.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let nextId = 0;
  let closed = false;
  const fail = () => {
    closed = true;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Jev MCP process ended or returned invalid protocol data.')); }
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
    if (message.error) p.reject(new Error('Jev MCP rejected the protocol request.'));
    else p.resolve(message.result);
  });
  child.stdin.on('error', fail);
  function request(method, params = {}) {
    if (closed) return Promise.reject(new Error('Jev MCP connection is closed.'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Jev MCP deadline exceeded. A decision outcome may be uncertain; check account usage before repeating a POST.'));
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
        if (result.isError) throw new Error(`Jev MCP tool ${name} failed. No automatic retry was made; check credentials, limits and account usage before a decision retry.`);
        if (result.structuredContent !== undefined) return result.structuredContent;
        const content = result.content?.find(item => item.type === 'text');
        if (!content) throw new Error('Jev MCP tool did not return structured output.');
        return JSON.parse(content.text);
      },
      close,
    };
  } catch (error) { close(); throw error; }
}
