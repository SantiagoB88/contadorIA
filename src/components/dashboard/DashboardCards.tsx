import Link from "next/link";
import { Badge, Card, type Tone } from "@/components/ui";
import { formatARS } from "@/lib/money";
import { formatDateAR } from "@/lib/dates";
import type { AlertLevel, MarginInfo, MonthBar, PeriodMetric } from "@/modules/dashboard/metrics";
import type { DebtSummary } from "@/modules/fiscal/obligations";
import { DEBT_STATE, debtStateText } from "@/components/fiscal/FiscalViews";

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

function compactARS(cents: bigint): string {
  return `$${compact.format(Number(cents / 100n))}`;
}

export function PeriodCard({ period, taxpayerId }: { period: PeriodMetric; taxpayerId: string }) {
  const href = `/dashboard/movimientos?c=${encodeURIComponent(taxpayerId)}&desde=${period.from}&hasta=${period.to}`;
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-600">{period.label}</h2>
        {period.coverage === "PARCIAL" && <Badge tone="warning">Parcial</Badge>}
      </div>
      {period.totalCents === null ? (
        <p className="mt-2 text-lg font-semibold text-amber-800">Información incompleta</p>
      ) : (
        <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-slate-900">{formatARS(period.totalCents)}</p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        {formatDateAR(period.from)} – {formatDateAR(period.to)}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{period.description}</p>
      <div className="mt-auto pt-3">
        <Link href={href} className="text-sm font-medium text-brand-700 hover:underline">
          Ver {period.invoiceCount} {period.invoiceCount === 1 ? "comprobante" : "comprobantes"} →
        </Link>
      </div>
    </Card>
  );
}

const LEVELS: Record<AlertLevel, { label: string; tone: Tone; bar: string }> = {
  NORMAL: { label: "Normal", tone: "success", bar: "bg-emerald-500" },
  PREVENTIVO: { label: "Preventivo", tone: "warning", bar: "bg-amber-400" },
  PROXIMO: { label: "Próximo al límite", tone: "warning", bar: "bg-orange-500" },
  SUPERADO: { label: "Límite superado", tone: "danger", bar: "bg-red-600" },
};

export function formatPercent(tenths: number): string {
  return `${(tenths / 10).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function DetailLink({ href }: { href?: string }) {
  if (!href) return null;
  return (
    <Link href={href} className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
      Ver cómo se calcula y la escala →
    </Link>
  );
}

export function MarginCard({ margin, detailHref }: { margin: MarginInfo; detailHref?: string }) {
  if (!margin.available) {
    return (
      <Card>
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Margen de categoría</h2>
          <Badge tone="warning">No disponible</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Categoría registrada: <strong>{margin.categoryCode ?? "sin cargar"}</strong>
        </p>
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{margin.reason}</p>
        <DetailLink href={detailHref} />
      </Card>
    );
  }

  const level = LEVELS[margin.level];
  const width = Math.min(margin.percentTenths / 10, 100);
  const exceeded = margin.marginCents < 0n;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Margen de categoría</h2>
          <p className="mt-1 text-sm text-slate-600">
            Categoría registrada <strong>{margin.categoryCode}</strong> · {formatDateAR(margin.referenceFrom)} al{" "}
            {formatDateAR(margin.referenceTo)}
          </p>
        </div>
        <Badge tone={level.tone}>{level.label}</Badge>
      </div>

      <div className="mt-5">
        <p className="text-sm text-slate-600">{exceeded ? "Exceso sobre el límite" : "Margen disponible"}</p>
        <p className={`tabular text-3xl font-semibold tracking-tight ${exceeded ? "text-red-700" : "text-slate-900"}`}>
          {formatARS(exceeded ? -margin.marginCents : margin.marginCents)}
        </p>
      </div>

      <div className="mt-4">
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Consumo del límite de la categoría"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(width)}
          aria-valuetext={`${formatPercent(margin.percentTenths)} del límite`}
        >
          <div className={`h-full rounded-full ${level.bar}`} style={{ width: `${width}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
          <span className="tabular font-medium text-slate-800">{formatPercent(margin.percentTenths)} del límite</span>
          <span className="tabular text-slate-600">
            {formatARS(margin.incomeCents)} de {formatARS(margin.limitCents)}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Escala aplicada</dt>
          <dd className="flex flex-wrap items-center gap-2 text-slate-800">
            {margin.scaleName}
            {margin.scaleStatus === "DEMO" && <Badge tone="warning">Ficticia</Badge>}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Umbrales de alerta</dt>
          <dd className="text-slate-800">80 % preventivo · 95 % próximo · +100 % superado</dd>
        </div>
      </dl>

      {margin.note && <p className="mt-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{margin.note}</p>}
      <p className="mt-4 text-xs text-slate-500">
        Es una referencia por ingresos. No reemplaza la recategorización oficial, que considera otros parámetros.
      </p>
      <DetailLink href={detailHref} />
    </Card>
  );
}

export function MonthlyChart({ bars }: { bars: MonthBar[] }) {
  const max = bars.reduce((acc, b) => (b.totalCents > acc ? b.totalCents : acc), 0n);
  const anyMissing = bars.some((b) => b.coverage !== "COMPLETA");

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Facturación mensual</h2>
        <span className="text-sm text-slate-500">Últimos 12 meses</span>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div className="flex h-56 items-end gap-1 sm:gap-2" aria-hidden="true">
          {bars.map((bar) => {
            const missing = bar.coverage !== "COMPLETA";
            const height = max > 0n ? Number((bar.totalCents * 1000n) / max) / 10 : 0;
            return (
              <div key={bar.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                {/* En el celular no entran los importes: están en las tarjetas de períodos y en la tabla accesible. */}
                <span className="tabular hidden text-[11px] text-slate-500 sm:inline">
                  {missing && bar.totalCents === 0n ? "s/d" : compactARS(bar.totalCents)}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    title={`${bar.longLabel}: ${formatARS(bar.totalCents)}${missing ? " (datos incompletos)" : ""}`}
                    className={`w-full rounded-t-md ${
                      missing ? "border border-dashed border-amber-400 bg-amber-100" : "bg-brand-500"
                    }`}
                    style={{ height: `${Math.max(height, missing ? 4 : bar.totalCents > 0n ? 2 : 0)}%` }}
                  />
                </div>
                <span className="text-center text-[11px] leading-tight text-slate-600">
                  {bar.label.split(" ")[0]}
                  <span className="block sm:inline"> {bar.label.split(" ")[1]}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {anyMissing && (
        <p className="mt-3 text-xs text-amber-800">
          Las barras punteadas (s/d) son meses sin datos completos: no significan que no hubo facturación.
        </p>
      )}

      {/* Versión accesible del gráfico */}
      <table className="sr-only">
        <caption>Facturación mensual de los últimos 12 meses</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Total</th>
            <th scope="col">Datos</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.key}>
              <td>{bar.longLabel}</td>
              <td>{formatARS(bar.totalCents)}</td>
              <td>{bar.coverage === "COMPLETA" ? "Completos" : "Incompletos"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function DebtCard({ debt, href }: { debt: DebtSummary; href: string }) {
  const state = DEBT_STATE[debt.state];
  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Deudas</h2>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      {debt.overdue.length > 0 && (
        <p className="tabular mt-3 text-2xl font-semibold text-red-700">{formatARS(debt.overdueTotalCents)}</p>
      )}
      <p className="mt-2 text-sm text-slate-600">{debtStateText(debt)}</p>
      <p className="mt-2 text-xs text-slate-500">
        {debt.review ? `Información al ${formatDateAR(debt.review.asOfDate)} · ${debt.review.source}` : "Sin revisión del estudio"}
        {debt.overdue.length > 0 && " · no incluye intereses"}
      </p>
      <div className="mt-auto pt-3">
        <Link href={href} className="text-sm font-medium text-brand-700 hover:underline">
          Ver deudas y vencimientos →
        </Link>
      </div>
    </Card>
  );
}

export function UpcomingCard({ debt, href }: { debt: DebtSummary; href: string }) {
  const next = debt.upcoming.slice(0, 3);
  return (
    <Card className="flex flex-col">
      <h2 className="font-semibold text-slate-900">Próximos vencimientos</h2>
      {next.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          {debt.state === "SIN_DATOS" ? "El estudio todavía no cargó vencimientos." : "No hay vencimientos pendientes cargados."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {next.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="tabular font-medium text-slate-900">{formatDateAR(o.dueDate)}</span>
                <span className="text-slate-600"> · {o.concept}</span>
              </span>
              <span className="tabular text-slate-800">{o.amountCents === null ? "Importe no informado" : formatARS(o.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-3">
        <Link href={href} className="text-sm font-medium text-brand-700 hover:underline">
          Ver todos →
        </Link>
      </div>
    </Card>
  );
}
