# Acceptance tests

## Authentication

- valid Redmine account can login
- invalid credentials return generic login failure
- app code cannot read credential cookie
- password change causes next online API call to require login
- no credential appears in IndexedDB/localStorage

## Offline shell and cache

- after one online load, app starts with network disabled, also when previously used as a normal browser tab rather than an installed homescreen PWA
- cached personal/group issues render without API
- cached image and non-image attachment can be accessed offline
- attachment caching uses the issue attachment `content_url` and does not require a second `/attachments/:id.json` lookup when that URL is already known
- a missing/non-cached attachment is clearly marked and can be retried manually when connectivity returns
- repeated attachment download failures do not cause a tight repeated-request loop
- completed/unassigned cache older than retention is removed only when no pending mutation exists

## Ticket browser / archive

- navigation exposes a dedicated `Tickets` surface separate from `Meine Arbeit`
- browser can switch between open, closed and all visible Redmine tickets
- tracker and project filters are passed to Redmine and affect results
- text search filters the currently loaded result set; search/filter toolbar is non-sticky and never obscures issue rows on 320–430px devices
- compact/card view switch defaults to compact, remains persisted on this device, preserves Redmine statuses and opens detail by tapping any row
- project/tracker selectors are in a collapsible bottom drawer rather than permanently consuming vertical list space
- result loading is paginated and exposes a clear load-more action while more results exist
- opening a visible result not yet in IndexedDB fetches its complete issue detail and stores it locally
- browsing a closed ticket does not incorrectly make it an active `Meine Arbeit` ticket
- while offline, the browser shows only matching locally cached issues and labels this limitation

## Offline mutations

- offline status change survives page reload
- offline comment survives page reload and app restart
- offline captured photo is stored before navigation away
- reconnect replays outbox automatically
- manual `Jetzt synchronisieren` triggers replay
- successful replay removes/marks outbox item without losing timeline entry

## Conflict

- append-only remote comment does not block local independent field change
- remote change to a different field auto-merges
- remote change to same status/assignee field creates conflict
- remotely closed issue is never silently reopened by stale local state

## UI / brand

- AppShell uses consistent vector icons on mobile/desktop navigation with labelled 48px+ tap targets
- `Meine Arbeit` quick filters show all/due-today/overdue counts; selection and clear/reset stay consistent with structured filters
- Ticket cards show readable status, title, address, date and assignee at 320px with no clipping
- Ticket-browser project/tracker selectors stack on narrow phones, and stale fetches cannot overwrite a newer filter choice
- Loading an uncached ticket uses a skeleton and provides an explicit retry after failure
- Status/notes/photos/advanced-form saves are guarded against double submission, and unsuccessful saves preserve drafts
- HTTPS is enforced by the login form for non-localhost devices, with a readable explanation when opened through HTTP
- Settings never permit clearing business cache while local outbox entries exist, including after opening the delete dialog
- Map fits two or more coordinate-bearing tickets; single and zero-pin maps keep their respective correct centers

- 360px viewport has no horizontal scroll in home/tickets/detail/login/settings
- every issue opens with advanced details collapsed
- simple view contains title, status, priority, assignee, dates, location/address, percent, description and primary actions when values/actions exist
- primary actions are touch-sized
- watcher-only issues are absent from `Meine Arbeit`
- user-facing product name is `DerKumpel`
- login uses the full PNG logo; header/start state use the square brand mark
- manifest contains *valid* versioned PNG 192x192, 512x512 and maskable icons, plus 180x180 Apple touch and favicons; release validation checks PNG headers, dimensions and IEND bytes, and the removed generic SVG icon is not referenced

## Real Web Push (when opted in)

- API starts normally with `PUSH_ENABLED=false` and without any push secrets/database on an existing deployment.
- Push-enabled startup rejects absent/invalid secrets, absent VAPID keys or HTTP PUBLIC_BASE_URL.
- One device can opt in only with a user gesture; iOS 16.4+ requires Home Screen install.
- Server binds each subscription to the actual Redmine login; local notification switches sync to that device's subscription.
- VAPID test arrives when app is minimized/closed; tapping notification opens the correct `/issues/:id` route.
- New personal/group assignment, status change including closure, another user comment, priority and date changes notify, with first enrollment only baselining.
- A Redmine role that cannot read an issue or private journal never receives its details in push. Lock-screen text contains no ticket subject/description/private notes.
- Changed/invalid Redmine password revokes stored encrypted credentials and device subscriptions after the next failed poll.
- Device unsubscribe removes the endpoint and deletes stored credentials once the account has no devices left.
- Invalid/untrusted subscription endpoints (localhost, internal networks, HTTP, forged domains) are rejected to prevent SSRF.
- Push database and secrets persist across container recreation, but never appear in source/logs.
- New service worker preserves offline navigation, cached issue/attachment data, raster offline maps and disabled API response caching.

## Map/privacy

- Map filters are collapsed by default, remember tracker/status/priority/project/due selections and never obscure the base map when closed.
- Selecting no map results shows the Otterbach–Otterberg raster fallback with an actionable explanation.

- map uses basemap.de Web Raster by default, without requiring a vector-style network request; browser CSP and service-worker caching allow its WMTS PNG tiles
- optional Offline-Karte prefetch downloads exactly the same raster PNG tile URLs used by the visible map
- map uses ticket coordinates
- when current scope has no valid ticket coordinates, map centers on Otterbach-Otterberg and explains the empty marker state
- requesting device location does not send it to `/api`
- navigation opens an external/native handler
- offline map cache is off by default

## Deployment

- `docker compose up -d --build` starts healthy app without database
- default bind address is loopback
- optional Caddy profile starts proxy
- `/api/health/live` and `/api/health/ready` succeed
