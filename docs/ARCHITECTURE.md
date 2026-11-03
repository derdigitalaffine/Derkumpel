# Architecture

## Shape

Derkumpel is a two-part application delivered as one container:

1. React/Mantine PWA (`apps/web`)
2. stateless Fastify BFF (`apps/api`)

The BFF serves the built PWA and same-origin `/api/*`. It does not have a database.

## Redmine authority

Redmine is the sole durable authority for issue data, users, groups, permissions, workflows, trackers, statuses, custom fields, journals, relations and attachments. The BFF uses the public Redmine REST API only. It does not access the Redmine database.

## Authentication

Login posts username/password over HTTPS to the BFF. The BFF verifies them against `/users/current.json`, then encrypts a credential envelope with AES-256-GCM and stores only the ciphertext in a Secure HttpOnly cookie. The browser application cannot read the password. On API calls, the BFF decrypts in memory, calls Redmine using Basic Authentication, and discards plaintext after the request.

The BFF remains stateless. Key rotation is operational: changing `SESSION_SECRET` invalidates existing online sessions and requires login.

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

## PWA caching

The service worker precaches the application shell. API data is not blindly cached by Workbox; authoritative offline data lives in IndexedDB. Static map assets may use runtime caching. Offline map tiles are a separate opt-in cache with explicit storage/budget controls.

## Map

MapLibre loads the basemap.de Web Vektor style online. Issue coordinates come from Redmine custom fields. Native navigation uses a platform URL handler. User geolocation never leaves the device.

## Deployment

Default Compose publishes the app on `${BIND_ADDRESS:-127.0.0.1}:${APP_PORT:-8080}`. External reverse proxy terminates TLS.

Optional `caddy` profile publishes 80/443 and reverse-proxies to the app. No database, broker or shared cache is required.

## Future Rapportzettel seam

The PWA domain layer exposes a time/rapport service interface. Redmine time entries are one adapter. A future dedicated rapport backend can be added behind a new `/api/rapport/*` route/service without changing issue storage or core navigation.
