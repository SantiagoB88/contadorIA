import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatARS } from "@/lib/money";
import { formatDateAR, monthKey, parseYmd } from "@/lib/dates";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { getDashboardData, monthOptions, resolveCutDate } from "@/modules/dashboard/metrics";
import { TaxpayerPicker } from "@/components/dashboard/TaxpayerPicker";
import { MarginCard, formatPercent } from "@/components/dashboard/DashboardCards";
import { ScaleStatusBadge, validityText } from "@/components/fiscal/FiscalViews";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Categoría y límites · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const COVERAGE_TEXT = {
  COMPLETA: "Completos",
  PARCIAL: "Parciales: falta información de una parte del período",
  SIN_DATOS: "Sin datos cargados",
} as const;

export default async function CategoryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const taxpayers = await getAccessibleTaxpayers(user);

  if (taxpayers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Categoría y límites" />
        <EmptyState title="Todavía no tenés contribuyentes habilitados" />
      </div>
    );
  }

  const taxpayer = await getAuthorizedTaxpayer(user, first(sp.c) ?? taxpayers[0].id);
  if (!taxpayer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Categoría y límites" />
        <Notice tone="danger" title="No tenés acceso a este contribuyente">
          <Link href="/dashboard/categoria" className="font-medium underline">
            Ver mi categoría
          </Link>
        </Notice>
      </div>
    );
  }

  const cutDate = resolveCutDate(first(sp.mes));
  const { year, month } = parseYmd(cutDate);
  const data = await getDashboardData(taxpayer, cutDate);
  const rolling = data.periods.find((p) => p.key === "movil12")!;
  const { category, margin } = data;
  const suggestion = category.suggestion;
  const movimientosHref = `/dashboard/movimientos?c=${encodeURIComponent(taxpayer.id)}&desde=${rolling.from}&hasta=${rolling.to}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Categoría y límites" subtitle={`${taxpayer.name} · fecha de corte ${formatDateAR(cutDate)}`}>
        <TaxpayerPicker
          action="/dashboard/categoria"
          taxpayers={taxpayers.map((t) => ({ id: t.id, label: t.name }))}
          selectedId={taxpayer.id}
          months={monthOptions()}
          selectedMonth={monthKey(year, month)}
        />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="font-semibold text-slate-900">Categoría registrada</h2>
            <p className="tabular mt-2 text-3xl font-semibold text-slate-900">{category.code ?? "Sin categoría"}</p>
            <p className="mt-1 text-sm text-slate-600">
              {category.since ? `Rige desde el ${formatDateAR(category.since)}` : "Sin fecha de inicio registrada"} · Cargada
              por el estudio
            </p>
            <p className="mt-3 text-xs text-slate-500">
              La categoría solo la cambia el estudio. ContadorSmart nunca la modifica en forma automática.
            </p>
          </Card>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Categoría orientativa por ingresos</h2>
              <Badge tone="info">Orientativa</Badge>
            </div>
            {suggestion.available ? (
              <>
                <p className="tabular mt-2 text-3xl font-semibold text-slate-900">
                  {suggestion.code ?? "Fuera de escala"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {suggestion.aboveTop
                    ? "Los ingresos de los últimos 12 meses superan el límite de la categoría más alta de la escala."
                    : `Es la menor categoría cuyo límite cubre ${formatARS(rolling.totalCents ?? 0n)} de ingresos en los últimos 12 meses.`}
                </p>
                {suggestion.code && category.code && suggestion.code !== category.code && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    No coincide con la categoría registrada ({category.code}). Consultá con el estudio antes de hacer cualquier
                    trámite.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No se puede sugerir: {suggestion.reason} Consultá con el estudio.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Solo mira los ingresos. La categoría correcta depende también de otros parámetros (superficie, energía,
              alquileres, precio unitario, etc.), así que no es una determinación oficial.
            </p>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <MarginCard margin={margin} />
        </div>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">Cómo se calcula</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Período de referencia</dt>
            <dd className="text-slate-800">
              {formatDateAR(rolling.from)} al {formatDateAR(rolling.to)} · doce meses calendario hasta la fecha de corte
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Ingresos computables</dt>
            <dd className="text-slate-800">
              {rolling.totalCents === null ? "Información incompleta" : formatARS(rolling.totalCents)} ·{" "}
              <Link href={movimientosHref} className="font-medium text-brand-700 hover:underline">
                ver {rolling.invoiceCount} {rolling.invoiceCount === 1 ? "comprobante" : "comprobantes"}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Datos del período</dt>
            <dd className={rolling.coverage === "COMPLETA" ? "text-slate-800" : "text-amber-800"}>
              {COVERAGE_TEXT[rolling.coverage]}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Qué suma</dt>
            <dd className="text-slate-800">
              Comprobantes verificados y, solo en la demo, facturas emitidas en simulación. No suman borradores ni rechazos.
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Margen</dt>
            <dd className="text-slate-800">
              Límite de la categoría registrada − ingresos computables.
              {margin.available && (
                <>
                  {" "}
                  {formatARS(margin.limitCents)} − {formatARS(margin.incomeCents)} ={" "}
                  <strong className={margin.marginCents < 0n ? "text-red-700" : ""}>{formatARS(margin.marginCents)}</strong>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Consumo del límite</dt>
            <dd className="text-slate-800">
              Ingresos ÷ límite × 100{margin.available && <> = {formatPercent(margin.percentTenths)}</>}. Alertas: 80 %
              preventivo, 95 % próximo, más de 100 % superado.
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Reglas {data.rulesVersion} · Moneda {data.currency} · Ambiente {data.environment}. Es una referencia de
          seguimiento: no es el cálculo oficial de una recategorización.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Escala aplicada</h2>
            {category.scale && (
              <p className="mt-1 text-sm text-slate-600">
                {category.scale.name} · vigencia {validityText(category.scale)} · fuente: {category.scale.source}
              </p>
            )}
          </div>
          {category.scale && <ScaleStatusBadge status={category.scale.status} />}
        </div>
        {!category.scale ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No hay una escala vigente a la fecha de corte. Sin escala no se calcula el margen ni se sugiere una categoría.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <caption className="sr-only">Límites anuales de la escala aplicada</caption>
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Categoría</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Límite anual de ingresos</th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Referencias</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {category.scale.limits.map((l) => {
                  const registered = l.code === category.code;
                  const suggested = suggestion.available && suggestion.code === l.code;
                  return (
                    <tr key={l.code} className={registered ? "bg-brand-50" : ""}>
                      <td className="py-2 pr-4 font-medium">{l.code}</td>
                      <td className="tabular py-2 pr-4 text-right">{formatARS(l.annualLimitCents)}</td>
                      <td className="flex flex-wrap gap-1 py-2">
                        {registered && <Badge tone="brand">Registrada</Badge>}
                        {suggested && <Badge tone="info">Orientativa</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
