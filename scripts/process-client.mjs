// Make watermarked proofs for ANY client gallery.
// Usage: npm run process:client -- <slug>
// Reads originals/clients/<slug>/*.{jpg,jpeg,png,tif,tiff,webp}, writes processed/clients/<slug>/NNN.jpg (+ -600 thumbs).
// Output names are the sanitised original names (a-z, 0-9, - and _), which is what you list in the client's data file.
import fs from 'node:fs';
import path from 'node:path';
import { makeProof } from './lib-image.mjs';

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]{1,64}$/.test(slug)) { console.error('Usage: npm run process:client -- <slug>   (slug: a-z, 0-9, -)'); process.exit(1); }
const inDir = path.join('originals', 'clients', slug);
if (!fs.existsSync(inDir)) { console.error(`No folder ${inDir}. Put the client's original photos there first.`); process.exit(1); }
const files = fs.readdirSync(inDir).filter((f) => /\.(jpe?g|png|tiff?|webp)$/i.test(f)).sort();
if (!files.length) { console.error('No images found in', inDir); process.exit(1); }
for (const f of files) {
  const safe = path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  await makeProof(path.join(inDir, f), path.join('processed', 'clients', slug), `${safe}.jpg`);
  console.log(`${f} -> ${safe}.jpg + ${safe}-600.jpg`);
}
console.log(`\n${files.length} proofs in processed/clients/${slug}/ . List them in src/content/clients/${slug}.json`);
