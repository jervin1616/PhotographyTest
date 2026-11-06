// Step 1: run each search once and cache the raw response to cache/. Cached searches are never re-run.
import fs from 'node:fs';
import { loadEnv, api, RateLimited } from './lib-unsplash.mjs';

loadEnv();
const QUERIES = [
  'seaside wedding', 'beach wedding ceremony', 'beach portrait',
  'couple walking beach shore', 'coastal sand dunes', 'pier sunrise', 'salt marsh',
];
fs.mkdirSync('cache', { recursive: true });
try {
  for (const q of QUERIES) {
    const f = `cache/search-${q.replace(/\W+/g, '-')}.json`;
    if (fs.existsSync(f)) { console.log('cached:', q); continue; }
    console.log('searching:', q);
    const data = await api(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=30&content_filter=high`);
    fs.writeFileSync(f, JSON.stringify(data));
  }
} catch (e) {
  console.error(e instanceof RateLimited ? 'RATE LIMITED: ' + e.message : e.message);
  process.exit(1);
}
