import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { centsToInput, formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/dates";
import { CATEGORY_CODES } from "@/lib/constants";
import { getStudyScale, sortedLimits } from "@/modules/fiscal/scales";
import { ScaleForm } from "@/components/fiscal/FiscalForms";
import { ScaleStatusBadge, validityText } from "@/components/fiscal/FiscalViews";
import { Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Escala · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ScalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  // Solo escalas del estudio del administrador.
  const scale = await getStudyScale(admin.studyId, id);
  if (!scale) notFound();

  const events = await prisma.auditEvent.findMany({
    where: { studyId: admin.studyId, entity: "TaxScaleVersion", entityId: scale.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const limits = sortedLimits(scale.limits);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/escalas" className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver a escalas
        </Link>
      </div>
      <PageHeader
        title={scale.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Vigencia: {validityText(scale)} <ScaleStatusBadge status={scale.status} />
          </span>
        }
      />

      {sp.creada && <Notice title="Versión creada">Ya se usa en los cálculos de las fechas que cubre.</Notice>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-semibold text-navy">Límites</h2>
          <p className="mt-1 text-sm text-slate-600">Fuente: {scale.source}</p>
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">Límite anual por categoría</caption>
            <thead className="text-slate-500">
              <tr>
                <th scope="col" className="py-1 text-left font-medium">Categoría</th>
                <th scope="col" className="py-1 text-right font-medium">Límite anual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {limits.map((l) => (
                <tr key={l.code}>
                  <td className="py-1.5">{l.code}</td>
                  <td className="tabular py-1.5 text-right">{formatARS(l.annualLimitCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-semibold text-navy">Editar versión</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Si los valores cambian desde una fecha nueva, conviene crear otra versión en lugar de editar esta.
          </p>
          <ScaleForm
            mode="edit"
            scaleId={scale.id}
            defaults={{
              name: scale.name,
              source: scale.source,
              status: scale.status,
              validFrom: scale.validFrom,
              validTo: scale.validTo ?? "",
              limits: Object.fromEntries(
                CATEGORY_CODES.map((code) => {
                  const l = scale.limits.find((x) => x.code === code);
                  return [code, l ? centsToInput(l.annualLimitCents) : ""];
                }),
              ),
            }}
          />
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-navy">Historial de cambios</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Sin cambios registrados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
                <span className="text-slate-800">{e.detail}</span>
                <span className="tabular shrink-0 text-slate-500">{formatDateTimeAR(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
