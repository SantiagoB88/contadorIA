import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { SR_STATUS_LABEL } from "@/lib/constants";
import { formatDateTimeAR } from "@/lib/dates";
import { listInbox } from "@/modules/requests/service";
import { PriorityBadge, RequestStatusBadge, topicLabel } from "@/components/requests/RequestViews";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Bandeja de solicitudes · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_FILTERS = [
  { key: "activas", label: "Sin resolver" },
  ...Object.entries(SR_STATUS_LABEL).map(([key, label]) => ({ key, label })),
  { key: "todas", label: "Todas" },
];

const ASSIGNED_FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "mias", label: "Asignadas a mí" },
  { key: "sin", label: "Sin asignar" },
];

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
        active ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const status = STATUS_FILTERS.some((s) => s.key === first(sp.estado)) ? first(sp.estado)! : "activas";
  const assigned = ASSIGNED_FILTERS.some((a) => a.key === first(sp.asignado)) ? first(sp.asignado)! : "todas";

  const { rows, counts } = await listInbox(admin, { status, assigned });
  const href = (over: { estado?: string; asignado?: string }) =>
    `/admin/solicitudes?estado=${over.estado ?? status}&asignado=${over.asignado ?? assigned}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bandeja de solicitudes"
        subtitle={`${counts.active} sin resolver · ${counts.fresh} nuevas · ${counts.unassigned} sin asignar · ${counts.mine} asignadas a vos`}
      />

      <div className="space-y-3">
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <Chip key={s.key} href={href({ estado: s.key })} active={status === s.key}>
              {s.label}
            </Chip>
          ))}
        </nav>
        <nav aria-label="Filtrar por asignación" className="flex flex-wrap gap-2">
          {ASSIGNED_FILTERS.map((a) => (
            <Chip key={a.key} href={href({ asignado: a.key })} active={assigned === a.key}>
              {a.label}
              {a.key === "mias" && ` (${counts.mine})`}
              {a.key === "sin" && ` (${counts.unassigned})`}
            </Chip>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No hay solicitudes con este filtro" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100 sm:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/solicitudes/${r.id}`} className="block space-y-1 px-4 py-3 text-sm hover:bg-slate-50">
                  <p className="font-medium text-navy">{r.subject}</p>
                  <p className="text-slate-600">
                    {r.taxpayer.name} · {topicLabel(r.topic)}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <PriorityBadge priority={r.priority} />
                    <RequestStatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {r.assignedTo?.name ?? "Sin asignar"} · {formatDateTimeAR(r.lastActivityAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Asunto</th>
                  <th scope="col" className="px-4 py-3 font-medium">Contribuyente</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 font-medium">Asignada a</th>
                  <th scope="col" className="px-4 py-3 font-medium">Última actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className={r.status === "ABIERTA" ? "bg-sky-50/40" : ""}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/solicitudes/${r.id}`} className="font-medium text-navy hover:text-brand-700 hover:underline">
                        {r.subject}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {topicLabel(r.topic)} · de {r.createdBy.name} · canal {r.channel === "WEB" ? "web" : r.channel}
                      </p>
                    </td>
                    <td className="px-4 py-3">{r.taxpayer.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <PriorityBadge priority={r.priority} />
                        <RequestStatusBadge status={r.status} />
                      </div>
                    </td>
                    <td className="px-4 py-3">{r.assignedTo?.name ?? <span className="text-slate-500">Sin asignar</span>}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTimeAR(r.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
