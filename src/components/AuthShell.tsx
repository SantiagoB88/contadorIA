import Link from "next/link";
import { APP_MODE } from "@/lib/constants";
import { DemoBanner } from "@/components/DemoBanner";
import { BrandMark } from "@/components/ui";

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
            <Link href="/login" className="mx-auto mb-3 flex w-fit" aria-label="ContadorSmart">
              <BrandMark size="lg" />
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
          {footer}
          {APP_MODE === "DEMO" && (
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
