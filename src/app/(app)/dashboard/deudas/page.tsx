import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { OBLIGATION_STATUS, ROLES } from "@/lib/constants";
import { formatARS } from "@/lib/money";
import { formatDateAR, formatDateTimeAR } from "@/lib/dates";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { getDebtSummary } from "@/modules/fiscal/obligations";
import { TaxpayerPicker } from "@/components/dashboard/TaxpayerPicker";
import { DEBT_STATE, amountText, debtStateText, formatPeriod, obligationBadge } from "@/components/fiscal/FiscalViews";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Deudas y vencimientos · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DebtsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const taxpayers = await getAccessibleTaxpayers(user);

  if (taxpayers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Deudas y vencimientos" />
        <EmptyState title="Todavía no tenés contribuyentes habilitados" />
      </div>
    );
  }

  const taxpayer = await getAuthorizedTaxpayer(user, first(sp.c) ?? taxpayers[0].id);
  if (!taxpayer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Deudas y vencimientos" />
        <Notice tone="danger" title="No tenés acceso a este contribuyente">
          <Link href="/dashboard/deudas" className="font-medium underline">
            Ver mis deudas
          </Link>
        </Notice>
      </div>
    );
  }

  const debt = await getDebtSummary(taxpayer.id);
  const state = DEBT_STATE[debt.state];
  const canInform = user.role !== ROLES.ADMIN;

  return (
    <div className="space-y-6">
      <PageHeader title="Deudas y vencimientos" subtitle={`${taxpayer.name} · estado al ${formatDateAR(debt.today)}`}>
        <TaxpayerPicker
          action="/dashboard/deudas"
          taxpayers={taxpayers.map((t) => ({ id: t.id, label: t.name }))}
          selectedId={taxpayer.id}
        />
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-600">Estado</h2>
            <Badge tone={state.tone}>{state.label}</Badge>
          </div>
          <p className="mt-3 text-sm text-slate-700">{debtStateText(debt)}</p>
          <p className="mt-3 text-xs text-slate-500">
            {debt.review
              ? `Información al ${formatDateAR(debt.review.asOfDate)} · ${debt.review.source} · revisado ${formatDateTimeAR(debt.review.updatedAt)}`
              : "Sin revisión del estudio."}
          </p>
        </Card>
        <Card>
          <h2 className="text-sm font-medium text-slate-600">Deuda vencida informada</h2>
          {/* Un cero solo se muestra si hay una revisión completa; si no, se dice que no hay dato. */}
          {debt.overdue.length === 0 && debt.state !== "SIN_DEUDA_INFORMADA" ? (
            <p className="mt-2 text-lg font-semibold text-slate-700">{state.label}</p>
          ) : (
            <p className="tabular mt-2 text-2xl font-semibold text-slate-900">{formatARS(debt.overdueTotalCents)}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {debt.overdueWithoutAmount > 0 &&
              `Más ${debt.overdueWithoutAmount} ${debt.overdueWithoutAmount === 1 ? "vencimiento" : "vencimientos"} sin importe informado. `}
            No incluye intereses ni actualizaciones.
          </p>
        </Card>
        <Card>
          <h2 className="text-sm font-medium text-slate-600">Próximos vencimientos</h2>
          <p className="tabular mt-2 text-2xl font-semibold text-slate-900">{debt.upcoming.length}</p>
          <p className="mt-1 text-xs text-slate-500">
            {debt.upcoming[0]
              ? `El próximo vence el ${formatDateAR(debt.upcoming[0].dueDate)}. No se suman como deuda vencida.`
              : "No hay vencimientos pendientes cargados."}
          </p>
        </Card>
      </div>

      {debt.all.length === 0 ? (
        <EmptyState title="No hay vencimientos cargados">
          {debt.state === "SIN_DATOS"
            ? "El estudio todavía no cargó información. Esto no significa que no tengas deuda."
            : "El estudio no informó vencimientos para este contribuyente."}
        </EmptyState>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Concepto</th>
                  <th scope="col" className="px-4 py-3 font-medium">Período</th>
                  <th scope="col" className="px-4 py-3 font-medium">Vencimiento</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Importe</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 font-medium">Fuente y revisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debt.all.map((o) => (
                  <tr key={o.id} className={o.status === "ANULADA" ? "text-slate-500" : ""}>
                    <td className="px-4 py-3">
                      {o.concept}
                      {o.statusNote && <p className="mt-0.5 text-xs text-slate-500">{o.statusNote}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatPeriod(o.period)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3">{formatDateAR(o.dueDate)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{amountText(o)}</td>
                    <td className="px-4 py-3">
                      {obligationBadge(o, debt.today)}
                      {canInform && o.status === OBLIGATION_STATUS.PENDIENTE && (
                        <Link
                          href={`/dashboard/deudas/informar/${o.id}`}
                          className="mt-1 block text-xs font-medium text-brand-700 hover:underline"
                        >
                          Informar pago
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {o.source}
                      <br />
                      {formatDateTimeAR(o.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        En esta versión no hay consulta automática a ARCA: las deudas y vencimientos los carga el estudio. Un pago figura
        como verificado solo cuando el estudio revisó el comprobante; no hay confirmación bancaria. Si ya pagaste, usá
        “Informar pago” y adjuntá el comprobante.
      </p>
    </div>
  );
}
