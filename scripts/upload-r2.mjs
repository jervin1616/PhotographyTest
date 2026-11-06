// Upload private-out/ to the private R2 bucket. Usage: node scripts/upload-r2.mjs --local | --remote
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv.includes('--remote') ? '--remote' : '--local';
const BUCKET = 'saltmarsh-clients';
const types = { '.jpg': 'image/jpeg', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk('private-out');
console.log(`uploading ${files.length} objects (${mode}) to ${BUCKET}`);
for (const f of files) {
  const key = path.relative('private-out', f).replace(/\\/g, '/');
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', f, '--content-type', types[path.extname(f)], mode], { stdio: ['ignore', 'ignore', 'inherit'] });
  process.stdout.write('.');
}
console.log('\ndone');
