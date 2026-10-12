// Install the pinned jev-mcp binary for this platform after checking the archive and binary SHA-256.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MCP_BINARY, MCP_PIN, MCP_PLATFORM, MCP_SOURCE } from '../src/mcp.mjs';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
if (!MCP_PIN) {
  console.error(`No pinned jev-mcp binary for ${MCP_PLATFORM}. Pinned: ${Object.keys(MCP_SOURCE.platforms).join(', ')}.`);
  process.exit(1);
}
let installed = '';
try { installed = sha256(readFileSync(MCP_BINARY)); } catch {}
if (installed === MCP_PIN.binarySha256) {
  console.log(`jev-mcp ${MCP_SOURCE.release} for ${MCP_PLATFORM} is already installed.`);
} else {
  const response = await fetch(MCP_PIN.archiveURL);
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}.`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (sha256(archive) !== MCP_PIN.archiveSha256) throw new Error('Archive checksum mismatch. Nothing was installed.');
  const work = mkdtempSync(join(tmpdir(), 'jev-mcp-'));
  try {
    writeFileSync(join(work, 'archive.tar.gz'), archive);
    execFileSync('tar', ['-xzf', 'archive.tar.gz', 'jev-mcp'], { cwd: work });
    const binary = readFileSync(join(work, 'jev-mcp'));
    if (sha256(binary) !== MCP_PIN.binarySha256) throw new Error('Binary checksum mismatch. Nothing was installed.');
    mkdirSync(dirname(MCP_BINARY), { recursive: true });
    writeFileSync(MCP_BINARY, binary, { mode: 0o755 });
  } finally { rmSync(work, { recursive: true, force: true }); }
  console.log(`Installed jev-mcp ${MCP_SOURCE.release} for ${MCP_PLATFORM} at ${MCP_BINARY}.`);
}
