import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { formatDateTimeAR } from "@/lib/dates";
import { getAccessibleTaxpayers } from "@/modules/taxpayers/access";
import { listRequestsForUser } from "@/modules/requests/service";
import { PriorityBadge, RequestStatusBadge, topicLabel } from "@/components/requests/RequestViews";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Solicitudes · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const VIEWS = [
  { key: "activas", label: "En curso" },
  { key: "resueltas", label: "Resueltas" },
  { key: "todas", label: "Todas" },
];

export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (user.role === ROLES.ADMIN) redirect("/admin/solicitudes");
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === first(sp.ver)) ? first(sp.ver)! : "activas";

  const taxpayers = await getAccessibleTaxpayers(user);
  const rows = await listRequestsForUser(user, { view });

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitudes al estudio" subtitle="Consultas, pedidos de documentación y pagos informados.">
        {taxpayers.length > 0 && (
          <Link
            href="/solicitudes/nueva"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            Nueva solicitud
          </Link>
        )}
      </PageHeader>

      <nav aria-label="Filtrar solicitudes" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/solicitudes?ver=${v.key}`}
            aria-current={view === v.key ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              view === v.key ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {taxpayers.length === 0 ? (
        <EmptyState title="Todavía no tenés contribuyentes habilitados">
          Cuando el estudio apruebe tu acceso vas a poder enviarle solicitudes desde acá.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={view === "resueltas" ? "No hay solicitudes resueltas" : "No tenés solicitudes en curso"}>
          Para consultar algo al estudio o mandarle documentación, tocá “Nueva solicitud”.
        </EmptyState>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/solicitudes/${r.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                    {r.subject}
                  </Link>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {r.taxpayer.name} · {topicLabel(r.topic)}
                  </p>
                  <p className="text-xs text-slate-500">Última actividad {formatDateTimeAR(r.lastActivityAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <PriorityBadge priority={r.priority} />
                  <RequestStatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
