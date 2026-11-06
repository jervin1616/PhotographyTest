// Browser tests for site behaviour (not security). Usage: node tests/functional.mjs <base-url>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // global install or local, whichever exists
const BASE = (process.argv[2] || 'http://localhost:4324').replace(/\/$/, '');
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '   (' + extra + ')'}`); c ? pass++ : fail++; };
const b = await chromium.launch();
const errors = [];
const page = async (vp = { width: 1440, height: 900 }, opts = {}) => {
  const ctx = await b.newContext({ viewport: vp, ...opts }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
  return p;
};

// ---- home
let p = await page();
await p.goto(BASE + '/'); await p.waitForTimeout(800);
ok('home: hero headline renders word-by-word and is readable', (await p.locator('h1').getAttribute('aria-label')) === 'Light, salt air, and the moments in between.');
ok('home: 4 hero slides, first active', (await p.locator('.hero-slide').count()) === 4 && await p.locator('.hero-slide').first().evaluate(e => e.classList.contains('is-active')));
await p.waitForTimeout(6600);
ok('home: slideshow advances on its own (~6s)', await p.locator('.hero-slide').nth(1).evaluate(e => e.classList.contains('is-active')));
await p.locator('.dots button').nth(3).click(); await p.waitForTimeout(300);
ok('home: slide dots jump to a slide', await p.locator('.hero-slide').nth(3).evaluate(e => e.classList.contains('is-active')));
await p.locator('[data-count]').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(2300);
const counts = await p.locator('[data-count]').allTextContents();
ok('home: counters animate to their targets', counts.join('|') === '140|10|1,200|100', counts.join('|'));
const card = p.locator('.bento .tile').nth(2); await card.scrollIntoViewIfNeeded(); await card.hover(); await p.waitForTimeout(700);
ok('home: hover caption fades in on a featured photo', await card.locator('.cap').evaluate(e => getComputedStyle(e).opacity) === '1');
await p.mouse.move(3, 3); await p.waitForTimeout(600);
ok('home: caption hidden again when not hovered', await card.locator('.cap').evaluate(e => getComputedStyle(e).opacity) === '0');
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
await p.evaluate(() => window.scrollTo(0, 1200)); await p.waitForTimeout(500);
ok('home: header switches to scrolled state', await p.locator('.site-header').evaluate(e => e.classList.contains('is-scrolled')));
ok('home: scroll progress bar advances', parseFloat(await p.locator('.progress').evaluate(e => getComputedStyle(e).getPropertyValue('--p'))) > 0.05);
ok('home: back-to-top appears after scrolling', await p.evaluate(() => window.scrollTo(0, 1500)).then(() => p.waitForTimeout(400)).then(() => p.locator('.to-top').evaluate(e => e.classList.contains('show'))));
await p.locator('.to-top').click(); await p.waitForTimeout(1200);
ok('home: back-to-top returns to the top', (await p.evaluate(() => window.scrollY)) < 20);
await p.locator('[data-next]').first().scrollIntoViewIfNeeded(); await p.locator('[data-next]').first().click(); await p.waitForTimeout(900);
ok('home: testimonial arrows scroll the carousel', (await p.locator('.carousel').evaluate(e => e.scrollLeft)) > 100);

// ---- portfolio: filter + lightbox
await p.goto(BASE + '/portfolio/'); await p.waitForTimeout(900);
ok('portfolio: shows all 18 photos', (await p.locator('.masonry > li:visible').count()) === 18);
await p.locator('[data-filter="weddings"]').click(); await p.waitForTimeout(400);
ok('portfolio: filter "Weddings" shows exactly 6', (await p.locator('.masonry > li:visible').count()) === 6);
ok('portfolio: active filter is marked pressed', (await p.locator('[data-filter="weddings"]').getAttribute('aria-pressed')) === 'true');
await p.locator('.masonry > li:visible a').first().click(); await p.waitForTimeout(500);
ok('lightbox: opens on click', await p.locator('.lb.open').count() === 1);
ok('lightbox: counter starts at 1 / 6 (only the filtered set)', (await p.locator('.lb-count').textContent()) === '1 / 6', await p.locator('.lb-count').textContent());
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
ok('lightbox: → moves to the next photo', (await p.locator('.lb-count').textContent()) === '2 / 6');
await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300);
ok('lightbox: ← wraps around to the last photo', (await p.locator('.lb-count').textContent()) === '6 / 6');
ok('lightbox: shows title and photographer credit with link', (await p.locator('.lb-title').textContent()).length > 3 && (await p.locator('.lb-meta a').count()) === 1);
ok('lightbox: loads a full-size image', (await p.locator('.lb img').evaluate(i => i.complete && i.naturalWidth >= 1200)));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok('lightbox: Esc closes it', await p.locator('.lb.open').count() === 0);
await p.locator('[data-filter="all"]').click(); await p.waitForTimeout(300);
ok('portfolio: "All" restores 18', (await p.locator('.masonry > li:visible').count()) === 18);

// ---- contact form
await p.goto(BASE + '/contact/?type=Portrait'); await p.waitForTimeout(700);
ok('contact: ?type=Portrait preselects that session type', (await p.locator('input[name="session"]:checked').getAttribute('value')) === 'Portrait');
await p.locator('#message').fill('hi'); await p.locator('button[type=submit]').click(); await p.waitForTimeout(300);
ok('contact: empty/short fields show validation errors', (await p.locator('.err:not([hidden])').count()) >= 2);
await p.fill('#name', 'Jamie Rivers'); await p.fill('#email', 'not-an-email'); await p.locator('button[type=submit]').click(); await p.waitForTimeout(300);
ok('contact: invalid email is rejected', (await p.locator('.err[data-for="email"]').isVisible()));
await p.fill('#email', 'jamie@example.com'); await p.fill('#message', 'We are planning a small beach wedding next October.');
await p.locator('button[type=submit]').click(); await p.waitForTimeout(900);
ok('contact: valid form shows the success state with first name', await p.locator('#sent').isVisible() && (await p.locator('#sent-name').textContent()).includes('Jamie'));
ok('contact: demo mode is honest that nothing was sent', (await p.locator('#sent-msg').textContent()).includes('nothing was actually sent'));
await p.locator('#again').click(); ok('contact: "Send another" returns to a blank form', await p.locator('#form-wrap').isVisible() && (await p.inputValue('#name')) === '');
// honeypot
await p.fill('#name', 'Bot Bot'); await p.fill('#email', 'b@b.co'); await p.fill('#message', 'buy my cheap pills now please');
await p.evaluate(() => { document.querySelector('[name=_gotcha]').value = 'x'; });
const reqs = []; p.on('request', r => { if (r.method() === 'POST') reqs.push(r.url()); });
await p.locator('button[type=submit]').click(); await p.waitForTimeout(600);
ok('contact: honeypot-filled submissions send nothing', reqs.length === 0);

// ---- contact page content
ok('contact: owner section present (Elena Marsh)', (await p.locator('#elena').textContent()).includes('Elena Marsh'));
ok('contact: owner seal ring text fits (no overlap glitch)', await p.locator('#elena textPath').getAttribute('textLength') === '497');

// ---- client login
await p.goto(BASE + '/client-login/'); await p.waitForTimeout(700);
await p.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
await p.locator('[data-copy]').first().click(); await p.waitForTimeout(300);
ok('client-login: Copy button confirms ("Copied")', (await p.locator('[data-copy]').first().textContent()) === 'Copied');
ok('client-login: lists two demo galleries with links', (await p.locator('a[href^="/clients/"]').count()) === 2);
ok('client-login: does NOT list the Peters gallery or password', !(await p.content()).match(/peters|velvet-juniper/i));
ok('client-login: FAQ opens/closes', await p.locator('.faq details').nth(1).evaluate(d => { d.querySelector('summary').click(); return d.open; }));

// ---- services + about
await p.goto(BASE + '/services/'); await p.waitForTimeout(500);
ok('services: 3 packages with enquiry links carrying ?type=', (await p.locator('a[href^="/contact/?type="]').count()) === 3);
ok('services: FAQ has 7 questions', (await p.locator('#faq details').count()) === 7);
await p.goto(BASE + '/about/'); await p.waitForTimeout(500);
ok('about: credits wall lists every public photo (25)', (await p.locator('.credit-card').count()) === 25, String(await p.locator('.credit-card').count()));
ok('about: Unsplash credit links go to unsplash.com', await p.locator('.credit-card').evaluateAll(a => a.every(x => x.href.startsWith('https://unsplash.com/'))));
ok('about: no client names leak into the credits list', !(await p.locator('#credits').innerHTML()).match(/smith|peters|coastal-portraits/i));

// ---- mobile
p = await page({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
await p.goto(BASE + '/'); await p.waitForTimeout(800);
ok('mobile: desktop nav hidden, burger visible', !(await p.locator('nav[aria-label=Main]').isVisible()) && await p.locator('.burger').isVisible());
await p.locator('.burger').click(); await p.waitForTimeout(600);
ok('mobile: menu opens (aria-expanded, links visible)', (await p.locator('.burger').getAttribute('aria-expanded')) === 'true' && await p.locator('.menu-panel a.m-link').first().isVisible());
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
ok('mobile: Esc closes the menu', (await p.locator('.burger').getAttribute('aria-expanded')) === 'false');
await p.locator('.burger').click(); await p.waitForTimeout(500); await p.locator('.menu-panel a.m-link', { hasText: 'Services' }).click(); await p.waitForURL('**/services/');
ok('mobile: menu link navigates and closes the menu', (await p.locator('.burger').getAttribute('aria-expanded')) === 'false');
for (const path of ['/', '/portfolio/', '/services/', '/about/', '/contact/', '/client-login/']) {
  await p.goto(BASE + path); await p.waitForTimeout(500);
  ok(`mobile: ${path} has no horizontal overflow`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
}
await p.goto(BASE + '/portfolio/'); await p.waitForTimeout(600);
await p.locator('.masonry a').first().tap(); await p.waitForTimeout(500);
ok('mobile: lightbox opens on tap', await p.locator('.lb.open').count() === 1);

// ---- lightbox shows every photo WHOLE (not cropped/zoomed) on desktop, laptop and phones, portrait and landscape
for (const [label, vp, mobile] of [['desktop 1440x900', { width: 1440, height: 900 }, false], ['laptop 1280x720', { width: 1280, height: 720 }, false], ['phone 390x844', { width: 390, height: 844 }, true], ['phone landscape 844x390', { width: 844, height: 390 }, true]]) {
  const q = await page(vp, { isMobile: mobile, hasTouch: mobile });
  await q.goto(BASE + '/portfolio/'); await q.waitForTimeout(800);
  await q.locator('.masonry a').first().click(); await q.waitForTimeout(400);
  const bad = [];
  for (let i = 0; i < 18; i++) {
    await q.waitForFunction(() => { const im = document.querySelector('.lb img'); return im && im.complete && im.naturalWidth > 0; });
    await q.waitForTimeout(350);
    const r = await q.evaluate(() => { const im = document.querySelector('.lb img'), b = im.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, bt: b.bottom, w: b.width, h: b.height, nw: im.naturalWidth, nh: im.naturalHeight, vw: innerWidth, vh: innerHeight, t2: document.querySelector('.lb-title').textContent }; });
    if (r.l < -1 || r.t < -1 || r.r > r.vw + 1 || r.bt > r.vh + 1 || Math.abs(r.w / r.h / (r.nw / r.nh) - 1) > 0.02) bad.push(r.t2);
    await q.keyboard.press('ArrowRight');
  }
  ok(`lightbox: all 18 photos shown whole on ${label}`, bad.length === 0, bad.slice(0, 3).join(', '));
}

// ---- every image on every page actually loads (catches broken srcset/WebP paths)
p = await page();
for (const path of ['/', '/portfolio/', '/services/', '/about/', '/contact/', '/client-login/']) {
  await p.goto(BASE + path); await p.waitForTimeout(700);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(80); }
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => { const all = [...document.images]; return { n: all.length, broken: all.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.currentSrc || i.src) }; });
  ok(`images: ${path} all ${r.n} images load`, r.broken.length === 0, r.broken.slice(0, 3).join(', '));
}
ok('webp is actually served to modern browsers', await p.goto(BASE + '/').then(() => p.waitForTimeout(800)).then(() => p.evaluate(() => [...document.images].some((i) => /\.webp/.test(i.currentSrc)))));
ok('no JavaScript errors or failed requests across all pages', errors.length === 0, [...new Set(errors)].join(' | '));
await b.close();
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
