# QA report

Date: 2026-11-04

## Release status

The DerKumpel production baseline including the ticket browser and attachment recovery is on `main`. Follow-up candidate `fix/raster-default-valid-png` repairs four malformed PNG assets and switches the primary MapLibre basemap and offline map downloads to official basemap.de Web Raster tiles.

Automated release gates cover static typing, unit tests, production build, high/critical production dependency audit, Compose validation, Docker image build and a started production-container readiness smoke test. A code candidate must not be merged/released while the latest branch CI is red.

## Automated checks

The CI pipeline verifies:

- API TypeScript typecheck
- Web TypeScript typecheck
- AES-GCM credential-envelope tests, including deterministic tamper detection
- Redmine field/address/coordinate/status projection tests
- normalized custom-field conflict snapshots
- offline-map bounds/tile-limit helpers
- real PNG-header/dimension validation for every branding asset, including 192/512/maskable/Apple-touch/favicon sizes
- basemap raster-style and WMTS tile-order tests
- PWA production build
- `npm audit --omit=dev --audit-level=high`
- `docker compose config --quiet`
- production Docker image build
- production container startup
- `/api/health/ready` from the running container

The earlier manifest/image checks were insufficient: malformed PNG bytes passed CI despite file names and declared dimensions looking correct. The new CI validates the binary PNG signature, IHDR image dimensions and IEND trailer; candidate must pass the complete pipeline before merge.

## Security/architecture review points

Verified in implementation:

- no server-side application database, Redis or central Redmine poller
- Redmine credentials are not stored in localStorage/IndexedDB
- encrypted AES-256-GCM HttpOnly session envelope
- session age is checked server-side
- Secure cookie in production, SameSite Strict
- unsafe cross-origin API requests rejected when Origin is supplied
- explicit Redmine endpoints rather than arbitrary URL proxy
- configured Redmine origin enforced for attachment fetches
- supplied attachment `content_url` is constrained to the configured Redmine origin and attachment URL path before proxying
- Authorization/cookie response data redacted from Fastify logging
- API business responses marked `no-store`
- CSP, frame denial, nosniff, referrer and permissions headers
- current device geolocation is never submitted to the BFF
- account switch/logout removes prior account's offline business cache
- logout is blocked while unsynchronized mutations remain

## Offline/replay review points

Implemented:

- app-shell PWA cache
- issue/attachment IndexedDB cache, including normal browser-tab use after a prior successful load/sync
- durable mutation outbox
- status/field/comment/private-note/photo/attachment offline queue for existing issues
- automatic reconnect/foreground sync
- manual sync action
- append-only comment/attachment retry deduplication
- field-level conflict detection against base values
- normalized custom-field comparison
- permanent Redmine 4xx rejection surfaces as conflict instead of retrying forever
- completed/unassigned/browsed issue cleanup after configurable retention, default 30 days
- pending mutations prevent stale-cache removal
- attachment caching uses the `content_url` already present on issue data rather than requiring a second metadata endpoint
- missing attachment cache entries remain visible, use a bounded retry delay and can be retried individually from the issue when online

## Ticket browser / archive review points

Implemented:

- dedicated `Tickets` destination in desktop and mobile navigation
- `Offen`, `Geschlossen` and `Alle` Redmine status scopes
- tracker and project filters applied server-side against Redmine
- text search over currently loaded results
- 50-item pagination with explicit load-more action
- full issue detail is fetched on demand when opening a result not yet cached
- on-demand browsed/closed tickets are retained locally without being incorrectly promoted into active `Meine Arbeit`
- offline browser fallback uses only locally retained tickets and labels that limitation clearly

## Brand/PWA review points

Implemented:

- actual PNG source and generated 192, 512, maskable 512, Apple-touch 180, favicon 32/64 and wordmark assets have valid headers, correct pixel dimensions and pass an automated release check
- renamed icons with a `-v2` suffix to avoid stale browser/home-screen caches; the four malformed legacy images were removed
- source icon and deterministic Pillow generation script are retained so the branded image suite is reproducible

- user-facing spelling is `DerKumpel`
- login uses the full DerKumpel PNG logo
- header/startup state uses the square PNG brand mark
- browser title/meta use DerKumpel
- PWA manifest exposes 192x192, 512x512 and maskable 512x512 PNG icons
- the previous generic SVG `D` icon is removed
- technical identifiers such as the existing cookie/IndexedDB/Compose names remain stable where renaming would invalidate sessions or caches

## Map review points

Implemented:

- official basemap.de Web **Raster** is the direct primary MapLibre style (no initial vector style request), independently of stale `MAP_STYLE_URL` values
- CSP allows the raster tile host and the service worker caches `/wmts_basemapde/tile/` requests
- opt-in Offline-Karte preload now downloads raster PNG rather than unusable vector PBF files

- ticket markers continue to use Redmine/custom-field coordinates when present
- when the selected scope contains no valid ticket coordinates, the basemap is centered on the Otterbach-Otterberg area instead of leaving an undefined/empty geographic state
- the empty-marker state is explained in the UI
- employee device location remains local-only

## UI/UX polish verification

The Mantine polish expectations remain release requirements:

- cached offline mode opens immediately when `navigator.onLine` is false and a prior user is available; no doomed Redmine round trip blocks startup
- work-list first sync uses skeleton cards instead of an empty spinner-only state
- last successful work-list sync time is visible without adding persistent visual noise
- pending local mutations/conflicts are surfaced on the global Sync navigation item
- screen-reader live regions announce meaningful connection/work-list changes
- `prefers-reduced-motion` and `prefers-contrast: more` have explicit styling behavior
- login disables unusable submit states and explains when connectivity is required
- attachment cards clearly distinguish cached/offline versus not-yet-offline files; missing files expose an online recovery action
- Sync queue entries link back to their issue and distinguish pending/retrying/conflict states
- conflict resolution is guarded against repeated taps while a choice is being applied
- bottom navigation remains touch-friendly with five destinations: Arbeit, Tickets, Karte, Sync, Mehr

## Live acceptance still required before organization-wide rollout

These checks require the real `redmine.vgo-o.de` data/credentials, actual roles/workflows or physical smartphones and therefore cannot be honestly certified by repository CI alone:

1. Login using a normal Bauhof account against the production/staging Redmine instance.
2. Confirm `/users/current.json` exposes the user's real Redmine groups as expected and group-assigned issues appear in `Meine Arbeit`.
3. Confirm all representative trackers/custom fields render correctly, including `Ort`, `Strasse`, `lat`, `lng`, requester data and multi-value fields.
4. Exercise real `redmine_custom_workflows` transitions for at least two different Bauhof roles and verify rejected transitions become visible sync conflicts rather than data loss.
5. Verify private-note permissions with a user allowed to create them and a user not allowed to create them.
6. Verify project membership/assignee lists contain expected users and groups for representative projects.
7. Verify the new `Tickets` browser against real Redmine: closed/open/all scopes, tracker filters, project filters, pagination and opening a closed issue.
8. Specifically retry representative formerly failing attachments such as IDs `676`/`677` through their issue-provided `content_url`; confirm one successful download, local offline availability and no repeated 404 loop.
9. Upload a real camera photo on Android; repeat offline -> airplane mode -> capture -> reopen app -> reconnect -> verify exactly one Redmine attachment.
10. Repeat the critical offline workflow on iOS Safari/PWA if iPhones are deployed.
11. Cache and open representative large image/PDF/office attachments offline; observe browser storage pressure on actual devices.
12. Open DerKumpel in a normal browser tab, synchronize once, disable networking and confirm cached work/attachments remain usable; separately verify installed-PWA behavior.
13. Verify native navigation opens the expected installed map app.
14. Remove coordinates from/currently select a scope without coordinate-bearing issues and verify the map centers sensibly on Otterbach-Otterberg.
15. Verify basemap.de Web Raster PNG tiles load from the final HTTPS origin and optional offline-map download for the configured administrative boundary/radius.
16. Verify favicon, Android install icon, maskable icon and Apple touch icon render from the PNG assets rather than a stale service-worker/SVG cache.
17. Verify external reverse-proxy headers/cookies/HTTPS on the final hostname; if Caddy is used, verify certificate issuance and renewal path.
18. Run a half-day pilot with 2–3 field workers before enabling the client for all ~25 field users.

## Intentional non-blocking future scope

Not part of the current production baseline by explicit product decision:

- full electronic Rapportzettel/timekeeping backend
- Web Push now has an optional device-subscription adapter and a separate Redmine 5.x bridge. It remains opt-in, and staging/live Redmine + real-device verification is required before claiming production delivery.
- online new-issue creation
- richer editing of issue relations/subissues
- imported Redmine saved queries

## Go-live decision rule

Repository/CI readiness is necessary but not sufficient for municipal field deployment. Organization-wide rollout is approved only after the live acceptance items above are completed without a P0 data-loss, authorization, login, offline-replay or camera/attachment defect. A small field pilot should precede the full rollout.


## UI/UX overhaul — November 4, 2026

Branch: `ux/field-app-overhaul`. Mantine 9 / React 19 field-service redesign, no Redmine API schema change.

- DerKumpel navy/green theme, consistent responsive typography, accessible vector icon vocabulary, modern mobile dock and desktop navigation.
- Clear work overview with all/today/overdue quick filters, improved status/urgency cards and semantic date-only calculations.
- Ticket browser controls adapted for narrow screens; stale asynchronous search results guarded by request tokens; additional pages can be loaded even when searching the current result set.
- Simplified action hierarchy for ticket field workers, inline route affordance, timeline styling and explicit on-device save feedback.
- Offline mutation buttons (status, comments, photo, expanded editor) protected against repeated submissions; drafts remain intact when local queue persistence fails.
- Sync Center with clearer status/error/queue hierarchy and guarded manual sync action.
- Settings cache-clear and logout disabled with pending outbox edits, also within destructive confirmations.
- Map fits all available pins and communicates local-only geolocation privacy.
- HTTPS guard on the login form prevents password entry on nonlocal HTTP origins.
- New due-date classification unit tests and extended visual/UX acceptance checklist.

**Automated CI:** Typecheck, unit tests, PNG asset checks, production PWA build, npm audit, Compose validation, Docker image and running-container smoke test. A passing pipeline does not prove pixel-level rendering on every mobile browser; physical-device checks (320/360/390/430 px, sunlight, phone keyboard, offline/online and iOS standalone where used) remain required before a fleet-wide release.


## Opt-in Web Push and ticket/map refinement — November 2026

Branch: `feature/push-ticket-map-ux`.

- Ticket browser toolbar no longer sticks over the scrolling list; search and view switch are compact. Per-device compact list vs cards. Tracker/project filters available only on demand in a bottom drawer.
- Map filter accordion/Collapse persists scope, status, tracker, priority and project, without hiding the map behind a permanent form.
- Optional VAPID Web Push with a private 0600 on-disk device registry persisted through Docker volume, session-bound subscription API, host allowlist and secret-protected event ingestion.
- Workbox service worker imports push click/notification handlers while keeping existing offline shell and map caching. Notification payload intentionally contains only issue ID and event category.
- Redmine 5.x plugin emits events through after-commit Issue/Journal callbacks via ActiveJob. It enforces Redmine visibility, current assignee/group membership and private-note roles. Notifications are opt-in and do not replace normal offline/client sync.
- Node CI tests input validation and builds the delivery code; Ruby static syntax checks run. **Cannot verify real push delivery, Redmine plugin registration/role model or iOS PWA behavior without deployment + pilot**; see `docs/PUSH_NOTIFICATIONS.md`.
