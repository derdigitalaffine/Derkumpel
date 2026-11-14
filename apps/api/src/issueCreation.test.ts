import { describe, expect, it } from 'vitest';
import { issueCreatePayload, validateIssueCreate } from './issueCreation.js';

describe('native issue creation payload', () => {
  const input = { projectId: 12, trackerId: 3, subject: 'Weg reinigen',
    description: 'Bauhof', dueDate: '2026-11-30', priorityId: 4 };
  it('maps only supported fields without client-selected author', () => {
    const output = issueCreatePayload(validateIssueCreate({ ...input, user_id: 100, is_private: true }));
    expect(output).toEqual({ issue: {
      project_id: 12, tracker_id: 3, subject: 'Weg reinigen', description: 'Bauhof',
      due_date: '2026-11-30', priority_id: 4,
    } });
  });
  it.each([0, -5, 1.5, '5', null])('rejects bad project IDs', (projectId) => {
    expect(() => validateIssueCreate({ ...input, projectId })).toThrow();
  });
  it.each(['', '   ', 'a'.repeat(256)])('rejects bad titles', (subject) => {
    expect(() => validateIssueCreate({ ...input, subject })).toThrow();
  });
  it('rejects impossible dates and overlong descriptions', () => {
    expect(() => validateIssueCreate({ ...input, dueDate: '2026-02-30' })).toThrow();
    expect(() => validateIssueCreate({ ...input, description: 'a'.repeat(20001) })).toThrow();
  });
});
