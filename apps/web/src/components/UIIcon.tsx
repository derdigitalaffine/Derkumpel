import type { ReactNode } from 'react';

/** Consistent, dependency-free line icons for the field-service UI. Decorative by default. */
export type IconName =
  | 'work' | 'tickets' | 'map' | 'sync' | 'settings' | 'search' | 'filter' | 'sort'
  | 'pin' | 'calendar' | 'user' | 'chevron-right' | 'chevron-left' | 'check' | 'clock'
  | 'camera' | 'message' | 'route' | 'arrow-left' | 'wifi' | 'wifi-off' | 'alert'
  | 'download' | 'external' | 'layers' | 'shield' | 'trash' | 'logout' | 'cloud'
  | 'close' | 'info' | 'file' | 'refresh' | 'list' | 'archive' | 'plus' | 'eye'
  | 'save' | 'sliders' | 'bolt' | 'check-circle' | 'menu' | 'edit';

const paths: Record<IconName, ReactNode> = {
  work: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
  tickets: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15" /></>,
  sync: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></>,
  settings: <><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M18.4 5.6l-2.1 2.1m-8.6 8.6-2.1 2.1" /><circle cx="12" cy="12" r="4" /></>,
  search: <><circle cx="10.7" cy="10.7" r="6.7" /><path d="m16 16 5 5" /></>,
  filter: <><path d="M4 6h16M7 12h10m-7 6h4" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /></>,
  sort: <><path d="M8 4v16m0-16-3 3m3-3 3 3M16 20V4m0 16-3-3m3 3 3-3" /></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  check: <path d="m4 12 5 5L20 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  camera: <><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></>,
  message: <path d="M20 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3l4-4h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />,
  route: <><circle cx="6" cy="18" r="2" /><path d="M6 16v-5a4 4 0 0 1 4-4h4a4 4 0 0 0 4-4m-4 2 4-3 4 3" /></>,
  'arrow-left': <path d="M19 12H5m6-6-6 6 6 6" />,
  wifi: <><path d="M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0m-11 4a6 6 0 0 1 8 0" /><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" /></>,
  'wifi-off': <><path d="m2 2 20 20M3.6 8A15 15 0 0 1 18 6m3.5 2a15 15 0 0 0-1.9-1.4M6.4 12a10 10 0 0 1 9-.7M9 16a6 6 0 0 1 5-.5" /><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" /></>,
  alert: <><path d="M11 4a2 2 0 0 1 2 0l9 16H2Z" /><path d="M12 9v5m0 3v1" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
  external: <><path d="M14 4h6v6m0-6-9 9" /><path d="M20 14v6H4V4h6" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
  shield: <><path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6z" /><path d="m8 12 3 3 5-6" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6" /></>,
  logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M13 8l4 4-4 4m-8-4h12" /></>,
  cloud: <><path d="M7 19h11a4 4 0 0 0 0-8h-1a6 6 0 0 0-11.5-1.5A4.8 4.8 0 0 0 7 19Z" /></>,
  close: <path d="M5 5 19 19M19 5 5 19" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
  file: <><path d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8m-8 4h8" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M20 12a8 8 0 0 0-14-5l-2 3M4 12a8 8 0 0 0 14 5l2-3" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v13h14V8m-10 5h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  save: <><path d="M4 3h13l4 4v14H3V3zM7 3v7h10V3M7 21v-7h10v7" /></>,
  sliders: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" /></>,
  bolt: <path d="m13 2-9 11h7l-1 9 10-12h-7z" />,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m7 12 3 3 7-7" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  edit: <><path d="M3 17.5V21h3.5L19 8.5 15.5 5 3 17.5ZM14 6.5l3.5 3.5M19 8.5l2-2-3.5-3.5-2 2" /></>,
};

export function UIIcon({ name, size = 20, strokeWidth = 1.9 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths[name]}
  </svg>;
}
