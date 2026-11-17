"use server";

import { demoAction } from "@/lib/demo-journal";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth";

async function logoutActionAccion(formData?: FormData) {
  await destroySession();
  // Después de salir puede volver a Crear cuenta (desde "ya ingresaste como..."); cualquier otro destino, al ingreso.
  redirect(formData?.get("next") === "/registro" ? "/registro" : "/login");
}

// Demo de Vercel: cada acción reconstruye y guarda los datos de la demo en el navegador (ver demo-journal.ts).
export const logoutAction = demoAction(logoutActionAccion);
