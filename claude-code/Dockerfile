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

COPY rootfs /

RUN find /etc/s6-overlay/s6-rc.d -type f \( -name run -o -name finish -o -name up \) -exec chmod +x {} \; \
    && chmod +x /usr/local/bin/login-url-watcher /usr/local/bin/claude-select

HEALTHCHECK --start-period=30s --interval=30s --timeout=5s --retries=3 \
    CMD ["curl", "-fs", "-o", "/dev/null", "http://127.0.0.1:8099/"]
