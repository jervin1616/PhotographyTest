// Step 2: pick photos from the cached searches, download them (build-side only), and call
// Unsplash's download-tracking endpoint once per photo. Resume-safe: finished photos are skipped.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, api, RateLimited } from './lib-unsplash.mjs';

loadEnv();
const slug = (q) => `cache/search-${q.replace(/\W+/g, '-')}.json`;
const read = (q) => JSON.parse(fs.readFileSync(slug(q), 'utf8')).results;

// group -> [query, result indexes]. Indexes were hand-picked from the cached results.
const PLAN = {
  'portfolio/weddings': [['seaside wedding', [0, 1, 7, 12]]],
  'portfolio/portraits': [['beach portrait', [0, 4, 5, 9]]],
  'portfolio/landscapes': [['pier sunrise', [10, 20]], ['coastal sand dunes', [23]], ['salt marsh', [28]]],
  'clients/smith-wedding': [['seaside wedding', [2, 3, 5, 6, 11, 13, 14, 16, 19, 21, 18]]],
  'clients/coastal-portraits': [['couple walking beach shore', [3, 4, 6, 12, 14, 17, 18, 22, 25]], ['beach portrait', [1, 2]]],
};

const manifestPath = 'cache/manifest.json';
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const utm = '?utm_source=saltmarsh_photo_demo&utm_medium=referral';

try {
  for (const [group, sources] of Object.entries(PLAN)) {
    let n = 0;
    for (const [q, idxs] of sources) {
      const results = read(q);
      for (const i of idxs) {
        n++;
        const p = results[i];
        const name = group.startsWith('portfolio/')
          ? `${group.split('/')[1]}-${String(n).padStart(2, '0')}.jpg`
          : `${String(n).padStart(3, '0')}.jpg`;
        const out = path.join('originals', group.startsWith('portfolio/') ? 'portfolio' : group, name);
        const key = `${group}/${name}`;
        if (manifest[key]?.tracked && fs.existsSync(out)) { continue; }
        fs.mkdirSync(path.dirname(out), { recursive: true });
        console.log('photo', key, p.id);
        // 1) download the image from Unsplash's image CDN (not part of the API rate limit)
        if (!fs.existsSync(out)) {
          const r = await fetch(`${p.urls.raw}&w=2400&q=85&fm=jpg`);
          if (!r.ok) throw new Error(`image download ${r.status} for ${p.id}`);
          fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
        }
        // 2) tell Unsplash it was downloaded (required by their guidelines)
        await api(p.links.download_location);
        manifest[key] = {
          id: p.id,
          alt: p.alt_description || p.description || '',
          width: p.width, height: p.height, color: p.color, blur_hash: p.blur_hash,
          photographer: p.user.name,
          photographerUrl: p.user.links.html + utm,
          photoUrl: p.links.html + utm,
          tracked: true,
        };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
      }
    }
  }
  console.log('done:', Object.keys(manifest).length, 'photos');
} catch (e) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.error(e instanceof RateLimited ? 'RATE LIMITED: ' + e.message : 'ERROR: ' + e.message);
  process.exit(1);
}
