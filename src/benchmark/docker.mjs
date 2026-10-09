import { spawn } from 'node:child_process';

export const CONTAINER_LABEL = 'org.jev-router.benchmark';
export function assertSandbox(info) {
  if (!info || info.Config?.Labels?.[CONTAINER_LABEL] !== 'true' ||
      info.Config?.Labels?.[`${CONTAINER_LABEL}.role`] !== 'agent' ||
      info.HostConfig?.NetworkMode !== 'none' || info.HostConfig?.Privileged ||
      info.HostConfig?.PidMode === 'host' || info.HostConfig?.IpcMode === 'host' ||
      (info.Mounts?.length ?? 0) !== 0 || (info.HostConfig?.Devices?.length ?? 0) !== 0 ||
      (info.HostConfig?.CapAdd?.length ?? 0) !== 0 ||
      (info.HostConfig?.SecurityOpt ?? []).some(value => /unconfined/.test(value)) ||
      !(info.HostConfig?.Memory > 0) || !(info.HostConfig?.NanoCpus > 0) ||
      info.Config?.WorkingDir !== '/app' || !info.State?.Running) {
    throw new Error('UNSAFE_SANDBOX');
  }
  return info.Id;
}

export function processResult(command, args, { timeoutMs = 15000, maxBytes = 2_000_000, input, env, cwd, killProcessTree = false, onStdout, abortSignal } = {}) {
  return new Promise((resolve, reject) => {
    if(abortSignal?.aborted){reject(new Error('PROCESS_ABORTED'));return;}
    const child = spawn(command, args, { env, cwd, detached: killProcessTree, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [[], []]; let size = 0; let interrupted = null;
    const kill = (signal = 'SIGKILL') => { try { if (killProcessTree && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch {} };
    const timer = setTimeout(() => { interrupted = 'TIMEOUT'; kill(); }, timeoutMs);
    const abort=()=>{interrupted??='CANCELLED';kill();};
    abortSignal?.addEventListener('abort',abort,{once:true});
    const cleanup=()=>{clearTimeout(timer);abortSignal?.removeEventListener('abort',abort);};
    const stop = () => { interrupted ??= 'OUTPUT_LIMIT'; kill(); };
    child.stdout.on('data', data => {
      size += data.length;
      if (size > maxBytes) stop();
      else {
        chunks[0].push(data);
        try { onStdout?.(data); } catch { interrupted ??= 'OUTPUT_WRITE_FAILED'; kill(); }
      }
    });
    child.stderr.on('data', data => { size += data.length; if (size > maxBytes) stop(); else chunks[1].push(data); });
    child.on('error', () => { cleanup(); reject(new Error('PROCESS_START_FAILED')); });
    child.on('close', async (code, signal) => {
      cleanup();
      // Give idle MCP descendants a bounded chance to close journals/locks.
      // Timeouts and uncertain interruptions still kill immediately.
      if (killProcessTree && !interrupted) {
        kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 250));
        kill();
      } else if (killProcessTree) kill();
      resolve({ exit_code: code, signal, stdout: Buffer.concat(chunks[0]).toString('utf8'),
        stderr: Buffer.concat(chunks[1]).toString('utf8'), outcome_uncertain: Boolean(interrupted || signal), interrupted });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

export async function inspectSandbox(container) {
  if (!/^jev-[a-z0-9][a-z0-9_.-]{0,90}$/.test(container)) throw new Error('INVALID_CONTAINER');
  const result = await processResult('docker', ['container', 'inspect', container]);
  if (result.exit_code !== 0 || result.outcome_uncertain) throw new Error('SANDBOX_UNAVAILABLE');
  let info;
  try { info = JSON.parse(result.stdout)[0]; } catch { throw new Error('INVALID_SANDBOX_RESPONSE'); }
  assertSandbox(info);
  return info;
}

export async function executeSandbox(container, command, { timeoutMs = 120000 } = {}) {
  if (typeof command !== 'string' || !command.trim() || Buffer.byteLength(command) > 16384) throw new Error('INVALID_COMMAND');
  const info = await inspectSandbox(container);
  const started = performance.now();
  const result = await processResult('docker', ['exec', '--workdir', '/app', info.Id, '/bin/bash', '-lc', command], { timeoutMs });
  if (result.outcome_uncertain) {
    // Killing docker exec alone does not stop the process inside the container. Quarantine our exact container ID.
    await processResult('docker', ['stop', '--time', '1', info.Id]).catch(() => {});
    throw new Error('EXECUTION_UNCERTAIN');
  }
  return { ...result, duration_ms: Math.round(performance.now() - started),
    stdout: result.stdout.slice(0, 24000), stderr: result.stderr.slice(0, 6000),
    stdout_truncated: result.stdout.length > 24000, stderr_truncated: result.stderr.length > 6000 };
}
