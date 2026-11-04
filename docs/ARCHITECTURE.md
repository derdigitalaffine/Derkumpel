# Architecture

## Shape

Derkumpel is a two-part application delivered as one container:

1. React/Mantine PWA (`apps/web`)
2. Fastify BFF (`apps/api`), stateless for all core Redmine operations.

The BFF serves the built PWA and same-origin `/api/*`. **Exception:** when explicitly enabled, the Web Push module uses a single small SQLite file for per-device subscriptions, encrypted per-user Redmine credentials and change snapshots. This is not a source of ticket truth, and core deployment continues to work when Push is disabled.

## Redmine authority

Redmine is the sole durable authority for issue data, users, groups, permissions, workflows, trackers, statuses, custom fields, journals, relations and attachments. The BFF uses the public Redmine REST API only. It does not access the Redmine database.

## Authentication

Login posts username/password over HTTPS to the BFF. The BFF verifies them against `/users/current.json`, then encrypts a credential envelope with AES-256-GCM and stores only the ciphertext in a Secure HttpOnly cookie. The browser application cannot read the password. On API calls, the BFF decrypts in memory, calls Redmine using Basic Authentication, and discards plaintext after the request.

The core BFF remains stateless. The optional Push module saves separate AES-256-GCM-encrypted credential copies on the server **only with device opt-in**, and deletes them when the last subscription is removed. Push workers use each subscriber's own credentials for Redmine requests and revoke stored access on HTTP 401. Key rotation is operational: changing `SESSION_SECRET` invalidates existing online sessions and requires login.

Offline state is a local UI state, not an authentication bypass: cached data remains accessible on the personally assigned device while offline, but no server action can occur without a valid online session.

## API strategy

Use explicit BFF endpoints instead of an unrestricted proxy. Core endpoints:

- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `/api/issues` and `/api/issues/:id`
- `/api/issues/:id` update
- `/api/issues/:id/comments`
- `/api/issues/:id/attachments`
- `/api/attachments/:id`
- `/api/time-entries`
- `/api/meta/*` for statuses, trackers, priorities, projects, memberships/groups/custom fields as Redmine permits
- `/api/health/live`, `/api/health/ready`

Responses include revision information (Redmine `updated_on` and a deterministic snapshot hash where useful) for conflict detection.

## Local data model

IndexedDB/Dexie tables:

- `issues`: normalized issue summaries/details and server revision
- `attachments`: cached attachment metadata and Blob content
- `outbox`: durable offline mutations with idempotency key, base revision, retry state and conflict payload
- `settings`: device/user preferences
- `syncState`: last successful sync, current state and diagnostics

No credential material is stored in these tables.

## Sync algorithm

1. Hydrate UI immediately from IndexedDB.
2. If online, validate session and fetch `my work` pages.
3. Upsert server snapshots without deleting locally pending edits.
4. Cache required attachments with storage-budget checks.
5. Replay outbox in creation order, grouping only safe independent changes.
6. For append-only mutations (comments, attachments) retry idempotently.
7. For field mutations compare base revision and current server snapshot.
8. Auto-merge when changed fields do not overlap.
9. Otherwise mark conflict and require user choice.
10. Refresh affected issue after successful replay.

Background Sync API may be used when available, but correctness must not depend on it. Foreground/reconnect sync is mandatory for iOS compatibility.

## Optional Web Push

When `PUSH_ENABLED=true`, one API process opens `/data/push.sqlite` and performs a per-subscriber Redmine poll no faster than every 120 seconds. Each worker request uses the real logged-in Redmine account, including its group memberships; there is **no admin impersonation**, and unreadable issues are not pushed. New assignments, status, notes, priority and date changes are classified against per-user snapshots; initial enrollment only establishes a baseline (no historical notification storm). The service sends generic lock-screen text and an issue deep link without copying confidential titles/contents into push messages.

`PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_CONTACT`, and a separately generated 32-byte `PUSH_ENCRYPTION_SECRET` must remain stable. The HTTPS browser asks permission only after a user gesture; on iOS/iPadOS Web Push requires opening the installed Home Screen PWA. Settings can unregister one device, delete its endpoint, and delete the associated encrypted account data after its last device unsubscribes. A rotated/invalid Redmine password deactivates that account's Push subscriptions.

The custom Vite PWA service worker precaches the shell, continues to cache basemap raster tiles, and handles `push` and `notificationclick` events; API responses are deliberately never cached in CacheStorage.

This optional poller requires **one writable volume and one active app replica**. Do not scale it horizontally without a distributed lease. Redmine is still the only authoritative business database.

## PWA caching

The service worker precaches the application shell. API data is not blindly cached by Workbox; authoritative offline data lives in IndexedDB. Static map assets may use runtime caching. Offline map tiles are a separate opt-in cache with explicit storage/budget controls.

## Map

MapLibre loads the basemap.de Web Raster tiles online. Issue coordinates come from Redmine custom fields. Native navigation uses a platform URL handler. User geolocation never leaves the device.

## Deployment

Default Compose publishes the app on `${BIND_ADDRESS:-127.0.0.1}:${APP_PORT:-8080}`. External reverse proxy terminates TLS.

Optional `caddy` profile publishes 80/443 and reverse-proxies to the app. No external database, broker or shared cache is required. When Push is enabled, Compose mounts the local `push_data` volume at `/data`.

## Future Rapportzettel seam

The PWA domain layer exposes a time/rapport service interface. Redmine time entries are one adapter. A future dedicated rapport backend can be added behind a new `/api/rapport/*` route/service without changing issue storage or core navigation.
