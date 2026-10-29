import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { APP_MODE, SOURCE_LABEL, STATUS_LABEL } from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatARS } from "@/lib/money";
import { formatDateAR, formatDateTimeAR, todayAR } from "@/lib/dates";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CoverageForm, InvoiceForm } from "@/components/admin/AdminForms";
import { CategoryForm, DebtReviewForm, ObligationForm, ObligationStatusForm } from "@/components/fiscal/FiscalForms";
import { DEBT_STATE, ScaleStatusBadge, amountText, debtStateText, formatPeriod, obligationBadge } from "@/components/fiscal/FiscalViews";
import { findScaleForDate } from "@/modules/fiscal/scales";
import { getCategoryHistory } from "@/modules/fiscal/category";
import { getDebtSummary } from "@/modules/fiscal/obligations";
import { listDocuments, formatBytes } from "@/modules/documents/service";
import { listRequestsForUser } from "@/modules/requests/service";
import { DocumentUploadForm, DocumentVisibilityButton } from "@/components/requests/RequestForms";
import { RequestList, docCategoryLabel } from "@/components/requests/RequestViews";
import { DOC_CATEGORY_LABEL } from "@/lib/constants";

export const metadata = { title: "Administrar contribuyente · ContadorSmart" };

const ACCESS_LABEL: Record<string, string> = { APROBADO: "Aprobado", PENDIENTE: "Pendiente", REVOCADO: "Revocado" };

export default async function AdminTaxpayerPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;

  // Solo contribuyentes del estudio del administrador.
  const taxpayer = await prisma.taxpayer.findFirst({
    where: { id, studyId: admin.studyId },
    include: {
      coverage: true,
      accesses: { include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!taxpayer) notFound();

  const today = todayAR();
  const [invoices, scale, history, debt, documents, requests] = await Promise.all([
    prisma.invoice.findMany({
      where: { taxpayerId: taxpayer.id, environment: APP_MODE },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 15,
    }),
    findScaleForDate(admin.studyId, today),
    getCategoryHistory(taxpayer.id),
    getDebtSummary(taxpayer.id, today),
    listDocuments(admin, { taxpayerId: taxpayer.id }),
    listRequestsForUser(admin, { taxpayerId: taxpayer.id, view: "todas" }, 8),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver al backoffice
        </Link>
      </div>
      <PageHeader
        title={taxpayer.name}
        subtitle={`CUIT ${formatCuit(taxpayer.cuit)} · ${taxpayer.activity} · Inicio de actividad ${formatDateAR(taxpayer.startDate)}`}
      >
        <Link
          href={`/dashboard?c=${taxpayer.id}`}
          className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Ver tablero del cliente
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-navy">Cargar comprobante manual</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Queda como “Cargado por el estudio” y suma enseguida en el tablero.
          </p>
          <InvoiceForm taxpayerId={taxpayer.id} today={today} />
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold text-navy">Categoría</h2>
            <p className="mt-1 text-sm text-slate-600">
              Actual: <strong>{taxpayer.categoryCode ?? "sin categoría"}</strong>
              {scale ? (
                <>
                  {" "}· escala vigente: {scale.name} <ScaleStatusBadge status={scale.status} />
                </>
              ) : (
                <> · <span className="text-amber-800">no hay escala vigente hoy</span></>
              )}
            </p>
            <p className="mt-1 mb-4 text-xs text-slate-500">
              El sistema nunca cambia la categoría solo: la registra el estudio, con la fecha desde la que rige.
            </p>
            <CategoryForm taxpayerId={taxpayer.id} current={taxpayer.categoryCode} today={today} />
            {history.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-medium text-slate-700">Historial</h3>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:justify-between sm:gap-3">
                      <span>
                        <strong className="font-medium">{h.code ?? "Sin categoría"}</strong> desde el {formatDateAR(h.validFrom)}
                        <span className="text-slate-500"> · {h.reason}</span>
                      </span>
                      <span className="tabular shrink-0 text-xs text-slate-500">{formatDateTimeAR(h.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold text-navy">Cobertura de datos</h2>
            <p className="mt-1 mb-4 text-sm text-slate-600">
              Indica desde cuándo la facturación está completa. Así el tablero distingue un cero real de un dato faltante.
            </p>
            <CoverageForm
              taxpayerId={taxpayer.id}
              fromDate={taxpayer.coverage?.fromDate ?? null}
              complete={taxpayer.coverage?.complete ?? false}
              today={today}
            />
          </Card>
        </div>
      </div>

      <Card id="deudas" className="scroll-mt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-navy">Deudas y vencimientos</h2>
            <p className="mt-1 text-sm text-slate-600">{debtStateText(debt)}</p>
          </div>
          <Badge tone={DEBT_STATE[debt.state].tone}>{DEBT_STATE[debt.state].label}</Badge>
        </div>
        {debt.review && (
          <p className="mt-2 text-xs text-slate-500">
            Última revisión: información al {formatDateAR(debt.review.asOfDate)} · {debt.review.source} ·{" "}
            {formatDateTimeAR(debt.review.updatedAt)}
            {debt.review.note ? ` · ${debt.review.note}` : ""}
          </p>
        )}

        {debt.all.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100">
            {debt.all.map((o) => (
              <li key={o.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <strong className="font-medium text-navy">{o.concept}</strong>
                    <span className="text-slate-600"> · {formatPeriod(o.period)} · vence {formatDateAR(o.dueDate)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular">{amountText(o)}</span>
                    {obligationBadge(o, debt.today)}
                  </span>
                </div>
                {o.statusNote && <p className="mt-1 text-xs text-slate-500">{o.statusNote}</p>}
                <div className="mt-2">
                  <ObligationStatusForm obligationId={o.id} status={o.status} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 grid gap-6 border-t border-slate-100 pt-5 lg:grid-cols-2">
          <div>
            <h3 className="font-medium text-navy">Cargar vencimiento</h3>
            <p className="mt-1 mb-3 text-sm text-slate-600">Queda como “Cargado por el estudio”. El importe es opcional.</p>
            <ObligationForm taxpayerId={taxpayer.id} currentMonth={today.slice(0, 7)} />
          </div>
          <div>
            <h3 className="font-medium text-navy">Registrar revisión</h3>
            <p className="mt-1 mb-3 text-sm text-slate-600">
              Solo con una revisión “completa a esa fecha” el cliente ve “Sin deuda informada”. Sin revisión ve “No disponible”.
            </p>
            <DebtReviewForm taxpayerId={taxpayer.id} today={today} current={debt.review} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="documentos" className="scroll-mt-6">
          <h2 className="font-semibold text-navy">Documentos</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Se guardan en una carpeta privada. “Solo el estudio” no aparece nunca en el portal del cliente.
          </p>
          <DocumentUploadForm
            taxpayerId={taxpayer.id}
            categories={Object.entries(DOC_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
          />
          {documents.length === 0 ? (
            <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">Todavía no hay documentos.</p>
          ) : (
            <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {documents.map((d) => (
                <li key={d.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <a href={`/documentos/${d.id}/descargar`} className="block truncate font-medium text-navy hover:text-brand-700 hover:underline">
                      {d.fileName}
                    </a>
                    <p className="text-xs text-slate-500">
                      {docCategoryLabel(d.category)} · {formatBytes(d.sizeBytes)} · {d.uploadedBy.name} · {formatDateTimeAR(d.createdAt)}
                    </p>
                    {d.message && (
                      <Link href={`/admin/solicitudes/${d.message.requestId}`} className="text-xs font-medium text-brand-700 hover:underline">
                        Adjunto de una solicitud{d.message.visibility === "INTERNA" ? " (nota interna)" : ""}
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                    <Badge tone={d.visibility === "CLIENTE" ? "success" : "warning"}>
                      {d.visibility === "CLIENTE" ? "Lo ve el cliente" : "Solo el estudio"}
                    </Badge>
                    {d.message?.visibility !== "INTERNA" && <DocumentVisibilityButton documentId={d.id} visibility={d.visibility} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold text-navy">Solicitudes</h2>
            <Link href="/admin/solicitudes" className="text-sm font-medium text-brand-700 hover:underline">
              Bandeja
            </Link>
          </div>
          <RequestList rows={requests} hrefBase="/admin/solicitudes" empty="Este contribuyente no tiene solicitudes." />
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-navy">Usuarios con acceso</h2>
        {taxpayer.accesses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Ningún usuario tiene acceso a este contribuyente.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {taxpayer.accesses.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {a.user.name} <span className="text-slate-500">· {a.user.email}</span>
                </span>
                <Badge tone={a.status === "APROBADO" ? "success" : a.status === "PENDIENTE" ? "warning" : "neutral"}>
                  {ACCESS_LABEL[a.status] ?? a.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Los accesos se aprueban y revocan en{" "}
          <Link href="/admin/accesos" className="font-medium text-brand-700 hover:underline">
            Accesos
          </Link>
          .
        </p>
      </Card>

      <Card className="p-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-navy">Últimos comprobantes</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-600">Todavía no hay comprobantes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-medium">Receptor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 font-medium">Origen</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="tabular whitespace-nowrap px-4 py-3">{formatDateAR(inv.issueDate)}</td>
                    <td className="px-4 py-3">{inv.recipientName}</td>
                    <td className="px-4 py-3">{STATUS_LABEL[inv.status] ?? inv.status}</td>
                    <td className="px-4 py-3 text-slate-600">{SOURCE_LABEL[inv.source] ?? inv.source}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right">{formatARS(inv.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
