// Saltmarsh Photo Co. — client gallery gatekeeper. See WORKER-EXPLAINED.md for a plain-English tour.
//
// Wrangler runs this Worker FIRST for /clients/* (assets.run_worker_first). Everything else is
// served straight from static assets without touching this code.
//
// Private files live ONLY in the R2 bucket (env.CLIENTS), under:
//   clients/<slug>/meta.json      { title, iterations, salt, hash }   (hash only, never the password)
//   clients/<slug>/page.html      the gallery page
//   clients/<slug>/img/<file>     watermarked proofs
// The only way to read them is through this Worker, after the cookie check.

const SLUG_RE = /^[a-z0-9-]{1,64}$/;
const IMG_RE = /^[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/;
const COOKIE_TTL = 60 * 60 * 24 * 7; // 7 days
const FAIL_DELAY_MS = 800;           // slows down password guessing
const enc = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/clients\/([^/]+)(\/.*)?$/);
    if (!m) {
      // "/clients" or "/clients/" itself (no listing exists) -> 404. Anything else is not ours.
      if (url.pathname === '/clients' || url.pathname === '/clients/') return text('Not found', 404);
      return env.ASSETS.fetch(request);
    }
    const slug = m[1];
    const rest = m[2] || '';
    if (!SLUG_RE.test(slug)) return text('Not found', 404);

    // ---- POST /clients/<slug>/logout
    if (request.method === 'POST' && rest === '/logout') {
      if (!sameOrigin(request, url)) return text('Forbidden', 403);
      return redirect(`/clients/${slug}`, [clearCookie(slug)]);
    }

    // ---- POST /clients/<slug>  (password form)
    if (request.method === 'POST' && (rest === '' || rest === '/')) {
      if (!sameOrigin(request, url)) return text('Forbidden', 403);
      return handleLogin(request, env, slug);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') return text('Method not allowed', 405);

    const authed = await hasValidCookie(request, env, slug);

    // ---- GET /clients/<slug>  (the gallery page, or the login form)
    if (rest === '' || rest === '/') {
      if (!authed) return loginPage(slug, '', 401);
      const page = await env.CLIENTS.get(`clients/${slug}/page.html`);
      if (!page) return text('Not found', 404);
      return secure(new Response(request.method === 'HEAD' ? null : page.body, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }));
    }

    // ---- GET /clients/<slug>/img/<file>
    const im = rest.match(/^\/img\/([^/]+)$/);
    if (im && IMG_RE.test(im[1])) {
      if (!authed) return text('Unauthorized', 401);
      const obj = await env.CLIENTS.get(`clients/${slug}/img/${im[1]}`);
      if (!obj) return text('Not found', 404);
      return secure(new Response(request.method === 'HEAD' ? null : obj.body, {
        headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg' },
      }));
    }

    return text('Not found', 404);
  },
};

// ------------------------------------------------------------------ login

async function handleLogin(request, env, slug) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  // 1) per-IP attempt limit BEFORE doing any expensive work
  const { success } = await env.LOGIN_LIMITER.limit({ key: `${slug}:${ip}` });
  if (!success) return loginPage(slug, 'Too many attempts. Please wait a minute and try again.', 429);

  let password = '';
  try {
    const len = Number(request.headers.get('content-length') || 0);
    if (len > 2048) return loginPage(slug, 'Incorrect password.', 401);
    password = String((await request.formData()).get('password') || '').slice(0, 200);
  } catch { /* fall through: empty password fails below */ }

  // 2) load stored hash; for unknown slugs use a dummy so timing looks the same
  const metaObj = await env.CLIENTS.get(`clients/${slug}/meta.json`);
  const meta = metaObj ? await metaObj.json() : null;
  const salt = meta ? hexToBytes(meta.salt) : new Uint8Array(16);
  const iterations = meta ? meta.iterations : 100000;
  const expected = meta ? hexToBytes(meta.hash) : new Uint8Array(32);

  const derived = await pbkdf2(password, salt, iterations);
  const ok = timingSafeEqual(derived, expected) && meta !== null;

  if (!ok) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return loginPage(slug, 'Incorrect password.', 401); // same message for every failure
  }
  return redirect(`/clients/${slug}`, [await makeCookie(env, slug)]);
}

// ------------------------------------------------------------------ crypto helpers

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function hmacKey(env, usage) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
  return crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// Cookie value = <expiry>.<signature>. The signature covers the SLUG, so a cookie minted for one
// client can never validate for another, even if it were somehow sent to the wrong path.
async function makeCookie(env, slug) {
  const exp = Math.floor(Date.now() / 1000) + COOKIE_TTL;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env, 'sign'), enc.encode(`v1|${slug}|${exp}`));
  return `cg_${slug}=${exp}.${b64u(sig)}; Path=/clients/${slug}; Max-Age=${COOKIE_TTL}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(slug) {
  return `cg_${slug}=; Path=/clients/${slug}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function hasValidCookie(request, env, slug) {
  const raw = request.headers.get('cookie') || '';
  const name = `cg_${slug}=`;
  const part = raw.split(/;\s*/).find((p) => p.startsWith(name));
  if (!part) return false;
  const [expStr, sig] = part.slice(name.length).split('.');
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  try {
    // crypto.subtle.verify compares the HMAC in constant time
    return await crypto.subtle.verify('HMAC', await hmacKey(env, 'verify'), unb64u(sig), enc.encode(`v1|${slug}|${exp}`));
  } catch { return false; }
}

// ------------------------------------------------------------------ responses

// Every response from this Worker for /clients/* goes through here.
function secure(res) {
  const h = new Headers(res.headers);
  h.set('Cache-Control', 'private, no-store');
  h.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(res.body, { status: res.status, headers: h });
}

function text(body, status) {
  return secure(new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
}

function redirect(to, cookies = []) {
  const h = new Headers({ Location: to });
  for (const c of cookies) h.append('Set-Cookie', c);
  return secure(new Response(null, { status: 303, headers: h }));
}

// CSRF guard for the two POST routes. NOTE: browsers send "Origin: null" on same-site form posts
// when Referrer-Policy is no-referrer, so we must not insist on Origin === our origin.
// Sec-Fetch-Site is set by the browser itself and cannot be forged by a web page.
function sameOrigin(request, url) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null' && origin !== url.origin) return false;
  return true;
}

function loginPage(slug, message, status) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Client gallery · Saltmarsh Photo Co.</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4ede1;color:#10263d;font:16px/1.5 Inter,system-ui,sans-serif}
main{width:min(92vw,26rem);padding:2rem;background:#fff9;border:1px solid #e8dcc8}
h1{font:400 1.9rem/1.1 "Iowan Old Style",Palatino,Georgia,serif;margin:0 0 .5rem}
p{margin:.25rem 0 1rem;color:#5e5144}label{display:block;font-size:.85rem;margin-bottom:.35rem}
input{width:100%;box-sizing:border-box;padding:.75rem 1rem;border:1px solid #8b7a6899;background:#fff;font:inherit}
button{margin-top:1rem;width:100%;padding:.8rem;background:#10263d;color:#f4ede1;border:0;font:inherit;cursor:pointer}
button:hover{background:#4f8a7b}.err{color:#8a1c1c;margin-top:.75rem}a{color:inherit}
</style></head><body><main>
<h1>Private gallery</h1><p>Enter the password we sent you to view this gallery.</p>
<form method="post" action="/clients/${esc(slug)}">
<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">View gallery</button>
${message ? `<p class="err" role="alert">${esc(message)}</p>` : ''}
</form><p style="margin-top:1.5rem;font-size:.85rem"><a href="/client-login/">How private galleries work</a></p>
</main></body></html>`;
  return secure(new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } }));
}
