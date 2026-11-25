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
# HAB_SKIP_UPDATE_CHECK: hab is pinned below; a self-update would not
# survive an image update anyway.
ENV LANG=C.UTF-8 \
    HOME=/data/home \
    CLAUDE_CONFIG_DIR=/addon_config \
    DISABLE_AUTOUPDATER=1 \
    USE_BUILTIN_RIPGREP=0 \
    HAB_SKIP_UPDATE_CHECK=1

RUN apk add --no-cache \
        git \
        github-cli \
        libgcc \
        libstdc++ \
        nginx \
        openssh-client \
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

# Home Assistant CLI (`ha`, Apache-2.0): static Go binary, pinned by the
# SHA-256 GitHub publishes per asset. Talks to http://supervisor with
# SUPERVISOR_TOKEN; also used by the ha-restart-guard hook.
ARG HA_CLI_VERSION=6.0.0
ARG HA_CLI_SHA256_AMD64=faab39046723cb68d43e9d5c8ac5a2cf105f3ecb3f5c8a01c0999c2699c56489
ARG HA_CLI_SHA256_AARCH64=514cd052627358d673842e6132d4d0fc88f246c1af767a895c2b529a153c0c59
RUN case "$(apk --print-arch)" in \
        x86_64)  arch=amd64;   sha="${HA_CLI_SHA256_AMD64}" ;; \
        aarch64) arch=aarch64; sha="${HA_CLI_SHA256_AARCH64}" ;; \
    esac \
    && curl -fsSL -o /usr/local/bin/ha "https://github.com/home-assistant/cli/releases/download/${HA_CLI_VERSION}/ha_${arch}" \
    && echo "${sha}  /usr/local/bin/ha" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/ha \
    && ha --help >/dev/null

# Home Assistant Builder (`hab`, Apache-2.0): static Go binary from
# balloob/home-assistant-build-cli for managing entities, automations,
# dashboards, helpers… through the HA API. Authenticates with
# SUPERVISOR_TOKEN on its own. Pinned by the SHA-256 GitHub publishes.
ARG HAB_VERSION=1.10.0
ARG HAB_SHA256_AMD64=2d2c0529f61f1e6bd8759f1cdf0ece153c04f51b7eee0e6def28ad6bbac8bca0
ARG HAB_SHA256_AARCH64=719c61fb3b0c7a8295a61113b4730f251b3c3fa5c833c5bab64e8865e3af5b90
RUN case "$(apk --print-arch)" in \
        x86_64)  arch=amd64; sha="${HAB_SHA256_AMD64}" ;; \
        aarch64) arch=arm64; sha="${HAB_SHA256_AARCH64}" ;; \
    esac \
    && curl -fsSL -o /usr/local/bin/hab "https://github.com/balloob/home-assistant-build-cli/releases/download/${HAB_VERSION}/hab-linux-${arch}" \
    && echo "${sha}  /usr/local/bin/hab" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/hab \
    && hab --help >/dev/null

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

# ttyd's stock page plus the font and ttyd-extras.js (font redraw, OSC 52
# clipboard, Korean IME on WebKit) — see build-ttyd-index.sh.
COPY build-ttyd-index.sh ttyd-extras.js /tmp/ttyd-page/
RUN bash /tmp/ttyd-page/build-ttyd-index.sh /usr/share/claude-code/ttyd/index.html /tmp/ttyd-page/ttyd-extras.js \
    && rm -rf /tmp/ttyd-page

COPY rootfs /

RUN find /etc/s6-overlay/s6-rc.d -type f \( -name run -o -name finish -o -name up \) -exec chmod +x {} \; \
    && chmod +x /usr/local/bin/login-url-watcher /usr/local/bin/claude-select /usr/local/bin/ha-restart-guard

HEALTHCHECK --start-period=30s --interval=30s --timeout=5s --retries=3 \
    CMD ["curl", "-fs", "-o", "/dev/null", "http://127.0.0.1:8099/"]
