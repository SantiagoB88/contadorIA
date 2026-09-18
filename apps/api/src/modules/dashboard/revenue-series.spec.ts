import { buildDailyRevenueSeries } from './revenue-series';

const NOW = new Date('2026-01-10T12:00:00.000Z');

describe('buildDailyRevenueSeries', () => {
  it('zero-fills every day in the window, most recent last', () => {
    const series = buildDailyRevenueSeries([], 5, NOW);

    expect(series).toEqual([
      { date: '2026-01-06', amount: '0' },
      { date: '2026-01-07', amount: '0' },
      { date: '2026-01-08', amount: '0' },
      { date: '2026-01-09', amount: '0' },
      { date: '2026-01-10', amount: '0' },
    ]);
  });

  it('sums multiple invoices issued on the same day', () => {
    const series = buildDailyRevenueSeries(
      [
        { issuedAt: new Date('2026-01-09T08:00:00.000Z'), total: 1_000n },
        { issuedAt: new Date('2026-01-09T20:00:00.000Z'), total: 500n },
      ],
      5,
      NOW,
    );

    expect(series.find((p) => p.date === '2026-01-09')?.amount).toBe('1500');
  });

  it('ignores invoices outside the window and those with no issuedAt (not yet authorized)', () => {
    const series = buildDailyRevenueSeries(
      [
        { issuedAt: new Date('2025-12-01T00:00:00.000Z'), total: 999_999n },
        { issuedAt: null, total: 42n },
      ],
      5,
      NOW,
    );

    expect(series.reduce((sum, p) => sum + BigInt(p.amount), 0n)).toBe(0n);
  });
});
