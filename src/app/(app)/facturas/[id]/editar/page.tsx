import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DOC_TYPE_LABEL, INVOICE_SOURCE, INVOICE_STATUS } from "@/lib/constants";
import { addDaysYmd, todayAR } from "@/lib/dates";
import { formatQuantity } from "@/lib/money";
import { getAuthorizedInvoice, listRecipients, MAX_DAYS_BACK } from "@/modules/billing/service";
import { InvoiceForm } from "@/components/billing/InvoiceForm";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Editar borrador · ContadorSmart" };

/** "12345" centavos → "123,45" (formato que acepta el formulario). */
function centsToInput(cents: bigint): string {
  const pesos = cents / 100n;
  const rest = cents % 100n;
  return rest === 0n ? pesos.toString() : `${pesos},${rest.toString().padStart(2, "0")}`;
}

export default async function EditarFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const invoice = await getAuthorizedInvoice(user, id);
  if (!invoice || invoice.source !== INVOICE_SOURCE.FACTURADOR) notFound();
  if (invoice.status !== INVOICE_STATUS.BORRADOR) redirect(`/facturas/${invoice.id}`);

  const recipients = await listRecipients(invoice.taxpayerId);
  const today = todayAR();
  const minDate = [addDaysYmd(today, -MAX_DAYS_BACK), invoice.taxpayer.startDate].sort().at(-1)!;
  const savedRecipient = invoice.recipientId && recipients.some((r) => r.id === invoice.recipientId);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/facturas/${invoice.id}`} className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver al borrador
        </Link>
      </div>
      <PageHeader title="Editar borrador" subtitle={`Emisor: ${invoice.taxpayer.name} · Factura C (monotributo)`} />
      <Card>
        <InvoiceForm
          taxpayerId={invoice.taxpayerId}
          invoiceId={invoice.id}
          recipients={recipients.map((r) => ({
            id: r.id,
            label: `${r.name}${r.docNumber ? ` · ${DOC_TYPE_LABEL[r.docType] ?? r.docType} ${r.docNumber}` : ""}`,
          }))}
          initial={{
            issueDate: invoice.issueDate,
            recipientMode: savedRecipient ? "existente" : "nuevo",
            recipientId: invoice.recipientId ?? "",
            recipientName: invoice.recipientName,
            docType: invoice.recipientDocType ?? "CUIT",
            docNumber: invoice.recipientDocNumber ?? "",
            taxCondition: invoice.recipientTaxCondition ?? "CONSUMIDOR_FINAL",
            saveRecipient: false,
            items: invoice.items.map((it) => ({
              description: it.description,
              quantity: formatQuantity(it.quantityMilli).replace(/\./g, ""),
              unitPrice: centsToInput(it.unitPriceCents),
            })),
          }}
          today={today}
          minDate={minDate}
        />
      </Card>
    </div>
  );
}
