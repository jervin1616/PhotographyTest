import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

export const JPG = { quality: 80, mozjpeg: true };

// Tiled, diagonal "PROOF" text watermark, sized relative to the image.
export function watermarkSvg(w, h) {
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

// 1800px-wide watermarked proof + 600px watermarked thumbnail -> outDir
export async function makeProof(src, outDir, file) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(file, path.extname(file));
  const full = await sharp(src).rotate().resize({ width: 1800, withoutEnlargement: true }).toBuffer();
  const fm = await sharp(full).metadata();
  await sharp(full).composite([{ input: watermarkSvg(fm.width, fm.height) }]).jpeg(JPG).toFile(path.join(outDir, `${base}.jpg`));
  const thumb = await sharp(src).rotate().resize({ width: 600 }).toBuffer();
  const tm = await sharp(thumb).metadata();
  await sharp(thumb).composite([{ input: watermarkSvg(tm.width, tm.height) }]).jpeg(JPG).toFile(path.join(outDir, `${base}-600.jpg`));
}
