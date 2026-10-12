import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { JevError } from './client.mjs';

const KEY_LINE = /^\s*(export\s+)?JEV_AI_API_KEY\s*=/;

// Replace the Jev key line in a dotenv file, keep every other line, owner-only permissions.
export function writeEnvKey(path, key) {
  if (!key || /\s/.test(key)) throw new Error('The key is empty or contains whitespace.');
  let lines = [];
  try { lines = readFileSync(path, 'utf8').split('\n'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (lines.at(-1) === '') lines.pop();
  const first = lines.findIndex((line) => KEY_LINE.test(line));
  const kept = lines.filter((line) => !KEY_LINE.test(line));
  kept.splice(first === -1 ? kept.length : first, 0, `JEV_AI_API_KEY=${key}`);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${kept.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, path);
}

export async function ask(question, input = process.stdin, output = process.stderr) {
  const prompt = createInterface({ input, output });
  try { return (await prompt.question(question)).trim(); } finally { prompt.close(); }
}

// Raw-mode read so the key is never echoed to the terminal or its scrollback.
export function readHidden(question, input = process.stdin, output = process.stderr) {
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error); else resolve(value.trim());
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0003') return finish(new JevError('LOGIN_CANCELLED', 'Sign-in was cancelled. Nothing was saved.'));
        value = character === '\u007f' || character === '\b' ? value.slice(0, -1) : value + character;
      }
    };
    output.write(question);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

export function openBrowser(url) {
  const [command, args] = { darwin: ['open', [url]], win32: ['cmd', ['/c', 'start', '', url]] }[process.platform] ?? ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}
