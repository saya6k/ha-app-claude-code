# Home Assistant

- `/config` is the Home Assistant configuration directory.
- HA REST API: `http://supervisor/core/api/`; Supervisor API: `http://supervisor/` (both with `Authorization: Bearer $SUPERVISOR_TOKEN`).
- Run `curl -sX POST -H "Authorization: Bearer $SUPERVISOR_TOKEN" http://supervisor/core/check` before restarting Home Assistant.
