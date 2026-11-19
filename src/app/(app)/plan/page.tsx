import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getUserModules } from "@/modules/plans/service";
import { MODULE_KEYS, MODULES, isModuleKey } from "@/modules/plans/catalog";
import { Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Mi plan · ContadorIA" };

export default async function MiPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const modulo = (await searchParams).modulo;
  const blocked = typeof modulo === "string" && isModuleKey(modulo) ? modulo : null;
  const { plan, modules } = await getUserModules(user);
  const description = plan ? (await prisma.plan.findUnique({ where: { id: plan.id }, select: { description: true } }))?.description : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Mi plan" subtitle={user.role === ROLES.ADMIN ? "El estudio ve todos los módulos." : undefined} />
      {blocked && !modules.includes(blocked) && (
        <Notice tone="warning" title={`Tu plan no incluye ${MODULES[blocked].label}`}>
          Si lo necesitás, pedíselo al estudio.
        </Notice>
      )}
      <Card>
        <h2 className="text-lg font-semibold text-navy">{plan ? plan.name : "Acceso completo"}</h2>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        {!plan && <p className="mt-1 text-sm text-slate-600">Por ahora tenés habilitados todos los módulos.</p>}
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {MODULE_KEYS.map((key) => {
            const on = modules.includes(key);
            const href = MODULES[key].href;
            return (
              <li key={key} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                <span aria-hidden="true" className={on ? "text-emerald-700" : "text-slate-400"}>
                  {on ? "✓" : "–"}
                </span>
                <span>
                  {on && href ? (
                    <Link href={href} className="font-medium text-navy hover:underline">
                      {MODULES[key].label}
                    </Link>
                  ) : (
                    <span className="font-medium">{MODULES[key].label}</span>
                  )}
                  <span className="sr-only">{on ? " (incluido)" : " (no incluido)"}</span>
                  <span className="block text-xs">{MODULES[key].desc}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
