export function fullDayMinutes(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const day = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== date) return 0;
  const weekday = day.getUTCDay();
  return weekday >= 1 && weekday <= 4 ? 510 : weekday === 5 ? 300 : 0;
}
export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2]) : /^\d{1,2}(?:[.,]\d+)?$/.test(trimmed) ? Math.round(Number(trimmed.replace(',', '.')) * 60) : NaN;
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : null;
}

export type RapportPerson = { id: number; name: string; groups?: string[] };
export type RapportDraftEntry = {
  employee: RapportPerson;
  recordedBy: RapportPerson;
  minutes: number;
  activity?: string;
  recordedAt: string;
  startAt: string;
  endAt: string;
};
export function makeRapportEntries(people: RapportPerson[], selectedIds: number[], recordedBy: RapportPerson, minutes: number, activity: string, recordedAt: string, startAt: string): RapportDraftEntry[] {
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) return [];
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) return [];
  const endAt = new Date(start.getTime() + minutes * 60000).toISOString();
  const selected = new Set(selectedIds);
  const unique = new Map(people.map(person => [person.id, person]));
  return [...unique.values()].filter(person => selected.has(person.id)).map(employee => ({
    employee, recordedBy, minutes, activity: activity.trim() || undefined, recordedAt, startAt: start.toISOString(), endAt,
  }));
}

export function localDateInput(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
export function parseLocalStart(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const start = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(start.getTime()) || localDateInput(start) !== date || formatDuration(start.getHours() * 60 + start.getMinutes()).padStart(5, '0') !== time) return null;
  return start.toISOString();
}
export function rankRapportPeople(people: RapportPerson[], favorites: number[], counts: Record<number, number>, actorId?: number): RapportPerson[] {
  return [...people].sort((a,b) => Number(b.id === actorId) - Number(a.id === actorId) || Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) || (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.name.localeCompare(b.name, 'de'));
}
