import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { COUNTED_INVOICE_STATUSES, SOURCE_LABEL, STATUS_LABEL } from "@/lib/constants";
import { formatARS } from "@/lib/money";
import { formatDateAR, isValidYmd, todayAR } from "@/lib/dates";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { getInvoices, periodRanges } from "@/modules/dashboard/metrics";
import { TaxpayerPicker } from "@/components/dashboard/TaxpayerPicker";
import { Badge, Card, EmptyState, Notice, PageHeader, inputClass, labelClass } from "@/components/ui";

export const metadata = { title: "Movimientos · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MovimientosPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const taxpayers = await getAccessibleTaxpayers(user);

  if (taxpayers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Movimientos" />
        <EmptyState title="Todavía no tenés contribuyentes habilitados" />
      </div>
    );
  }

  const taxpayer = await getAuthorizedTaxpayer(user, first(sp.c) ?? taxpayers[0].id);
  if (!taxpayer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Movimientos" />
        <Notice tone="danger" title="No tenés acceso a este contribuyente">
          <Link href="/dashboard/movimientos" className="font-medium underline">
            Ver mis movimientos
          </Link>
        </Notice>
      </div>
    );
  }

  // Por defecto: últimos 12 meses. Fechas inválidas vuelven al valor por defecto.
  const defaults = periodRanges(todayAR()).movil12;
  let from = first(sp.desde) ?? "";
  let to = first(sp.hasta) ?? "";
  const invalidRange = (from !== "" && !isValidYmd(from)) || (to !== "" && !isValidYmd(to));
  if (!isValidYmd(from)) from = defaults.from;
  if (!isValidYmd(to)) to = defaults.to;
  const swapped = from > to;
  if (swapped) [from, to] = [to, from];

  const invoices = await getInvoices(taxpayer.id, from, to);
  const counted = invoices.filter((i) => COUNTED_INVOICE_STATUSES.includes(i.status));
  const total = counted.reduce((acc, i) => acc + i.amountCents, 0n);

  return (
    <div className="space-y-6">
      <PageHeader title="Movimientos" subtitle={`${taxpayer.name} · ${formatDateAR(from)} al ${formatDateAR(to)}`}>
        <TaxpayerPicker
          action="/dashboard/movimientos"
          taxpayers={taxpayers.map((t) => ({ id: t.id, label: t.name }))}
          selectedId={taxpayer.id}
        />
      </PageHeader>

      <Card>
        <form method="get" action="/dashboard/movimientos" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="c" value={taxpayer.id} />
          <div>
            <label htmlFor="desde" className={labelClass}>
              Desde
            </label>
            <input id="desde" name="desde" type="date" defaultValue={from} className={inputClass} />
          </div>
          <div>
            <label htmlFor="hasta" className={labelClass}>
              Hasta
            </label>
            <input id="hasta" name="hasta" type="date" defaultValue={to} className={inputClass} />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            Filtrar
          </button>
        </form>
        {(invalidRange || swapped) && (
          <p className="mt-3 text-sm text-amber-800">
            {invalidRange ? "Alguna fecha no era válida y se usó el rango por defecto." : "Las fechas estaban invertidas y se ordenaron."}
          </p>
        )}
      </Card>

      {invoices.length === 0 ? (
        <EmptyState title="No hay comprobantes en este rango">
          Probá con otras fechas. Si esperabas ver movimientos, consultá al estudio si ya están cargados.
        </EmptyState>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-medium">Receptor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Concepto</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 font-medium">Origen</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const isCounted = COUNTED_INVOICE_STATUSES.includes(inv.status);
                  return (
                    <tr key={inv.id} className={isCounted ? "" : "text-slate-500"}>
                      <td className="tabular whitespace-nowrap px-4 py-3">{formatDateAR(inv.issueDate)}</td>
                      <td className="px-4 py-3">{inv.recipientName}</td>
                      <td className="px-4 py-3">{inv.description}</td>
                      <td className="px-4 py-3">
                        <Badge tone={isCounted ? "success" : "neutral"}>{STATUS_LABEL[inv.status] ?? inv.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{SOURCE_LABEL[inv.source] ?? inv.source}</td>
                      <td className={`tabular whitespace-nowrap px-4 py-3 text-right ${isCounted ? "" : "line-through"}`}>
                        {formatARS(inv.amountCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={5} className="px-4 py-3 font-medium">
                    Total computable ({counted.length} {counted.length === 1 ? "comprobante" : "comprobantes"})
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right font-semibold">{formatARS(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            Los borradores y rechazados se muestran tachados y no suman en el total ni en el tablero.
          </p>
        </Card>
      )}
    </div>
  );
}
