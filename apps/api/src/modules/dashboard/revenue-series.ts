import type { RevenuePoint } from '@dashgobo/contracts';

export interface RevenueRow {
  issuedAt: Date | null;
  total: bigint;
}

/**
 * Buckets invoice totals into a fixed-length, zero-filled daily series ending
 * today (UTC day boundaries) — a chart shouldn't have gaps just because a day
 * had no invoices. Pure function, no DB access, so it's cheap to unit test
 * independently of the aggregation query that feeds it.
 */
export function buildDailyRevenueSeries(
  rows: RevenueRow[],
  days: number,
  now = new Date(),
): RevenuePoint[] {
  const buckets = new Map<string, bigint>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    buckets.set(toDateKey(day), 0n);
  }

  for (const row of rows) {
    if (!row.issuedAt) continue;
    const key = toDateKey(row.issuedAt);
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + row.total);
  }

  return [...buckets.entries()].map(([date, amount]) => ({ date, amount: amount.toString() }));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
