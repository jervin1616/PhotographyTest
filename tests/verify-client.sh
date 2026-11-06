#!/usr/bin/env bash
# Prove ONE client gallery is protected. Usage: tests/verify-client.sh <base-url> <slug> <password> [other-slug other-password]
# If the optional "other" client is given, also checks that the two galleries do not open each other.
BASE="${1%/}"; SLUG="$2"; PW="$3"; OTHER="$4"; OTHERPW="$5"
[ -z "$BASE" ] || [ -z "$SLUG" ] || [ -z "$PW" ] && { echo "usage: $0 <base-url> <slug> <password> [other-slug other-password]"; exit 2; }
pass=0; fail=0
ok(){ echo "PASS  $1"; pass=$((pass+1)); }; bad(){ echo "FAIL  $1   ($2)"; fail=$((fail+1)); }
check(){ if [ "$2" = "1" ]; then ok "$1"; else bad "$1" "$3"; fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
status(){ grep -E '^HTTP/' | tail -1 | awk '{print $2}'; }
cookie(){ grep -i '^set-cookie:' | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: *//; s/;.*//' | tr -d '\r'; }
login(){ curl -s -i -X POST --data-urlencode "password=$2" "$BASE/clients/$1"; }
echo "Testing client '$SLUG' on $BASE"; echo "----------------------------------------------"

r=$(curl -s -i "$BASE/clients/$SLUG"); c=$(echo "$r" | status); leak=$(echo "$r" | grep -c -E 'class="gallery"|/img/00')
check "1. Locked URL serves only the login form, no gallery content" "$([ "$c" = 200 ] && [ "$leak" = 0 ] && echo "$r" | grep -q 'name="password"' && echo 1)" "status=$c leak=$leak"
c=$(code "$BASE/clients/$SLUG/img/001.jpg"); check "2. Direct image without cookie blocked" "$([ "$c" = 401 ] && echo 1)" "status=$c"
r=$(login "$SLUG" "definitely-wrong"); c=$(echo "$r" | status); sc=$(echo "$r" | grep -ic '^set-cookie:')
check "3. Wrong password rejected (401, no cookie)" "$([ "$c" = 401 ] && [ "$sc" = 0 ] && echo 1)" "status=$c cookie=$sc"
r=$(login "$SLUG" "$PW"); c=$(echo "$r" | status); SC=$(echo "$r" | cookie)
check "4. Correct password accepted (303 + cookie)" "$([ "$c" = 303 ] && [ -n "$SC" ] && echo 1)" "status=$c"
page=$(curl -s -i -H "Cookie: $SC" "$BASE/clients/$SLUG"); pc=$(echo "$page" | status)
files=$(echo "$page" | grep -o "/clients/$SLUG/img/[A-Za-z0-9_-]*\(-600\)\?\.jpg" | sort -u)
n=$(echo "$files" | grep -c .)
check "5a. Gallery page loads with cookie (200, $n image links)" "$([ "$pc" = 200 ] && [ "$n" -ge 2 ] && echo 1)" "status=$pc links=$n"
badc=0; for f in $files; do c=$(code -H "Cookie: $SC" "$BASE$f"); [ "$c" = 200 ] || { badc=$((badc+1)); echo "      $f -> $c"; }; done
check "5b. Every image ($n) loads with the cookie" "$([ "$badc" = 0 ] && [ "$n" -ge 2 ] && echo 1)" "failed=$badc"
check "5c. Gallery has noindex + no-store" "$([ "$pc" = 200 ] && echo "$page" | tr -d '\r' | grep -i '^cache-control:' | grep -qi no-store && echo "$page" | tr -d '\r' | grep -i '^x-robots-tag:' | grep -qi noindex && echo 1)" "headers"
check "5d. Password is not in the gallery HTML" "$([ "$pc" = 200 ] && ! echo "$page" | grep -qF "$PW" && echo 1)" "password found in page"
if [ -n "$OTHER" ]; then
  c=$(code -H "Cookie: $SC" "$BASE/clients/$OTHER/img/001.jpg"); check "6a. This client's cookie does NOT open '$OTHER' (image)" "$([ "$c" = 401 ] && echo 1)" "status=$c"
  r=$(login "$OTHER" "$PW"); c=$(echo "$r" | status); check "6b. This password does NOT open '$OTHER'" "$([ "$c" = 401 ] && echo 1)" "status=$c"
  OC=$(login "$OTHER" "$OTHERPW" | cookie); c=$(code -H "Cookie: $OC" "$BASE/clients/$SLUG/img/001.jpg"); check "6c. '$OTHER' cookie does NOT open this client (image)" "$([ "$c" = 401 ] && echo 1)" "status=$c"
fi
echo "----------------------------------------------"; echo "RESULT: $pass passed, $fail failed"; [ "$fail" = 0 ]
