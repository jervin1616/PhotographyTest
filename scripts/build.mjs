// Full build: public site -> dist/ (served as static assets), private galleries -> private-out/ (R2 only).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const only = process.argv.includes('--client') ? process.argv[process.argv.indexOf('--client') + 1] : null;
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
fs.rmSync('dist', { recursive: true, force: true });
fs.rmSync('private-dist', { recursive: true, force: true });
if (!only) fs.rmSync('private-out', { recursive: true, force: true });

run('npx astro build');
run('npx astro build', { PRIVATE_BUILD: '1' });

// ---- safety check #1: nothing private may be inside the public asset directory
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const leaked = walk('dist').filter((f) => /(^|\/)clients\//.test(f.replace(/\\/g, '/')) || /proof|processed/.test(f));
if (leaked.length) { console.error('LEAK: private files in dist/:', leaked); process.exit(1); }

// ---- stage private objects, laid out exactly like their R2 keys
const clientsDir = 'src/content/clients';
if (only && !fs.existsSync(path.join(clientsDir, `${only}.json`))) throw new Error(`No data file for client "${only}"`);
for (const f of fs.readdirSync(clientsDir).filter((f) => f.endsWith('.json') && (!only || f === `${only}.json`))) {
  const slug = f.replace('.json', '');
  const data = JSON.parse(fs.readFileSync(path.join(clientsDir, f), 'utf8'));
  const p = data.password;
  if (!p?.hash || !p?.salt) throw new Error(`${slug}: no password hash. Run: npm run set-passwords`);
  const out = path.join('private-out', 'clients', slug);
  fs.mkdirSync(path.join(out, 'img'), { recursive: true });
  fs.copyFileSync(path.join('private-dist', 'clients', slug, 'index.html'), path.join(out, 'page.html'));
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ title: data.title, iterations: p.iterations, salt: p.salt, hash: p.hash }));
  for (const img of data.images) {
    for (const name of [img.file, img.file.replace(/\.jpg$/i, '-600.jpg')]) {
      const src = path.join('processed', 'clients', slug, name);
      if (!fs.existsSync(src)) throw new Error(`${slug}: missing image ${src}`);
      fs.copyFileSync(src, path.join(out, 'img', name));
    }
  }
  console.log(`staged ${slug}: ${data.images.length} images`);
}
// ---- safety check #2: no plain-text password anywhere in what gets deployed
const plain = fs.existsSync('demo-passwords.local.json') ? JSON.parse(fs.readFileSync('demo-passwords.local.json', 'utf8')) : {};
if (!Object.keys(plain).length) console.warn('note: no demo-passwords.local.json, plain-password leak check skipped');
for (const root of ['private-out']) for (const file of walk(root)) {
  if (!/\.(json|html)$/.test(file)) continue;
  const body = fs.readFileSync(file, 'utf8');
  for (const pw of Object.values(plain)) if (body.includes(pw)) { console.error('PLAIN PASSWORD FOUND in', file); process.exit(1); }
}
console.log('build OK');
