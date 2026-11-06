// Step 3: resize with sharp. Originals stay in originals/ (gitignored).
//  - portfolio -> public/photos/portfolio  (1800 / 1200 / 600 wide JPEGs, safe to be public)
//  - client galleries -> processed/clients/<client>/  (PROOF-watermarked; uploaded to private R2 ONLY)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const manifest = JSON.parse(fs.readFileSync('cache/manifest.json', 'utf8'));
const JPG = { quality: 80, mozjpeg: true };

function watermarkSvg(w, h) {
  const size = Math.round(w / 14);
  const stepX = Math.round(size * 4.2), stepY = Math.round(size * 3.2);
  let texts = '';
  for (let y = -stepY; y < h + stepY; y += stepY)
    for (let x = -stepX; x < w + stepX; x += stepX)
      texts += `<text x="${x + ((y / stepY) % 2 ? stepX / 2 : 0)}" y="${y}" transform="rotate(-28 ${x} ${y})">PROOF</text>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <style>text{font:700 ${size}px "DejaVu Sans",Arial,sans-serif;letter-spacing:${size / 8}px;fill:rgba(255,255,255,.34);stroke:rgba(0,0,0,.18);stroke-width:2}</style>
      ${texts}</svg>`
  );
}

const portfolio = [];
for (const [key, meta] of Object.entries(manifest)) {
  const [kind, group, file] = key.split('/');
  const base = path.basename(file, '.jpg');
  if (kind === 'portfolio') {
    const src = path.join('originals', 'portfolio', file);
    const outDir = 'public/photos/portfolio';
    fs.mkdirSync(outDir, { recursive: true });
    const img = sharp(src).rotate();
    const { width, height } = await img.metadata();
    const w1800 = Math.min(1800, width);
    for (const w of [1800, 1200, 600]) {
      await sharp(src).rotate().resize({ width: Math.min(w, width) }).jpeg(JPG).toFile(path.join(outDir, `${base}-${w}.jpg`));
    }
    const outH = Math.round((height / width) * w1800);
    portfolio.push({ id: base, category: group, width: w1800, height: outH, alt: meta.alt, photographer: meta.photographer });
  } else {
    const src = path.join('originals', kind, group, file);
    const outDir = path.join('processed', 'clients', group);
    fs.mkdirSync(outDir, { recursive: true });
    // full: 1800px wide max, watermarked
    const resized = await sharp(src).rotate().resize({ width: 1800, withoutEnlargement: true }).toBuffer();
    const m = await sharp(resized).metadata();
    await sharp(resized).composite([{ input: watermarkSvg(m.width, m.height) }]).jpeg(JPG).toFile(path.join(outDir, file));
    // thumb: 600px wide, watermarked too
    const t = await sharp(src).rotate().resize({ width: 600 }).toBuffer();
    const tm = await sharp(t).metadata();
    await sharp(t).composite([{ input: watermarkSvg(tm.width, tm.height) }]).jpeg(JPG).toFile(path.join(outDir, `${base}-600.jpg`));
  }
}
// order portfolio so categories interleave nicely on "All"
const order = ['weddings', 'portraits', 'landscapes'];
portfolio.sort((a, b) => a.id.split('-')[1] - b.id.split('-')[1] || order.indexOf(a.category) - order.indexOf(b.category));
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/portfolio.json', JSON.stringify(portfolio, null, 2));

// credits.json: photographer, profile URL, photo URL per image (Unsplash attribution)
const credits = Object.entries(manifest).map(([key, m]) => ({
  image: key, photographer: m.photographer, photographerUrl: m.photographerUrl, photoUrl: m.photoUrl,
}));
fs.writeFileSync('src/data/credits.json', JSON.stringify(credits, null, 2));
console.log('portfolio:', portfolio.length, 'credits:', credits.length);
