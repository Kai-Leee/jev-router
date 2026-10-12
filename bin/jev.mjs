import { readFile } from 'node:fs/promises';
import { loadConfig, describeConfig, DEFAULT_MODEL, KEY_PAGE_URL, TERMS_URL, PRIVACY_URL } from '../src/config.mjs';
import { createJevClient, JevError } from '../src/client.mjs';
import { ask, openBrowser, readHidden, writeEnvKey } from '../src/login.mjs';

const FLAGS = { config: [], models: [], demo: ['--spend'], login: ['--no-browser'], 'login-check': [] };
const SIGN_IN_HINT = `Jev AI is not signed in for jev-router: no JEV_AI_API_KEY in the environment or the key file. `
  + `Live Jev calls and the jev-ai MCP server fail until the user signs in. Show the sign-in now: `
  + `(1) open ${KEY_PAGE_URL} in the browser pane so the user can sign in to Jev AI and create a key; `
  + `(2) open a terminal tab in this project running \`npm run login -- --no-browser\`, where the user accepts `
  + `the Jev AI Terms of Use (${TERMS_URL}) and pastes the key with hidden input. If those tools are unavailable, `
  + `tell the user to run \`npm run login\` in their own terminal (for example iTerm). Never ask for the key in chat `
  + `and never type it yourself. After sign-in, the jev-ai MCP server needs a restart.`;

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
  if (!FLAGS[command] || flags.some((flag) => !FLAGS[command].includes(flag))) {
    throw new JevError('USAGE', 'Use: node bin/jev.mjs config | models | demo --spend | login [--no-browser] | login-check');
  }
  config = loadConfig();
  if (command === 'config') {
    print(describeConfig(config));
  } else if (command === 'login-check') {
    // Claude Code SessionStart hook: silent when a key exists, otherwise ask Claude to show the sign-in.
    if (!config.apiKey) print({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: SIGN_IN_HINT } });
  } else if (command === 'login') {
    if (!process.stdin.isTTY) throw new JevError('LOGIN_NEEDS_TERMINAL', 'Run npm run login in an interactive terminal. The key is never read from arguments or pipes.');
    process.stderr.write(`Jev AI Terms of Use: ${TERMS_URL}\nJev AI Privacy Policy: ${PRIVACY_URL}\n`);
    if (!/^y(es)?$/i.test(await ask('Do you accept the Jev AI Terms of Use and Privacy Policy? [y/N] '))) {
      throw new JevError('TERMS_NOT_ACCEPTED', 'The Jev AI terms were not accepted. Nothing was saved.');
    }
    process.stderr.write(`Sign in to Jev AI and create a key: ${KEY_PAGE_URL}\n`);
    if (!flags.includes('--no-browser')) openBrowser(KEY_PAGE_URL);
    const keySource = config.keySource;
    config = { ...config, apiKey: await readHidden('Paste your Jev API key (input hidden): ') };
    const lookup = await createJevClient(config).listModels(); // GET only; nothing is saved unless the key works
    writeEnvKey(config.envFile, config.apiKey);
    print({
      saved: config.envFile,
      keyVerified: true,
      modelsListed: lookup.models.length,
      shadowedByEnvironment: keySource === 'environment',
      next: 'Restart Claude Code or reconnect the jev-ai MCP server to load the key.',
    });
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
