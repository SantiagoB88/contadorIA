import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { DOC_CATEGORY_LABEL, ROLES } from "@/lib/constants";
import { formatDateTimeAR } from "@/lib/dates";
import { getAccessibleTaxpayers } from "@/modules/taxpayers/access";
import { formatBytes, listDocuments } from "@/modules/documents/service";
import { docCategoryLabel } from "@/components/requests/RequestViews";
import { Badge, Card, EmptyState, PageHeader, inputClass, labelClass } from "@/components/ui";

export const metadata = { title: "Documentos · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const isAdmin = user.role === ROLES.ADMIN;
  const sp = await searchParams;
  const taxpayers = await getAccessibleTaxpayers(user);

  // Un contribuyente del filtro que no está entre los habilitados se ignora (no muestra nada ajeno).
  const taxpayerId = taxpayers.find((t) => t.id === first(sp.c))?.id ?? "";
  const category = first(sp.categoria) ?? "";
  const q = first(sp.q) ?? "";
  const docs = taxpayers.length ? await listDocuments(user, { taxpayerId: taxpayerId || undefined, category, q }) : [];
  const filtered = Boolean(taxpayerId || category || q);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        subtitle={isAdmin ? "Todos los documentos del estudio, incluidos los internos." : "Documentación que compartió el estudio y adjuntos de tus solicitudes."}
      />

      <Card>
        <form action="/documentos" className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div>
            <label htmlFor="c" className={labelClass}>
              Contribuyente
            </label>
            <select id="c" name="c" defaultValue={taxpayerId} className={inputClass}>
              <option value="">Todos</option>
              {taxpayers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="categoria" className={labelClass}>
              Categoría
            </label>
            <select id="categoria" name="categoria" defaultValue={category} className={inputClass}>
              <option value="">Todas</option>
              {Object.entries(DOC_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="q" className={labelClass}>
              Nombre del archivo
            </label>
            <input id="q" name="q" defaultValue={q} maxLength={80} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700">
              Filtrar
            </button>
            {filtered && (
              <Link href="/documentos" className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-100">
                Limpiar
              </Link>
            )}
          </div>
        </form>
      </Card>

      {docs.length === 0 ? (
        <EmptyState title={filtered ? "No hay documentos con estos filtros" : "Todavía no hay documentos"}>
          {!isAdmin && "Cuando el estudio comparta documentación o adjuntes archivos en una solicitud, van a aparecer acá."}
        </EmptyState>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Archivo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Contribuyente</th>
                  <th scope="col" className="px-4 py-3 font-medium">Categoría</th>
                  <th scope="col" className="px-4 py-3 font-medium">Subido por</th>
                  <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Descargar</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate font-medium text-slate-900">{d.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(d.sizeBytes)}
                        {d.note ? ` · ${d.note}` : ""}
                      </p>
                      {d.message && (
                        <Link
                          href={`${isAdmin ? "/admin/solicitudes" : "/solicitudes"}/${d.message.requestId}`}
                          className="text-xs font-medium text-brand-700 hover:underline"
                        >
                          Ver solicitud
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">{d.taxpayer.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span>{docCategoryLabel(d.category)}</span>
                        {isAdmin && d.visibility === "INTERNO" && <Badge tone="warning">Interno</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {d.uploadedBy.name}
                      <span className="block text-xs text-slate-500">{d.uploadedBy.role === ROLES.ADMIN ? "Estudio" : "Cliente"}</span>
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTimeAR(d.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <a href={`/documentos/${d.id}/descargar`} className="font-medium text-brand-700 hover:underline">
                        Descargar
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs text-slate-500">
        Los archivos se guardan en una carpeta privada del servidor y cada descarga se autoriza con tus permisos actuales.
      </p>
    </div>
  );
}
