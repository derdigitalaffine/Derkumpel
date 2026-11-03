# AGENTS.md

## Mission

Build Derkumpel as a reliable, offline-first, touch-first Redmine client for municipal field work. Redmine remains the system of record. The app should make normal Bauhof work possible without routinely opening the classic Redmine UI.

## Read first

Before changing code, read in order:

1. `README.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/ARCHITECTURE.md`
4. `docs/SECURITY_PRIVACY.md`
5. `docs/USER_FLOWS.md`
6. `docs/DESIGN_SYSTEM.md`
7. `docs/ROADMAP.md`
8. `docs/ACCEPTANCE_TESTS.md`
9. `docs/IMPLEMENTATION_DECISIONS.md`

If code and specification conflict, do not silently invent product behavior. Prefer Redmine semantics and the safer offline behavior, document the conflict, then update tests/specification together.

## Product invariants

- Redmine 5.0.5 is the authoritative system for users, permissions, groups, issues, workflows, trackers, statuses and custom fields.
- Do not introduce a parallel issue database.
- The backend/BFF is stateless; durable application state belongs in Redmine or the user's local PWA cache.
- The PWA must remain usable offline for existing synchronized issues for several hours/up to roughly half a workday.
- Offline editing covers existing issues: fields, status, assignee, comments/private notes, attachments/photos and Redmine time entries where supported. New issue creation is online-only for the initial product.
- Never silently discard an offline mutation. Every queued mutation reaches `synced`, `retrying`, or `conflict` state.
- Auto-merge safe changes. Surface only material conflicts that cannot be safely replayed.
- All Redmine permissions/workflow decisions are authoritative. Derkumpel must not grant operations Redmine would reject.
- Personal and group assignments count as “my work”. Watcher-only issues do not.
- Every issue opens in simple mode. Full Redmine-visible data is available in an expandable advanced section.
- Location access is local-only for map orientation/navigation. Do not upload or persist employee location to Redmine.
- Image compression may preserve EXIF; do not deliberately strip EXIF/GPS metadata.
- Future electronic Rapportzettel/timekeeping may use a separate backend. Do not couple the current architecture so tightly to Redmine that this becomes impossible.

## UX invariants

- Smartphone-first, portrait-first, one-hand usable.
- Primary actions are at least 48px high; important controls target 52–56px.
- No hover-only interaction.
- Simple issue mode always shows title, status, priority, assignee, start/due date, location/address, percent done, description and primary actions when available.
- Primary issue actions: In Arbeit, unterbrochen, Erledigt, Kommentar, Foto, Zeit buchen and Navigation. Actions must be permission/workflow aware.
- Less important history and technical field changes are collapsed under an advanced expander.
- Sync details live in a dedicated subview, not as constant visual noise.
- Offline/online state must be understandable without alarming the user.

## Engineering constraints

- TypeScript throughout.
- React + Mantine for the PWA.
- IndexedDB via Dexie for offline data/outbox.
- MapLibre for the map, basemap.de Web Vektor as default online style.
- Docker Compose deployment.
- One stateless application container by default; optional Caddy Compose profile.
- External reverse proxy must be supported as the default production pattern.
- Do not require Redis, PostgreSQL or another service for the initial product.
- Same-origin `/api` BFF in production.
- No Redmine password/API secret in localStorage or IndexedDB.
- Production secrets are environment variables, never committed.

## Tests and definition of done

A change is done only when:

- acceptance criteria for the changed flow pass;
- `npm run build` succeeds;
- automated tests succeed;
- the Docker image builds;
- mobile UI remains usable at 360px width;
- offline mutations are durable across reload;
- new configuration is documented;
- no real credentials, personal data or Redmine exports are committed.

Prefer small coherent changes. Commit/PR text should state behavior, config changes, tests and known limitations.
