import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatARS } from "@/lib/money";
import { formatDateAR } from "@/lib/dates";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { formatInvoiceNumber, listInvoices } from "@/modules/billing/service";
import { TaxpayerPicker } from "@/components/dashboard/TaxpayerPicker";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { Card, EmptyState, Notice, PageHeader, inputClass, labelClass } from "@/components/ui";

export const metadata = { title: "Facturación · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "BORRADOR", label: "Borradores" },
  { value: "SIMULADO", label: "Emitidas (simulación)" },
  { value: "RECHAZADO", label: "Rechazadas" },
  { value: "EN_PROCESO", label: "En proceso" },
];

export default async function FacturasPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const taxpayers = await getAccessibleTaxpayers(user);

  if (taxpayers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Facturación" />
        <EmptyState title="Todavía no tenés contribuyentes habilitados">
          <Link href="/perfil#asociar" className="font-medium text-brand-700 hover:underline">
            Asociá tu CUIT
          </Link>{" "}
          para poder facturar.
        </EmptyState>
      </div>
    );
  }

  const taxpayer = await getAuthorizedTaxpayer(user, first(sp.c) ?? taxpayers[0].id);
  if (!taxpayer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Facturación" />
        <Notice tone="danger" title="No tenés acceso a este contribuyente">
          <Link href="/facturas" className="font-medium underline">
            Ver mis facturas
          </Link>
        </Notice>
      </div>
    );
  }

  const filters = {
    status: first(sp.estado) ?? "",
    q: first(sp.q) ?? "",
    from: first(sp.desde) ?? "",
    to: first(sp.hasta) ?? "",
    page: Number(first(sp.pagina) ?? "1") || 1,
  };
  const { rows, total, page, pageCount } = await listInvoices(taxpayer.id, filters);

  const pageHref = (p: number) => {
    const params = new URLSearchParams({ c: taxpayer.id });
    if (filters.status) params.set("estado", filters.status);
    if (filters.q) params.set("q", filters.q);
    if (filters.from) params.set("desde", filters.from);
    if (filters.to) params.set("hasta", filters.to);
    params.set("pagina", String(p));
    return `/facturas?${params.toString()}`;
  };
  const hasFilters = !!(filters.status || filters.q || filters.from || filters.to);

  return (
    <div className="space-y-6">
      <PageHeader title="Facturación" subtitle={`${taxpayer.name} · Factura C · punto de venta de demostración`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TaxpayerPicker
            action="/facturas"
            taxpayers={taxpayers.map((t) => ({ id: t.id, label: t.name }))}
            selectedId={taxpayer.id}
          />
          <Link
            href={`/facturas/nueva?c=${taxpayer.id}`}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            Nueva factura
          </Link>
        </div>
      </PageHeader>

      <Notice tone="warning" title="Facturador en modo demostración">
        Las facturas se emiten con un simulador local: no se envían a ARCA, no tienen CAE y no tienen validez fiscal.
      </Notice>

      <Card>
        <form method="get" action="/facturas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_10rem_10rem_auto] lg:items-end">
          <input type="hidden" name="c" value={taxpayer.id} />
          <div>
            <label htmlFor="q" className={labelClass}>
              Buscar
            </label>
            <input id="q" name="q" defaultValue={filters.q} placeholder="Receptor o concepto" maxLength={100} className={inputClass} />
          </div>
          <div>
            <label htmlFor="estado" className={labelClass}>
              Estado
            </label>
            <select id="estado" name="estado" defaultValue={filters.status} className={inputClass}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="desde" className={labelClass}>
              Desde
            </label>
            <input id="desde" name="desde" type="date" defaultValue={filters.from} className={inputClass} />
          </div>
          <div>
            <label htmlFor="hasta" className={labelClass}>
              Hasta
            </label>
            <input id="hasta" name="hasta" type="date" defaultValue={filters.to} className={inputClass} />
          </div>
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700">
            Filtrar
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={hasFilters ? "No hay facturas con esos filtros" : "Todavía no hiciste ninguna factura"}>
          {hasFilters ? (
            <Link href={`/facturas?c=${taxpayer.id}`} className="font-medium text-brand-700 hover:underline">
              Quitar filtros
            </Link>
          ) : (
            <Link href={`/facturas/nueva?c=${taxpayer.id}`} className="font-medium text-brand-700 hover:underline">
              Crear la primera
            </Link>
          )}
        </EmptyState>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100 sm:hidden">
            {rows.map((inv) => (
              <li key={inv.id}>
                <Link href={`/facturas/${inv.id}`} className="block space-y-1 px-4 py-3 text-sm hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium text-slate-900">{inv.recipientName}</p>
                    <p className="tabular shrink-0 font-semibold">{formatARS(inv.amountCents)}</p>
                  </div>
                  <p className="truncate text-slate-600">{inv.description}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="tabular">{formatDateAR(inv.issueDate)}</span>
                    <span className="tabular font-medium text-brand-700">
                      {inv.number ? formatInvoiceNumber(inv.invoiceType, inv.pointOfSale, inv.number) : "Borrador"}
                    </span>
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-medium">Número</th>
                  <th scope="col" className="px-4 py-3 font-medium">Receptor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Concepto</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="tabular whitespace-nowrap px-4 py-3">{formatDateAR(inv.issueDate)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3">
                      <Link href={`/facturas/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                        {inv.number ? formatInvoiceNumber(inv.invoiceType, inv.pointOfSale, inv.number) : "Ver borrador"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{inv.recipientName}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">{inv.description}</td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatARS(inv.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              {total} {total === 1 ? "factura" : "facturas"} · página {page} de {pageCount}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
                  ← Anterior
                </Link>
              )}
              {page < pageCount && (
                <Link href={pageHref(page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
                  Siguiente →
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
