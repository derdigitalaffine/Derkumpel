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

## Plugin-free Redmine REST polling push

- setup offers a clearly selected `--push-mode polling` and `--push-mode plugin`, with interactive choice when a terminal is present
- polling mode requires HTTPS and validates an administrator Redmine REST API key without leaking it in shell arguments or logs
- plugin mode still installs the existing Redmine bridge (including remote Docker via SSH) and never launches the REST poller
- first polling run creates a durable cursor in the push volume and **does not send historic issue notifications**
- polling detects assigned group issues, status, priority, date and comment changes through Redmine issue journals
- before sending, administrator API impersonation must resolve to the target user and that user must see the issue; fail closed otherwise
- a private note is sent only if the impersonated user sees its exact journal ID; no note text, subjects or coordinates enter the notification payload
- polling skips events authored by the recipient, does not notify watchers-only recipients and handles inactive/deleted accounts conservatively
- polling mode refuses direct plugin event webhook delivery, preventing two sources from running at once
- on transient Redmine errors, existing cursor is not advanced; stale multi-day backlog is intentionally discarded rather than replaying old notifications
- switching polling → plugin clears `PUSH_POLL_API_KEY` from active environment; push subscriptions and VAPID keys remain intact
- REST polling is best effort and needs testing against actual Redmine 5.x with its third-party workflows

## Linux automated Push setup

- `./setup.sh push --help` documents local native Redmine, Docker Compose, SSH remote and app-only modes
- Linux install reuses VAPID keys and webhook secret on rerun, preserving SESSION_SECRET and every non-Push `.env` value
- `.env` stays owner-only (`0600`); no private VAPID key or webhook token appears in console logs or checked-in files
- unsafe `PUBLIC_BASE_URL=http://...`, incomplete keys and malformed SSH targets are rejected without overwriting stored secrets
- native Redmine systemd installer creates a root-readable EnvironmentFile, copies the plugin and restarts the selected unit
- Redmine Compose installer adds a persistent plugin bind mount and root-protected env file without overwriting unrelated existing Compose overrides
- SSH remote mode transfers the plugin and token only over SSH and requires an authorized remote sudo account; temporary upload files are removed
- `--app-only` explicitly reports that Redmine events are not enabled until the separate Redmine adapter is installed

## Push notifications (with configured Redmine bridge and HTTPS)

- push disabled on a fresh unconfigured server, normal offline-first behavior is unchanged
- user manually enables push in settings and grants browser permission; no automatic permission prompt on page load
- Android and installed iOS PWA receive notification for other user assignment/status/comment/priority/date updates
- group issue assignment notifies eligible members; watcher-only or unauthorized users receive none
- private notes never go to users lacking Redmine `view_private_notes`
- lock-screen notification contains event kind + issue number, never subject, location, phone, photo or notes
- tapping push opens the affected issue and obeys current Redmine authentication/visibility
- disabling push, logging out and switching Redmine accounts prevent stale device subscriptions from delivering another account's events
- subscription endpoints must be HTTPS URLs at approved browser push providers; arbitrary URLs are rejected
- duplicate event IDs do not generate duplicate pushes and push endpoint expiration is handled
- VAPID keys persist through deployment; subscriber volume persists across app image upgrades
- the existing service worker keeps offline shell, cached attachments and map tiles functional with push handlers installed

## Ticket browser / archive

- navigation exposes a dedicated `Tickets` surface separate from `Meine Arbeit`
- browser can switch between open, closed and all visible Redmine tickets
- tracker and project filters are passed to Redmine and affect results
- text search filters the currently loaded result set
- compact list and spacious card view toggle on the same results, remembered per device
- tracker/project search filters are hidden in the bottom drawer until asked for, leaving the ticket list visible
- no permanently sticky multi-row browser toolbar obscures the list at 320px
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

## Map/privacy

- map uses basemap.de Web Raster by default, without requiring a vector-style network request; browser CSP and service-worker caching allow its WMTS PNG tiles
- optional Offline-Karte prefetch downloads exactly the same raster PNG tile URLs used by the visible map
- map filters expand/collapse by user action and offer local tracker, status, priority, project and own/all scope
- map filters persist on the device, can reset and are applied before rendering pins
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
