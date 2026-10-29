import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { logoutAction } from "@/app/actions";
import { AppNav, MobileNav } from "@/components/AppNav";
import { DemoBanner } from "@/components/DemoBanner";
import { BrandMark } from "@/components/ui";

// Todas las pantallas internas dependen de la sesión: nunca se cachean entre usuarios.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === ROLES.ADMIN;

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
            <span className="rounded-lg ring-1 ring-white/15">
              <BrandMark />
            </span>
            <span className="font-semibold">ContadorSmart</span>
          </Link>
          <AppNav isAdmin={isAdmin} />
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
                <span className="font-semibold text-navy">ContadorSmart</span>
              </Link>
              <MobileNav
                isAdmin={isAdmin}
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

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
