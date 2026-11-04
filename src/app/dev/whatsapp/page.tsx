import { notFound } from "next/navigation";
import { DemoBanner } from "@/components/DemoBanner";
import { SIMULATOR_IDENTITIES, simulatorEnabled } from "@/modules/bot/simulator-config";
import { SimulatorClient } from "./SimulatorClient";

export const metadata = { title: "Simulador de WhatsApp · ContadorSmart" };
export const dynamic = "force-dynamic";

/** Simulador local del bot. Solo existe en modo DEMO y fuera de producción: en cualquier otro caso da 404. */
export default function WhatsAppSimulatorPage() {
  if (!simulatorEnabled()) notFound();
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Simulador de WhatsApp</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Reemplaza solo a WhatsApp: cada mensaje entra por la misma recepción y el mismo motor que el webhook real, contra la
          misma base. Lo que hagas acá se ve en la web (Bandeja, Accesos, Mi perfil). Solo usa números ficticios.
        </p>
        <SimulatorClient identities={SIMULATOR_IDENTITIES.map((i) => ({ address: i.address, label: i.label }))} />
      </main>
    </div>
  );
}
