import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OBLIGATION_STATUS, OBLIGATION_STATUS_LABEL } from "@/lib/constants";
import { formatDateAR } from "@/lib/dates";
import { getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { InformPaymentForm } from "@/components/requests/RequestForms";
import { amountText, formatPeriod } from "@/components/fiscal/FiscalViews";
import { Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Informar pago · ContadorSmart" };

export default async function InformPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const obligation = await prisma.obligation.findFirst({ where: { id, studyId: user.studyId } });
  const taxpayer = obligation ? await getAuthorizedTaxpayer(user, obligation.taxpayerId) : null;
  if (!obligation || !taxpayer) notFound();

  const back = `/dashboard/deudas?c=${encodeURIComponent(taxpayer.id)}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver a deudas
        </Link>
      </div>
      <PageHeader title="Informar un pago" subtitle={taxpayer.name} />

      <Card className="max-w-2xl">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Concepto</dt>
            <dd className="text-navy">{obligation.concept}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Período</dt>
            <dd className="text-navy">{formatPeriod(obligation.period)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Vencimiento</dt>
            <dd className="tabular text-navy">{formatDateAR(obligation.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Importe informado por el estudio</dt>
            <dd className="tabular text-navy">{amountText(obligation)}</dd>
          </div>
        </dl>
      </Card>

      {obligation.status !== OBLIGATION_STATUS.PENDIENTE ? (
        <Notice tone="warning" title="Este vencimiento ya no está pendiente">
          Estado actual: {OBLIGATION_STATUS_LABEL[obligation.status] ?? obligation.status}.
        </Notice>
      ) : (
        <Card className="max-w-2xl">
          <p className="mb-4 text-sm text-slate-600">
            Adjuntá el comprobante. El vencimiento va a quedar como “pago informado” hasta que el estudio lo revise; recién ahí
            figura como pagado.
          </p>
          <InformPaymentForm obligationId={obligation.id} />
        </Card>
      )}
    </div>
  );
}
