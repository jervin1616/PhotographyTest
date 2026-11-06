// Generates the two link-preview ("Open Graph") images in public/. Re-run after changing the branding.
//  og.jpg          : the whole site (hero photo + wordmark)
//  og-gallery-<event>.jpg : private client gallery links, one per event type in src/data/events.json. Deliberately NOT a client photo: preview images are public.
import sharp from 'sharp';

const W = 1200, H = 630;
const src = 'public/photos/portfolio/landscapes-01-1800.jpg';
const svg = (inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${inner}</svg>`);
const serif = `font-family="DejaVu Serif, Georgia, serif"`;

const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#0b1620" stop-opacity=".05"/><stop offset=".55" stop-color="#0b1620" stop-opacity=".55"/><stop offset="1" stop-color="#0b1620" stop-opacity=".95"/></linearGradient></defs>`;

// 1) site-wide card
const base = await sharp(src).resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer();
await sharp(base).composite([{ input: svg(`${grad}
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <text x="72" y="470" ${serif} font-size="78" fill="#ece4d6">Saltmarsh Photo Co.</text>
  <text x="76" y="530" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" letter-spacing="6" fill="#9fc9bd">COASTAL PHOTOGRAPHY</text>
  <text x="76" y="582" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#a9b4bb">Weddings · Portraits · Landscapes</text>`) }]).jpeg({ quality: 82, mozjpeg: true }).toFile('public/og.jpg');

// 2) private gallery cards, one per event type (src/data/events.json): blurred, darkened backdrop (a public
//    portfolio photo) + padlock + heading. Never a client photo, and never a per-client file name: preview
//    images are public, so a per-client file would reveal which clients exist.
import fs from 'node:fs';
const events = JSON.parse(fs.readFileSync('src/data/events.json', 'utf8'));
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const [key, ev] of Object.entries(events)) {
  const blurred = await sharp(`public/photos/portfolio/${ev.backdrop}-1800.jpg`).resize(W, H, { fit: 'cover' }).blur(14).modulate({ brightness: 0.55 }).toBuffer();
  await sharp(blurred).composite([{ input: svg(`
    <rect width="${W}" height="${H}" fill="#0b1620" fill-opacity=".35"/>
    <g transform="translate(600 150) scale(.8)" fill="none" stroke="#ece4d6" stroke-width="9" stroke-linecap="round">
      <path d="M-42 -8 V-40 a42 42 0 0 1 84 0 V-8"/><rect x="-62" y="-8" width="124" height="96" rx="10" fill="#142231"/>
      <circle cx="0" cy="34" r="9" fill="#ece4d6" stroke="none"/><path d="M0 40 V62" stroke-width="8"/></g>
    <text x="600" y="330" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" letter-spacing="7" fill="#9fc9bd">${esc(ev.eyebrow.toUpperCase())}</text>
    <text x="600" y="420" text-anchor="middle" ${serif} font-size="78" fill="#ece4d6">${esc(ev.heading)}</text>
    <text x="600" y="480" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#a9b4bb">Enter the password we sent you to view your photos</text>
    <text x="600" y="565" text-anchor="middle" ${serif} font-size="34" fill="#9fc9bd">Saltmarsh Photo Co.</text>`) }]).jpeg({ quality: 82, mozjpeg: true }).toFile(`public/og-gallery-${key}.jpg`);
}
console.log('wrote public/og.jpg and', Object.keys(events).map((k) => `og-gallery-${k}.jpg`).join(', '));
