import { requestCode } from "@/lib/request-code";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { CHANNEL_LABEL, OBLIGATION_STATUS_LABEL } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatDateAR, formatDateTimeAR } from "@/lib/dates";
import { getRequestForUser, listStaff } from "@/modules/requests/service";
import { ReplyForm, RequestSettingsForm } from "@/components/requests/RequestForms";
import { Conversation, PriorityBadge, RequestStatusBadge, statusOptions, topicLabel } from "@/components/requests/RequestViews";
import { formatPeriod } from "@/components/fiscal/FiscalViews";
import { Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Solicitud · Backoffice · ContadorSmart" };

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const [request, staff] = await Promise.all([getRequestForUser(admin, id), listStaff(admin)]);
  if (!request) notFound();
  // Avisos al cliente por WhatsApp (solo si la solicitud llegó por ahí): estado real de cada envío.
  const notices =
    request.channel === "WHATSAPP"
      ? await prisma.outboundMessage.findMany({ where: { requestId: request.id }, orderBy: { createdAt: "desc" }, take: 5 })
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/solicitudes" className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver a la bandeja
        </Link>
      </div>
      <PageHeader
        title={request.subject}
        subtitle={
          <>
            {request.taxpayer ? (
              <Link href={`/admin/contribuyentes/${request.taxpayer.id}`} className="font-medium text-brand-700 hover:underline">
                {request.taxpayer.name}
              </Link>
            ) : (
              <span>Sin contribuyente (alta o acceso pendiente)</span>
            )}{" "}
            · {requestCode(request.id)} · {topicLabel(request.topic)} · creada por {request.createdBy.name} el {formatDateTimeAR(request.createdAt)} · canal{" "}
            {CHANNEL_LABEL[request.channel] ?? request.channel}
          </>
        }
      >
        <div className="flex flex-wrap gap-1">
          <PriorityBadge priority={request.priority} />
          <RequestStatusBadge status={request.status} />
        </div>
      </PageHeader>

      {request.obligation && (
        <Notice tone={request.obligation.status === "PAGO_INFORMADO" ? "warning" : "info"} title="Pago informado por el cliente">
          {request.obligation.concept} · {formatPeriod(request.obligation.period)} · vence {formatDateAR(request.obligation.dueDate)}. Estado
          actual: {OBLIGATION_STATUS_LABEL[request.obligation.status] ?? request.obligation.status}.{" "}
          {request.obligation.status === "PAGO_INFORMADO" && (
            <>
              Revisá el comprobante adjunto y verificá el pago en{" "}
              <Link href={`/admin/contribuyentes/${request.taxpayer?.id ?? ""}#deudas`} className="font-medium underline">
                Deudas y vencimientos
              </Link>
              .
            </>
          )}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Conversation request={request} viewerIsStaff />
          <Card>
            <h2 className="mb-4 font-semibold text-navy">Responder o agregar una nota interna</h2>
            <ReplyForm requestId={request.id} staff statuses={statusOptions} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 font-semibold text-navy">Gestión</h2>
            <RequestSettingsForm
              requestId={request.id}
              status={request.status}
              priority={request.priority}
              assignedToId={request.assignedTo?.id ?? ""}
              staff={staff.map((s) => ({ value: s.id, label: s.id === admin.id ? `${s.name} (vos)` : s.name }))}
              statuses={statusOptions}
            />
          </Card>
          {request.channel === "WHATSAPP" && (
            <Card>
              <h2 className="font-semibold text-navy">Avisos por WhatsApp</h2>
              {notices.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">Todavía no se mandó ningún aviso. Al responder al cliente, se le avisa por WhatsApp.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {notices.map((n) => (
                    <li key={n.id}>
                      <span className="font-medium text-navy">
                        {n.status === "ENVIADO" ? "Enviado" : n.status === "SIMULADO" ? "Entregado en el simulador" : n.status === "FALLIDO" ? "Falló" : "Pendiente"}
                      </span>{" "}
                      <span className="text-slate-500">· {formatDateTimeAR(n.createdAt)}</span>
                      {n.error && <span className="block text-xs text-slate-500">{n.error}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <p className="text-xs text-slate-500">
            Las notas internas y sus adjuntos solo los ve el estudio: nunca se envían al cliente ni aparecen en su portal. Cada
            cambio queda en la auditoría.
          </p>
        </div>
      </div>
    </div>
  );
}
