#!/usr/bin/env bash
# Proves the client galleries are really protected. Usage: tests/verify-protection.sh <base-url>
# Passwords default to the public demo ones; override with SMITH_PW / PORTRAITS_PW.
BASE="${1:-${BASE_URL:-http://localhost:8787}}"; BASE="${BASE%/}"
SMITH_PW="${SMITH_PW:-driftwood-tide-42}"
PORT_PW="${PORTRAITS_PW:-seaglass-dune-87}"
S=smith-wedding; P=coastal-portraits
pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1   ($2)"; fail=$((fail+1)); }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1" "$3"; fi; }

code()  { curl -s -o /dev/null -w '%{http_code}' "$@"; }
login() { # slug password -> prints full response headers+body
  curl -s -i -X POST --data-urlencode "password=$2" "$BASE/clients/$1"; }
cookie_of() { grep -i '^set-cookie:' | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: *//; s/;.*//' | tr -d '\r'; }

echo "Testing: $BASE"
echo "---------------------------------------------------------------"

# 1. gallery page without cookie is not served
r=$(curl -s -i "$BASE/clients/$S"); c=$(echo "$r" | grep -E '^HTTP/' | tail -1 | awk '{print $2}')
leak=$(echo "$r" | grep -c -E 'class="gallery"|/img/001')
check "1. Gallery page without cookie is NOT served (smith)" "$([ "$c" = 401 ] && [ "$leak" = 0 ] && echo 1)" "status=$c gallery-markup-lines=$leak"
r=$(curl -s -i "$BASE/clients/$P"); c=$(echo "$r" | grep -E '^HTTP/' | tail -1 | awk '{print $2}')
leak=$(echo "$r" | grep -c -E 'class="gallery"|/img/001')
check "1b. Gallery page without cookie is NOT served (portraits)" "$([ "$c" = 401 ] && [ "$leak" = 0 ] && echo 1)" "status=$c gallery-markup-lines=$leak"

# 2. direct image URL without cookie is blocked (full-size and thumbnail)
for f in 001.jpg 001-600.jpg; do
  c=$(code "$BASE/clients/$S/img/$f")
  check "2. Direct image /clients/$S/img/$f without cookie blocked" "$([ "$c" = 401 ] && echo 1)" "status=$c"
done

# 3. wrong password rejected
r=$(login $S "not-the-password"); c=$(echo "$r" | grep -E '^HTTP/' | tail -1 | awk '{print $2}')
sc=$(echo "$r" | grep -ic '^set-cookie:')
check "3. Wrong password rejected (401, no cookie set, generic message)" "$([ "$c" = 401 ] && [ "$sc" = 0 ] && echo "$r" | grep -q 'Incorrect password' && echo 1)" "status=$c set-cookie=$sc"

# 4. Smith password does not open Portraits
r=$(login $P "$SMITH_PW"); c=$(echo "$r" | grep -E '^HTTP/' | tail -1 | awk '{print $2}'); sc=$(echo "$r" | grep -ic '^set-cookie:')
check "4. Smith password on Portraits rejected" "$([ "$c" = 401 ] && [ "$sc" = 0 ] && echo 1)" "status=$c set-cookie=$sc"

# 5. correct password loads the gallery and its images
r=$(login $S "$SMITH_PW"); c=$(echo "$r" | grep -E '^HTTP/' | tail -1 | awk '{print $2}')
SC=$(echo "$r" | cookie_of)
check "5a. Correct Smith password accepted (303 + cookie)" "$([ "$c" = 303 ] && [ -n "$SC" ] && echo 1)" "status=$c"
flags=$(echo "$r" | grep -i '^set-cookie:' | head -1)
check "5b. Cookie is HttpOnly, Secure, SameSite=Lax, path-scoped to /clients/$S" "$(echo "$flags" | grep -qi 'HttpOnly' && echo "$flags" | grep -qi 'Secure' && echo "$flags" | grep -qi 'SameSite=Lax' && echo "$flags" | grep -qi "Path=/clients/$S" && echo 1)" "$flags"
page=$(curl -s -i -H "Cookie: $SC" "$BASE/clients/$S"); pc=$(echo "$page" | grep -E '^HTTP/' | tail -1 | awk '{print $2}')
n=$(echo "$page" | grep -o '/clients/smith-wedding/img/[0-9]*\.jpg' | sort -u | wc -l)
check "5c. Gallery page loads with cookie (200, $n full-size image links)" "$([ "$pc" = 200 ] && [ "$n" -ge 10 ] && echo 1)" "status=$pc images=$n"
ic=$(curl -s -o /tmp/proof.jpg -w '%{http_code} %{content_type} %{size_download}' -H "Cookie: $SC" "$BASE/clients/$S/img/001.jpg")
check "5d. Image loads with cookie ($ic)" "$(echo "$ic" | awk '{exit !($1==200 && $2=="image/jpeg" && $3>20000)}' && echo 1)" "$ic"
bad_imgs=0; for f in $(echo "$page" | grep -o "/clients/$S/img/[0-9]*\(-600\)\?\.jpg" | sed 's|.*/img/||' | sort -u); do
  c=$(code -H "Cookie: $SC" "$BASE/clients/$S/img/$f"); [ "$c" = 200 ] || { bad_imgs=$((bad_imgs+1)); bad_list="$bad_list $f=$c"; }; done
check "5e. Every image (full + thumbnail) linked from the gallery loads with the cookie" "$([ "$bad_imgs" = 0 ] && echo 1)" "failed=$bad_imgs:$bad_list"

# 6. Smith cookie does not grant Portraits
c1=$(code -H "Cookie: $SC" "$BASE/clients/$P/img/001.jpg")
c2=$(code -H "Cookie: $SC" "$BASE/clients/$P")
# also try the Smith cookie value under the Portraits cookie NAME (the signature covers the slug)
val="${SC#*=}"; c3=$(code -H "Cookie: cg_$P=$val" "$BASE/clients/$P/img/001.jpg")
check "6a. Smith cookie does NOT open Portraits image (status $c1)" "$([ "$c1" = 401 ] && echo 1)" "status=$c1"
check "6b. Smith cookie does NOT open Portraits page (status $c2)" "$([ "$c2" = 401 ] && echo 1)" "status=$c2"
check "6c. Smith cookie VALUE re-labelled as a Portraits cookie rejected (status $c3)" "$([ "$c3" = 401 ] && echo 1)" "status=$c3"

# 7. extra hardening checks
h=$(curl -s -i -H "Cookie: $SC" "$BASE/clients/$S" | tr -d '\r')
check "7a. Protected response has Cache-Control: private, no-store" "$(echo "$h" | grep -i '^cache-control:' | grep -qi 'private' && echo "$h" | grep -i '^cache-control:' | grep -qi 'no-store' && echo 1)" "$(echo "$h" | grep -i '^cache-control:')"
check "7b. Protected response has X-Robots-Tag noindex" "$(echo "$h" | grep -i '^x-robots-tag:' | grep -qi noindex && echo 1)" "$(echo "$h" | grep -i '^x-robots-tag:')"
check "7c. Gallery HTML has a noindex meta tag" "$(echo "$h" | grep -qi 'name="robots" content="noindex' && echo 1)" "no meta"
check "7d. 401 login page also sends X-Robots-Tag noindex" "$(curl -s -i "$BASE/clients/$S" | grep -i '^x-robots-tag:' | grep -qi noindex && echo 1)" "missing"
check "7e. robots.txt disallows /clients/" "$(curl -s "$BASE/robots.txt" | grep -qi 'Disallow: /clients/' && echo 1)" "missing"
check "7f. Forged cookie rejected" "$([ "$(code -H "Cookie: cg_$S=9999999999.AAAA" "$BASE/clients/$S/img/001.jpg")" = 401 ] && echo 1)" "accepted"
check "7g. Expired/garbage cookie rejected" "$([ "$(code -H "Cookie: cg_$S=1.AAAA" "$BASE/clients/$S")" = 401 ] && echo 1)" "accepted"
check "7h. Private file names are NOT reachable as public static files" "$([ "$(code "$BASE/clients/$S/page.html")" != 200 ] && [ "$(code "$BASE/clients/$S/meta.json")" != 200 ] && [ "$(code "$BASE/clients/$S/index.html")" != 200 ] && echo 1)" "reachable"
check "7i. /clients/ has no directory listing" "$([ "$(code "$BASE/clients/")" = 404 ] && echo 1)" "status=$(code "$BASE/clients/")"
check "7j. Path traversal attempt does not leak (..%2f)" "$([ "$(code -H "Cookie: $SC" "$BASE/clients/$S/img/..%2f..%2f$P%2fmeta.json")" != 200 ] && echo 1)" "leaked"
check "7k. meta.json (password hash) not served even with cookie" "$([ "$(code -H "Cookie: $SC" "$BASE/clients/$S/img/meta.json")" != 200 ] && echo 1)" "served"
check "7l. Public site still works (home 200)" "$([ "$(code "$BASE/")" = 200 ] && echo 1)" "home down"

# 7m/7n. login-form CSRF guard: cross-site POST refused, but real browsers (Origin: null) still work
c=$(code -X POST -H "Sec-Fetch-Site: cross-site" --data-urlencode "password=$SMITH_PW" "$BASE/clients/$S")
check "7m. Cross-site login POST refused (403)" "$([ "$c" = 403 ] && echo 1)" "status=$c"
c=$(code -X POST -H "Origin: null" -H "Sec-Fetch-Site: same-origin" --data-urlencode "password=wrong" "$BASE/clients/$S")
check "7n. Real-browser login POST (Origin: null, same-origin) is not blocked (401 wrong pw)" "$([ "$c" = 401 ] && echo 1)" "status=$c"

# 8. logout clears the cookie
lo=$(curl -s -i -X POST -H "Cookie: $SC" "$BASE/clients/$S/logout")
check "8. Logout clears cookie (Max-Age=0)" "$(echo "$lo" | grep -i '^set-cookie:' | grep -qi 'Max-Age=0' && echo 1)" "no clear"

# 9. attempt limiting (INFO: Cloudflare's limiter is approximate and per-location, so this is best-effort)
last=0; for i in 1 2 3 4 5 6 7 8 9 10; do last=$(code -X POST --data-urlencode "password=x$i" "$BASE/clients/$P"); [ "$last" = 429 ] && break; done
if [ "$last" = 429 ]; then ok "9. Repeated wrong passwords get rate limited (429 after $i attempts)"; else echo "INFO  9. No 429 within 10 rapid attempts (limiter is approximate; see README known limitations)"; fi

echo "---------------------------------------------------------------"
echo "RESULT: $pass passed, $fail failed"
[ "$fail" = 0 ]
