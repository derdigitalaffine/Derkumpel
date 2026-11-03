import { describe, expect, it } from 'vitest';
import { issueAddress, issueCoordinates, redminePatchValue, scalarField, statusColor } from './issueUtils';
import type { RedmineIssue } from './types';

function issue(custom_fields: RedmineIssue['custom_fields'] = []): RedmineIssue {
  return {
    id: 42,
    project: { id: 1, name: 'Bauhof' },
    tracker: { id: 1, name: 'Auftrag' },
    status: { id: 1, name: 'Neu' },
    priority: { id: 2, name: 'Normal' },
    subject: 'Test',
    created_on: '2026-11-03T10:00:00Z',
    updated_on: '2026-11-03T10:00:00Z',
    custom_fields,
  };
}

describe('issue field projection', () => {
  it('builds address from tracker-dependent custom fields', () => {
    const value = issue([
      { id: 1, name: 'Strasse', value: 'Otterstraße 43' },
      { id: 2, name: 'Ort', value: '67697 Otterberg' },
    ]);
    expect(issueAddress(value)).toBe('Otterstraße 43, 67697 Otterberg');
  });

  it('reads lat/lng case-insensitively', () => {
    const value = issue([
      { id: 1, name: 'LAT', value: '49.50' },
      { id: 2, name: 'Lng', value: '7.77' },
    ]);
    expect(issueCoordinates(value)).toEqual([7.77, 49.5]);
  });

  it('rejects invalid coordinates', () => {
    const value = issue([{ id: 1, name: 'lat', value: '999' }, { id: 2, name: 'lng', value: '7.77' }]);
    expect(issueCoordinates(value)).toBeUndefined();
  });

  it('joins multi-value custom fields', () => {
    const value = issue([{ id: 1, name: 'Tags', value: ['A', 'B'] }]);
    expect(scalarField(value, 'tags')).toBe('A, B');
  });

  it('normalizes custom fields to Redmine update shape for conflict snapshots', () => {
    const value = issue([
      { id: 9, name: 'Ort', value: 'Otterberg' },
      { id: 3, name: 'Tags', value: ['A', 'B'] },
    ]);
    expect(redminePatchValue(value, 'custom_fields')).toEqual([
      { id: 3, value: ['A', 'B'] },
      { id: 9, value: 'Otterberg' },
    ]);
  });
});

describe('status colors', () => {
  it('maps field-work statuses consistently', () => {
    expect(statusColor('In Arbeit')).toBe('blue');
    expect(statusColor('unterbrochen')).toBe('orange');
    expect(statusColor('Auftrag erledigt')).toBe('green');
    expect(statusColor('abgelehnt')).toBe('red');
  });
});
