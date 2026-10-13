// Check every relative link and heading anchor in tracked Markdown files, plus links into the
// research branch (resolved against origin/research or research, so the branch must be fetched).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const RESEARCH = /^https:\/\/github\.com\/Kai-Leee\/pointsman\/(?:blob|tree)\/research\/([^#?]+)/;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const withoutCode = (text) => text.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');

// ponytail: approximates GitHub's heading slugger (punctuation removed, spaces to hyphens, -1/-2 for repeats).
function anchors(file) {
  const seen = new Map();
  const found = new Set();
  for (const line of withoutCode(readFileSync(file, 'utf8')).split('\n')) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1];
    if (heading === undefined) continue;
    const slug = heading.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '').replaceAll(' ', '-');
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    found.add(count ? `${slug}-${count}` : slug);
  }
  return found;
}

const researchRef = ['origin/research', 'research'].find((ref) => {
  try { git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`); return true; } catch { return false; }
});
const files = git('ls-files', '-z', '--', '*.md').split('\0').filter(Boolean);
const broken = [];
let checked = 0;
for (const file of files) {
  for (const [, target] of withoutCode(readFileSync(file, 'utf8')).matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
    const research = RESEARCH.exec(target);
    if (research) {
      checked++;
      if (!researchRef) broken.push(`${file}: ${target} (research branch not fetched)`);
      else {
        try { git('cat-file', '-e', `${researchRef}:${decodeURI(research[1])}`); } catch { broken.push(`${file}: ${target}`); }
      }
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    checked++;
    const [path, anchor] = target.split('#');
    const resolved = path ? normalize(join(dirname(file), decodeURI(path))) : file;
    if (relative('.', resolved).startsWith('..') || !existsSync(resolved)) { broken.push(`${file}: ${target}`); continue; }
    if (anchor && resolved.endsWith('.md') && statSync(resolved).isFile() && !anchors(resolved).has(decodeURIComponent(anchor))) {
      broken.push(`${file}: ${target} (no such heading)`);
    }
  }
}
for (const line of broken) console.error(`broken link ${line}`);
console.log(`Markdown files ${files.length}, links checked ${checked}, broken ${broken.length}.`);
process.exitCode = broken.length ? 1 : 0;
