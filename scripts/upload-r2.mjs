// Upload private-out/ (or one client) to the private R2 bucket.
// Usage: node scripts/upload-r2.mjs --local | --remote [--client <slug>]
// Throttled (the Cloudflare API returns 429 if hammered). On 429 it waits and retries a few times,
// then stops with a clear message listing what is NOT uploaded yet. Safe to re-run: puts overwrite.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv.includes('--remote') ? '--remote' : '--local';
const only = process.argv.includes('--client') ? process.argv[process.argv.indexOf('--client') + 1] : null;
const BUCKET = 'saltmarsh-clients';
const types = { '.jpg': 'image/jpeg', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const files = walk(only ? `private-out/clients/${only}` : 'private-out');
const PAUSE_MS = mode === '--remote' ? 600 : 0, MAX_TRIES = 4, BACKOFF_MS = 20000;

console.log(`uploading ${files.length} objects (${mode}) to ${BUCKET}`);
let done = 0;
for (const [i, f] of files.entries()) {
  const key = path.relative('private-out', f).replace(/\\/g, '/');
  let ok = false;
  for (let attempt = 1; attempt <= MAX_TRIES && !ok; attempt++) {
    const r = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', f, '--content-type', types[path.extname(f)], mode], { encoding: 'utf8' });
    if (r.status === 0) { ok = true; break; }
    const msg = `${r.stdout || ''}${r.stderr || ''}`;
    if (/429|Too Many Requests|throttl/i.test(msg) && attempt < MAX_TRIES) {
      console.log(`\n  rate limited on ${key}; waiting ${BACKOFF_MS / 1000}s (try ${attempt}/${MAX_TRIES})`);
      await sleep(BACKOFF_MS);
    } else {
      console.error(`\nFAILED on ${key}:\n${msg.split('\n').filter((l) => /ERROR|error|429/.test(l)).slice(0, 3).join('\n')}`);
      console.error(`\nUploaded ${done} of ${files.length}. NOT uploaded:\n  ${files.slice(i).map((x) => path.relative('private-out', x)).join('\n  ')}\nWait a minute and re-run the same command.`);
      process.exit(1);
    }
  }
  done++; process.stdout.write('.');
  if (PAUSE_MS) await sleep(PAUSE_MS);
}
console.log(`\ndone: ${done} of ${files.length} objects uploaded`);
