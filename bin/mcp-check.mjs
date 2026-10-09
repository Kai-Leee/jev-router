import { readFile } from 'node:fs/promises';
import { loadConfig, DEFAULT_MODEL } from '../src/config.mjs';
import { prepareDecision } from '../src/client.mjs';
import { connectMcp, mcpConfig, mcpLaunch } from '../src/mcp.mjs';

let client;
let config;
function print(value, stream = process.stdout) {
  let output = JSON.stringify(value, null, 2);
  if (config?.apiKey) output = output.replaceAll(JSON.stringify(config.apiKey).slice(1, -1), '[REDACTED]').replaceAll(config.apiKey, '[REDACTED]');
  stream.write(`${output}\n`);
}
try {
  const [command = 'config', ...flags] = process.argv.slice(2);
  if (!['config', 'tools', 'models', 'demo'].includes(command) || flags.some(flag => flag !== '--spend') || (command !== 'demo' && flags.length)) throw new Error('Use config, tools, models, or demo --spend.');
  if (command === 'demo' && !flags.includes('--spend')) throw new Error('This demo uses your balance. Run npm run mcp:demo -- --spend for one decision POST after model discovery.');
  config = loadConfig();
  if (command === 'config') print(mcpConfig(config));
  else {
    // Tool discovery is offline: a non-secret placeholder is used only if no key is configured.
    client = await connectMcp(mcpLaunch(command === 'tools' && !config.apiKey ? { ...config, apiKey: 'offline-protocol-check' } : config));
    if (command === 'tools') {
      const result = await client.request('tools/list');
      print({ server: client.info.serverInfo, tools: result.tools.map(({ name }) => name), inference: false, providerToolCalled: false });
    } else {
      const models = await client.tool('list_models');
      if (command === 'models') print({ destination: 'https://jev-ai.pro/api/v1/models', inference: false, ...models });
      else {
        if (!models.models.some(item => item.id === DEFAULT_MODEL || item.name === DEFAULT_MODEL)) throw new Error('jev-latest is not listed. No inference was requested.');
        const input = JSON.parse(await readFile(new URL('../examples/decision.json', import.meta.url), 'utf8'));
        const prepared = prepareDecision(input); // Reuse Jev AI request and size validation.
        const decision = await client.tool('decide', prepared.body);
        print({ destination: 'https://jev-ai.pro/api/v1/systemone', automaticRetries: 0, usdCost: decision.usage?.cost ?? null, decision });
      }
    }
  }
} catch (error) {
  print({ error: error.message, automaticRetries: 0, action: 'For a decision failure, check API usage/request outcome before another POST. Honor Retry-After when available.' }, process.stderr);
  process.exitCode = 1;
} finally { client?.close(); }
