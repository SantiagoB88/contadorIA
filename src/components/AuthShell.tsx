import Link from "next/link";
import { publicDemoTools } from "@/lib/demo-tools";
import { DemoBanner } from "@/components/DemoBanner";

/** Marco común de las pantallas públicas (login, registro, recuperación). */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link href="/login" className="mx-auto mb-4 flex w-fit" aria-label="ContadorIA">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo */}
              <img src="/marca/logo-claro.png" alt="ContadorIA" width={234} height={48} className="h-12 w-auto" />
            </Link>
            {/* En Ingresar el título es la marca y ya la muestra el logo: queda solo para lectores de pantalla. */}
            <h1 className={title === "ContadorIA" ? "sr-only" : "text-2xl font-semibold tracking-tight text-navy"}>{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
          {footer}
          {publicDemoTools() && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Los correos no se envían: se ven en{" "}
              <Link href="/dev/correos" className="font-medium text-brand-700 hover:underline">
                la bandeja de prueba
              </Link>
              .
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
