import { publicDemoTools } from "./demo-tools";
import { smtpConfigured } from "@/providers/mail";

/**
 * Si la persona puede recibir (o ver) los correos que manda la app: con un servidor SMTP configurado
 * (src/providers/mail.ts) salen de verdad; en la demo pública se ven en /dev/correos. Si no, los textos no deben decir
 * "te enviamos un correo".
 */
export function mailReachesPeople(): boolean {
  return smtpConfigured() || publicDemoTools();
}

/** Recuperar la contraseña mientras los correos no llegan. */
export const NO_MAIL_HELP =
  "Por ahora los correos no se envían: pedile al estudio que te blanquee la contraseña, o pedí una temporal al asistente de WhatsApp (Mi cuenta → Entrar a la web).";
