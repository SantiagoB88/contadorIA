import { redirect } from "next/navigation";
import type { CurrentUser } from "./auth";
import { hasModule } from "@/modules/plans/service";
import type { ModuleKey } from "@/modules/plans/catalog";

/** Pantallas de un módulo: si el plan del cliente no lo incluye, va a "Mi plan" con la explicación. */
export async function requireModule(user: CurrentUser, key: ModuleKey) {
  if (!(await hasModule(user, key))) redirect(`/plan?modulo=${key}`);
}
