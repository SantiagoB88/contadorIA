import { prisma } from "@/lib/db";

export type MailMessage = { to: string; subject: string; body: string };

// Contrato del proveedor de correo. En DEMO solo existe la implementación local.
export interface NotificationProvider {
  send(message: MailMessage): Promise<void>;
}

/** Guarda el correo en la base (bandeja local /dev/correos). No sale nada a internet. */
class LocalMailProvider implements NotificationProvider {
  async send(message: MailMessage) {
    await prisma.outboxEmail.create({ data: message });
    console.log(`[correo local] Para: ${message.to} · ${message.subject}`);
  }
}

export const mail: NotificationProvider = new LocalMailProvider();
