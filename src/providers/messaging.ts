import { fallbackText, type BotMessage } from "@/modules/bot/ui";

// Transporte de mensajes. El motor del bot no sabe por dónde salen las respuestas.
// - MetaWhatsAppTransport: API de WhatsApp Business (Meta Cloud API), solo si está configurada.
// - SimulatorTransport: el simulador local; no sale nada a internet.
// - NotConfiguredTransport: sin credenciales, el mensaje queda PENDIENTE (nunca se finge una entrega).

export type SendResult = { status: "ENVIADO" | "FALLIDO" | "PENDIENTE" | "SIMULADO"; providerId?: string; error?: string };

export interface MessagingTransport {
  readonly name: string;
  send(to: string, message: BotMessage): Promise<SendResult>;
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

/** Cuerpo del mensaje para la API de Meta (botones de respuesta o lista interactiva). */
export function metaPayload(to: string, message: BotMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/^\+/, "") };
  if (message.kind === "text") return { ...base, type: "text", text: { body: message.text } };
  if (message.kind === "buttons") {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: message.text },
        ...(message.footer ? { footer: { text: message.footer } } : {}),
        action: { buttons: message.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
      },
    };
  }
  return {
    ...base,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: message.text },
      ...(message.footer ? { footer: { text: message.footer } } : {}),
      action: {
        button: message.button,
        sections: message.sections.map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          rows: s.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })),
        })),
      },
    },
  };
}

class MetaWhatsAppTransport implements MessagingTransport {
  readonly name = "META";
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly version: string,
  ) {}

  private async post(body: Record<string, unknown>): Promise<SendResult> {
    try {
      const res = await fetch(`https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
      if (!res.ok) return { status: "FALLIDO", error: `HTTP ${res.status}${json.error?.code ? ` · código ${json.error.code}` : ""}: ${json.error?.message ?? "sin detalle"}` };
      // "ENVIADO" significa que Meta aceptó el pedido; la entrega la informa después el webhook de estados.
      return { status: "ENVIADO", providerId: json.messages?.[0]?.id };
    } catch (err) {
      return { status: "FALLIDO", error: err instanceof Error ? err.message : "Error de red" };
    }
  }

  async send(to: string, message: BotMessage): Promise<SendResult> {
    const result = await this.post(metaPayload(to, message));
    // Si el cliente o la cuenta no aceptan mensajes interactivos, se manda la versión numerada en texto.
    if (result.status === "FALLIDO" && message.kind !== "text") {
      const fallback = await this.post(metaPayload(to, { kind: "text", text: fallbackText(message) }));
      if (fallback.status === "ENVIADO") return { ...fallback, error: `Interactivo rechazado (${result.error}); se envió como texto.` };
    }
    return result;
  }

  /** Descarga un adjunto recibido: primero se pide la URL (vence en 5 minutos) y después el archivo, ambos con el token. */
  async downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    try {
      const meta = await fetch(`https://graph.facebook.com/${this.version}/${encodeURIComponent(mediaId)}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!meta.ok) return null;
      const info = (await meta.json()) as { url?: string; mime_type?: string };
      if (!info.url) return null;
      const file = await fetch(info.url, { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(20_000) });
      if (!file.ok) return null;
      return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: info.mime_type ?? file.headers.get("content-type") ?? "" };
    } catch {
      return null;
    }
  }
}

export const simulatorTransport: MessagingTransport = new SimulatorTransport();

/** Transporte real: Meta si hay credenciales; si no, los mensajes quedan pendientes. */
export function whatsappTransport(): MessagingTransport & { downloadMedia?: MetaWhatsAppTransport["downloadMedia"] } {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return new NotConfiguredTransport();
  return new MetaWhatsAppTransport(token, phoneNumberId, process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0");
}
