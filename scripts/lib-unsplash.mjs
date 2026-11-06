// Build-time only helper. The key is read from .env and never leaves this machine.
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv() {
  const p = path.resolve('.env');
  if (!fs.existsSync(p)) throw new Error('.env missing');
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  if (!process.env.UNSPLASH_ACCESS_KEY) throw new Error('UNSPLASH_ACCESS_KEY empty');
}

export class RateLimited extends Error {}

// One request, no retries. Stops the whole run on 403/429.
export async function api(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' },
  });
  const remaining = res.headers.get('x-ratelimit-remaining');
  const limit = res.headers.get('x-ratelimit-limit');
  console.log(`  [${res.status}] rate-limit remaining ${remaining}/${limit}`);
  if (res.status === 403 || res.status === 429) {
    throw new RateLimited(
      'Unsplash rate limit hit (demo apps get ~50 requests/hour). Stop and wait up to 1 hour; everything cached is kept.'
    );
  }
  if (!res.ok) throw new Error(`Unsplash ${res.status} for ${url.split('?')[0]}`);
  return res.json();
}
