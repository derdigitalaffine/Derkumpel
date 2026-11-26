export const fullDayMinutes = 468;
export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2]) : /^\d{1,2}(?:[.,]\d+)?$/.test(trimmed) ? Math.round(Number(trimmed.replace(',', '.')) * 60) : NaN;
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : null;
}
