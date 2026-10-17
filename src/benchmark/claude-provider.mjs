import {mkdirSync, openSync, writeSync, fsyncSync, closeSync, realpathSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {writePrivateJson} from './runner.mjs';
import {CLAUDE_EFFORTS, CLAUDE_NATIVE_SHA256, CLAUDE_NATIVE_VERSION, frozenClaudeProcessOptions} from './claude-environment.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const finite = value => Number.isFinite(value) && value >= 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, details = {}) => {throw Object.assign(new Error(code), {code, ...details});};
const safeCode = error => /^[A-Z][A-Z0-9_]+$/.test(error?.code) ? error.code : 'CLAUDE_ATTEMPT_FAILED';
export const CLAUDE_STRUCTURED_SYSTEM_PROMPT = 'You are a tool-free structured-response component in an isolated software construction benchmark. '
  + 'Use only the supplied inline specification, state, candidates and source text. Return JSON matching the supplied schema. '
  + 'Do not invoke tools, inspect files, run commands, load skills or customizations, access network or change permissions. '
  + 'The controller owns all file writes and checks. Never claim a check ran unless an actual supplied observation says so.';

// Exact native initialization metadata observed in the preserved D093 Opus
// probe. These rows are reported builtins, not evidence of their semantics or
// absence of CLI-internal activity. Arbitrary names, sources and paths fail.
export const CLAUDE_BUILTIN_PLUGIN_MANIFEST = Object.freeze({
  version: CLAUDE_NATIVE_VERSION, binary_sha256: CLAUDE_NATIVE_SHA256,
  plugins: Object.freeze(['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring']
    .map(name => Object.freeze({name, path: 'builtin', source: `${name}@builtin`})))});

export function claudeArguments({model, effort, role = 'decision', schema}) {
  if (!['decision', 'worker'].includes(role) || !/^claude-[A-Za-z0-9._-]+$/.test(model ?? '')
    || !CLAUDE_EFFORTS.includes(effort) || !object(schema)) fail('CLAUDE_PROFILE_INVALID');
  return ['--print', '--safe-mode', '--restricted', '--model', model, '--effort', effort,
    '--tools', '', '--disable-slash-commands', '--no-chrome', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--setting-sources', '', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose', '--json-schema', JSON.stringify(schema), '--system-prompt', CLAUDE_STRUCTURED_SYSTEM_PROMPT];
}

function normalizeUsage(raw) {
  if (!object(raw) || !['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens'].every(key => integer(raw[key])))
    return null;
  const creation = raw.cache_creation_input_tokens, read = raw.cache_read_input_tokens, ordinary = raw.input_tokens;
  const five = raw.cache_creation?.ephemeral_5m_input_tokens, hour = raw.cache_creation?.ephemeral_1h_input_tokens;
  const thinking = raw.output_tokens_details?.thinking_tokens;
  if (five !== undefined && !integer(five) || hour !== undefined && !integer(hour)
    || integer(five) && integer(hour) && five + hour !== creation
    || integer(five) && five > creation || integer(hour) && hour > creation
    || thinking !== undefined && (!integer(thinking) || thinking > raw.output_tokens)) return null;
  const totalInput = ordinary + read + creation;
  if (!Number.isSafeInteger(totalInput) || !Number.isSafeInteger(totalInput + raw.output_tokens)) return null;
  return {input_tokens: totalInput, uncached_input_tokens: ordinary, cached_input_tokens: read,
    cache_creation_tokens: creation, cache_creation_5m_tokens: integer(five) ? five : null,
    cache_creation_1h_tokens: integer(hour) ? hour : null, output_tokens: raw.output_tokens,
    total_tokens: totalInput + raw.output_tokens, reasoning_output_tokens: integer(thinking) ? thinking : null};
}

function terminalCode(result) {
  // result.result is arbitrary generated code on successful calls. Error
  // phrases inside that payload cannot establish provider/account failure.
  const errors = result?.errors;
  const reportedErrors = Array.isArray(errors) ? errors.length > 0 : errors !== null && errors !== undefined && errors !== '';
  const failedTerminal = result?.is_error === true || result?.subtype !== 'success' || reportedErrors;
  if (!failedTerminal) return null;
  const text = [result?.result, ...(Array.isArray(result?.errors) ? result.errors : [])].filter(value => typeof value === 'string').join('\n');
  if (/not logged in|please log in|authentication (?:failed|required)|invalid (?:api key|authentication)|oauth.*(?:expired|invalid)/i.test(text)) return 'CLAUDE_AUTH_REQUIRED';
  if (/usage limit|rate limit|weekly limit|hit your limit|quota|credit balance|insufficient credit|out of (?:usage|credits)/i.test(text)) return 'CLAUDE_ACCOUNT_LIMIT';
  if (/model.*(?:not (?:found|available)|unavailable|unsupported|access)|(?:unknown|invalid) model/i.test(text)) return 'CLAUDE_MODEL_UNAVAILABLE';
  return 'CLAUDE_PROVIDER_FAILED';
}

/** Read only the final aggregate usage, never sum assistant updates again. */
export function parseClaudeTrace(stdout) {
  let rows;
  try {rows = stdout.split('\n').filter(line => line.trim()).map(JSON.parse);} catch {fail('CLAUDE_STREAM_INVALID');}
  const finals = rows.filter(row => row.type === 'result');
  if (finals.length !== 1) fail('CLAUDE_RESULT_MISSING_OR_DUPLICATE');
  const completion = finals[0], initializations = rows.filter(row => row.type === 'system' && row.subtype === 'init');
  const used = rows.flatMap(row => row.type === 'assistant' && Array.isArray(row.message?.content)
    ? row.message.content.filter(item => item.type === 'tool_use').map(item => item.name) : []);
  const schemaCalls = used.filter(name => name === 'StructuredOutput');
  const tools = used.filter(name => name !== 'StructuredOutput');
  const serverTools = completion.usage?.server_tool_use;
  if (serverTools && Object.values(serverTools).some(value => typeof value === 'number' && value > 0)) tools.push('server_tool_use');
  const observed = [...new Set(rows.flatMap(row => [row.type === 'system' && row.subtype === 'init' ? row.model : null,
    row.type === 'assistant' ? row.message?.model : null,
    ...(row.type === 'result' && object(row.modelUsage) ? Object.keys(row.modelUsage) : [])]).filter(value => typeof value === 'string' && value))];
  const usage = normalizeUsage(completion.usage), code = terminalCode(completion);
  return {completion, initialization: initializations.length === 1 ? initializations[0] : null, initialization_count: initializations.length,
    completed_turns: Number.isSafeInteger(completion.num_turns) ? completion.num_turns : null,
    failed_events: code ? 1 : 0, terminal_code: code, tools_used: tools, structured_output_tool_calls: schemaCalls.length,
    observed_models: observed, usage, native_usage: completion.usage ?? null, native_model_usage: completion.modelUsage ?? null,
    usage_complete: usage !== null, cli_reported_cost_usd: finite(completion.total_cost_usd) ? completion.total_cost_usd : null,
    native_duration_api_ms: finite(completion.duration_api_ms) ? completion.duration_api_ms : null};
}

export function inspectClaudeInitialization(trace, {binarySha256, version} = {}) {
  const init = trace.initialization;
  if (trace.initialization_count !== 1 || !init || !Array.isArray(init.tools)
    || init.tools.some(tool => tool !== 'StructuredOutput') || !Array.isArray(init.mcp_servers) || init.mcp_servers.length
    || !Array.isArray(init.slash_commands) || init.slash_commands.length
    || init.skills !== undefined && (!Array.isArray(init.skills) || init.skills.length)
    || init.plugins !== undefined && !Array.isArray(init.plugins)) fail('CLAUDE_INITIALIZATION_NOT_ISOLATED', {outcome_uncertain: true});
  const plugins = init.plugins ?? [];
  const exactBuiltinManifest = plugins.length === CLAUDE_BUILTIN_PLUGIN_MANIFEST.plugins.length
    && plugins.every((row, index) => object(row) && Object.keys(row).sort().join(',') === 'name,path,source'
      && ['name', 'path', 'source'].every(key => row[key] === CLAUDE_BUILTIN_PLUGIN_MANIFEST.plugins[index][key]))
    && binarySha256 === CLAUDE_BUILTIN_PLUGIN_MANIFEST.binary_sha256
    && version === CLAUDE_BUILTIN_PLUGIN_MANIFEST.version && init.claude_code_version === '2.1.299';
  if (plugins.length && !exactBuiltinManifest) fail('CLAUDE_INITIALIZATION_NOT_ISOLATED', {outcome_uncertain: true});
  return {verified: true, tools: [...init.tools], mcp_servers: [], slash_commands: [],
    skills: init.skills ?? null, plugins: init.plugins ?? null,
    reported_builtin_plugins: exactBuiltinManifest ? plugins.map(row => ({...row})) : [],
    builtin_plugin_manifest: exactBuiltinManifest ? {version, binary_sha256: binarySha256} : null,
    builtin_plugin_semantics_verified: false, external_plugins_reported: 0,
    missing_optional_fields: ['skills', 'plugins'].filter(key => init[key] === undefined),
    synthetic_schema_tool_only: init.tools.includes('StructuredOutput')};
}

function write(fd, value) {const bytes = Buffer.from(value); let offset = 0;
  while (offset < bytes.length) {const n = writeSync(fd, bytes, offset, bytes.length - offset); if (n <= 0) fail('CLAUDE_RECORD_FAILED'); offset += n;}
  fsyncSync(fd);
}
// No implicit model-call timer. Cancellation, output overflow or persistence
// failures stop the process group and do not trigger a retry or fallback.
function execute(command, args, {cwd, input, onStdout, onStderr, signal, env, maxBytes = 16_000_000}) {
  return new Promise((accept, reject) => {
    if (signal?.aborted) {reject(Object.assign(new Error('CLAUDE_CANCELLED'), {code: 'CLAUDE_CANCELLED', process_submitted: false})); return;}
    const child = spawn(command, args, {cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe']});
    let stopped = null, bytes = 0; const stdout = [];
    const stop = code => {stopped ??= code; try {process.kill(-child.pid, 'SIGKILL');} catch {child.kill('SIGKILL');}};
    const abort = () => stop('CLAUDE_CANCELLED'); signal?.addEventListener('abort', abort, {once: true});
    child.stdout.on('data', chunk => {bytes += chunk.length; if (bytes > maxBytes) return stop('CLAUDE_OUTPUT_LIMIT');
      try {onStdout(chunk); stdout.push(chunk);} catch {stop('CLAUDE_RECORD_FAILED');}});
    child.stderr.on('data', chunk => {bytes += chunk.length; if (bytes > maxBytes) return stop('CLAUDE_OUTPUT_LIMIT');
      try {onStderr(chunk);} catch {stop('CLAUDE_RECORD_FAILED');}});
    child.stdin.on('error', () => {}); child.stdin.end(input);
    child.on('error', () => {signal?.removeEventListener('abort', abort); reject(Object.assign(new Error('CLAUDE_PROCESS_START_FAILED'),
      {code: 'CLAUDE_PROCESS_START_FAILED', process_submitted: false}));});
    child.on('close', (exit_code, exitSignal) => {signal?.removeEventListener('abort', abort);
      try {process.kill(-child.pid, 'SIGTERM');} catch {}
      accept({exit_code, stdout: Buffer.concat(stdout).toString('utf8'), interrupted: stopped,
        outcome_uncertain: Boolean(stopped || exitSignal)});});
  });
}

export async function runClaudeAttempt({out, cwd, prompt, schema, model, effort, role = 'decision', spend = false,
  validateAnswer, signal, cliEnvironment, beforeDispatch = () => {}, run = execute, referencePricing = true} = {}) {
  if (!spend) fail('EXPLICIT_SPEND_REQUIRED', {outcome_uncertain: false});
  if (![false, true, 'v1'].includes(referencePricing)) fail('CLAUDE_PRICING_MODE_INVALID', {outcome_uncertain: false});
  if (!cliEnvironment || typeof cliEnvironment.verify !== 'function' || typeof prompt !== 'string' || !prompt.trim()
    || typeof validateAnswer !== 'function') fail('CLAUDE_INPUT_INVALID', {outcome_uncertain: false});
  const pricing = referencePricing ? await import('./claude-pricing.mjs') : null;
  pricing?.assertClaudePricingSource();
  const work = realpathSync(cwd), directory = resolve(out), args = claudeArguments({model, effort, role, schema});
  const environment = frozenClaudeProcessOptions(cliEnvironment);
  mkdirSync(directory, {mode: 0o700});
  const save = (name, value) => writePrivateJson(join(directory, name), value);
  save('schema.json', schema); save('request.json', {provider: 'claude', role, prompt, model, effort, cwd: work, args,
    cli_environment: cliEnvironment.evidence.fingerprint, prompt_sha256: hash(prompt), schema_sha256: hash(JSON.stringify(schema)),
    system_prompt_sha256: hash(CLAUDE_STRUCTURED_SYSTEM_PROMPT), automatic_retries: 0,
    ...(pricing ? {reference_pricing_contract: pricing.claudePricingContract().source} : {})});
  let outFd, errFd, submitted = false, raw = null, trace = null, receipt = null;
  const began = performance.now();
  const priceFields = () => pricing ? {reference_pricing: pricing.claudeReferencePricing({requestedModel: model,
    usage: trace?.usage ?? null, nativeUsage: trace?.native_usage ?? null,
    usageComplete: trace?.usage_complete ?? false, observedModels: trace?.observed_models ?? []})} : {};
  const fields = () => ({provider: 'claude', role, requested_model: model, requested_effort: effort,
    cli_environment: cliEnvironment.evidence.fingerprint, wall_ms: performance.now() - began,
    completed_turns: trace?.completed_turns ?? null, failed_events: trace?.failed_events ?? null,
    tools_used: trace?.tools_used ?? [], structured_output_tool_calls: trace?.structured_output_tool_calls ?? null,
    usage: trace?.usage ?? null, usage_complete: trace?.usage_complete ?? false,
    native_usage: trace?.native_usage ?? null, native_model_usage: trace?.native_model_usage ?? null,
    observed_models: trace?.observed_models ?? [], model_identity_verified: trace?.observed_models.length === 1 ? trace.observed_models[0] === model : null,
    effective_effort_verified: null, native_duration_api_ms: trace?.native_duration_api_ms ?? null,
    cli_reported_cost_usd: trace?.cli_reported_cost_usd ?? null, ...priceFields(),
    actual_billed_usd: null, api_equivalent_usd: null, automatic_retries: 0, process_submitted: submitted});
  try {
    outFd = openSync(join(directory, 'stream.jsonl'), 'wx', 0o600); errFd = openSync(join(directory, 'stderr.log'), 'wx', 0o600);
    await beforeDispatch(); pricing?.assertClaudePricingSource();
    await cliEnvironment.verify({cwd: work, model, effort});
    save('dispatch.json', {provider: 'claude', role, requested_model: model, requested_effort: effort, at: new Date().toISOString()});
    submitted = true;
    raw = await run(environment.command, args, {cwd: work, input: prompt, signal, env: environment.env,
      onStdout: chunk => write(outFd, chunk), onStderr: chunk => write(errFd, chunk)});
    trace = parseClaudeTrace(raw.stdout);
    try {await cliEnvironment.verify({cwd: work, model, effort});}
    catch (error) {Object.assign(error, {outcome_uncertain: true}); throw error;}
    if (raw.outcome_uncertain) fail(raw.interrupted ?? 'CLAUDE_OUTCOME_UNCERTAIN', {outcome_uncertain: true});
    // Account/model denial is terminal; it must not become a code-repair retry.
    if (trace.terminal_code) fail(trace.terminal_code, {outcome_uncertain: false});
    if (raw.exit_code !== 0) fail('CLAUDE_PROCESS_FAILED', {outcome_uncertain: false});
    const isolation = inspectClaudeInitialization(trace, {binarySha256: cliEnvironment.evidence.app_binary.sha256,
      version: cliEnvironment.evidence.app_binary.version});
    if (trace.tools_used.length) fail('CLAUDE_TOOLS_USED', {outcome_uncertain: false});
    if (trace.observed_models.some(observed => observed !== model)) fail('CLAUDE_MODEL_MISMATCH', {outcome_uncertain: false});
    if (!trace.usage_complete) fail('CLAUDE_USAGE_MISSING', {outcome_uncertain: false});
    const answer = trace.completion.structured_output;
    if (!object(answer) || validateAnswer(answer) !== true) fail('CLAUDE_STRUCTURED_ANSWER_INVALID', {outcome_uncertain: false});
    save('answer.json', answer);
    receipt = {...fields(), status: 'completed', outcome_uncertain: false, initialization: isolation,
      answer_sha256: hash(JSON.stringify(answer))};
    save('receipt.json', receipt); return {answer, receipt};
  } catch (error) {
    if (error.process_submitted === false) submitted = false;
    const unknown = raw?.outcome_uncertain === true || error.outcome_uncertain === true || submitted && !trace;
    if (!receipt) {
      let details;
      try {details = fields();} catch (pricingError) {details = {provider: 'claude', role, requested_model: model, requested_effort: effort,
        wall_ms: performance.now() - began, process_submitted: submitted, usage: trace?.usage ?? null,
        usage_complete: trace?.usage_complete ?? false, pricing_error: safeCode(pricingError), actual_billed_usd: null};}
      save('receipt.json', {...details, status: unknown ? 'uncertain' : 'failed', code: safeCode(error), outcome_uncertain: Boolean(unknown)});
    } else Object.assign(error, {code: 'CLAUDE_RECEIPT_PERSISTENCE_FAILED', outcome_uncertain: true});
    Object.assign(error, {outcome_uncertain: Boolean(error.outcome_uncertain || unknown)}); throw error;
  } finally {if (outFd !== undefined) closeSync(outFd); if (errFd !== undefined) closeSync(errFd);}
}
