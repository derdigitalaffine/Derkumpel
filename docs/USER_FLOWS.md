# User flows

## Login and offline return

1. User opens DerKumpel online and logs in using Redmine username/password.
2. BFF validates Redmine and issues encrypted HttpOnly session cookie.
3. PWA synchronizes `Meine Arbeit` and attachments.
4. Later in a dead zone, app shell and IndexedDB load immediately without a server roundtrip. This also works after prior use in a normal browser tab; homescreen installation is not a prerequisite for the local cache.
5. User can work on cached issues; queued changes are clearly local in the sync subview.
6. On reconnect/foreground, sync resumes automatically.

## Meine Arbeit

1. Home opens directly to assigned work.
2. Default scope: personal + group assignments, open issues only.
3. Search/filter/sort controls are reachable without leaving the screen.
4. User may save local filters and exclude trackers in Settings.
5. Opening a card goes to simple issue view.

## Tickets / archive

1. User opens `Tickets` from the main navigation.
2. Scope can be switched between `Offen`, `Geschlossen` and `Alle`.
3. Tracker and project filters narrow the Redmine result set; a text field searches currently loaded rows.
4. Results arrive in pages and `Weitere laden` fetches the next page.
5. Opening a ticket not yet cached fetches its full Redmine details, stores it locally, and opens the normal issue view.
6. A browsed ticket stays outside `Meine Arbeit` unless Redmine itself makes it an open personal/group assignment.
7. Offline, `Tickets` falls back to the retained local cache and clearly states that only locally known tickets can be shown.

## Issue simple mode

1. Header shows issue number, title, status and priority.
2. Operational facts show assignee, dates, percent, location/address.
3. Description is readable without entering advanced mode.
4. Large actions expose valid workflow transitions plus comment, photo, time and navigation.
5. Timeline shows operationally relevant events.
6. `Alle Angaben` expands full dynamic Redmine fields and technical history.

## Status change offline

1. User taps permitted status action.
2. UI updates optimistically and stores an outbox mutation before showing success.
3. Offline badge appears subtly on the affected action/timeline.
4. Sync later revalidates server revision.
5. Non-overlap merges automatically; material overlap becomes a conflict card.

## Comment/private note

1. User writes normal text (OS keyboard speech-to-text remains available).
2. Choose private note only when Redmine indicates permission/support.
3. Comment is stored locally first, then appended to Redmine.
4. Append-only journal entry never overwrites remote journal history.

## Photo

1. Tap `Foto`.
2. Camera opens with environment-facing capture hint.
3. Preview shows `Verwerfen` and `Verwenden`.
4. Selected image is persisted locally immediately.
5. Upload copy is compressed/resized while preserving EXIF where supported.
6. When offline, outbox waits; when online, Redmine upload token + issue attachment flow runs.

## Attachments

1. Existing attachments are cached using the attachment `content_url` already present on the issue.
2. Images open in-app. Other file types are offered to the OS/browser handler.
3. Cached attachments remain available during outages.
4. If caching failed or the file was never downloaded, the issue shows that state instead of pretending it is offline-ready.
5. When online, `Jetzt offline speichern` retries that individual file immediately; failures also remain visible in Sync.

## Map/navigation

1. Map shows filtered issue markers.
2. If the current selection contains no valid coordinates, the map remains useful by centering on Otterbach-Otterberg and explaining that there are no ticket markers.
3. Optional device position displays only on-device.
4. Tap marker -> issue preview -> open issue.
5. `Navigation` invokes native maps app using ticket coordinates/address.
6. Offline basemap download is opt-in in Settings.

## Sync center

1. User opens Sync from navigation/settings.
2. Shows last sync, network state, queued mutations, retries and conflicts.
3. `Jetzt synchronisieren` always available when online.
4. Conflicts provide server/local comparison and safe choice.

## Cache cleanup

1. Settings shows retention default 30 days.
2. Completed/unassigned/browsed stale issues are automatically pruned after retention window when they have no pending mutation.
3. `Offline-Daten jetzt löschen` clears cached business data/outbox only after explicit confirmation.
