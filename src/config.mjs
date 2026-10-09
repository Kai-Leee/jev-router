import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const BASE_URL = 'https://jev-ai.pro/api';
export const DEFAULT_MODEL = 'jev-latest';
export const MODELS_URL = `${BASE_URL}/v1/models`;
export const CREDITS_URL = `${BASE_URL}/v1/credits`;
export const DECISION_URL = `${BASE_URL}/v1/systemone`;
export const DEFAULT_ENV_FILE = join(homedir(), 'workspace', '.env');

// Parse data, never source a shell script. Only import the Jev key from the file.
export function loadConfig({ env = process.env, envFile } = {}) {
  const path = resolve(envFile ?? env.JEV_AI_ENV_FILE ?? DEFAULT_ENV_FILE);
  let apiKey = env.JEV_AI_API_KEY?.trim() ?? '';
  let keySource = apiKey ? 'environment' : 'missing';
  if (!apiKey) {
    try {
      apiKey = parseEnv(readFileSync(path, 'utf8')).JEV_AI_API_KEY?.trim() ?? '';
      if (apiKey) keySource = 'env-file';
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Cannot read the Jev environment file. Check its path and permissions.');
    }
  }
  return { apiKey, keySource, envFile: path };
}

export function describeConfig(config) {
  return {
    baseURL: BASE_URL,
    modelsURL: MODELS_URL,
    decisionURL: DECISION_URL,
    defaultModel: DEFAULT_MODEL,
    transport: 'Node.js fetch (no SDK)',
    automaticRetries: 0,
    redirects: 'blocked',
    envFile: config.envFile,
    keyConfigured: Boolean(config.apiKey),
    keySource: config.keySource,
  };
}
