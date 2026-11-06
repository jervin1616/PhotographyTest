# Saltmarsh Photo Co. (demo)

A fictional coastal photography studio, built to show **password-protected client galleries that are
really protected**. Live demo: <https://saltmarsh-photo-co.jervin5612.workers.dev>

> Demo site. Photos are from [Unsplash](https://unsplash.com). Demo client passwords are listed on the
> site's **Client Login** page on purpose. Real client passwords would never be published.

## Demo passwords

| Gallery | URL | Password |
|---|---|---|
| The Smith Wedding | `/clients/smith-wedding` | `driftwood-tide-42` |
| Coastal Portraits | `/clients/coastal-portraits` | `seaglass-dune-87` |

Each password opens only its own gallery.

## Architecture

```
Browser ──► Cloudflare Worker (worker/index.js)
              │
              ├─ /clients/*  → ALWAYS runs the Worker first (assets.run_worker_first)
              │                  ├─ checks the signed cookie for THAT client
              │                  ├─ no/bad cookie → login form or 401
              │                  └─ good cookie  → reads the page/image from PRIVATE R2
              │
              └─ everything else → static assets (dist/): Home, Portfolio, About, Contact, Client Login
```

- **Astro (static) + Tailwind** build the public site into `dist/`.
- **One Worker** with static assets. Cloudflare's docs recommend Workers over Pages for new projects.
- **One private R2 bucket** (`saltmarsh-clients`) holds the client gallery pages, watermarked proofs and
  password hashes. It has **no public URL and no custom domain**; the Worker is the only door.
- **GitHub → Cloudflare Workers Builds** redeploys the public site on every push to the production branch.

Why galleries are not in the public assets: files in `dist/` are public the moment they are uploaded.
`scripts/build.mjs` and `scripts/check-dist.mjs` fail the build if anything private ends up in `dist/`.

For a plain-English tour of the Worker, read **[WORKER-EXPLAINED.md](WORKER-EXPLAINED.md)**.

## Security design

- PBKDF2-SHA256, 100,000 iterations (the Workers maximum), random 16-byte salt per client. Only the salt and
  hash are stored. Plain passwords live in a gitignored local file (`demo-passwords.local.json`) and the
  build fails if one appears in anything it would deploy.
- Hash comparison is constant-time.
- A correct password sets a signed (HMAC-SHA256) cookie: `HttpOnly; Secure; SameSite=Lax`, `Path=/clients/<slug>`,
  7 days. The signature covers the client slug, so one client's cookie can never open another.
- The signing key (`SESSION_SECRET`) is a Cloudflare secret, never in the repo.
- Wrong password: one generic message, an 800 ms delay, and a per-IP limit (see known limitations).
- `noindex` meta tag, `X-Robots-Tag`, `robots.txt` disallow, `Cache-Control: private, no-store`, and a
  restrictive `Content-Security-Policy` on every protected response.
- Login POSTs are checked with `Sec-Fetch-Site` against cross-site forms.

## Testing the protection

```bash
bash tests/verify-protection.sh https://saltmarsh-photo-co.jervin5612.workers.dev
```

It prints PASS/FAIL per check: gallery page without cookie, direct image URL without cookie, wrong
password, Smith password on Portraits, correct password loads page + every image, Smith cookie on
Portraits (page, image, and re-labelled cookie), forged/expired cookies, path traversal, headers, robots,
logout, and more. Passwords default to the public demo ones; override with `SMITH_PW` / `PORTRAITS_PW`.

## Add a client gallery (step by step)

No new code is needed. Example: slug `jones-family`.

1. **Add the photos.** Put the originals in `originals/clients/jones-family/` (gitignored, never committed).
2. **Make proofs.** `npm run process:client -- jones-family` creates 1800 px watermarked ("PROOF") JPEGs plus
   600 px thumbnails in `processed/clients/jones-family/` (gitignored). Note the output file names.
3. **Create the data file** `src/content/clients/jones-family.json`:
   ```json
   {
     "title": "The Jones Family",
     "subtitle": "Spring session · proofs",
     "password": {},
     "images": [
       { "file": "img-0001.jpg", "size": "hero" },
       { "file": "img-0002.jpg", "size": "wide" },
       { "file": "img-0003.jpg", "size": "tall" }
     ]
   }
   ```
   Size names: `hero` (full width), `wide` (two thirds), `half`, `third`, `tall` (one third, two rows).
   Sizes that tile a row exactly: `hero` · `wide`+`tall` · `tall`×3 · `half`×2 · `third`×3.
4. **Set the password.** Add `"jones-family": "a-long-password"` to `demo-passwords.local.json`
   (gitignored), then `npm run set-passwords jones-family`. This writes only a salted hash into the data file.
5. **Build and upload just this client.** `npm run build -- --client jones-family`, then (once, on your own
   computer) `npx wrangler login`, then `node scripts/upload-r2.mjs --remote --client jones-family`.
   The gallery goes live immediately, because pages and images live in R2. Other clients' files are not
   needed and are not touched.
6. **Push** the new data file so the repo matches: `git add src/content/clients && git commit && git push`.
7. **Test.** `SMITH_PW=... bash tests/verify-protection.sh <url>`, or just open `/clients/jones-family`
   and log in. Send the client the link and password through different channels.

To change a password, repeat step 4 and 5. To log everyone out of everything, rotate the secret:
`npx wrangler secret put SESSION_SECRET`.

## Contact form (fake on purpose)

`src/pages/contact.astro` has the full UI (validation, honeypot) and posts to a **placeholder**
endpoint set in one constant at the top of the file:

```js
const FORM_ENDPOINT = 'https://formspree.io/f/REPLACE_WITH_YOUR_FORM_ID';
```

**To make it real:** create a free form at formspree.io and replace `REPLACE_WITH_YOUR_FORM_ID` with your ID.
Until then, nothing is sent anywhere, and the page says so.

## Photos and credits

- Photos were fetched once at build time with the Unsplash API (key in the gitignored `.env`, never in
  browser code). Search responses are cached in `cache/`, the download-tracking endpoint is called once per
  downloaded photo, and the run stops on a rate limit instead of retrying.
- `src/data/credits.json` has photographer, profile URL and photo URL for every image. Credits appear in
  the footer and on the About page.
- Unsplash's current guidelines could not be read from the build environment (the site was blocked), so
  these steps follow the API's documented behaviour and common practice. Check the guidelines before any
  real use. In particular, Unsplash has asked apps to hotlink images from their CDN; this demo self-hosts
  resized copies.
- Originals stay out of the repo. Client gallery proofs go only to R2.

## Local development

```bash
npm install
npm run build                  # public site -> dist/, private galleries -> private-out/
npm run upload:local           # load private-out/ into a local R2 simulation
cp .dev.vars.example .dev.vars # local-only session secret
npx wrangler dev --local       # http://localhost:8787
```

## Known limitations (honest list)

- **No downloads, favourites or proofing tools.** It is a viewer. Images open full size, watermarked.
- **One shared password per gallery.** Anyone who has it can view the gallery and share it. There is no
  per-person access or revocation except changing the password and rotating `SESSION_SECRET`.
- **Cookies last 7 days and cannot be revoked individually.**
- **The attempt limiter is not proven.** The per-IP limit uses Cloudflare's rate-limiting binding. It is
  approximate and counted per Cloudflare location by design. On the live deployment, tests from one IP (12
  sequential and 40 parallel wrong guesses) were **never** rate limited, although the same code limited after 5
  attempts locally. Treat the 800 ms delay and the PBKDF2 cost as the real brakes, and do not rely on the
  limiter. A strict limiter needs a Durable Object.
- **The delay slows one guess at a time, not parallel guesses.**
- **PBKDF2 at 100k iterations** is the Workers maximum, but below current OWASP guidance for PBKDF2-SHA256
  (600k). Use long, random passwords. The demo passwords are public on purpose.
- **Proofs are watermarked, not DRM.** Anyone who can view a proof can screenshot it.
- **Free-tier limits:** Workers Free allows 100,000 requests/day and about 10 ms CPU per request; R2 has a
  free monthly allowance. A busy gallery can exceed them.
- **Uploads are manual.** `npm run upload:remote` runs from a computer logged in to Cloudflare. Uploading
  does not delete old objects. If you remove an image from a gallery, delete its object in R2 as well.
- **Deploying from the build sandbox used for this project failed** at Wrangler's asset-upload step (401),
  so the public site deploys through Workers Builds from GitHub instead.
