import { readFile } from 'node:fs/promises';
import { loadConfig, describeConfig, DEFAULT_MODEL } from '../src/config.mjs';
import { createJevClient, JevError } from '../src/client.mjs';

let config;
function print(value, stream = process.stdout) {
  let output = JSON.stringify(value, null, 2);
  if (config?.apiKey) {
    output = output.replaceAll(JSON.stringify(config.apiKey).slice(1, -1), '[REDACTED]').replaceAll(config.apiKey, '[REDACTED]');
  }
  stream.write(`${output}\n`);
}

try {
  const [command = 'config', ...flags] = process.argv.slice(2);
  if (!['config', 'models', 'demo'].includes(command) || flags.some((flag) => flag !== '--spend') || (command !== 'demo' && flags.length)) {
    throw new JevError('USAGE', 'Use: node bin/jev.mjs config | models | demo --spend');
  }
  config = loadConfig();
  if (command === 'config') {
    print(describeConfig(config));
  } else if (command === 'demo' && !flags.includes('--spend')) {
    throw new JevError('SPEND_FLAG_REQUIRED', 'This demo uses your balance. Run npm run demo -- --spend to perform a model lookup followed by one small decision POST.');
  } else {
    const client = createJevClient(config);
    const lookup = await client.listModels();
    if (command === 'models') {
      print(lookup);
    } else {
      if (!lookup.models.some(({ name }) => name === DEFAULT_MODEL)) {
        throw new JevError('MODEL_UNAVAILABLE', 'jev-latest was not listed for this account. No inference was requested.');
      }
      const input = JSON.parse(await readFile(new URL('../examples/decision.json', import.meta.url), 'utf8'));
      print({ connection: lookup.receipt, decision: await client.decide(input) });
    }
  }
} catch (error) {
  print({
    error: error instanceof JevError ? error.code : 'CONFIGURATION_ERROR',
    message: error instanceof JevError ? error.message : 'Could not load local configuration or the example file.',
    status: error.status ?? null,
    retryAfterMs: error.retryAfterMs ?? null,
    outcomeUncertain: error.outcomeUncertain ?? false,
    automaticRetries: 0,
  }, process.stderr);
  process.exitCode = 1;
}
