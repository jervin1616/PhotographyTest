// Generates the two link-preview ("Open Graph") images in public/. Re-run after changing the branding.
//  og.jpg          : the whole site (hero photo + wordmark)
//  og-gallery.jpg  : private client gallery links. Deliberately NOT a client photo: preview images are public.
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

// 2) private gallery card: blurred, darkened backdrop + padlock. Reveals nothing about any client.
const blurred = await sharp(src).resize(W, H, { fit: 'cover' }).blur(14).modulate({ brightness: 0.55 }).toBuffer();
await sharp(blurred).composite([{ input: svg(`
  <rect width="${W}" height="${H}" fill="#0b1620" fill-opacity=".35"/>
  <g transform="translate(600 205)" fill="none" stroke="#ece4d6" stroke-width="9" stroke-linecap="round">
    <path d="M-42 -8 V-40 a42 42 0 0 1 84 0 V-8"/><rect x="-62" y="-8" width="124" height="96" rx="10" fill="#142231"/>
    <circle cx="0" cy="34" r="9" fill="#ece4d6" stroke="none"/><path d="M0 40 V62" stroke-width="8"/></g>
  <text x="600" y="395" text-anchor="middle" ${serif} font-size="70" fill="#ece4d6">Private Client Gallery</text>
  <text x="600" y="455" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#a9b4bb">Enter the password we sent you to view your photos</text>
  <text x="600" y="560" text-anchor="middle" ${serif} font-size="36" fill="#9fc9bd">Saltmarsh Photo Co.</text>`) }]).jpeg({ quality: 82, mozjpeg: true }).toFile('public/og-gallery.jpg');
console.log('wrote public/og.jpg and public/og-gallery.jpg');
