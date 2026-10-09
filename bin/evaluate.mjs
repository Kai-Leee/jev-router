import { readFile, writeFile } from 'node:fs/promises';

const HELP = `Usage:
  node bin/evaluate.mjs --manifest <json> --records <jsonl> [--output <json>]
  node bin/evaluate.mjs --help

Evaluate saved records offline. No API key or network request is required.
JSON output goes to stdout unless --output creates a new file.
An existing output path is never overwritten. Empty JSONL means no records.
`;

const ERRORS = {
  USAGE: [2, 'Use --help for the supported arguments.'],
  INPUT_READ_FAILED: [3, 'Could not read an input file.'],
  INPUT_ENCODING_INVALID: [3, 'Input files must contain valid UTF-8.'],
  MANIFEST_JSON_INVALID: [3, 'The manifest must contain valid JSON.'],
  RECORD_JSON_INVALID: [3, 'Every nonempty records line must contain valid JSON.'],
  INPUT_CONTRACT_INVALID: [3, 'The inputs do not satisfy the evaluation contract.'],
  OUTPUT_EXISTS: [4, 'The output path already exists; choose a new path.'],
  OUTPUT_WRITE_FAILED: [4, 'Could not write the evaluation report.'],
  INTERNAL_ERROR: [1, 'The evaluation could not be completed.'],
};

class CliError extends Error {
  constructor(code) {
    super(ERRORS[code][1]);
    this.code = code;
  }
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!['--manifest', '--records', '--output'].includes(flag)
      || typeof value !== 'string' || value.length === 0 || value.startsWith('--')
      || Object.hasOwn(options, flag.slice(2))) {
      throw new CliError('USAGE');
    }
    options[flag.slice(2)] = value;
  }
  if (!options.manifest || !options.records) throw new CliError('USAGE');
  return options;
}

async function readUtf8(path) {
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    throw new CliError('INPUT_READ_FAILED');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CliError('INPUT_ENCODING_INVALID');
  }
}

function parseJson(text, errorCode) {
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(errorCode);
  }
}

async function writeReport(text, output) {
  if (output) {
    try {
      await writeFile(output, text, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      throw new CliError(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_WRITE_FAILED');
    }
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      process.stdout.once('error', reject);
      process.stdout.write(text, (error) => error ? reject(error) : resolve());
    });
  } catch {
    throw new CliError('OUTPUT_WRITE_FAILED');
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    await writeReport(HELP);
  } else {
    const manifest = parseJson(await readUtf8(options.manifest), 'MANIFEST_JSON_INVALID');
    const records = (await readUtf8(options.records)).split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => parseJson(line, 'RECORD_JSON_INVALID'));
    const { evaluate } = await import('../src/evaluation/index.mjs');
    let report;
    try {
      report = evaluate({ manifest, records });
    } catch (error) {
      if (error.code === 'INVALID_EVALUATION') throw new CliError('INPUT_CONTRACT_INVALID');
      throw error;
    }
    await writeReport(`${JSON.stringify(report, null, 2)}\n`, options.output);
  }
} catch (error) {
  const code = error instanceof CliError ? error.code : 'INTERNAL_ERROR';
  const [exitCode, message] = ERRORS[code];
  process.stderr.write(`${JSON.stringify({ error: code, message })}\n`);
  process.exitCode = exitCode;
}
