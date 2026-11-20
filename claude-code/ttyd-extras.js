// Browser-side additions to ttyd's stock page. build-ttyd-index.sh inlines
// this file before </body> at image build time; ttyd serves the result via
// `ttyd --index`. Keep it small and dependency-free, and never write the
// closing script tag in it.
//
// 1. Nerd Font redraw. xterm.js caches rendered glyphs, so symbols drawn
//    before the bundled font finished loading would stay as boxes; once it
//    has loaded, clear the cache and redraw.
//
// 2. OSC 52 clipboard. tmux (mouse drag-copy) and Claude Code ("c to copy")
//    send copied text out as an OSC 52 escape sequence, but ttyd registers
//    no handler, so xterm.js dropped it and nothing reached the clipboard.
//    Writes go to the async Clipboard API where available (HTTPS or
//    localhost); on a plain-HTTP Home Assistant that API does not exist, so
//    fall back to a hidden textarea + execCommand('copy'). Clipboard READ
//    requests (`52;c;?`) are refused: answering them would let anything
//    that can write to the terminal read the user's clipboard.
//
// OSC 52 approach adapted from heytcass/claude-terminal's ttyd-extras.js.
(function () {
    'use strict';

    var FONT = '14px "Symbols Nerd Font Mono"';
    var OSC52_MAX = 1000000; // base64 chars, ~750 KB of text
    var BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    function withTerm(fn) {
        var tries = 0;
        (function wait() {
            if (window.term) return fn(window.term);
            if (tries++ < 100) setTimeout(wait, 100);
        })();
    }

    function toast(text) {
        var el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9;' +
            'padding:6px 10px;border-radius:6px;font:12px sans-serif;' +
            'background:#333;color:#eee;opacity:.9;pointer-events:none';
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 1500);
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        var active = document.activeElement;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        if (active && active.focus) active.focus();
        return ok;
    }

    function writeClipboard(text) {
        function done(ok) {
            toast(ok ? 'Copied' : 'Copy blocked by the browser: use Shift+drag (Option+drag on Mac), then Ctrl/Cmd+C');
        }
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () { done(true); },
                function () { done(fallbackCopy(text)); });
        } else {
            done(fallbackCopy(text));
        }
    }

    function onOsc52(data) {
        var i = data.indexOf(';');
        if (i === -1) return true;
        var payload = data.slice(i + 1);
        if (payload === '?' || payload.length > OSC52_MAX || !BASE64.test(payload)) return true;
        try {
            var bytes = Uint8Array.from(atob(payload), function (c) { return c.charCodeAt(0); });
            writeClipboard(new TextDecoder().decode(bytes));
        } catch (e) { /* malformed: ignore */ }
        return true;
    }

    withTerm(function (term) {
        if (term.parser && term.parser.registerOscHandler) {
            term.parser.registerOscHandler(52, onOsc52);
        }
    });

    if (document.fonts && document.fonts.load) {
        document.fonts.load(FONT).then(function () {
            withTerm(function (term) {
                if (term.clearTextureAtlas) term.clearTextureAtlas();
                term.refresh(0, term.rows - 1);
            });
        });
    }
})();
