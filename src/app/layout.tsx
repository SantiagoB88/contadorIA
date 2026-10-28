import type { Metadata, Viewport } from "next";
import { isDbUpToDate } from "@/lib/db-status";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContadorSmart",
  description: "Portal del contribuyente y backoffice del estudio (demo local)",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** Se muestra cuando el código es más nuevo que la base local (por ejemplo, después de un `git pull`). */
function OutdatedDb() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div role="alert" className="w-full max-w-lg rounded-xl border border-amber-300 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Falta reiniciar la aplicación</h1>
        <p className="mt-2 text-sm text-slate-700">
          El programa se actualizó, pero la base local todavía no. No se perdió ningún dato.
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>
            En la terminal donde corre la app, apretá <kbd className="rounded border border-slate-300 px-1">Ctrl</kbd> +{" "}
            <kbd className="rounded border border-slate-300 px-1">C</kbd>.
          </li>
          <li>
            Volvé a escribir <code className="rounded bg-slate-100 px-1">npm run dev</code> y esperá a que diga “Ready”.
          </li>
          <li>Recargá esta página.</li>
        </ol>
      </div>
    </main>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ready = await isDbUpToDate();
  return (
    <html lang="es-AR">
      <body className="min-h-screen antialiased">{ready ? children : <OutdatedDb />}</body>
    </html>
  );
}
