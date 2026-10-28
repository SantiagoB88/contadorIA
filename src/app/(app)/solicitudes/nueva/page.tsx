import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SR_TOPIC_LABEL } from "@/lib/constants";
import { getAccessibleTaxpayers } from "@/modules/taxpayers/access";
import { NewRequestForm } from "@/components/requests/RequestForms";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Nueva solicitud · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewRequestPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const taxpayers = await getAccessibleTaxpayers(user);
  const requested = first(sp.c);
  const selectedId = taxpayers.find((t) => t.id === requested)?.id ?? taxpayers[0]?.id ?? "";
  // "Pago informado" se crea desde Deudas, sobre un vencimiento concreto.
  const topics = Object.entries(SR_TOPIC_LABEL)
    .filter(([value]) => value !== "PAGO")
    .map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/solicitudes" className="text-sm font-medium text-brand-700 hover:underline">
          ← Volver a solicitudes
        </Link>
      </div>
      <PageHeader title="Nueva solicitud" subtitle="El estudio la recibe en su bandeja y te avisa por correo cuando responde." />
      {taxpayers.length === 0 ? (
        <EmptyState title="Todavía no tenés contribuyentes habilitados" />
      ) : (
        <Card className="max-w-3xl">
          <NewRequestForm taxpayers={taxpayers.map((t) => ({ value: t.id, label: t.name }))} selectedId={selectedId} topics={topics} />
        </Card>
      )}
      <p className="max-w-3xl text-xs text-slate-500">
        Para informar el pago de un vencimiento, entrá en{" "}
        <Link href="/dashboard/deudas" className="underline">
          Deudas
        </Link>{" "}
        y tocá “Informar pago”. No envíes claves ni contraseñas por este medio.
      </p>
    </div>
  );
}
