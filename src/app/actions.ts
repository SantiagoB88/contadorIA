"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth";

export async function logoutAction(formData?: FormData) {
  await destroySession();
  // Después de salir puede volver a Crear cuenta (desde "ya ingresaste como..."); cualquier otro destino, al ingreso.
  redirect(formData?.get("next") === "/registro" ? "/registro" : "/login");
}
