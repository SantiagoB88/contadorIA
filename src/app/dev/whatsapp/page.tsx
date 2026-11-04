import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { DemoBanner } from "@/components/DemoBanner";
import { SIMULATOR_IDENTITIES, simulatorEnabled } from "@/modules/bot/simulator-config";
import { SimulatorClient } from "./SimulatorClient";

export const metadata = { title: "Simulador de WhatsApp · ContadorSmart" };
export const dynamic = "force-dynamic";

/** Simulador del bot. Solo existe en modo DEMO (en la compu y en la demo de Vercel): en cualquier otro caso da 404. */
export default async function WhatsAppSimulatorPage() {
  if (!simulatorEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dev/whatsapp");
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Simulador de WhatsApp</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Reemplaza solo a WhatsApp: cada mensaje entra por la misma recepción y el mismo motor que el webhook real, contra la
          misma base. Lo que hagas acá se ve en la web (Bandeja, Accesos, Mi perfil). Solo usa números ficticios.
        </p>
        {process.env.VERCEL && (
          <p className="mt-2 max-w-3xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Demo online: los datos son temporales. Si la demo queda un rato sin uso, vuelve sola a los datos de ejemplo y
            hay que empezar el recorrido de nuevo. Conviene hacerlo de corrido.
          </p>
        )}
        <details className="mt-3 max-w-3xl rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" open>
          <summary className="cursor-pointer font-medium text-navy">Cómo probarlo</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Con <strong>Tu WhatsApp de prueba</strong> escribí <em>hola</em> y tocá <strong>Quiero registrarme</strong>: el
              asistente te pide nombre, correo, CUIT, actividad y fecha de inicio, y te da una contraseña temporal para la web.
            </li>
            <li>
              El estudio aprueba el acceso en{" "}
              <a href="/admin/accesos" target="_blank" rel="noreferrer" className="text-brand-700 underline">
                Accesos
              </a>{" "}
              (con el usuario administrador). Al aprobar, te llega el aviso al chat y se habilita el menú completo.
            </li>
            <li>
              Para recorrer todo con datos cargados, elegí <strong>Ana Gómez · clienta de ejemplo</strong> en Quién escribe.
            </li>
            <li>
              Para entrar a la web con la cuenta nueva, usá una ventana privada: así no se mezcla con tu sesión actual.
            </li>
          </ol>
        </details>
        <SimulatorClient
          examples={SIMULATOR_IDENTITIES.filter((i) => i.example).map((i) => ({ address: i.address, label: i.label }))}
          canResetDemo={user.role === ROLES.ADMIN}
        />
      </main>
    </div>
  );
}
