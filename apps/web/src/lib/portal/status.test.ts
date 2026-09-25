import { describe, expect, it } from 'vitest';
import { addDays, deriveStatus, toIsoDate } from './status';

const today = new Date(2026, 8, 25); // 25/09/2026, midday-agnostic

describe('deriveStatus', () => {
  it('returns OVERDUE for a due date in the past', () => {
    expect(deriveStatus(toIsoDate(addDays(today, -1)), 'PENDING', today)).toBe('OVERDUE');
  });

  it('returns DUE_SOON exactly at the 5-day boundary regardless of time-of-day', () => {
    const dueDate = toIsoDate(new Date(2026, 8, 30, 23, 59)); // same calendar day, late clock time
    expect(deriveStatus(dueDate, 'PENDING', today)).toBe('DUE_SOON');
  });

  it('returns PENDING just past the 5-day threshold', () => {
    expect(deriveStatus(toIsoDate(addDays(today, 6)), 'PENDING', today)).toBe('PENDING');
  });

  it('never recomputes a terminal status', () => {
    expect(deriveStatus(toIsoDate(addDays(today, -30)), 'PAID', today)).toBe('PAID');
    expect(deriveStatus(toIsoDate(addDays(today, -30)), 'ACTION_REQUIRED', today)).toBe(
      'ACTION_REQUIRED',
    );
  });
});
