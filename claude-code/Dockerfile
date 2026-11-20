# BUILD_FROM is no longer injected by the Supervisor (>=2026.04.0) — default to
# the multi-arch HA base manifest. Alpine 3.24's musl provides the symbols the
# native Claude Code musl build links against. Overridable with --build-arg.
ARG BUILD_FROM=ghcr.io/home-assistant/base:3.24
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Bumped by .github/workflows/upstream-check.yml.
ARG CLAUDE_CODE_VERSION=2.1.329

LABEL \
    io.hass.type="app" \
    org.opencontainers.image.title="Home Assistant App: Claude Code" \
    org.opencontainers.image.description="Claude Code CLI in a web terminal, served via the ingress panel" \
    org.opencontainers.image.source="https://github.com/saya6k/ha-app-claude-code" \
    org.opencontainers.image.licenses="MIT"

# HOME holds shell history, git/ssh config, etc. (private /data).
# CLAUDE_CONFIG_DIR moves everything Claude Code keeps under ~/.claude *and*
# ~/.claude.json into the app config folder, so it is user-editable from the
# host at /addon_configs/<repo>_claude-code/.
# DISABLE_AUTOUPDATER: claude-select (init-claude) installs the configured
# version on every start instead.
# USE_BUILTIN_RIPGREP=0: the bundled rg is glibc-only; use Alpine's.
ENV LANG=C.UTF-8 \
    HOME=/data/home \
    CLAUDE_CONFIG_DIR=/addon_config \
    DISABLE_AUTOUPDATER=1 \
    USE_BUILTIN_RIPGREP=0

RUN apk add --no-cache \
        git \
        libgcc \
        libstdc++ \
        nginx \
        ripgrep \
        tmux \
        ttyd

# Bundled fallback: native musl build straight from the npm registry (the npm
# wrapper package would only download this same binary at first run).
# /usr/local/bin/claude is a symlink that claude-select repoints at start-up
# to the configured version in /data, or back to this copy.
RUN case "$(apk --print-arch)" in \
        x86_64)  pkg="linux-x64-musl" ;; \
        aarch64) pkg="linux-arm64-musl" ;; \
        *) echo "Unsupported architecture: $(apk --print-arch)" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://registry.npmjs.org/@anthropic-ai/claude-code-${pkg}/-/claude-code-${pkg}-${CLAUDE_CODE_VERSION}.tgz" \
        | tar -xz -C /tmp package/claude \
    && install -D -m 0755 /tmp/package/claude /opt/claude-code/claude \
    && echo "${CLAUDE_CODE_VERSION}" > /opt/claude-code/VERSION \
    && ln -s /opt/claude-code/claude /usr/local/bin/claude \
    && rm -rf /tmp/package \
    && claude --version

# claudebar: statusline under the Claude Code prompt (usage limits, context,
# cost). Musl build from the GitHub release, SHA256-verified. init-claude
# writes its config from the app options and wires it into settings.json.
ARG CLAUDEBAR_VERSION=2026.8.27
RUN asset="claudebar-$(uname -m)-unknown-linux-musl.tar.gz" \
    && url="https://github.com/micschr0/claudebar/releases/download/${CLAUDEBAR_VERSION}/${asset}" \
    && mkdir -p /tmp/claudebar \
    && curl -fsSL -o "/tmp/claudebar/${asset}" "${url}" \
    && curl -fsSL "${url}.sha256" \
        | awk -v f="/tmp/claudebar/${asset}" 'NF {print $1 "  " f}' | sha256sum -c - \
    && tar -xzf "/tmp/claudebar/${asset}" -C /tmp/claudebar \
    && install -m 0755 "$(find /tmp/claudebar -type f -name claudebar | head -1)" /usr/local/bin/claudebar \
    && rm -rf /tmp/claudebar \
    && claudebar --version

# Symbols Nerd Font (MIT) for powerline/Nerd Font glyphs in the browser
# terminal: the browser draws the text, so the font is served to it by nginx
# (fonts/) and wired into ttyd's page below — installing it in the image
# alone would change nothing. Symbols-only, so normal text keeps the
# system monospace font. Pinned by SHA-256.
ARG NERD_FONTS_VERSION=v3.5.1
ARG NERD_FONTS_SHA256=01172f37db8543edb102e5cb5c64101c9f4686630804d49b419aa07b23a69996
RUN mkdir -p /tmp/nf /usr/share/claude-code/fonts \
    && curl -fsSL -o /tmp/nf/symbols.tar.xz \
        "https://github.com/ryanoasis/nerd-fonts/releases/download/${NERD_FONTS_VERSION}/NerdFontsSymbolsOnly.tar.xz" \
    && echo "${NERD_FONTS_SHA256}  /tmp/nf/symbols.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/nf/symbols.tar.xz -C /tmp/nf SymbolsNerdFontMono-Regular.ttf LICENSE \
    && install -m 0644 /tmp/nf/SymbolsNerdFontMono-Regular.ttf /usr/share/claude-code/fonts/ \
    && install -m 0644 /tmp/nf/LICENSE /usr/share/claude-code/fonts/LICENSE-nerd-fonts \
    && rm -rf /tmp/nf

# ttyd's stock page with the font injected (see build-ttyd-index.sh).
COPY build-ttyd-index.sh /tmp/build-ttyd-index.sh
RUN bash /tmp/build-ttyd-index.sh /usr/share/claude-code/ttyd/index.html \
    && rm /tmp/build-ttyd-index.sh

COPY rootfs /

RUN find /etc/s6-overlay/s6-rc.d -type f \( -name run -o -name finish -o -name up \) -exec chmod +x {} \; \
    && chmod +x /usr/local/bin/login-url-watcher /usr/local/bin/claude-select

HEALTHCHECK --start-period=30s --interval=30s --timeout=5s --retries=3 \
    CMD ["curl", "-fs", "-o", "/dev/null", "http://127.0.0.1:8099/"]
