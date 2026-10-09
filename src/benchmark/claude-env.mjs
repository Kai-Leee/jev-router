// Claude's macOS keychain lookup needs the user identity as well as HOME.
// Share this exact allowlist between preflight and both Claude process roles.
export function claudeEnvironment(env, { auth = 'cli', includeJev = false } = {}) {
  if (!['cli', 'api-key'].includes(auth)) throw new Error('INVALID_RUN_CONFIG');
  const names = ['PATH','HOME','TMPDIR','LANG','USER','LOGNAME',
    ...(auth === 'cli' ? ['CLAUDE_CODE_OAUTH_TOKEN'] : ['ANTHROPIC_API_KEY']),
    ...(includeJev ? ['JEV_AI_ENV_FILE','JEV_AI_API_KEY'] : [])];
  return Object.fromEntries(names.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
}
