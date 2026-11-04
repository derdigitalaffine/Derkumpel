# Design system

## Direction

DerKumpel is a municipal field tool: calm, strong, modern, highly legible in daylight, and comfortable with one hand. Avoid dense Redmine tables and desktop metaphors.

## Brand

- User-facing spelling is always **DerKumpel**.
- Prominent identity surfaces may use the full PNG logo lockup.
- Header, startup state, favicon and install surfaces use the square PNG brand mark.
- PWA installation uses dedicated 192x192, 512x512 and maskable PNG assets.
- Internal technical identifiers may remain lowercase where renaming would invalidate sessions/caches.

## Mantine strategy

Use Mantine components and theme tokens, not ad-hoc component libraries. Prefer `AppShell`, `Card`, `Paper`, `Stack`, `Group`, `Badge`, `ActionIcon`, `Button`, `Drawer`, `Accordion`, `Collapse`, `SegmentedControl`, `Tabs`, `Affix` and `Modal` where appropriate.

## Mobile layout

- Primary design range 360–430px portrait.
- Technical lower bound 320px.
- No horizontal scrolling in core flows.
- Bottom navigation on mobile: Arbeit, Tickets, Karte, Sync, Mehr.
- Desktop/tablet may use a side navigation and two-column detail layout.
- Primary controls >= 52px where practical; minimum touch target 48px.
- Form text >= 16px.
- Safe-area insets must be respected on installed PWAs.

## Information hierarchy

The shared dependency-free `UIIcon` component is the approved icon vocabulary; don't mix random Unicode symbols into navigation/critical actions. All icons in controls are decorative and their button labels remain readable to assistive technologies.

Issue cards emphasize in this order:

1. status/priority signal
2. subject
3. address/location
4. due/start timing
5. assignee/group

The `Meine Arbeit` home has a compact work overview and **three optional quick filters** (all, due today, overdue) before the sticky search toolbar. Tapping a selected urgent quick filter returns to all. Stored personal filters are not lost when using quick filters.

Issue detail simple mode uses sections: Auftrag, Ort & Termin, Aktionen, Beschreibung, Anhänge, Verlauf. `Alle Angaben & Bearbeiten` remains collapsed by default on every open.

All ticket titles wrap safely at 320 px. Date-only overdue classification must use calendar days rather than elapsed hours; UTC arithmetic prevents false urgency around DST. Status and deadline labels must remain textual in addition to color.

`Tickets` is a browse/archive surface, not a second dashboard. Keep status scope, tracker, project and search controls together in a sticky filter surface; reuse the same issue cards as `Meine Arbeit` so scanning behavior stays consistent.

## Perceived performance

- Prefer skeleton content over empty spinners for first-load work/ticket lists.
- Cached offline state should open immediately when the browser is clearly offline; do not wait for a doomed network round trip first.
- Show the last successful sync time where it helps establish trust in cached data.
- Local mutations must feel instant, while sync state remains visible in the dedicated navigation/status surfaces.

## Sync awareness

- Pending local changes and real conflicts are visible from the global Sync navigation item.
- Conflict counts use a stronger semantic signal than ordinary pending changes.
- The Sync page links each queue/warning item back to the affected issue.
- Repeated conflict-resolution taps must be guarded while one resolution is running.
- Status, comment, photo and advanced-form saves must block repeated input, keep the draft on error and report whether it was saved locally.
- Missing attachment cache entries are visually distinct from attachments already stored offline.

## Color

Use a light-first municipal palette derived from the DerKumpel symbol: deep navy for structure, clean white surfaces, muted forest/grass green for selection and semantic state colors for ticket urgency. Use the Mantine `brand` color scale for primary actions and `blue/red/orange/green` for their established meanings. Dark mode may follow OS later, but outdoor daylight readability takes priority for the initial release. Never encode status using color alone.

Suggested tokens:

- primary: `brand.7–9` (navy)
- background: `#f3f7f8` (soft daylight canvas)
- surface: white / nearly opaque
- text: `#142d40` and `#567080` secondary
- selection accent: `#82b535` (brand green)
- urgent: red 7
- warning/paused: orange 7
- active: blue 7
- done: green 7

## Offline state

Offline should be calm, not an error screen. Show a compact connection chip in header. Pending changes use a subtle count/status mark. Detailed queue lives in Sync center. First launch/login without a cached account still requires Redmine connectivity.

## Accessibility

Target WCAG 2.2 AA:

- visible focus
- semantic labels
- text + icon for critical state
- contrast-safe badges/buttons
- reduced motion support
- increased-contrast media preference support
- live regions for meaningful connection/result changes without visual clutter
- no gesture-only essential action
- dialogs must remain usable with mobile keyboard and at 320x568

## Timeline

Use avatar/icon rail + cards. Comments and photos are visually prominent. Technical field diffs are grouped under `Weitere Änderungen` accordion.

## Attachments

- Image attachments should be directly tappable for a larger device-native view.
- Every attachment card communicates whether it is already stored offline.
- Non-image files show a recognizable file-type cue and a large `Mit Gerät öffnen` action.
- Missing offline copies use a calm dashed state rather than looking like a failed upload.
- Destructive cache clearing and logout must be disabled while local mutations remain unsynchronized, including inside confirmation dialogs.
- If online, a missing copy offers an explicit `Jetzt offline speichern` recovery action on the attachment itself.

## Map

Map is a secondary work view, never the only way to reach an issue. Marker clustering is allowed. A bottom sheet/card may present selected issue details. Markers must remain comfortably tappable on phones. When two or more issues have coordinates, fit the map viewport to all visible pins (with padding and a sensible maximum zoom). With no valid coordinates in the selected scope, center the basemap on Otterbach-Otterberg and explain why no issue markers are visible.
