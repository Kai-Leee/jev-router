import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connectMcp, MCP_BINARY, mcpConfig, mcpLaunch } from '../src/mcp.mjs';
import { prepareDecision } from '../src/client.mjs';

test('native launcher exposes the upstream tools and demo refuses spending without flag', async () => {
  const launcher = fileURLToPath(new URL('../bin/mcp-server.mjs', import.meta.url));
  const client = await connectMcp({ command: process.execPath, args: [launcher], env: { PATH: process.env.PATH, JEV_AI_API_KEY: 'offline-protocol-check' } });
  try { assert.equal((await client.request('tools/list')).tools.length, 5); }
  finally { client.close(); }
  const helper = fileURLToPath(new URL('../bin/mcp-check.mjs', import.meta.url));
  const attempt = spawnSync(process.execPath, [helper, 'demo'], { env: {}, encoding: 'utf8' });
  assert.equal(attempt.status, 1);
  assert.match(JSON.parse(attempt.stderr).error, /uses your balance/);
});

test('launch pins Jev AI and passes no inherited provider credentials', () => {
  const launch = mcpLaunch({ apiKey: 'fake-fixture-key' });
  assert.equal(launch.env.BASE_URL, 'https://jev-ai.pro/api');
  assert.equal(launch.env.JEV_MODEL, 'jev-latest');
  assert.equal(launch.env.JEV_PROVIDER, 'typesafe');
  assert.equal(launch.env.API_KEY, 'fake-fixture-key');
  assert.deepEqual(Object.keys(launch.env).sort(), ['API_KEY', 'BASE_URL', 'JEV_MODEL', 'JEV_PROVIDER', 'PATH']);
  assert.equal(JSON.stringify(mcpConfig({ apiKey: 'fake-fixture-key' })).includes('fake-fixture-key'), false);
});

test('actual pinned MCP binary discovers tools, sends GET and one POST, and never retries errors', async () => {
  const received = [];
  let status = 200;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
    res.writeHead(status, { 'Content-Type': 'application/json', 'Retry-After': '5' });
    if (status !== 200) res.end(JSON.stringify({ error: { message: 'fake-fixture-key' } }));
    else if (req.method === 'GET') res.end(JSON.stringify({ models: [{ name: 'jev-latest', description: 'Fixture' }] }));
    else res.end(JSON.stringify({ model: 'jev-fixture', answers: { needs_code: { type: 'noul', noul: 0.8 } }, usage: { input_tokens: 10, output_tokens: 0 } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let client;
  try {
    client = await connectMcp({ command: MCP_BINARY, env: { PATH: process.env.PATH, JEV_PROVIDER: 'typesafe', BASE_URL: `http://127.0.0.1:${server.address().port}`, API_KEY: 'fake-fixture-key', JEV_MODEL: 'jev-latest' } });
    assert.equal(client.info.serverInfo.version, '0.3.1');
    const tools = await client.request('tools/list');
    assert.deepEqual(tools.tools.map(x => x.name).sort(), ['classify', 'decide', 'list_models', 'rerank', 'verify']);
    assert.equal(received.length, 0);
    const models = await client.tool('list_models');
    assert.equal(models.models[0].id, 'jev-latest');
    assert.deepEqual(received.map(x => [x.method, x.url]), [['GET', '/v1/models']]);
    const input = prepareDecision({ state: 'A button is broken.', questions: { needs_code: { type: 'noul', instructions: 'Does this need a code fix?' } } }).body;
    const result = await client.tool('decide', input);
    assert.equal(result.answers.needs_code.noul, 0.8);
    assert.equal(result.usage.cost, undefined);
    assert.equal(received[1].url, '/v1/systemone');
    assert.equal(received[1].auth, 'Bearer fake-fixture-key');
    assert.deepEqual(received[1].body, input);
    for (const code of [429, 504]) {
      status = code;
      const before = received.length;
      await assert.rejects(client.tool('decide', input), error => !error.message.includes('fake-fixture-key') && /No automatic retry/.test(error.message));
      assert.equal(received.length, before + 1);
    }
    assert.throws(() => prepareDecision({ ...input, state: 'x'.repeat(256000) }), /256000/);
  } finally {
    client?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
