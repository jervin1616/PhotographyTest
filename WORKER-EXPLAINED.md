# The Worker, explained for a Cloudflare beginner

File: `worker/index.js`. Config: `wrangler.jsonc`.

## The big picture in one paragraph

A **Worker** is a small program that runs on Cloudflare's servers close to your visitors. Normally,
Cloudflare hands out your static site's files without running any code. For `/clients/*` we say
"run my program first". That program is a **bouncer**: it checks a wristband (a cookie), and only then
fetches the photos from a **private storage room** (the R2 bucket) that nobody else can walk into.

## Part 0 — `wrangler.jsonc` (the settings that make the bouncer mandatory)

| Setting | Plain English | If you change it |
|---|---|---|
| `assets.directory: "./dist"` | The public website files. | **Never** point this at a folder containing gallery files. Everything in it is public. |
| `assets.run_worker_first: ["/clients/*"]` | "For any URL under /clients/, run the Worker before looking for a file." | **Remove or narrow it and the bouncer can be skipped.** The test script would catch it. |
| `r2_buckets` → `CLIENTS` | Gives the Worker a key to the private bucket under the name `env.CLIENTS`. | The bucket must stay private: no custom domain, r2.dev URL off. |
| `ratelimits` → `LOGIN_LIMITER` | A counter for "5 password tries per minute" (see limits in the README). | Removing it breaks the login code (it expects the counter to exist). |
| Secret `SESSION_SECRET` | A long random string, stored only in Cloudflare. Used to sign wristbands. Set with `npx wrangler secret put SESSION_SECRET`. | If it leaks, anyone can forge wristbands. Changing it logs every client out. |

## Part 1 — The front door: `fetch()` at the top

Every request to the Worker lands here. In order:

1. **Read the URL** and match `/clients/<name>/...`. `<name>` is the client's "slug".
2. **Reject odd slugs.** Only `a–z`, `0–9`, `-`, up to 64 characters are allowed. This stops tricks like
   `../` that try to reach other files in the bucket. *Loosening this regex can open path-traversal holes.*
3. **Route by what the visitor wants:**
   - `POST …/logout` → clear the wristband.
   - `POST …/<name>` → the password form was submitted → `handleLogin`.
   - `GET …/<name>` → they want the gallery page.
   - `GET …/<name>/img/<file>` → they want a photo.
   - anything else → 404.
4. Everything that is not under `/clients/` is passed to the normal static files (`env.ASSETS.fetch`).

## Part 2 — Checking the wristband: `hasValidCookie`

Before serving a page or a photo, the Worker looks for a cookie named `cg_<name>` (for example
`cg_smith-wedding`). The cookie looks like `1763000000.AbC…`: an **expiry time** and a **signature**.

The Worker recomputes what the signature *should* be, using the secret, and compares. A visitor cannot
forge it, because they do not know the secret. Important details:

- The signature covers the **client name** as well as the expiry, so a Smith wristband is useless for
  Portraits, even if someone copies it into a Portraits cookie. *If you remove the slug from the signed
  text, one client's cookie would open every gallery.*
- The cookie's `Path=/clients/<name>` means the browser only sends it to that gallery.
- The comparison uses `crypto.subtle.verify`, which takes the same time whether the guess is close or not.
  (That stops "timing attacks".)

## Part 3 — Gallery page and photos

If the wristband is valid, the Worker reads the object from the private bucket:

- page: `clients/<name>/page.html`
- photos: `clients/<name>/img/<file>`

If the wristband is missing or invalid: the **page** request gets a login form with status **401**, and a
**photo** request gets a bare **401**. The Worker never touches R2 before the check passes.
*The order "check cookie → then read R2" is the whole point. Do not reorder it.*

Photo file names must match a strict pattern (`001.jpg`, `001-600.jpg`). That is why asking for
`meta.json` (which holds the password hash) through the image route returns nothing.

## Part 4 — Logging in: `handleLogin`

When the password form is submitted:

1. **Attempt counter first.** It asks the rate limiter "has this visitor tried too often?". If yes: 429.
   (Its limits are described honestly in the README; it is a best-effort brake.)
2. **Read the typed password** (size-limited).
3. **Load the stored recipe** for that client from `meta.json`: a random *salt* and the *hash*. The password
   itself is **not stored anywhere**.
4. **Scramble the typed password** with the same recipe (PBKDF2, 100,000 rounds) and compare the result with
   the stored hash using a **constant-time** comparison.
5. If the client does not exist, it still does the scrambling with dummy values, so "no such gallery" and
   "wrong password" look and feel identical.
6. **Wrong:** wait 0.8 seconds, then show "Incorrect password." (same words for every failure).
7. **Right:** hand over the wristband and redirect to the gallery.

*If you replace the constant-time compare with `===`, or return different messages for different failures,
you leak hints to attackers.*

## Part 5 — The cookie flags (`makeCookie`)

- `HttpOnly` — page scripts cannot read it.
- `Secure` — only sent over HTTPS.
- `SameSite=Lax` — not sent on most cross-site requests.
- `Max-Age` — 7 days.

## Part 6 — The safety headers (`secure()`)

Every response from the Worker passes through one function that adds:

- `Cache-Control: private, no-store` — so Cloudflare, proxies and shared computers do not keep copies.
  *Without it, a gallery could be cached and served to someone without a password.*
- `X-Robots-Tag: noindex…` — please do not list this in search engines (plus the `<meta>` tag and
  `robots.txt`).
- `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer` — browser rules that
  limit what the page can load or leak.

## Part 7 — The forgery guard (`sameOrigin`)

Login and logout are `POST`s. The Worker refuses them if the browser says they came from another website
(`Sec-Fetch-Site: cross-site`). A subtle lesson from building this: because we send
`Referrer-Policy: no-referrer`, browsers send `Origin: null` on normal same-site form posts, so the guard
must **not** insist on a matching Origin header, or real clients could never log in.

## What would break the protection (cheat sheet)

| Change | Result |
|---|---|
| Put gallery files in `dist/` or `public/` | They become public downloads. |
| Remove `run_worker_first` for `/clients/*` | The Worker can be bypassed. |
| Make the R2 bucket public / add a custom domain / enable r2.dev | Photos can be fetched without a password. |
| Serve R2 before checking the cookie | Anyone gets the page/photos. |
| Take the slug out of the signed cookie text | One password opens every gallery. |
| Remove `Cache-Control: private, no-store` | Cached copies can leak. |
| Commit `SESSION_SECRET` or a plain password | Anyone can forge access. |

After **any** change to the Worker or its config, run:

```bash
bash tests/verify-protection.sh https://saltmarsh-photo-co.jervin5612.workers.dev
```
