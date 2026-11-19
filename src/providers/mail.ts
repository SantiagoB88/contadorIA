import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";

export type MailMessage = { to: string; subject: string; body: string };

// Contrato del proveedor de correo.
// - Siempre se guarda una copia en la base (OutboxEmail): la bandeja local de la demo y el registro de lo enviado.
// - Si hay un servidor SMTP configurado (SMTP_HOST, SMTP_USER, SMTP_PASS y MAIL_FROM), además sale de verdad.
//   Sirve cualquier proveedor con SMTP: Gmail (con contraseña de aplicación), Brevo, Resend, el correo de Hostinger…
// Un error al enviar no corta lo que la persona estaba haciendo: queda en el registro del servidor.
export interface NotificationProvider {
  send(message: MailMessage): Promise<void>;
}

/** Hay un servidor de correo real configurado. */
export function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
}

let transporter: Transporter | null = null;
/** Para las pruebas: reemplaza el transporte SMTP por uno local. */
export function setMailTransportForTests(t: Transporter | null) {
  transporter = t;
}

function smtp(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465: TLS directo; 587: STARTTLS
    requireTLS: port !== 465 && process.env.SMTP_INSECURE !== "1",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

class Mailer implements NotificationProvider {
  async send(message: MailMessage) {
    await prisma.outboxEmail.create({ data: message });
    if (!smtpConfigured() && !transporter) {
      console.log(`[correo local] Para: ${message.to} · ${message.subject}`);
      return;
    }
    try {
      await smtp().sendMail({
        from: process.env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.body,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      console.log(`[correo] Enviado: ${message.subject}`);
    } catch (err) {
      // Sin el destinatario en el registro (dato personal).
      console.error(`[correo] No se pudo enviar "${message.subject}":`, err instanceof Error ? err.message : err);
    }
  }
}

export const mail: NotificationProvider = new Mailer();
