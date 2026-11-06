// Step 3: resize with sharp. Originals stay in originals/ (gitignored).
//  - portfolio -> public/photos/portfolio  (1800 / 1200 / 600 wide JPEGs, safe to be public)
//  - client galleries -> processed/clients/<client>/  (PROOF-watermarked; uploaded to private R2 ONLY)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { JPG, makeProof } from './lib-image.mjs';

const manifest = JSON.parse(fs.readFileSync('cache/manifest.json', 'utf8'));
const JPG_OPTS = JPG;

// public photos: 480/800/1200/1800 wide, JPEG + WebP of each (the browser picks the best via <picture>)
const WIDTHS = [480, 800, 1200, 1800];
async function writeSizes(src, outDir, name, srcWidth) {
  for (const w of WIDTHS) {
    const r = () => sharp(src).rotate().resize({ width: Math.min(w, srcWidth) });
    await r().jpeg(JPG_OPTS).toFile(path.join(outDir, `${name}-${w}.jpg`));
    await r().webp({ quality: 76, effort: 5 }).toFile(path.join(outDir, `${name}-${w}.webp`));
  }
}
const portfolio = [];
const siteImages = {};
for (const [key, meta] of Object.entries(manifest)) {
  const [kind, group, file] = key.split('/');
  if (kind === 'site') {
    // page imagery (heroes/backdrops): public, 1800/1200/600 wide, recorded with real dimensions
    const name = path.basename(group, '.jpg');
    const src = path.join('originals', 'site', group);
    const outDir = 'public/photos/site';
    fs.mkdirSync(outDir, { recursive: true });
    const { width, height } = await sharp(src).rotate().metadata();
    await writeSizes(src, outDir, name, width);
    const w1800 = Math.min(1800, width);
    siteImages[name] = { width: w1800, height: Math.round((height / width) * w1800), alt: meta.alt, photographer: meta.photographer };
    continue;
  }
  const base = path.basename(file, '.jpg');
  if (kind === 'portfolio') {
    const src = path.join('originals', 'portfolio', file);
    const outDir = 'public/photos/portfolio';
    fs.mkdirSync(outDir, { recursive: true });
    const img = sharp(src).rotate();
    const { width, height } = await img.metadata();
    const w1800 = Math.min(1800, width);
    await writeSizes(src, outDir, base, width);
    const outH = Math.round((height / width) * w1800);
    portfolio.push({ id: base, category: group, width: w1800, height: outH, alt: meta.alt, photographer: meta.photographer });
  } else {
    const src = path.join('originals', kind, group, file);
    const outDir = path.join('processed', 'clients', group);
    fs.mkdirSync(outDir, { recursive: true });
    await makeProof(src, outDir, file);
  }
}
// order portfolio so categories interleave nicely on "All"
const order = ['weddings', 'portraits', 'landscapes'];
portfolio.sort((a, b) => a.id.split('-')[1] - b.id.split('-')[1] || order.indexOf(a.category) - order.indexOf(b.category));
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/portfolio.json', JSON.stringify(portfolio, null, 2));
fs.writeFileSync('src/data/site-images.json', JSON.stringify(siteImages, null, 2));

// credits.json: photographer, profile URL, photo URL per image (Unsplash attribution)
const credits = Object.entries(manifest).map(([key, m]) => ({
  image: key, photographer: m.photographer, photographerUrl: m.photographerUrl, photoUrl: m.photoUrl,
}));
fs.writeFileSync('src/data/credits.json', JSON.stringify(credits, null, 2));
console.log('portfolio:', portfolio.length, 'credits:', credits.length);
