import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { logoutAction } from "@/app/actions";
import { AppNav, MobileNav } from "@/components/AppNav";
import { DemoBanner } from "@/components/DemoBanner";
import { BrandMark, BrandName } from "@/components/ui";
import { simulatorEnabled } from "@/modules/bot/simulator-config";
import { getUserModules } from "@/modules/plans/service";
import { prisma } from "@/lib/db";
import { mailReachesPeople } from "@/lib/mail-status";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";

// Todas las pantallas internas dependen de la sesión: nunca se cachean entre usuarios.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === ROLES.ADMIN;
  const showBot = simulatorEnabled();
  const allowed = isAdmin ? undefined : (await getUserModules(user)).modules;
  // Entró confirmando por WhatsApp: el correo se confirma después (solo si los correos salen de verdad).
  const pendingEmail =
    !isAdmin && mailReachesPeople() && !(await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true } }))?.emailVerifiedAt;

  const logout = (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        Cerrar sesión
      </button>
    </form>
  );
  const darkLogout = (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-accent"
      >
        Cerrar sesión
      </button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <div className="flex flex-1">
        {/* Barra lateral en escritorio (desde 1024 px) */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-navy p-4 text-white lg:flex">
          <Link href="/dashboard" className="mb-6 flex items-center gap-2 rounded-lg px-2 focus-visible:outline-accent">
            <BrandMark />
            <BrandName dark />
          </Link>
          <AppNav isAdmin={isAdmin} showBot={showBot} allowed={allowed} />
          <div className="mt-auto border-t border-white/15 pt-4">
            <p className="truncate px-2 text-sm font-medium text-white">{user.name}</p>
            <p className="truncate px-2 text-xs text-slate-300">
              {isAdmin ? "Administrador" : "Cliente"} · {user.studyName}
            </p>
            <div className="mt-3 px-2">{darkLogout}</div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Barra superior compacta en celular y tablet, con el menú desplegable */}
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link href="/dashboard" className="flex items-center gap-2">
                <BrandMark />
                <BrandName />
              </Link>
              <MobileNav
                isAdmin={isAdmin}
                showBot={showBot}
                allowed={allowed}
                logout={logout}
                account={
                  <>
                    <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {isAdmin ? "Administrador" : "Cliente"} · {user.studyName}
                    </p>
                  </>
                }
              />
            </div>
          </header>

          {pendingEmail && !user.mustChangePassword && <VerifyEmailBanner email={user.email} />}
          {user.mustChangePassword && (
            <div role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
              Estás usando una contraseña temporal.{" "}
              <Link href="/perfil#clave" className="font-medium underline">
                Elegí tu contraseña
              </Link>{" "}
              para seguir usando la web.
            </div>
          )}
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
