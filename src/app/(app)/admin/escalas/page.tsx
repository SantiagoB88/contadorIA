import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { centsToInput, formatARS } from "@/lib/money";
import { todayAR } from "@/lib/dates";
import { CATEGORY_CODES } from "@/lib/constants";
import { findScaleForDate, listScales, sortedLimits } from "@/modules/fiscal/scales";
import { ScaleForm, type ScaleDefaults } from "@/components/fiscal/FiscalForms";
import { ScaleStatusBadge, validityText } from "@/components/fiscal/FiscalViews";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Escalas · ContadorSmart" };

export default async function ScalesPage() {
  const admin = await requireAdmin();
  const today = todayAR();
  const [scales, current] = await Promise.all([listScales(admin.studyId), findScaleForDate(admin.studyId, today)]);

  // La versión nueva parte de los límites de la vigente: alcanza con corregir los que cambian.
  const base = current ?? scales[0] ?? null;
  const defaults: ScaleDefaults = {
    name: "",
    source: "",
    status: "DEMO",
    validFrom: today,
    validTo: "",
    limits: Object.fromEntries(
      CATEGORY_CODES.map((code) => {
        const limit = base?.limits.find((l) => l.code === code);
        return [code, limit ? centsToInput(limit.annualLimitCents) : ""];
      }),
    ),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escalas de categorías"
        subtitle="Límites anuales de ingresos por categoría, con vigencia y fuente. Cada cálculo usa la escala vigente a su fecha de corte."
      />

      {!current && (
        <Notice tone="warning" title="No hay una escala vigente hoy">
          Sin escala vigente el tablero no calcula márgenes ni alertas. Cargá una versión nueva.
        </Notice>
      )}

      {scales.length === 0 ? (
        <EmptyState title="Todavía no hay escalas cargadas" />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Versión</th>
                  <th scope="col" className="px-4 py-3 font-medium">Vigencia</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 font-medium">Categorías</th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scales.map((s) => {
                  const limits = sortedLimits(s.limits);
                  const last = limits[limits.length - 1];
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900">{s.name}</span>
                        {current?.id === s.id && (
                          <span className="ml-2">
                            <Badge tone="brand">Vigente hoy</Badge>
                          </span>
                        )}
                        <p className="mt-0.5 text-xs text-slate-500">{s.source}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{validityText(s)}</td>
                      <td className="px-4 py-3">
                        <ScaleStatusBadge status={s.status} />
                      </td>
                      <td className="tabular px-4 py-3 text-slate-600">
                        {last ? `${limits[0].code} a ${last.code} · tope ${formatARS(last.annualLimitCents)}` : "Sin límites"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link href={`/admin/escalas/${s.id}`} className="font-medium text-brand-700 hover:underline">
                          Ver y editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-slate-900">Nueva versión</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          Se precarga con los límites de la escala vigente. Si la versión vigente no tiene fecha de fin, se cierra sola el
          día anterior al inicio de la nueva. No cargues valores oficiales sin su fuente.
        </p>
        <ScaleForm mode="create" defaults={defaults} />
      </Card>
    </div>
  );
}
