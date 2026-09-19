'use client';

import { useId, useState } from 'react';
import type { RevenuePoint } from '@dashgobo/contracts';
import { formatMoney } from '@/lib/money';

const CHART_HEIGHT = 160;
const BAR_GAP = 2;

/**
 * Single-series daily bar chart — no legend needed (title names the series),
 * one accent hue, thin bars with rounded data-ends, per-bar hover tooltip.
 * See the dataviz skill: marks-and-anatomy.md + interaction.md.
 */
export function RevenueChart({ points, currency }: { points: RevenuePoint[]; currency: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId();

  if (points.length === 0) return null;

  const amounts = points.map((p) => Number(p.amount));
  const max = Math.max(...amounts, 1);
  const barWidth = (100 - BAR_GAP * (points.length - 1)) / points.length;
  const active = hovered !== null ? points[hovered] : null;

  return (
    <div className="relative">
      {active && (
        <div className="pointer-events-none absolute -top-9 left-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs shadow-md">
          <span className="font-semibold tabular-nums">{formatMoney(active.amount, currency)}</span>
          <span className="ml-1.5 text-[var(--color-muted)]">
            {new Date(`${active.date}T00:00:00Z`).toLocaleDateString('es-AR', {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            })}
          </span>
        </div>
      )}
      <svg
        viewBox={`0 0 100 ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-40 w-full overflow-visible"
        role="img"
        aria-label={`Facturación diaria de los últimos ${points.length} días`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {points.map((point, i) => {
          const amount = Number(point.amount);
          // Zero days still get a 2px baseline sliver so the day is present,
          // not just absent.
          const barHeight = Math.max((amount / max) * (CHART_HEIGHT - 4), 2);
          const x = i * (barWidth + BAR_GAP);
          const isHovered = hovered === i;
          return (
            <rect
              key={point.date}
              x={x}
              y={CHART_HEIGHT - barHeight}
              width={barWidth}
              height={barHeight}
              rx={2}
              fill={isHovered ? 'var(--color-accent)' : `url(#${gradientId})`}
              opacity={amount <= 0 ? 0.25 : 1}
              className="cursor-default transition-opacity"
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
              tabIndex={0}
              role="img"
              aria-label={`${point.date}: ${formatMoney(point.amount, currency)}`}
            />
          );
        })}
      </svg>
    </div>
  );
}
