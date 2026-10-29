import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION_LABEL, REQUEST_STATUS, SR_STATUS } from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR, todayAR } from "@/lib/dates";
import { getDashboardData, type AlertLevel } from "@/modules/dashboard/metrics";
import { getDebtSummary } from "@/modules/fiscal/obligations";
import { DEBT_STATE } from "@/components/fiscal/FiscalViews";
import { Badge, Card, EmptyState, PageHeader, type Tone } from "@/components/ui";

export const metadata = { title: "Backoffice · ContadorSmart" };

const LEVEL: Record<AlertLevel, { label: string; tone: Tone }> = {
  NORMAL: { label: "Normal", tone: "success" },
  PREVENTIVO: { label: "Preventivo", tone: "warning" },
  PROXIMO: { label: "Próximo al límite", tone: "warning" },
  SUPERADO: { label: "Superado", tone: "danger" },
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  const today = todayAR();

  const [taxpayers, events, pendingAccesses, openRequests, unassignedRequests] = await Promise.all([
    prisma.taxpayer.findMany({ where: { studyId: admin.studyId }, orderBy: { name: "asc" } }),
    prisma.auditEvent.findMany({ where: { studyId: admin.studyId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.accessRequest.count({ where: { status: REQUEST_STATUS.PENDIENTE, studyId: admin.studyId } }),
    prisma.serviceRequest.count({ where: { studyId: admin.studyId, status: { not: SR_STATUS.RESUELTA } } }),
    prisma.serviceRequest.count({ where: { studyId: admin.studyId, status: { not: SR_STATUS.RESUELTA }, assignedToId: null } }),
  ]);

  // Con pocos contribuyentes alcanza con calcular uno por uno usando el mismo servicio del tablero.
  const rows = await Promise.all(
    taxpayers.map(async (t) => {
      const [data, debt] = await Promise.all([getDashboardData(t, today), getDebtSummary(t.id, today)]);
      return { taxpayer: t, data, debt };
    }),
  );

  const actorIds = [...new Set(events.map((e) => e.actorId).filter((id): id is string => !!id))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const withAlerts = rows.filter((r) => r.data.margin.available && r.data.margin.level !== "NORMAL").length;
  const incomplete = rows.filter((r) => !r.data.coverage?.complete).length;
  const withDebt = rows.filter((r) => r.debt.state === "DEUDA_INFORMADA").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Backoffice" subtitle={`${admin.studyName} · resumen operativo`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-600">Contribuyentes</p>
          <p className="tabular mt-1 text-2xl font-semibold">{taxpayers.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Con alerta de límite</p>
          <p className="tabular mt-1 text-2xl font-semibold">{withAlerts}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Con datos incompletos</p>
          <p className="tabular mt-1 text-2xl font-semibold">{incomplete}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Con deuda informada</p>
          <p className="tabular mt-1 text-2xl font-semibold">{withDebt}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Asociaciones por validar</p>
          <p className="tabular mt-1 text-2xl font-semibold">{pendingAccesses}</p>
          <Link href="/admin/accesos" className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline">
            Ver accesos →
          </Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Solicitudes sin resolver</p>
          <p className="tabular mt-1 text-2xl font-semibold">{openRequests}</p>
          <Link
            href="/admin/solicitudes?estado=activas&asignado=sin"
            className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            {unassignedRequests} sin asignar →
          </Link>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No hay contribuyentes cargados" />
      ) : (
        <Card className="p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-navy">Contribuyentes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Nombre</th>
                  <th scope="col" className="px-4 py-3 font-medium">CUIT</th>
                  <th scope="col" className="px-4 py-3 font-medium">Cat.</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Últimos 12 meses</th>
                  <th scope="col" className="px-4 py-3 font-medium">Límite</th>
                  <th scope="col" className="px-4 py-3 font-medium">Deuda</th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ taxpayer, data, debt }) => {
                  const rolling = data.periods.find((p) => p.key === "movil12")!;
                  return (
                    <tr key={taxpayer.id}>
                      <td className="px-4 py-3 font-medium text-navy">{taxpayer.name}</td>
                      <td className="tabular whitespace-nowrap px-4 py-3">{formatCuit(taxpayer.cuit)}</td>
                      <td className="px-4 py-3">{taxpayer.categoryCode ?? "—"}</td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                        {rolling.totalCents === null ? "Sin datos" : formatARS(rolling.totalCents)}
                        {rolling.coverage === "PARCIAL" && <span className="ml-1 text-xs text-amber-700">(parcial)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {data.margin.available ? (
                          <Badge tone={LEVEL[data.margin.level].tone}>{LEVEL[data.margin.level].label}</Badge>
                        ) : (
                          <Badge tone="warning">Info. incompleta</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={DEBT_STATE[debt.state].tone}>{DEBT_STATE[debt.state].label}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          href={`/dashboard?c=${taxpayer.id}`}
                          className="mr-3 font-medium text-brand-700 hover:underline"
                        >
                          Tablero
                        </Link>
                        <Link
                          href={`/admin/contribuyentes/${taxpayer.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          Administrar
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
        <h2 className="font-semibold text-navy">Actividad reciente</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Todavía no hay eventos registrados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
                <span className="text-slate-800">
                  <strong className="font-medium">{e.actorId ? (actorName.get(e.actorId) ?? "Usuario") : "Sistema"}</strong>{" "}
                  · {AUDIT_ACTION_LABEL[e.action] ?? e.action}
                  {e.detail ? ` · ${e.detail}` : ""}
                </span>
                <span className="tabular shrink-0 text-slate-500">{formatDateTimeAR(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
