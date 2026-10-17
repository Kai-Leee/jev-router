import {readFileSync, realpathSync, readdirSync, existsSync, statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const handles = new WeakMap();
const MACH_O = new Set(['cffaedfe', 'feedfacf', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']);
export const CLAUDE_NATIVE_BINARY = '/Users/lee/Library/Application Support/Claude/claude-code/2.1.299/4fa9694b7975/claude.app/Contents/MacOS/claude';
export const CLAUDE_NATIVE_SHA256 = '05f5000df42e8d85d468e345539d7bbadb8516c447b00cfb5e10dc61b7786ad2';
export const CLAUDE_NATIVE_VERSION = '2.1.299 (Claude Code)';
export const CLAUDE_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

async function versionOutput(command, env) {
  return new Promise((accept, reject) => {
    const child = spawn(command, ['--version'], {env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '', finished = false;
    const done = (error, value) => {if (finished) return; finished = true; clearTimeout(timer);
      error ? reject(Object.assign(new Error(error), {code: error, outcome_uncertain: false})) : accept(value);};
    const timer = setTimeout(() => {child.kill('SIGKILL'); done('CLAUDE_ENV_VERSION_UNAVAILABLE');}, 10000);
    child.stdout.on('data', bytes => {output += bytes; if (output.length > 4096) {child.kill('SIGKILL'); done('CLAUDE_ENV_VERSION_UNAVAILABLE');}});
    child.stderr.on('data', () => {});
    child.on('error', () => done('CLAUDE_ENV_VERSION_UNAVAILABLE'));
    child.on('close', code => done(code === 0 ? null : 'CLAUDE_ENV_VERSION_UNAVAILABLE', output.trim()));
  });
}

/** OAuth keychain identity requires the original HOME/USER/LOGNAME. Safe mode,
 * restricted mode and explicit empty sources disable customizations instead.
 * --bare is deliberately not used: this CLI documents it as API-key-only.
 * No credential file, keychain item or account response is read by this module. */
export async function createFrozenClaudeEnvironment({binary = CLAUDE_NATIVE_BINARY, expectedSha256 = CLAUDE_NATIVE_SHA256,
  expectedVersion = CLAUDE_NATIVE_VERSION, allowedProfiles, authEvidence, readVersion = versionOutput,
  sourceEnv = process.env, managedSettingsPaths = []} = {}) {
  if (typeof binary !== 'string' || resolve(binary) !== binary || !/^[a-f0-9]{64}$/.test(expectedSha256)
    || typeof expectedVersion !== 'string' || typeof readVersion !== 'function') fail('CLAUDE_ENV_BINARY_BINDING_REQUIRED');
  if (!Array.isArray(allowedProfiles) || !allowedProfiles.length || allowedProfiles.some(row => !row
    || Object.keys(row).sort().join(',') !== 'effort,model' || !/^claude-[A-Za-z0-9._-]+$/.test(row.model ?? '')
    || !CLAUDE_EFFORTS.includes(row.effort)) || new Set(allowedProfiles.map(row => `${row.model}:${row.effort}`)).size !== allowedProfiles.length)
    fail('CLAUDE_ENV_ALLOWED_PROFILES_INVALID');
  if (authEvidence?.loggedIn !== true || authEvidence.authMethod !== 'claude.ai') fail('CLAUDE_ENV_OAUTH_REQUIRED');
  const profiles = Object.freeze(allowedProfiles.map(row => Object.freeze({...row})));
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL']
    .filter(key => typeof sourceEnv[key] === 'string').map(key => [key, sourceEnv[key]]));
  if (!env.HOME || !env.USER || !env.LOGNAME) fail('CLAUDE_ENV_KEYCHAIN_IDENTITY_REQUIRED');
  // --safe-mode is also sent explicitly, and the environment does not inherit
  // API keys, OAuth token variables, provider overrides, Jev secrets or NODE_OPTIONS.
  env.CLAUDE_CODE_SAFE_MODE = '1';
  const policies = managedSettingsPaths.map(path => ({path: resolve(path), exists: existsSync(path),
    sha256: existsSync(path) ? sha(readFileSync(path)) : null}));
  let closed = false;
  const check = async ({cwd, model, effort} = {}) => {
    if (closed) fail('CLAUDE_ENV_CLOSED');
    if ((model !== undefined || effort !== undefined) && !profiles.some(row => row.model === model && row.effort === effort))
      fail('CLAUDE_ENV_PROFILE_NOT_ALLOWED');
    let bytes;
    try {if (realpathSync(binary) !== binary || !statSync(binary).isFile()) fail('CLAUDE_ENV_BINARY_PATH_CHANGED'); bytes = readFileSync(binary);}
    catch (error) {if (error.code?.startsWith('CLAUDE_ENV_')) throw error; fail('CLAUDE_ENV_BINARY_UNAVAILABLE');}
    if (!MACH_O.has(bytes.subarray(0, 4).toString('hex'))) fail('CLAUDE_ENV_NOT_NATIVE_BINARY');
    if (sha(bytes) !== expectedSha256) fail('CLAUDE_ENV_BINARY_CHANGED');
    const version = await readVersion(binary, {...env});
    if (version !== expectedVersion && `${version} (Claude Code)` !== expectedVersion && version !== `${expectedVersion} (Claude Code)`)
      fail('CLAUDE_ENV_VERSION_CHANGED');
    for (const policy of policies) if (existsSync(policy.path) !== policy.exists
      || policy.exists && sha(readFileSync(policy.path)) !== policy.sha256) fail('CLAUDE_ENV_MANAGED_POLICY_CHANGED');
    let workspace;
    if (cwd !== undefined) {
      if (typeof cwd !== 'string' || resolve(cwd) !== cwd) fail('CLAUDE_ENV_WORKSPACE_NOT_EMPTY');
      const canonical = realpathSync(cwd);
      // macOS exposes its temporary directory through this single OS alias.
      // Exact equality rejects additional symlinks anywhere below that root.
      const osAlias = process.platform === 'darwin' && cwd.startsWith('/var/folders/')
        && realpathSync('/var/folders') === '/private/var/folders' && canonical === `/private${cwd}`;
      if (canonical !== cwd && !osAlias || !statSync(canonical).isDirectory() || readdirSync(canonical).length !== 0)
        fail('CLAUDE_ENV_WORKSPACE_NOT_EMPTY');
      workspace = {requested_cwd: cwd, canonical_cwd: canonical, os_temporary_alias_used: osAlias};
    }
    return {verified: true, ...(workspace ? {workspace} : {})};
  };
  await check();
  const appBinary = {path: binary, sha256: expectedSha256, version: expectedVersion};
  const models = [...new Set(profiles.map(row => row.model))].map(model => ({model,
    supported_reasoning_efforts: profiles.filter(row => row.model === model).map(row => row.effort),
    availability_basis: 'controller-declared documented candidates; actual account execution is verified separately',
    actual_account_availability_verified: false}));
  const core = {version: 'frozen-claude-native-v1', provider: 'claude', binary: appBinary, app_binary: appBinary, models,
    allowed_profiles: profiles, model_calls: 0, credential_source: 'existing_cli_oauth_keychain',
    auth: {loggedIn: true, authMethod: 'claude.ai', logged_in: true, type: 'claude.ai',
      subscriptionType: authEvidence.subscriptionType ?? null, basis: 'controller supplied preflight attestation'},
    original_home_preserved_for_keychain: true, user_logname_preserved: true, environment_allowlist_only: true,
    safe_mode: true, restricted_mode: true, enabled_skills: 0, enabled_tools: 0, mcp_servers: 0,
    customizations_disabled: true, user_project_local_settings_disabled: true, session_persistence: false,
    automatic_fallback: false, bare_mode: false,
    bare_mode_reason: 'CLI2.1.299 --bare skips OAuth/keychain and requires an API key; safe-mode retains OAuth and disables customizations.',
    managed_policy_pins: policies, managed_settings_still_apply: true,
    managed_policy_contents_not_model_input: true,
    workspace_path_policy: {id: 'macos-var-folders-canonical-v1', require_empty_directory: true,
      canonical_absolute_paths: true, allowed_os_alias: {from: '/var/folders/', to: '/private/var/folders/'},
      os_alias_requires_darwin_and_exact_realpath: true, other_symlinks_allowed: false},
    isolation_basis: 'explicit native flags; initialization evidence checked before accepting output',
    module_direct_auth_or_home_writes: false, cli_home_side_effects: 'unverified'};
  const fingerprint = sha(JSON.stringify(core));
  const handle = {evidence: {...core, fingerprint}, async verify(options) {return {...await check(options), fingerprint};},
    close() {closed = true; return {closed: true, module_direct_auth_or_home_writes: false, cli_home_side_effects: 'unverified'};}};
  handles.set(handle, {command: binary, env}); return handle;
}

export function frozenClaudeProcessOptions(handle) {
  const item = handles.get(handle); if (!item) fail('CLAUDE_ENV_INVALID');
  return {command: item.command, env: {...item.env}};
}
