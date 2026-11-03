# Roadmap

## Implemented production baseline

- stateless encrypted-credential BFF, no application database or Redis
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
- MapLibre + basemap.de Web Vektor, local-only device position and native navigation
- own/all-visible map scope
- optional municipality-bounds/radius offline map cache, disabled by default
- saved local filters and tracker exclusions
- notification-category preferences prepared for external push integration
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

## P2 — separate integration adapter

- true Web Push while the PWA is fully closed
- durable push-subscription storage and Redmine event detection/delivery
- deep-link notifications for assignment/group assignment, status, comment, priority and date changes

The push adapter remains separate because the core BFF is intentionally stateless and Redmine 5.0.5 does not provide the required durable browser push-subscription store/event stream by itself.

## Future separate capability

- full electronic Rapportzettel/timekeeping system with a dedicated backend if Redmine is insufficient

The current application shell, identity/session model and issue client must remain reusable by that future module.
