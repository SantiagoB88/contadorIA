import { publicDemoTools } from "./demo-tools";

/**
 * Si la persona puede recibir (o ver) los correos que manda la app. Hoy el servidor no tiene un proveedor de correo
 * real (src/providers/mail.ts guarda los correos en una bandeja local): solo se ven en la demo pública
 * (/dev/correos). En el piloto no llegan, así que los textos no deben decir "te enviamos un correo".
 * Cuando se configure un proveedor real, esto devuelve true siempre.
 */
export function mailReachesPeople(): boolean {
  return publicDemoTools();
}

/** Qué hacer mientras los correos no llegan. */
export const NO_MAIL_HELP =
  "Por ahora los correos no se envían: pedile al estudio que confirme tu correo o te blanquee la contraseña. Si te registrás por WhatsApp, no hace falta confirmar el correo.";
