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

Pull the desired release/commit, then `docker compose build --pull app && docker compose up -d app`. The service is stateless; rollback is switching image/source version and restarting.

After a branding update, deploy a **newly built image** (a plain container restart cannot replace the bundled static files). The current PNG assets use `-v2` names to avoid broken historic icon caches. Reload the HTTPS site; installed PWAs may need to be reopened or reinstalled before the device launcher updates its home-screen icon. Do not delete offline app storage just to refresh icons while unsynchronized mutations exist.

The map uses basemap.de **Web Raster** by default (`wmts_basemapde/tile/.../{z}/{y}/{x}.png`). Old `MAP_STYLE_URL` values that point to basemap.de Web Vektor are ignored. To preload tiles, enable Offline-Karte in Settings, then download the configured area while online.

## Backup

Derkumpel has no server database. Back up configuration/secrets through your normal secret-management process. Redmine backup remains the authoritative business-data backup. Offline device caches are disposable working copies and are not a backup source.

## Health

- `/api/health/live`: process health
- `/api/health/ready`: process configuration readiness; does not require Redmine to be online so a temporary Redmine outage does not restart-loop Derkumpel
