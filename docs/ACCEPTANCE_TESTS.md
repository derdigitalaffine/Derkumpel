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
- text search filters the currently loaded result set
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

- 360px viewport has no horizontal scroll in home/tickets/detail/login/settings
- every issue opens with advanced details collapsed
- simple view contains title, status, priority, assignee, dates, location/address, percent, description and primary actions when values/actions exist
- primary actions are touch-sized
- watcher-only issues are absent from `Meine Arbeit`
- user-facing product name is `DerKumpel`
- login uses the full PNG logo; header/start state use the square brand mark
- manifest contains PNG 192x192, 512x512 and maskable icons and does not depend on the removed generic SVG icon

## Map/privacy

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
