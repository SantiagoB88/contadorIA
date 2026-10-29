import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ACCESS_STATUS, ROLES } from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatDateTimeAR, todayAR } from "@/lib/dates";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AssociationForm, ChangePasswordForm, ProfileForm } from "@/components/access/AccessForms";

export const metadata = { title: "Mi perfil · ContadorSmart" };

const REQUEST_BADGE = {
  PENDIENTE: { label: "Pendiente de validación", tone: "warning" },
  APROBADO: { label: "Aprobada", tone: "success" },
  RECHAZADO: { label: "Rechazada", tone: "danger" },
} as const;

export default async function PerfilPage() {
  const user = await requireUser();
  const isClient = user.role === ROLES.CLIENTE;

  const [row, accesses, requests] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.taxpayerAccess.findMany({
      where: { userId: user.id, status: ACCESS_STATUS.APROBADO, taxpayer: { studyId: user.studyId } },
      include: { taxpayer: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.accessRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Mi perfil" subtitle={`${user.email} · ${user.studyName}`} />

      {isClient && (
        <Card>
          <h2 className="font-semibold text-navy">Mis contribuyentes</h2>
          {accesses.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              Todavía no tenés contribuyentes habilitados. Asociá tu CUIT abajo.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {accesses.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium text-navy">{a.taxpayer.name}</span>{" "}
                    <span className="text-slate-500">· CUIT {formatCuit(a.taxpayer.cuit)}</span>
                  </span>
                  <Link href={`/dashboard?c=${a.taxpayer.id}`} className="font-medium text-brand-700 hover:underline">
                    Ver tablero
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {requests.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold text-slate-800">Solicitudes</h3>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {requests.map((r) => {
                  const badge = REQUEST_BADGE[r.status as keyof typeof REQUEST_BADGE];
                  return (
                    <li key={r.id} className="py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {r.declaredName} <span className="text-slate-500">· CUIT {formatCuit(r.cuit)}</span>
                        </span>
                        {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : <Badge>{r.status}</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">Enviada el {formatDateTimeAR(r.createdAt)}</p>
                      {r.status === "RECHAZADO" && r.reviewNote && (
                        <p className="mt-1 text-sm text-slate-700">Motivo: {r.reviewNote}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      )}

      {isClient && (
        <Card>
          <h2 id="asociar" className="scroll-mt-6 font-semibold text-navy">
            Asociar un CUIT
          </h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Cargalo una sola vez. Vas a ver la información cuando el estudio apruebe la asociación.
          </p>
          <AssociationForm today={todayAR()} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-navy">Datos personales</h2>
          <ProfileForm name={row.name} phone={row.phone ?? ""} email={row.email} />
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-navy">Contraseña</h2>
          <ChangePasswordForm />
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-navy">Vinculación fiscal</h2>
        <p className="mt-1 text-sm text-slate-600">
          <Badge tone="neutral">No conectada</Badge> En esta versión no hay conexión con ARCA y no se guarda ninguna clave
          fiscal. Los datos los carga el estudio.
        </p>
      </Card>
    </div>
  );
}
