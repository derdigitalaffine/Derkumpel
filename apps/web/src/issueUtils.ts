import type { RedmineCustomField, RedmineIssue } from './types';

function normalized(name: string): string { return name.trim().toLocaleLowerCase('de-DE'); }

export function customField(issue: RedmineIssue, ...names: string[]): RedmineCustomField | undefined {
  const wanted = new Set(names.map(normalized));
  return issue.custom_fields?.find((field) => wanted.has(normalized(field.name)));
}

export function scalarField(issue: RedmineIssue, ...names: string[]): string | undefined {
  const value = customField(issue, ...names)?.value;
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return value == null || value === '' ? undefined : String(value);
}

export function issueAddress(issue: RedmineIssue): string | undefined {
  const street = scalarField(issue, 'Strasse', 'Straße');
  const house = scalarField(issue, 'Hausnummer');
  const place = scalarField(issue, 'Ort');
  const first = [street, house && !street?.includes(house) ? house : undefined].filter(Boolean).join(' ');
  return [first, place].filter(Boolean).join(', ') || undefined;
}

export function issueCoordinates(issue: RedmineIssue): [number, number] | undefined {
  const lat = Number.parseFloat(scalarField(issue, 'lat', 'latitude', 'Breitengrad') ?? '');
  const lng = Number.parseFloat(scalarField(issue, 'lng', 'lon', 'longitude', 'Längengrad') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return [lng, lat];
}

export function statusColor(name: string): string {
  const value = normalized(name);
  if (value.includes('erledigt') || value.includes('genehmigt')) return 'green';
  if (value.includes('unterbrochen') || value.includes('rücksprache')) return 'orange';
  if (value.includes('abgelehnt')) return 'red';
  if (value.includes('arbeit') || value.includes('auftrag erteilt')) return 'blue';
  return 'gray';
}

export function dateLabel(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

export function navigationUrl(issue: RedmineIssue): string | undefined {
  const coords = issueCoordinates(issue);
  const address = issueAddress(issue);
  if (!coords && !address) return undefined;
  const ua = navigator.userAgent;
  const destination = coords ? `${coords[1]},${coords[0]}` : address!;
  if (/iPhone|iPad|iPod/i.test(ua)) return `maps://?daddr=${encodeURIComponent(destination)}&dirflg=d`;
  if (/Android/i.test(ua) && coords) return `geo:${coords[1]},${coords[0]}?q=${coords[1]},${coords[0]}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function normalizedCustomFields(issue: RedmineIssue): Array<{ id: number; value: RedmineCustomField['value'] }> {
  return (issue.custom_fields ?? [])
    .map((field) => ({ id: field.id, value: field.value ?? null }))
    .sort((a, b) => a.id - b.id);
}

export function redminePatchValue(issue: RedmineIssue, key: string): unknown {
  switch (key) {
    case 'status_id': return issue.status.id;
    case 'priority_id': return issue.priority.id;
    case 'assigned_to_id': return issue.assigned_to?.id ?? null;
    case 'project_id': return issue.project.id;
    case 'tracker_id': return issue.tracker.id;
    case 'parent_issue_id': return issue.parent?.id ?? null;
    case 'custom_fields': return normalizedCustomFields(issue);
    default: return (issue as unknown as Record<string, unknown>)[key];
  }
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
