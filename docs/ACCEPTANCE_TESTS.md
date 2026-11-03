# Acceptance tests

## Authentication

- valid Redmine account can login
- invalid credentials return generic login failure
- app code cannot read credential cookie
- password change causes next online API call to require login
- no credential appears in IndexedDB/localStorage

## Offline shell and cache

- after one online load, app starts with network disabled
- cached personal/group issues render without API
- cached image and non-image attachment can be accessed offline
- completed/unassigned cache older than retention is removed only when no pending mutation exists

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

## UI

- 360px viewport has no horizontal scroll in home/detail/login/settings
- every issue opens with advanced details collapsed
- simple view contains title, status, priority, assignee, dates, location/address, percent, description and primary actions when values/actions exist
- primary actions are touch-sized
- watcher-only issues are absent from `Meine Arbeit`

## Map/privacy

- map uses ticket coordinates
- requesting device location does not send it to `/api`
- navigation opens an external/native handler
- offline map cache is off by default

## Deployment

- `docker compose up -d --build` starts healthy app without database
- default bind address is loopback
- optional Caddy profile starts proxy
- `/api/health/live` and `/api/health/ready` succeed
