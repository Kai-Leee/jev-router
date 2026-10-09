import { spawn } from 'node:child_process';
import { mcpLaunch } from '../src/mcp.mjs';

try {
  const launch = mcpLaunch();
  const child = spawn(launch.command, launch.args, { env: launch.env, stdio: ['inherit', 'inherit', 'pipe'] });
  child.stderr.resume();
  child.on('error', () => { process.stderr.write('Jev MCP could not start. Check the local binary and server configuration.\n'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
} catch {
  process.stderr.write('Jev MCP configuration is unavailable. Run npm run mcp:config and configure the server-side key.\n');
  process.exitCode = 1;
}
