# Home Assistant

- `/config` is the Home Assistant configuration directory.
- Use the `ha` CLI for Supervisor tasks (`ha core check`, `ha core logs`, `ha apps …`); the HA REST API is at `http://supervisor/core/api/` with `Authorization: Bearer $SUPERVISOR_TOKEN`.
- Restarting Home Assistant runs `ha core check` first and is blocked if the configuration is invalid — fix the reported errors, then restart again.
