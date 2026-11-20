#!/bin/bash
# Run once at image build (Dockerfile), not at boot.
#
# Captures the index.html this image's own ttyd serves and injects the
# bundled Symbols Nerd Font: an @font-face in <head> (served by nginx at
# fonts/, relative so it survives the ingress path prefix) and a small
# script before </body> that redraws the terminal once the font has loaded —
# xterm.js caches rendered glyphs, so symbols drawn before the font arrived
# would otherwise stay as boxes. Everything else is ttyd's stock page.
# Approach adapted from heytcass/claude-terminal's build-ttyd-index.sh.
#
# Usage: build-ttyd-index.sh OUTPUT
set -euo pipefail

out=$1
port=7699
work=$(mktemp -d)
ttyd --port "${port}" --interface lo true >/dev/null 2>&1 &
ttyd_pid=$!
trap 'kill "${ttyd_pid}" 2>/dev/null || true; rm -rf "${work}"' EXIT

for _ in $(seq 1 50); do
    curl -fsS -o "${work}/stock.html" "http://127.0.0.1:${port}/" 2>/dev/null && break
    sleep 0.2
done

[ -s "${work}/stock.html" ] || { echo "could not fetch ttyd's page" >&2; exit 1; }
for tag in '</head>' '</body>'; do
    [ "$(grep -o "${tag}" "${work}/stock.html" | wc -l)" -eq 1 ] \
        || { echo "expected exactly one ${tag} in ttyd's page" >&2; exit 1; }
done
grep -q 'window.term=' "${work}/stock.html" \
    || { echo "ttyd's page no longer exposes window.term" >&2; exit 1; }

# Single-line snippets with no '#' or '&' (sed delimiter / match token).
head_snippet='<style>@font-face{font-family:"Symbols Nerd Font Mono";src:url("fonts/SymbolsNerdFontMono-Regular.ttf") format("truetype");font-display:block}</style>'
body_snippet='<script>(function(){if(!document.fonts||!document.fonts.load)return;document.fonts.load("14px \\"Symbols Nerd Font Mono\\"").then(function(){var n=0;(function redraw(){var t=window.term;if(!t){if(n++<100)setTimeout(redraw,100);return}if(t.clearTextureAtlas)t.clearTextureAtlas();t.refresh(0,t.rows-1)})()})})();</script>'

mkdir -p "$(dirname "${out}")"
sed -e "s#</head>#${head_snippet}</head>#" \
    -e "s#</body>#${body_snippet}</body>#" \
    "${work}/stock.html" > "${out}"
grep -q 'Symbols Nerd Font Mono' "${out}" || { echo "injection failed" >&2; exit 1; }
echo "build-ttyd-index: wrote ${out} ($(wc -c < "${out}") bytes)"
