import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { APP_MODE, SOURCE_LABEL, STATUS_LABEL } from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatARS } from "@/lib/money";
import { formatDateAR, todayAR } from "@/lib/dates";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CategoryForm, CoverageForm, InvoiceForm } from "@/components/admin/AdminForms";

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

  const [invoices, scale] = await Promise.all([
    prisma.invoice.findMany({
      where: { taxpayerId: taxpayer.id, environment: APP_MODE },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 15,
    }),
    prisma.taxScaleVersion.findFirst({ orderBy: { validFrom: "desc" }, include: { limits: true } }),
  ]);
  const codes = (scale?.limits ?? []).map((l) => l.code).sort();
  const today = todayAR();

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
          <h2 className="font-semibold text-slate-900">Cargar comprobante manual</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Queda como “Cargado por el estudio” y suma enseguida en el tablero.
          </p>
          <InvoiceForm taxpayerId={taxpayer.id} today={today} />
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold text-slate-900">Categoría</h2>
            <p className="mt-1 mb-4 text-sm text-slate-600">
              Actual: <strong>{taxpayer.categoryCode ?? "sin categoría"}</strong>
              {scale && (
                <>
                  {" "}· {scale.name} {scale.status === "DEMO" && <Badge tone="warning">Ficticia</Badge>}
                </>
              )}
            </p>
            <CategoryForm taxpayerId={taxpayer.id} current={taxpayer.categoryCode} codes={codes} />
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">Cobertura de datos</h2>
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

      <Card>
        <h2 className="font-semibold text-slate-900">Usuarios con acceso</h2>
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
        <p className="mt-3 text-xs text-slate-500">La aprobación y revocación de accesos se suma en el paso 2.</p>
      </Card>

      <Card className="p-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Últimos comprobantes</h2>
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
