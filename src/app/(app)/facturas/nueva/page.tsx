import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { DOC_TYPE_LABEL } from "@/lib/constants";
import { addDaysYmd, todayAR } from "@/lib/dates";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { listRecipients, MAX_DAYS_BACK } from "@/modules/billing/service";
import { InvoiceForm } from "@/components/billing/InvoiceForm";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Nueva factura · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NuevaFacturaPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const taxpayers = await getAccessibleTaxpayers(user);
  if (taxpayers.length === 0) {
    return <EmptyState title="Todavía no tenés contribuyentes habilitados para facturar" />;
  }
  const taxpayer = await getAuthorizedTaxpayer(user, first(sp.c) ?? taxpayers[0].id);
  if (!taxpayer) {
    return <Notice tone="danger" title="No tenés acceso a este contribuyente" />;
  }

  const recipients = await listRecipients(taxpayer.id);
  const today = todayAR();
  const minDate = [addDaysYmd(today, -MAX_DAYS_BACK), taxpayer.startDate].sort().at(-1)!;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/facturas?c=${taxpayer.id}`} className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver a facturación
        </Link>
      </div>
      <PageHeader title="Nueva factura" subtitle={`Emisor: ${taxpayer.name} · Factura C (monotributo)`} />
      <Notice tone="warning" title="Modo DEMO">
        Primero se guarda como borrador. En el paso siguiente revisás y confirmás una emisión <strong>simulada</strong>, sin
        validez fiscal.
      </Notice>
      <Card>
        <InvoiceForm
          taxpayerId={taxpayer.id}
          recipients={recipients.map((r) => ({
            id: r.id,
            label: `${r.name}${r.docNumber ? ` · ${DOC_TYPE_LABEL[r.docType] ?? r.docType} ${r.docNumber}` : ""}`,
          }))}
          initial={{
            issueDate: today,
            recipientMode: recipients.length > 0 ? "existente" : "nuevo",
            recipientId: "",
            recipientName: "",
            docType: "CUIT",
            docNumber: "",
            taxCondition: "CONSUMIDOR_FINAL",
            saveRecipient: true,
            items: [],
          }}
          today={today}
          minDate={minDate}
        />
      </Card>
    </div>
  );
}
