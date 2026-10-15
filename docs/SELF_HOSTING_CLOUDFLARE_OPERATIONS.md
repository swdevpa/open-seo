# Cloudflare Self-Hosting: Operations

Day-to-day tasks after [initial setup](./SELF_HOSTING_CLOUDFLARE.md): connect the MCP server and manage telemetry. Updating and teammate access are covered in the [deploy guide](./SELF_HOSTING_CLOUDFLARE.md) (or the [legacy page](./SELF_HOSTING_CLOUDFLARE_LEGACY.md) for pre-alchemy deployments).

## Connect the MCP server through Cloudflare Access

Use the same Cloudflare Access application that protects your OpenSEO Worker.
Managed OAuth is required for MCP clients and is not enabled by default.

1. Open Cloudflare Zero Trust.
2. Go to `Access controls` -> `Applications`.
3. Find your OpenSEO application, then select `Edit`.
4. Go to `Additional settings` -> `OAuth`.
5. Turn on `Managed OAuth`.
6. In `Managed OAuth settings`, allow the redirect URIs your MCP clients use:
   - Allow `localhost` / loopback clients for CLI and desktop agents (Codex
     CLI, Claude Code) that register `http://localhost:PORT/callback`.
   - Add HTTPS redirect URIs for web connectors (a path may end in `/*`).
   - Without this, clients can't finish [Dynamic Client Registration](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
     and log in but expose no tools.
7. Still in `Managed OAuth settings`, set how long an MCP login lasts:
   - `Grant session duration`: how long the client's refresh token stays
     valid, for example 2–4 weeks. If you leave it unset, it falls back to the
     application session duration (24 hours by default), and agents have to
     log in again every day.
   - `Access token lifetime`: keep it short, for example 15 minutes. Clients
     refresh it silently, and Access re-checks your policies on each refresh.
8. Save.

The [global session duration](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#global-session-duration)
(`Access controls` -> `Access settings`) also limits how long a login lasts.
It defaults to the application session timeout. If MCP clients still have to
log in again daily, raise it to at least the grant session duration. It
applies to every Access application in the account. Clients that connected
before the change keep their old session until they log in again.

MCP clients should connect to:

```text
https://YOUR_WORKER_HOSTNAME/mcp
```

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` in `.env.selfhost` and redeploy. Docker and [legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): set it (or `DO_NOT_TRACK=1`) as an environment variable / Worker variable instead.
