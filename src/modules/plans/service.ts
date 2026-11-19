import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";
import type { CurrentUser } from "@/lib/auth";
import type { ServiceResult } from "@/modules/access/service";
import { MODULE_KEYS, MODULES, isModuleKey, parseModules, type ModuleKey } from "./catalog";

// Planes de suscripción: el estudio arma planes con los módulos que incluye cada uno y le asigna uno a cada cliente.
// Reglas:
// - El estudio (administradores) ve todo, siempre.
// - Un cliente con plan ve los módulos de su plan; sin plan, los del plan por defecto del estudio.
// - Si el estudio no armó ningún plan por defecto, el cliente sin plan ve todo (así nada se corta al empezar).
// - Todo se decide en el servidor con la sesión; el menú solo refleja lo mismo.
// Sin dependencias de Next, para poder probarlo con `npm run verify`.

export type UserModules = {
  /** Plan que rige (asignado o por defecto). Null: sin planes, ve todo. */
  plan: { id: string; name: string; assigned: boolean } | null;
  modules: ModuleKey[];
};

type Who = Pick<CurrentUser, "id" | "role" | "studyId">;

export async function getUserModules(user: Who): Promise<UserModules> {
  if (user.role === ROLES.ADMIN) return { plan: null, modules: [...MODULE_KEYS] };
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true } });
  const assigned = row?.plan && row.plan.studyId === user.studyId ? row.plan : null;
  const plan = assigned ?? (await prisma.plan.findFirst({ where: { studyId: user.studyId, isDefault: true } }));
  if (!plan) return { plan: null, modules: [...MODULE_KEYS] };
  return { plan: { id: plan.id, name: plan.name, assigned: !!assigned }, modules: parseModules(plan.modules) };
}

export async function hasModule(user: Who, key: ModuleKey): Promise<boolean> {
  return (await getUserModules(user)).modules.includes(key);
}

/** Mensaje para cuando el plan no incluye un módulo. */
export const notInPlan = (key: ModuleKey) =>
  `Tu plan no incluye ${MODULES[key].label}. Si lo necesitás, pedíselo al estudio.`;

// ───────────── Administración (solo el estudio) ─────────────

export async function listPlans(admin: CurrentUser) {
  const plans = await prisma.plan.findMany({
    where: { studyId: admin.studyId },
    include: { _count: { select: { users: true } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return plans.map((p) => ({ ...p, moduleKeys: parseModules(p.modules), userCount: p._count.users }));
}

export type PlanInput = { id?: string; name: string; description: string; modules: string[]; isDefault: boolean };

export async function savePlan(admin: CurrentUser, input: PlanInput): Promise<ServiceResult> {
  if (admin.role !== ROLES.ADMIN) return { ok: false, message: "Solo el estudio puede armar planes." };
  const name = input.name.trim();
  const description = input.description.trim();
  const modules = MODULE_KEYS.filter((k) => input.modules.includes(k));
  const fieldErrors: Record<string, string> = {};
  if (name.length < 2 || name.length > 60) fieldErrors.name = "Poné un nombre de 2 a 60 caracteres.";
  if (description.length > 300) fieldErrors.description = "Máximo 300 caracteres.";
  if (input.modules.some((m) => !isModuleKey(m))) fieldErrors.modules = "Hay un módulo que no existe.";
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  if (input.id) {
    const current = await prisma.plan.findFirst({ where: { id: input.id, studyId: admin.studyId } });
    if (!current) return { ok: false, message: "No encontramos ese plan." };
  }
  const clash = await prisma.plan.findFirst({ where: { studyId: admin.studyId, name, NOT: input.id ? { id: input.id } : undefined } });
  if (clash) return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { name: "Ya hay un plan con ese nombre." } };

  const data = { name, description: description || null, modules: JSON.stringify(modules), isDefault: input.isDefault };
  const plan = await prisma.$transaction(async (tx) => {
    // Un solo plan por defecto por estudio.
    if (input.isDefault) await tx.plan.updateMany({ where: { studyId: admin.studyId, isDefault: true }, data: { isDefault: false } });
    return input.id
      ? tx.plan.update({ where: { id: input.id }, data })
      : tx.plan.create({ data: { ...data, studyId: admin.studyId } });
  });
  await audit({
    studyId: admin.studyId,
    actorId: admin.id,
    action: input.id ? "PLAN_UPDATED" : "PLAN_CREATED",
    entity: "Plan",
    entityId: plan.id,
    detail: `${name}: ${modules.map((m) => MODULES[m].label).join(", ") || "sin módulos"}${input.isDefault ? " · por defecto" : ""}`,
  });
  return { ok: true, message: input.id ? `Plan "${name}" actualizado.` : `Plan "${name}" creado.` };
}

/** Solo se borra un plan sin clientes asignados (para no dejar a nadie con módulos distintos sin querer). */
export async function deletePlan(admin: CurrentUser, planId: string): Promise<ServiceResult> {
  if (admin.role !== ROLES.ADMIN) return { ok: false, message: "Solo el estudio puede borrar planes." };
  const plan = await prisma.plan.findFirst({ where: { id: planId, studyId: admin.studyId }, include: { _count: { select: { users: true } } } });
  if (!plan) return { ok: false, message: "No encontramos ese plan." };
  if (plan._count.users > 0) {
    return { ok: false, message: `El plan "${plan.name}" tiene clientes asignados. Pasalos a otro plan antes de borrarlo.` };
  }
  await prisma.plan.delete({ where: { id: plan.id } });
  await audit({ studyId: admin.studyId, actorId: admin.id, action: "PLAN_DELETED", entity: "Plan", entityId: plan.id, detail: plan.name });
  return { ok: true, message: `Plan "${plan.name}" borrado.` };
}

/** Asigna un plan a un cliente del estudio. planId vacío: vuelve al plan por defecto. */
export async function assignPlan(admin: CurrentUser, userId: string, planId: string | null): Promise<ServiceResult> {
  if (admin.role !== ROLES.ADMIN) return { ok: false, message: "Solo el estudio puede asignar planes." };
  const user = await prisma.user.findFirst({ where: { id: userId, studyId: admin.studyId } });
  if (!user) return { ok: false, message: "No encontramos ese usuario." };
  if (user.role !== ROLES.CLIENTE) return { ok: false, message: "El estudio ve todo: los planes son para clientes." };
  const plan = planId ? await prisma.plan.findFirst({ where: { id: planId, studyId: admin.studyId } }) : null;
  if (planId && !plan) return { ok: false, message: "No encontramos ese plan." };
  await prisma.user.update({ where: { id: user.id }, data: { planId: plan?.id ?? null } });
  await audit({
    studyId: admin.studyId,
    actorId: admin.id,
    action: "PLAN_ASSIGNED",
    entity: "User",
    entityId: user.id,
    detail: plan ? plan.name : "Plan por defecto",
  });
  return { ok: true, message: plan ? `${user.name} quedó en el plan "${plan.name}".` : `${user.name} quedó con el plan por defecto.` };
}
