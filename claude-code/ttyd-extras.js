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
//
// 3. Korean IME on WebKit (Home Assistant app, Safari). WebKit fires no
//    composition events for Hangul: a new jamo or syllable arrives as an
//    `insertText` input event and every later change to the syllable being
//    composed as `insertReplacementText` (ㅎ → 하 → 한), each before its
//    keydown (keyCode 229). xterm.js only handles `insertText`, so only the
//    first jamo of each syllable reached the terminal. Send each jamo at
//    once and replace it on every change with DEL + the new syllable, so
//    what is on screen is always what the program drew, mid-line too.
//    iOS instead sends a keydown per jamo (key "ㅌ", keyCode 0), which
//    xterm.js would send as is, then deletes the syllable and inserts the
//    recomposed text (deleteContentBackward + insertText "트"); drop the
//    keydown and keypress and mirror the delete as DEL. Backspace inside a
//    syllable is left to the IME the same way.
//    Browsers that fire composition events (Chrome, Firefox) are left to
//    xterm.js. Event analysis from xterm.js PR #5704.
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
        if (payload === '?' || payload === '' || payload.length > OSC52_MAX || !BASE64.test(payload)) return true;
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

    function isHangul(s) {
        var c = s.charCodeAt(0);
        return (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3130 && c <= 0x318F) ||
            (c >= 0xA960 && c <= 0xA97F) || (c >= 0xAC00 && c <= 0xD7FF);
    }

    var MODIFIERS = { Shift: 1, Control: 1, Alt: 1, Meta: 1, CapsLock: 1 };

    withTerm(function (term) {
        var ta = term.textarea, root = term.element;
        if (!ta || !root) return;
        var composing = false; // standard composition events: xterm.js handles those
        var webkit = false;    // WebKit pattern seen: 229 keydowns are ours from now on
        var current = '';      // syllable being composed, already sent
        var ios = false;       // iOS pattern seen: jamo keydowns with keyCode 0
        var imeKey = false;    // the IME handles the last keydown (iOS)
        var before = 0;        // textarea length before the current input

        // Capture on an ancestor runs before xterm.js's own textarea listeners.
        function ours(e) { return e.target === ta && !composing && !term.options.screenReaderMode; }

        root.addEventListener('compositionstart', function () { current = ''; composing = true; }, true);
        root.addEventListener('compositionend', function () { composing = false; }, true);

        root.addEventListener('beforeinput', function (e) {
            if (e.target === ta) before = ta.value.length;
        }, true);

        root.addEventListener('input', function (e) {
            if (!ours(e)) return;
            if (e.inputType === 'insertReplacementText' && e.data) {
                webkit = true;
                // No current syllable: a key such as Backspace already
                // removed it from the terminal, so just send the new one.
                if (e.data !== current) term.input((current ? '\x7f' : '') + e.data, true);
                current = e.data;
            } else if (e.inputType === 'insertText' && e.data && isHangul(e.data)) {
                webkit = true;
                term.input(e.data, true);
                current = e.data.slice(-1);
            } else if (e.inputType === 'deleteContentBackward' && (current || imeKey)) {
                // The IME removed text itself (no Backspace keydown reset
                // `current` first), so xterm.js sent nothing. iOS does this
                // on every jamo, before inserting the recomposed text.
                term.input(new Array(Math.max(before - ta.value.length, 1) + 1).join('\x7f'), true);
                current = '';
            } else {
                return;
            }
            e.stopImmediatePropagation();
        }, true);

        root.addEventListener('keydown', function (e) {
            if (!ours(e)) return;
            if (e.keyCode === 229) {
                // xterm.js would diff the textarea here and resend its whole
                // value; the input event already carried the text.
                if (webkit) e.stopImmediatePropagation();
                return;
            }
            imeKey = e.key.length === 1 && isHangul(e.key);
            if (imeKey) {
                // iOS: a jamo keydown (keyCode 0) that xterm.js would send
                // as is; the input events after it carry the composed text.
                webkit = ios = true;
                e.stopImmediatePropagation();
                return;
            }
            if (ios && current && e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // Inside a syllable, let the IME take the jamo off (한 → 하):
                // xterm.js would send DEL for the whole syllable and cancel
                // the key, so the IME's text would drift from the terminal.
                imeKey = true;
                e.stopImmediatePropagation();
                return;
            }
            if (!MODIFIERS[e.key]) current = '';
        }, true);

        // Once its keydown is stopped, xterm.js would send the jamo from
        // the keypress that iOS fires next.
        root.addEventListener('keypress', function (e) {
            if (ours(e) && e.key.length === 1 && isHangul(e.key)) e.stopImmediatePropagation();
        }, true);
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
