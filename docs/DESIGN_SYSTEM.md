# Design system

## Direction

Derkumpel is a municipal field tool: calm, strong, modern, highly legible in daylight, and comfortable with one hand. Avoid dense Redmine tables and desktop metaphors.

## Mantine strategy

Use Mantine components and theme tokens, not ad-hoc component libraries. Prefer `AppShell`, `Card`, `Paper`, `Stack`, `Group`, `Badge`, `ActionIcon`, `Button`, `Drawer`, `Accordion`, `Collapse`, `SegmentedControl`, `Tabs`, `Affix` and `Modal` where appropriate.

## Mobile layout

- Primary design range 360–430px portrait.
- Technical lower bound 320px.
- No horizontal scrolling in core flows.
- Bottom navigation on mobile: Arbeit, Karte, Sync, Mehr.
- Desktop/tablet may use a side navigation and two-column detail layout.
- Primary controls >= 52px where practical; minimum touch target 48px.
- Form text >= 16px.
- Safe-area insets must be respected on installed PWAs.

## Information hierarchy

Issue cards emphasize in this order:

1. status/priority signal
2. subject
3. address/location
4. due/start timing
5. assignee/group

Issue detail simple mode uses sections: Auftrag, Ort & Termin, Aktionen, Beschreibung, Anhänge, Verlauf. `Alle Angaben & Bearbeiten` remains collapsed by default on every open.

## Perceived performance

- Prefer skeleton content over empty spinners for first-load work lists.
- Cached offline state should open immediately when the browser is clearly offline; do not wait for a doomed network round trip first.
- Show the last successful sync time where it helps establish trust in cached data.
- Local mutations must feel instant, while sync state remains visible in the dedicated navigation/status surfaces.

## Sync awareness

- Pending local changes and real conflicts are visible from the global Sync navigation item.
- Conflict counts use a stronger semantic signal than ordinary pending changes.
- The Sync page links each queue/warning item back to the affected issue.
- Repeated conflict-resolution taps must be guarded while one resolution is running.
- Missing attachment cache entries are visually distinct from attachments already stored offline.

## Color

Use a neutral light-first municipal palette with strong blue primary and semantic status colors. Dark mode may follow OS later, but outdoor daylight readability takes priority for the initial release. Never encode status using color alone.

Suggested tokens:

- primary: blue 7/8
- background: gray 0
- surface: white
- text: dark 8/9
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

## Map

Map is a secondary work view, never the only way to reach an issue. Marker clustering is allowed. A bottom sheet/card may present selected issue details. Markers must remain comfortably tappable on phones.
