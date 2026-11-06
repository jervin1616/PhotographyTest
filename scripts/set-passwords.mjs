// Reads PLAIN demo passwords from the gitignored demo-passwords.local.json and writes ONLY a
// salted PBKDF2 hash into src/content/clients/<slug>.json. Usage: npm run set-passwords [slug ...]
import fs from 'node:fs';
import crypto from 'node:crypto';

const ITERATIONS = 100000; // Cloudflare Workers' WebCrypto maximum for PBKDF2
const plain = JSON.parse(fs.readFileSync('demo-passwords.local.json', 'utf8'));
const only = process.argv.slice(2);
for (const [slug, password] of Object.entries(plain)) {
  if (only.length && !only.includes(slug)) continue;
  const file = `src/content/clients/${slug}.json`;
  if (!fs.existsSync(file)) { console.warn('skip (no data file):', slug); continue; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const salt = crypto.randomBytes(16); // per-client random salt
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  data.password = { algo: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: salt.toString('hex'), hash: hash.toString('hex') };
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log('hashed password for', slug);
}
