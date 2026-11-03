# Implementation decisions

## 2026-11-03 — Redmine-first

Redmine remains the system of record. No server-side mirror DB is introduced.

## 2026-11-03 — Stateless BFF

Use a stateless BFF for credential isolation, CORS avoidance, controlled Redmine API surface and future integration seams. Do not add Redis/database sessions.

## 2026-11-03 — Encrypted cookie credential envelope

The user approved an encrypted HttpOnly cookie so the BFF can re-authenticate each online sync without exposing credentials to PWA JavaScript. `SESSION_SECRET` rotation invalidates sessions.

## 2026-11-03 — Offline in IndexedDB

Issue snapshots, attachments, preferences and queued mutations live on-device in IndexedDB/Dexie. Credentials never do.

## 2026-11-03 — Client polling

No central poller. Active clients refresh via BFF, default every 120 seconds.

## 2026-11-03 — Map

MapLibre + basemap.de Web Vektor. Device location is optional/local-only. Offline map cache is opt-in and disabled by default.

## 2026-11-03 — EXIF

Do not intentionally strip EXIF/GPS. Upload compression must preserve metadata where technically supported. This is different from the costume-contest project and is intentional.

## 2026-11-03 — Future Rapportzettel

Do not build it now. Keep a service boundary so a dedicated time/rapport backend can be added later.
