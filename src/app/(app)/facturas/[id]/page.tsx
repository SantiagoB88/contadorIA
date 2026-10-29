import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { APP_MODE, DOC_TYPE_LABEL, INVOICE_SOURCE, INVOICE_STATUS, TAX_CONDITION_LABEL } from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatDateAR, formatDateTimeAR } from "@/lib/dates";
import { formatARS, formatQuantity } from "@/lib/money";
import { formatInvoiceNumber, getAuthorizedInvoice } from "@/modules/billing/service";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { DeleteDraftButton, DuplicateButton, EmitPanel } from "@/components/billing/InvoiceActions";
import { Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Factura · ContadorSmart" };

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const invoice = await getAuthorizedInvoice(user, id);
  // Mismo 404 si no existe o si es de otro contribuyente: no se revela nada.
  if (!invoice || invoice.source !== INVOICE_SOURCE.FACTURADOR) notFound();

  const isDraft = invoice.status === INVOICE_STATUS.BORRADOR;
  const number = formatInvoiceNumber(invoice.invoiceType, invoice.pointOfSale, invoice.number);
  const docText =
    invoice.recipientDocType === "CUIT" && invoice.recipientDocNumber
      ? `CUIT ${formatCuit(invoice.recipientDocNumber)}`
      : invoice.recipientDocNumber
        ? `${DOC_TYPE_LABEL[invoice.recipientDocType ?? ""] ?? ""} ${invoice.recipientDocNumber}`
        : "Sin identificar";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/facturas?c=${invoice.taxpayerId}`} className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver a facturación
        </Link>
      </div>

      <PageHeader
        title={isDraft ? "Revisá la factura" : `Factura ${number}`}
        subtitle={`Emisor: ${invoice.taxpayer.name} · CUIT ${formatCuit(invoice.taxpayer.cuit)}`}
      >
        <InvoiceStatusBadge status={invoice.status} />
      </PageHeader>

      {invoice.status === INVOICE_STATUS.SIMULADO && (
        <Notice tone="warning" title="Emitida en simulación">
          Esta factura <strong>no tiene validez fiscal</strong>: no se envió a ARCA y no tiene CAE. Suma solo en los
          indicadores de la demo.
        </Notice>
      )}
      {invoice.status === INVOICE_STATUS.RECHAZADO && (
        <Notice tone="danger" title="Emisión rechazada">
          {invoice.rejectionReason ?? "Sin detalle."} No suma en los totales.
        </Notice>
      )}
      {invoice.status === INVOICE_STATUS.EN_PROCESO && (
        <Notice tone="info" title="Emisión en proceso">
          Actualizá la página en unos segundos. Si queda trabada, se reconcilia sola al volver a intentar.
        </Notice>
      )}

      <Card>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">Tipo</dt>
            <dd className="font-medium text-navy">Factura C</dd>
          </div>
          <div>
            <dt className="text-slate-500">Número</dt>
            <dd className="tabular font-medium text-navy">{isDraft ? "Se asigna al emitir" : number}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Fecha</dt>
            <dd className="tabular font-medium text-navy">{formatDateAR(invoice.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Emitida</dt>
            <dd className="font-medium text-navy">{invoice.issuedAt ? formatDateTimeAR(invoice.issuedAt) : "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Receptor</dt>
            <dd className="font-medium text-navy">{invoice.recipientName}</dd>
            <dd className="text-slate-600">
              {docText} · {TAX_CONDITION_LABEL[invoice.recipientTaxCondition ?? ""] ?? "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Concepto</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Cantidad</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Precio unitario</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-3">{it.description}</td>
                  <td className="tabular px-4 py-3 text-right">{formatQuantity(it.quantityMilli)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatARS(it.unitPriceCents)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatARS(it.subtotalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-medium">
                  Total
                </td>
                <td className="tabular whitespace-nowrap px-4 py-3 text-right text-lg font-semibold">
                  {formatARS(invoice.amountCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {isDraft && (
        <Card>
          <h2 className="font-semibold text-navy">Confirmar</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Modo de trabajo: <strong>{APP_MODE}</strong>. La emisión es simulada: se asigna un número interno y queda en el
            historial, pero no se envía nada a ARCA.
          </p>
          <EmitPanel invoiceId={invoice.id} idempotencyKey={randomUUID()} isDemo={APP_MODE === "DEMO"} />
          <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
            <Link
              href={`/facturas/${invoice.id}/editar`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Editar borrador
            </Link>
            <DeleteDraftButton invoiceId={invoice.id} />
          </div>
        </Card>
      )}

      {!isDraft && invoice.status !== INVOICE_STATUS.EN_PROCESO && (
        <div className="flex flex-wrap gap-3">
          {invoice.status === INVOICE_STATUS.SIMULADO && (
            <a
              href={`/facturas/${invoice.id}/pdf`}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Descargar PDF (sin validez fiscal)
            </a>
          )}
          <DuplicateButton invoiceId={invoice.id} />
        </div>
      )}
    </div>
  );
}
