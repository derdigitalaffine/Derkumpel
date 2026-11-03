# Development

## Prerequisites

- Node.js 24
- npm 11+
- Docker Engine + Compose v2 for production-path verification

## Install

```sh
npm install
```

## Development

The production application is same-origin: Fastify serves the built PWA and `/api`. During frontend work, Vite can proxy `/api` to a locally running BFF.

For the normal full build/test loop:

```sh
npm run typecheck
npm test
npm run build
```

The API requires at least:

```sh
export REDMINE_BASE_URL=https://redmine.vgo-o.de
export PUBLIC_BASE_URL=http://localhost:8080
export SESSION_SECRET="$(openssl rand -base64 32)"
```

Then start the built API with:

```sh
npm run start
```

## Production-path verification

```sh
cp .env.example .env
# replace SESSION_SECRET and PUBLIC_BASE_URL with valid values
docker compose config --quiet
docker compose build app
docker compose up -d app
curl --fail http://127.0.0.1:8080/api/health/ready
```

The GitHub Actions workflow performs typecheck, unit tests, production build, production dependency audit at high severity, Compose validation, Docker build and an actual container readiness smoke test.

## Offline development rules

Do not use Service Worker HTTP caching as the source of truth for issue data. Issue data, attachment blobs, preferences and mutations belong in IndexedDB/Dexie. Credentials must never be written there.

When adding an offline mutation:

1. persist it to the outbox before reporting success;
2. make the mutation replay-safe or deduplicatable;
3. record the base values needed for conflict detection;
4. distinguish permanent Redmine rejection from transient transport failure;
5. never drop a mutation silently;
6. add a regression test for conflict/replay helpers where practical.

## Redmine compatibility

The application targets Redmine 5.0.5 behavior in the current deployment. Keep the adapter explicit and avoid depending on plugin-internal endpoints. `redmine_custom_workflows` remains authoritative because all writes still go through Redmine itself.

Some Redmine metadata endpoints, notably full custom-field definitions/options, require administrator permissions. Do not add a hidden administrator service account just to populate mobile controls. Use data visible to the current user and generic fallbacks, and let Redmine validate writes.

## Device acceptance

Before a release reaches all field workers, test the candidate on at least one current Android Chrome device and one iPhone/Safari device when iOS is in scope. Cover camera capture, PWA installation, several minutes of airplane-mode work, reconnect/replay, attachment opening and native navigation.
