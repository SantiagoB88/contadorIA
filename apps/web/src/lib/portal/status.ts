import type { PortalStatus } from './types';

const DUE_SOON_THRESHOLD_DAYS = 5;

/** Terminal states never change based on the date. */
const TERMINAL_STATUSES: ReadonlySet<PortalStatus> = new Set(['PAID', 'ACTION_REQUIRED', 'CLOSED']);

/**
 * Derives the effective status of a dated obligation/payment from today's
 * date, so a badge never contradicts the due date it's next to (a due date
 * that was "próximo a vencer" yesterday must read as "vencido" today). Only
 * non-terminal statuses are recomputed.
 */
export function deriveStatus(dueDate: string, baseStatus: PortalStatus, today = new Date()): PortalStatus {
  if (TERMINAL_STATUSES.has(baseStatus)) return baseStatus;

  const daysUntilDue = Math.round(
    (startOfDay(new Date(dueDate)).getTime() - startOfDay(today).getTime()) / MS_PER_DAY,
  );

  if (daysUntilDue < 0) return 'OVERDUE';
  if (daysUntilDue <= DUE_SOON_THRESHOLD_DAYS) return 'DUE_SOON';
  return 'PENDING';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function toIsoDate(date: Date): string {
  return date.toISOString();
}
