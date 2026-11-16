"use server";

import { requireUser } from "@/lib/auth";
import { CHANNEL } from "@/lib/constants";
import { getOrigin } from "@/lib/origin";
import { requestHelp } from "./setup";

export type HelpState = { ok?: boolean; message?: string };

// Sin revalidatePath: si se revalida, Next vuelve a dibujar Mi perfil y la confirmación desaparece antes de que se
// lea. Las páginas de solicitudes y la Bandeja se arman en cada visita, así que muestran el pedido igual. Al volver a
// Mi perfil se ve el pedido abierto; si se toca de nuevo el botón, responde con ese mismo pedido (no crea otro).
export async function requestHelpAction(_prev: HelpState, formData: FormData): Promise<HelpState> {
  const user = await requireUser();
  const result = await requestHelp(user, String(formData.get("reason") ?? ""), CHANNEL.WEB, await getOrigin());
  return { ok: result.ok, message: result.message };
}
