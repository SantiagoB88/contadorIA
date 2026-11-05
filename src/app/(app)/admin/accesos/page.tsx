import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ACCESS_STATUS, REQUEST_STATUS, ROLES } from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatDateAR, formatDateTimeAR } from "@/lib/dates";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { AdminResetPasswordForm, ReviewRequestForms, RevokeAccessForm, UserStatusForm } from "@/components/access/AccessForms";
import { AdminUnlinkForm } from "@/components/bot/WhatsAppForms";
import { listStudyLinks } from "@/modules/bot/links";
import { AUTO_APPROVAL_NOTE } from "@/modules/access/service";

export const metadata = { title: "Accesos · ContadorSmart" };

const NOTICES: Record<string, string> = {
  aprobada: "Solicitud aprobada. El cliente ya ve al contribuyente; el acceso figura en “Accesos vigentes”.",
  rechazada: "Solicitud rechazada. El cliente ve el motivo en su perfil.",
  revocado: "Acceso revocado. El cliente deja de ver al contribuyente desde su próxima consulta.",
};

export default async function AccesosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const aviso = (await searchParams).aviso;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [newClients, pending, accesses, users] = await Promise.all([
    // Altas habilitadas solas (CUIT nuevo en el estudio) de los últimos 7 días.
    prisma.accessRequest.findMany({
      where: { studyId: admin.studyId, status: REQUEST_STATUS.APROBADO, reviewNote: AUTO_APPROVAL_NOTE, createdAt: { gte: since } },
      include: { user: { select: { name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.accessRequest.findMany({
      where: { studyId: admin.studyId, status: REQUEST_STATUS.PENDIENTE },
      include: { user: { select: { name: true, email: true, phone: true, emailVerifiedAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taxpayerAccess.findMany({
      where: { status: ACCESS_STATUS.APROBADO, taxpayer: { studyId: admin.studyId } },
      include: { user: { select: { name: true, email: true, active: true } }, taxpayer: { select: { name: true, cuit: true } } },
      orderBy: [{ taxpayer: { name: "asc" } }],
    }),
    prisma.user.findMany({ where: { studyId: admin.studyId }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
  ]);

  // Para cada solicitud, avisar al estudio si el CUIT coincide con un contribuyente ya cargado.
  const existing = await prisma.taxpayer.findMany({
    where: { studyId: admin.studyId, cuit: { in: pending.map((p) => p.cuit) } },
    select: { cuit: true, name: true },
  });
  const existingByCuit = new Map(existing.map((t) => [t.cuit, t.name]));
  const whatsappByUser = await listStudyLinks(admin);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver al backoffice
        </Link>
      </div>
      <PageHeader title="Accesos" subtitle="Solicitudes de asociación, accesos vigentes y usuarios del estudio" />
      {notice && <Notice title="Listo">{notice}</Notice>}

      {newClients.length > 0 && (
        <Card>
          <h2 className="font-semibold text-navy">
            Clientes nuevos <span className="tabular text-slate-500">({newClients.length}, últimos 7 días)</span>
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Se dieron de alta con un CUIT que el estudio no tenía y ya ven su panel. Cargales la categoría y la información; si
            un alta no corresponde, revocá el acceso abajo.
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {newClients.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-navy">
                    {r.declaredName} · CUIT {formatCuit(r.cuit)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.user.name} ({r.user.email}
                    {r.user.phone ? ` · ${r.user.phone}` : ""}) · {formatDateTimeAR(r.createdAt)}
                  </p>
                </div>
                {r.taxpayerId && (
                  <Link href={`/admin/contribuyentes/${r.taxpayerId}`} className="font-medium text-brand-700 hover:underline">
                    Ver contribuyente
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">
          Solicitudes pendientes <span className="tabular text-slate-500">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <EmptyState title="No hay solicitudes pendientes" />
        ) : (
          pending.map((r) => {
            const match = existingByCuit.get(r.cuit);
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy">
                      {r.declaredName} · CUIT {formatCuit(r.cuit)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Pedido por {r.user.name} ({r.user.email}
                      {r.user.phone ? ` · ${r.user.phone}` : ""}) el {formatDateTimeAR(r.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Declara: {r.declaredActivity} · categoría {r.declaredCategory ?? "no informada"} · inicio{" "}
                      {formatDateAR(r.declaredStartDate)}
                    </p>
                  </div>
                  {match ? (
                    <Badge tone="info">Coincide con {match}</Badge>
                  ) : (
                    <Badge tone="neutral">CUIT nuevo en el estudio</Badge>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Antes de aprobar, verificá por fuera del sistema que la persona sea titular o esté autorizada para ese CUIT.
                </p>
                <div className="mt-4">
                  <ReviewRequestForms requestId={r.id} declaredCategory={r.declaredCategory} />
                </div>
              </Card>
            );
          })
        )}
      </section>

      <Card className="p-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-navy">Accesos vigentes</h2>
          <p className="mt-1 text-sm text-slate-600">La revocación rige desde la próxima pantalla que abra el cliente.</p>
        </div>
        {accesses.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-600">No hay accesos vigentes.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accesses.map((a) => (
              <li key={a.id} className="grid gap-3 px-5 py-4 md:grid-cols-2 md:items-start">
                <div className="text-sm">
                  <p className="font-medium text-navy">
                    {a.user.name} → {a.taxpayer.name}
                  </p>
                  <p className="text-slate-500">
                    {a.user.email} · CUIT {formatCuit(a.taxpayer.cuit)}
                    {!a.user.active && " · usuario suspendido"}
                  </p>
                </div>
                <RevokeAccessForm accessId={a.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-navy">Usuarios</h2>
          <p className="mt-1 text-sm text-slate-600">
            Suspender cierra las sesiones abiertas y bloquea el ingreso. Blanquear clave genera una contraseña temporal para
            pasarle a la persona (vence en 72 horas y al entrar elige la suya).
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-medium text-navy">
                  {u.name} {u.id === admin.id && <span className="text-slate-500">(vos)</span>}
                </p>
                <p className="text-slate-500">{u.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={u.role === ROLES.ADMIN ? "brand" : "neutral"}>
                  {u.role === ROLES.ADMIN ? "Administrador" : "Cliente"}
                </Badge>
                {!u.emailVerifiedAt && <Badge tone="warning">Correo sin confirmar</Badge>}
                <Badge tone={u.active ? "success" : "danger"}>{u.active ? "Activo" : "Suspendido"}</Badge>
                {whatsappByUser.get(u.id) && <Badge tone="info">WhatsApp {whatsappByUser.get(u.id)!.masked}</Badge>}
                {whatsappByUser.get(u.id) && <AdminUnlinkForm linkId={whatsappByUser.get(u.id)!.id} />}
                {u.id !== admin.id && u.active && <AdminResetPasswordForm userId={u.id} name={u.name} />}
                {u.id !== admin.id && <UserStatusForm userId={u.id} active={u.active} />}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
