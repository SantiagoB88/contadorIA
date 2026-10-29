import Link from "next/link";
import { DOC_CATEGORY_LABEL, SR_PRIORITY_LABEL, SR_STATUS_LABEL, SR_TOPIC_LABEL } from "@/lib/constants";
import { formatDateTimeAR } from "@/lib/dates";
import { formatBytes } from "@/modules/documents/service";
import type { RequestView } from "@/modules/requests/service";
import { Badge, type Tone } from "@/components/ui";

// Piezas visuales de solicitudes y documentos (sin lógica de negocio).

const STATUS_TONE: Record<string, Tone> = {
  ABIERTA: "info",
  EN_CURSO: "brand",
  ESPERANDO_CLIENTE: "warning",
  RESUELTA: "success",
};

export function RequestStatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{SR_STATUS_LABEL[status] ?? status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority !== "ALTA") return null;
  return <Badge tone="danger">Prioridad {SR_PRIORITY_LABEL.ALTA.toLowerCase()}</Badge>;
}

export const topicLabel = (topic: string) => SR_TOPIC_LABEL[topic] ?? topic;

export const statusOptions = Object.entries(SR_STATUS_LABEL).map(([value, label]) => ({ value, label }));

export const docCategoryLabel = (c: string) => DOC_CATEGORY_LABEL[c] ?? c;

export function DownloadLink({ doc }: { doc: { id: string; fileName: string; sizeBytes: number } }) {
  return (
    <a
      href={`/documentos/${doc.id}/descargar`}
      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-800"
    >
      <span aria-hidden="true">📎</span>
      <span className="truncate">{doc.fileName}</span>
      <span className="shrink-0 text-xs text-slate-500">{formatBytes(doc.sizeBytes)}</span>
    </a>
  );
}

/** Conversación. Para el cliente, `request.messages` ya viene sin notas internas desde el servidor. */
export function Conversation({ request, viewerIsStaff }: { request: RequestView; viewerIsStaff: boolean }) {
  return (
    <ol className="space-y-4">
      {request.messages.map((m) => {
        const internal = m.visibility === "INTERNA";
        const mine = m.author.fromStudy === viewerIsStaff;
        return (
          <li
            key={m.id}
            className={`rounded-xl border p-4 ${
              internal
                ? "border-amber-300 bg-amber-50"
                : m.author.fromStudy
                  ? "border-accent/40 bg-soft"
                  : "border-slate-200 bg-white"
            } ${mine ? "sm:ml-10" : "sm:mr-10"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-medium text-navy">
                {m.author.name}
                <span className="ml-2 font-normal text-slate-500">{m.author.fromStudy ? "Estudio" : "Cliente"}</span>
              </p>
              <div className="flex items-center gap-2">
                {internal && <Badge tone="warning">Nota interna · el cliente no la ve</Badge>}
                <span className="tabular text-xs text-slate-500">{formatDateTimeAR(m.createdAt)}</span>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{m.body}</p>
            {m.documents.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.documents.map((d) => (
                  <DownloadLink key={d.id} doc={d} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type RequestRow = {
  id: string;
  subject: string;
  topic: string;
  status: string;
  priority: string;
  lastActivityAt: Date;
  taxpayer: { name: string };
  assignedTo: { name: string } | null;
};

/** Lista compacta (tablero y ficha del contribuyente). */
export function RequestList({ rows, hrefBase, empty }: { rows: RequestRow[]; hrefBase: string; empty: string }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="mt-2 divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <Link href={`${hrefBase}/${r.id}`} className="font-medium text-navy hover:text-brand-700 hover:underline">
              {r.subject}
            </Link>
            <p className="text-xs text-slate-500">
              {topicLabel(r.topic)} · última actividad {formatDateTimeAR(r.lastActivityAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            <PriorityBadge priority={r.priority} />
            <RequestStatusBadge status={r.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
