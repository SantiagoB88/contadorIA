import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { formatDateTimeAR } from "@/lib/dates";
import { getRequestForUser } from "@/modules/requests/service";
import { ReplyForm } from "@/components/requests/RequestForms";
import { Conversation, PriorityBadge, RequestStatusBadge, topicLabel } from "@/components/requests/RequestViews";
import { Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Solicitud · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser();
  const { id } = await params;
  if (user.role === ROLES.ADMIN) redirect(`/admin/solicitudes/${id}`);
  const sp = await searchParams;

  // Se autoriza en el servidor y la consulta ya excluye las notas internas.
  const request = await getRequestForUser(user, id);
  if (!request) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/solicitudes" className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver a solicitudes
        </Link>
      </div>
      <PageHeader
        title={request.subject}
        subtitle={`${request.taxpayer.name} · ${topicLabel(request.topic)} · creada ${formatDateTimeAR(request.createdAt)}`}
      >
        <div className="flex flex-wrap gap-1">
          <PriorityBadge priority={request.priority} />
          <RequestStatusBadge status={request.status} />
        </div>
      </PageHeader>

      {sp.enviada && <Notice title="Solicitud enviada">El estudio la va a ver en su bandeja. Te avisamos por correo cuando responda.</Notice>}
      {sp.pago && (
        <Notice title="Pago informado">
          El vencimiento quedó como “pago informado”. Cuando el estudio revise el comprobante lo va a marcar como verificado.
        </Notice>
      )}
      {request.status === "ESPERANDO_CLIENTE" && (
        <Notice tone="warning" title="El estudio espera tu respuesta">
          Respondé abajo con lo que te pidieron.
        </Notice>
      )}

      <p className="text-sm text-slate-600">
        {request.assignedTo ? `La atiende ${request.assignedTo.name}.` : "Todavía no la tomó nadie del estudio."}
      </p>

      <Conversation request={request} viewerIsStaff={false} />

      <Card>
        <h2 className="mb-4 font-semibold text-navy">{request.status === "RESUELTA" ? "¿Necesitás algo más?" : "Responder"}</h2>
        {request.status === "RESUELTA" && (
          <p className="-mt-2 mb-4 text-sm text-slate-600">Si escribís, la solicitud vuelve a quedar en curso.</p>
        )}
        <ReplyForm requestId={request.id} staff={false} statuses={[]} />
      </Card>
    </div>
  );
}
