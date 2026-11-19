import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listPlans } from "@/modules/plans/service";
import { MODULES } from "@/modules/plans/catalog";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { DeletePlanForm, PlanForm } from "@/components/plans/PlanForms";

export const metadata = { title: "Planes · ContadorIA" };

export default async function PlanesPage() {
  const admin = await requireAdmin();
  const plans = await listPlans(admin);
  const hasDefault = plans.some((p) => p.isDefault);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planes"
        subtitle="Armá los planes con los módulos que incluye cada uno y asignáselos a tus clientes en Accesos."
      />
      <Notice title="Cómo funciona">
        <ul className="list-disc space-y-1 pl-5">
          <li>Cada cliente ve solo los módulos de su plan, en la web y en WhatsApp. El estudio ve todo.</li>
          <li>
            Los clientes sin plan asignado usan el <strong>plan por defecto</strong>.{" "}
            {hasDefault ? "" : "Todavía no hay uno: por ahora ven todos los módulos."}
          </li>
          <li>
            El plan se asigna en{" "}
            <Link href="/admin/accesos#usuarios" className="font-medium underline">
              Accesos → Usuarios
            </Link>
            . Los planes no cobran nada: solo habilitan módulos.
          </li>
        </ul>
      </Notice>

      {plans.map((plan) => (
        <Card key={plan.id}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-navy">{plan.name}</h2>
            {plan.isDefault && <Badge tone="brand">Por defecto</Badge>}
            <Badge>
              {plan.userCount} {plan.userCount === 1 ? "cliente asignado" : "clientes asignados"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {plan.moduleKeys.length ? plan.moduleKeys.map((k) => MODULES[k].label).join(" · ") : "Sin módulos (solo Inicio y Mi perfil)"}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-brand-700 hover:underline">Editar plan</summary>
            <div className="mt-4 space-y-4">
              <PlanForm
                plan={{
                  id: plan.id,
                  name: plan.name,
                  description: plan.description ?? "",
                  modules: plan.moduleKeys,
                  isDefault: plan.isDefault,
                }}
              />
              {plan.userCount === 0 && <DeletePlanForm planId={plan.id} name={plan.name} />}
            </div>
          </details>
        </Card>
      ))}

      <Card>
        <h2 className="text-lg font-semibold text-navy">{plans.length ? "Nuevo plan" : "Creá tu primer plan"}</h2>
        <div className="mt-4">
          <PlanForm />
        </div>
      </Card>
    </div>
  );
}
