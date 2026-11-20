#!/bin/bash
# Run once at image build (Dockerfile), not at boot.
#
# Captures the index.html this image's own ttyd serves and adds two things:
# an @font-face in <head> for the bundled Symbols Nerd Font (served by nginx
# at fonts/, relative so it survives the ingress path prefix), and
# ttyd-extras.js inlined before </body> (font redraw + OSC 52 clipboard).
# Everything else is ttyd's stock page.
# Approach adapted from heytcass/claude-terminal's build-ttyd-index.sh.
#
# Usage: build-ttyd-index.sh OUTPUT EXTRAS_JS
set -euo pipefail

out=$1
extras=$2
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
if grep -qi '</script' "${extras}"; then
    echo "${extras} must not contain a closing script tag" >&2; exit 1
fi

head_snippet='<style>@font-face{font-family:"Symbols Nerd Font Mono";src:url("fonts/SymbolsNerdFontMono-Regular.ttf") format("truetype");font-display:block}</style>'
body_snippet="<script>
$(cat "${extras}")
</script>"

# Plain string replacement; with patsub_replacement (bash >= 5.2) an '&' in
# the replacement would expand to the matched text, so turn it off.
shopt -u patsub_replacement 2>/dev/null || true
html=$(cat "${work}/stock.html")
html=${html/'</head>'/"${head_snippet}</head>"}
html=${html/'</body>'/"${body_snippet}</body>"}
mkdir -p "$(dirname "${out}")"
printf '%s\n' "${html}" > "${out}"
grep -q 'Symbols Nerd Font Mono' "${out}" && grep -q 'registerOscHandler' "${out}" \
    || { echo "injection failed" >&2; exit 1; }
echo "build-ttyd-index: wrote ${out} ($(wc -c < "${out}") bytes)"
