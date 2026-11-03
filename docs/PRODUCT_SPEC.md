# Product specification

## Context

DerKumpel is a specialized mobile-first client for `redmine.vgo-o.de` used by a municipal Bauhof. Roughly 120 people use Redmine; about 25 employees work in the field. Team composition changes by assignment. Redmine groups can be assignees and every group member must be able to see and edit group-assigned work according to Redmine permissions.

Target Redmine environment:

- Redmine 5.0.5.stable
- REST API enabled
- MySQL backend (DerKumpel does not access it directly)
- Plugins: `redmine_custom_workflows` 2.0.8, `redmine_issue_templates` 1.1.1, `view_customize` 3.3.0

## Product goal

Field staff should rarely need the classic Redmine UI. DerKumpel provides a purpose-built touch UI while preserving Redmine behavior, permissions and workflows.

## Authentication

Users sign in with their existing Redmine username/password. A stateless BFF validates credentials with Redmine and stores an encrypted credential/session envelope in a Secure, HttpOnly cookie. Credentials must never be stored in localStorage or IndexedDB. When online, sync calls revalidate against Redmine; a changed/invalid password forces reauthentication. Offline cached work remains readable during a temporary network outage.

## My work

The home screen is `Meine Arbeit`, not a generic dashboard. It contains open issues assigned directly to the user plus open issues assigned to groups the user belongs to. Watcher-only issues are excluded.

Sorting is user-configurable: priority, start/due date, distance when coordinates and local location are available, and last update. Users can save local filters. All trackers are supported; users can explicitly exclude trackers in settings.

## Ticket browser / archive

`Tickets` is a separate browse surface for work that is not necessarily part of `Meine Arbeit`. It must support:

- `Offen`, `Geschlossen` and `Alle` status scopes;
- tracker filtering;
- project filtering;
- text search across the currently loaded results;
- paginated loading rather than downloading the complete Redmine history at once;
- opening any issue Redmine allows the current user to see.

The browser follows Redmine permissions and does not add its own authorization layer. Online, list results are loaded on demand from Redmine. Opening a result fetches the full issue and places it in the local cache. Offline, the browser falls back to tickets already cached on that device and clearly labels that limitation. Browsed/closed tickets use the normal configurable cache-retention policy; they are not promoted into the active `Meine Arbeit` set unless Redmine actually assigns them to the user/group and they are open.

## Issue detail

Every issue opens in simple mode. Always surface when present:

- subject/title
- status
- priority
- assigned to
- start date and due date
- percent done
- location/address
- description
- primary actions

Primary actions include workflow-permitted variants of `In Arbeit`, `unterbrochen`, `Erledigt`, comment, photo, time booking and navigation. The actual available status transitions remain controlled by Redmine.

An expandable advanced area exposes all additional data that Redmine returns and the current user may see/edit, including tracker-specific custom fields. The visual base structure stays consistent across trackers.

Known status IDs/names include: `1 Neu`, `2 In Arbeit`, `3 Erledigt`, `4 Bitte Rücksprache`, `6 abgelehnt`, `7 Neu erfasst`, `8 Auftrag erteilt`, `9 Auftrag erledigt`, `10 unterbrochen`, `11 zur Genehmigung`, `12 genehmigt - zur Disposition`.

Known tracker-dependent fields may include Ort, Strasse, Hausnummer, Anfragekategorie, lat, lng, uuid, Meldender Vorname, Meldender Nachname, Meldender E-Mail, Meldender Telefon and Bild. The implementation must remain dynamic rather than hard-coding a tracker form.

## Timeline

Use a modern field-work timeline. Normal mode shows operationally relevant comments, private notes, status changes and attachments/photos. Technical field churn is collapsed under `Weitere Änderungen`.

Private notes are supported when Redmine permits them.

## Relationships

Support subissues and issue relations. Watcher management is intentionally out of scope.

## Attachments and camera

- Existing images and non-image attachments are cached for offline use.
- Image cache uses optimized copies to reduce storage/bandwidth.
- Attachment downloads use the `content_url` already supplied by Redmine issue data; do not require a second attachment-metadata lookup when the URL is known.
- A failed offline-cache download remains visible and can be retried explicitly from the issue while online.
- Repeated failures use a bounded retry/backoff path rather than hammering the same missing resource continuously.
- Camera flow: capture -> preview -> discard/use.
- No mandatory photo caption.
- Before upload, images are compressed/resized while preserving EXIF where the source/type permits.
- Non-image attachments are handed to the mobile operating system for opening.

## Offline requirements

After one successful online login, the app can open and work during outages lasting minutes to several hours/roughly half a workday. Installation to the home screen is not required for IndexedDB/offline work: the same web app may be used in a normal browser tab, provided it has previously loaded and synchronized successfully. Installation remains recommended for the best standalone UX.

On startup/foreground, sync all currently open personal/group-assigned issues plus necessary details and attachments. Existing issues can be edited offline except initial new-issue creation. Offline operations are stored in an IndexedDB outbox. Photos must be persisted locally immediately before sync.

Synchronization is automatic on reconnect/foreground and also available through a manual sync button. Pending counts/details appear in a dedicated sync view rather than constantly occupying the main UI.

Conflict policy:

- append-only comments/notes/attachments: replay automatically;
- independent field changes: merge when server revision shows no overlapping field change;
- overlapping field/status/assignee changes: preserve local mutation and show a conflict-resolution UI;
- never reopen/overwrite a materially changed or closed issue silently.

Cache retention: completed/unassigned issues default to 30 days, configurable per user. Provide `Offline-Daten jetzt löschen`.

## Polling

Each active client may poll through the BFF for Redmine changes. Do not build a central poller. Poll interval defaults to 120 seconds and must not be more frequent than configured minimum policy.

## Maps

- MapLibre GL map.
- basemap.de Web Vektor default online basemap.
- Ticket markers use lat/lng when available.
- Filters allow own/group work and optionally all visible open issues.
- If the current map scope contains no valid ticket coordinates, keep the map useful by centering it on the Verbandsgemeinde Otterbach-Otterberg instead of presenting a blank/undefined geographic state.
- Current employee position is optional and local-only.
- `Navigation` opens the native maps/navigation app.
- Optional offline map caching is disabled by default. Preferred download extent is a configured municipality/administrative boundary; fallback is configurable radius.

## Brand and PWA identity

The product name is written **DerKumpel** in all user-facing UI and documentation. Technical identifiers that would break stored sessions/caches when renamed may remain lowercase/internal. Branding uses PNG assets: a full DerKumpel word/logo lockup for prominent surfaces and square 192/512/maskable variants for favicon, Apple touch icon and PWA installation.

## Push

Web Push is desired for personal and group assignment, status changes, comments, priority changes and date changes. Users can disable categories in settings. Tapping a notification deep-links to the issue. Because the BFF is stateless and Redmine 5 has no assumed event stream, push delivery is an integration seam: the initial deployment exposes subscription capability/configuration but must not invent a durable subscription store in the BFF.

## New issues

Online issue creation should be supported so field workers rarely need classic Redmine. Offline new issue creation is not part of the initial offline guarantee.

## Future Rapportzettel

A complete electronic Rapportzettel/timekeeping system is planned later and may require a different backend. Current `Zeit buchen` can integrate Redmine time entries, but architecture must allow a future separate module/service without rewriting the PWA shell, identity or issue client.
