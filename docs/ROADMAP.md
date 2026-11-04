# Roadmap

## Implemented production baseline

- stateless encrypted-credential core BFF; optional opt-in SQLite push module, no Redis
- Redmine issue/user/group/meta/attachment adapter
- installable React/Mantine PWA
- IndexedDB issue/attachment cache
- durable offline outbox for existing issue updates, comments/private notes and attachments/photos
- reconnect/foreground/manual sync
- safe auto-merge plus visible material conflicts
- `Meine Arbeit` for personal + group assignments
- touch-first simple issue mode and expandable full-data mode
- full allowed status list, priority, assignment, dates, `% erledigt` and dynamic Custom Fields
- camera -> preview -> compressed attachment upload/cache
- cached image and non-image attachments
- modern operational timeline + collapsed technical history
- MapLibre + basemap.de Web Raster, local-only device position and native navigation
- own/all-visible map scope
- optional municipality-bounds/radius offline map cache, disabled by default
- saved local filters and tracker exclusions
- real optional Web Push with VAPID, per-device event preferences, SQLite subscriber store, encrypted per-user credentials, status/closure/assignment/comment/priority/date events and service-worker deep links
- 30-day configurable cache retention + manual local purge
- safe logout/account cache isolation
- Compose deployment, external proxy default, optional Caddy profile
- one-command setup helper
- CI typecheck/tests/build/production dependency audit/Compose validation/container runtime smoke test
- health endpoints and security headers

## P1 — deliberately after field pilot

- online new-issue creation
- richer relationship/subissue editing (current baseline displays them)
- attachment storage budget UI/eviction warnings for unusually large workloads
- import/use of saved Redmine queries where the Redmine 5 API permits it cleanly
- more specialized editors for enumerated/custom field formats where metadata is available to the current Redmine user
- map clustering/work-planning refinements when real ticket density warrants them

## Optional Web Push deployment / pilot

- Enable the server push adapter only on request using `./setup.sh push-enable`, and back up its own stable VAPID/encryption secrets.
- Validate real Redmine group assignments, transitions including closed tickets and journal visibility with ordinary Bauhof roles.
- Confirm notifications on Android when app is closed and on an iOS 16.4+ installed Home Screen PWA (if applicable).
- Observe Redmine request volume for up to 25 subscribed employees; push is best-effort and polls no faster than every 120 seconds.

The core application still works without the SQLite push volume because Push is **disabled by default**.

## Future separate capability

- full electronic Rapportzettel/timekeeping system with a dedicated backend if Redmine is insufficient

The current application shell, identity/session model and issue client must remain reusable by that future module.
