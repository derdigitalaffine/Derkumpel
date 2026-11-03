# QA report

Date: 2026-11-03

## Release status

The Derkumpel production baseline is implemented on `work/initial-production`. Automated release gates cover static typing, unit tests, production build, high/critical production dependency audit, Compose validation, Docker image build and a started production-container readiness smoke test.

A code candidate must not be merged/released while the latest branch CI is red. Dependency resolution is committed in `package-lock.json`; CI and Docker both use `npm ci` so the tested and deployed dependency graph is reproducible.

## Automated checks

The CI pipeline verifies:

- API TypeScript typecheck
- Web TypeScript typecheck
- AES-GCM credential-envelope tests, including deterministic tamper detection
- Redmine field/address/coordinate/status projection tests
- normalized custom-field conflict snapshots
- offline-map bounds/tile-limit helpers
- PWA production build
- `npm audit --omit=dev --audit-level=high`
- `docker compose config --quiet`
- production Docker image build
- production container startup
- `/api/health/ready` from the running container

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
- Authorization/cookie response data redacted from Fastify logging
- API business responses marked `no-store`
- CSP, frame denial, nosniff, referrer and permissions headers
- current device geolocation is never submitted to the BFF
- account switch/logout removes prior account's offline business cache
- logout is blocked while unsynchronized mutations remain

## Offline/replay review points

Implemented:

- app-shell PWA cache
- issue/attachment IndexedDB cache
- durable mutation outbox
- status/field/comment/private-note/photo/attachment offline queue for existing issues
- automatic reconnect/foreground sync
- manual sync action
- append-only comment/attachment retry deduplication
- field-level conflict detection against base values
- normalized custom-field comparison
- permanent Redmine 4xx rejection surfaces as conflict instead of retrying forever
- incomplete attachment caching (quota/network/etc.) is visible in Sync Center and retried on subsequent sync
- completed/unassigned issue cleanup after configurable retention, default 30 days
- pending mutations prevent stale-cache removal

## Redmine behavior verified by API contract

- current-user responses support `groups`/`memberships`, which Derkumpel uses for personal + group assignment scope
- issue details support `allowed_statuses` in Redmine 5.0.x, so workflow-valid status choices come from Redmine rather than a Derkumpel copy
- issue priorities are loaded from Redmine enumeration order and displayed high-to-low for the `Priorität` sort
- full custom-field definitions/options are not assumed for normal users; generic field editing remains permission-safe because Redmine validates every write

## Live acceptance still required before organization-wide rollout

These checks require the real `redmine.vgo-o.de` data/credentials, actual roles/workflows or physical smartphones and therefore cannot be honestly certified by repository CI alone:

1. Login using a normal Bauhof account against the production/staging Redmine instance.
2. Confirm `/users/current.json` exposes the user's real Redmine groups as expected and group-assigned issues appear in `Meine Arbeit`.
3. Confirm all representative trackers/custom fields render correctly, including `Ort`, `Strasse`, `lat`, `lng`, requester data and multi-value fields.
4. Exercise real `redmine_custom_workflows` transitions for at least two different Bauhof roles and verify rejected transitions become visible sync conflicts rather than data loss.
5. Verify private-note permissions with a user allowed to create them and a user not allowed to create them.
6. Verify project membership/assignee lists contain expected users and groups for representative projects.
7. Upload a real camera photo on Android; repeat offline -> airplane mode -> capture -> reopen app -> reconnect -> verify exactly one Redmine attachment.
8. Repeat the critical offline workflow on iOS Safari/PWA if iPhones are deployed.
9. Cache and open representative large image/PDF/office attachments offline; deliberately approach browser storage limits and verify Sync Center reports any missing offline file.
10. Verify native navigation opens the expected installed map app.
11. Verify basemap.de Web Vektor from the final HTTPS origin and optional offline-map download for the configured administrative boundary/radius.
12. Verify external reverse-proxy headers/cookies/HTTPS on the final hostname; if Caddy is used, verify certificate issuance and renewal path.
13. Run a half-day pilot with 2–3 field workers before enabling the client for all ~25 field users.

## Intentional non-blocking future scope

Not part of the current production baseline by explicit product decision:

- full electronic Rapportzettel/timekeeping backend
- true Web Push while the PWA is completely closed (requires a separate durable subscription/event adapter because the core BFF is intentionally stateless)
- online new-issue creation
- richer editing of issue relations/subissues
- imported Redmine saved queries

## Go-live decision rule

Repository/CI readiness is necessary but not sufficient for municipal field deployment. Organization-wide rollout is approved only after the live acceptance items above are completed without a P0 data-loss, authorization, login, offline-replay or camera/attachment defect. A small field pilot should precede the full rollout.
