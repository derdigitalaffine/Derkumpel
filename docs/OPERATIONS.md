# Operations

## Requirements

Docker Engine with Compose v2. Production requires HTTPS. By default Derkumpel binds only to loopback and expects an external reverse proxy.

## Install

1. Copy `.env.example` to `.env`.
2. Set `REDMINE_BASE_URL=https://redmine.vgo-o.de`.
3. Generate `SESSION_SECRET` as 32 random bytes encoded base64.
4. Set `PUBLIC_BASE_URL` to the external Derkumpel URL.
5. Run `docker compose up -d --build`.

The app is then available on `${BIND_ADDRESS}:${APP_PORT}` (default `127.0.0.1:8080`).

## Optional Caddy

Set `APP_HOST` to the public hostname and run `docker compose --profile caddy up -d --build`. Ensure DNS points to the host and ports 80/443 are reachable.

## Reverse proxy

Proxy the public HTTPS origin to `http://127.0.0.1:8080`. Preserve Host and standard forwarded headers. Do not expose a second public HTTP origin because secure cookies and PWA installability rely on HTTPS.

## Updates

Pull the desired release/commit, then `docker compose build --pull app && docker compose up -d app`. Core Redmine operations are stateless; rollback is switching image/source version and restarting. If Push is enabled, preserve the `push_data` volume and matching VAPID/encryption secrets.

After a branding update, deploy a **newly built image** (a plain container restart cannot replace the bundled static files). The current PNG assets use `-v2` names to avoid broken historic icon caches. Reload the HTTPS site; installed PWAs may need to be reopened or reinstalled before the device launcher updates its home-screen icon. Do not delete offline app storage just to refresh icons while unsynchronized mutations exist.

The map uses basemap.de **Web Raster** by default (`wmts_basemapde/tile/.../{z}/{y}/{x}.png`). Old `MAP_STYLE_URL` values that point to basemap.de Web Vektor are ignored. To preload tiles, enable Offline-Karte in Settings, then download the configured area while online.

## Optional real Web Push

Web Push is **off by default**. It is a small, explicitly persistent exception to the stateless Redmine client. To enable on an existing server after pulling this release:

```sh
./setup.sh push-enable --contact mailto:your-admin@your-organisation.tld
```

This generates stable VAPID keypair + an independent 32-byte AES key inside a mode-0600 `.env`, builds the app and recreates the container. The SQLite file lives in the Compose named volume `push_data` at `/data/push.sqlite`, owned by the unprivileged app user. A separate database service is NOT needed. On startup, enabled Push **requires** `PUBLIC_BASE_URL` to be HTTPS and the secrets to be valid; errors fail startup rather than silently exposing subscriptions.

Afterward, each employee activates **Mehr → Einstellungen → Push aktivieren** and chooses categories. Browser prompts must be approved from an actual tap. On **iOS/iPadOS 16.4+**, install DerKumpel on the Home Screen first and open the installed app. Chrome/Firefox Android/desktop can use the supported browser directly. Use **Test senden** to verify push-provider delivery, including while the app is closed. Initial enrollment is only a baseline (no retroactive flood). New assignments, group assignments, status/closure, comments, priority and dates are monitored approximately every two minutes using each person's existing Redmine permissions. Redmine outages defer checks; delivery is best-effort, not a guaranteed real-time alarm system.

**Security operations:** Push stores each opt-in account's encrypted Redmine username/password server-side (never in browser JS storage) so it can monitor with the app closed. Restrict filesystem/host access, keep `PUSH_ENCRYPTION_SECRET` separate from `SESSION_SECRET`, back up `push_data` and both VAPID and encryption keys together, and protect backups as credential material. Changing keys invalidates stored subscriptions/credentials. Redmine password rotation revokes that employee's monitoring on the next 401; the employee must re-enable Push after logging in. Disabling Push on the device removes its server subscription; deleting the last device also removes the stored credentials/snapshots. When performing an offline logout, the browser unregisters its endpoint locally; the server cleans up permanently invalid endpoints on a subsequent delivery, but online unsubscription is recommended.

This built-in poller is intended for **one app replica**, as in the provided Compose configuration. Do not scale multiple processes against the same SQLite store without a distributed leader/lease. A user with many assigned tickets/groups can cause many API requests; observe Redmine load before rolling out to all 25 users. Push sends only generic lock-screen text (no subjects, notes or contact details), and issue deep links are protected by the same Redmine authorization as the rest of the app.

## Backup

Without Push, there is no server-side business database; Redmine remains the authority. With Push, back up the optional sensitive `push_data` volume and stable .env secrets securely. Offline device caches are disposable working copies and are not a backup source.

## Health

- `/api/health/live`: process health
- `/api/health/ready`: process configuration readiness; does not require Redmine to be online so a temporary Redmine outage does not restart-loop Derkumpel
