// Transporte de mensajes salientes. El motor del bot no sabe por dónde salen las respuestas.
// - MetaWhatsAppTransport: API de WhatsApp Business (Meta Cloud API), solo si está configurada.
// - SimulatorTransport: el simulador local; no sale nada a internet.
// - NotConfiguredTransport: sin credenciales, el mensaje queda PENDIENTE (nunca se finge una entrega).

export type SendResult = { status: "ENVIADO" | "FALLIDO" | "PENDIENTE" | "SIMULADO"; providerId?: string; error?: string };

export interface MessagingTransport {
  readonly name: string;
  send(to: string, text: string): Promise<SendResult>;
}

class SimulatorTransport implements MessagingTransport {
  readonly name = "SIMULADOR";
  async send(): Promise<SendResult> {
    return { status: "SIMULADO" };
  }
}

class NotConfiguredTransport implements MessagingTransport {
  readonly name = "SIN_PROVEEDOR";
  async send(): Promise<SendResult> {
    return { status: "PENDIENTE", error: "Proveedor de WhatsApp no configurado (faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID)." };
  }
}

class MetaWhatsAppTransport implements MessagingTransport {
  readonly name = "META";
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly version: string,
  ) {}

  async send(to: string, text: string): Promise<SendResult> {
    try {
      const res = await fetch(`https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        // `to` va sin "+": el mismo formato en que WhatsApp informa el número entrante.
        body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: text.slice(0, 4096) } }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
      if (!res.ok) return { status: "FALLIDO", error: `HTTP ${res.status}${json.error?.code ? ` · código ${json.error.code}` : ""}: ${json.error?.message ?? "sin detalle"}` };
      return { status: "ENVIADO", providerId: json.messages?.[0]?.id };
    } catch (err) {
      return { status: "FALLIDO", error: err instanceof Error ? err.message : "Error de red" };
    }
  }
}

export const simulatorTransport: MessagingTransport = new SimulatorTransport();

/** Transporte real: Meta si hay credenciales; si no, los mensajes quedan pendientes. */
export function whatsappTransport(): MessagingTransport {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return new NotConfiguredTransport();
  return new MetaWhatsAppTransport(token, phoneNumberId, process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0");
}
