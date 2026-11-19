import { fallbackText, type BotMessage } from "@/modules/bot/ui";

// Transporte de mensajes. El motor del bot no sabe por dónde salen las respuestas.
// - MetaWhatsAppTransport: API de WhatsApp Business (Meta Cloud API), solo si está configurada.
// - SimulatorTransport: el simulador local; no sale nada a internet.
// - NotConfiguredTransport: sin credenciales, el mensaje queda PENDIENTE (nunca se finge una entrega).

/**
 * Dirección de la API de Meta. Siempre la real, salvo en pruebas automáticas que la reemplazan por un doble local
 * (WHATSAPP_GRAPH_BASE_URL) para ensayar el envío completo sin salir a internet.
 */
const graphBase = () => (process.env.WHATSAPP_GRAPH_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");

/**
 * Número de destino para la API de Meta (sin "+"). Meta informa los celulares argentinos como 549 + área + número,
 * pero con el número de prueba a veces solo acepta enviar a 54 + área + número, sin el 9 (error 131030, "no está en
 * la lista de destinatarios permitidos"). Con WHATSAPP_AR_SIN_9=1 se quita ese 9 al enviar. Apagado por defecto: se
 * prende solo si los registros muestran ese error.
 */
export function metaRecipient(to: string): string {
  const digits = to.replace(/^\+/, "");
  if (process.env.WHATSAPP_AR_SIN_9 === "1" && /^549\d{10}$/.test(digits)) return `54${digits.slice(3)}`;
  return digits;
}

export type SendResult = { status: "ENVIADO" | "FALLIDO" | "PENDIENTE" | "SIMULADO"; providerId?: string; error?: string };

/** Archivo que el estudio le manda a la persona por el chat (por ejemplo, la constancia que pidió). */
export type OutgoingDocument = { bytes: Uint8Array; fileName: string; mimeType: string; caption?: string };

export interface MessagingTransport {
  readonly name: string;
  send(to: string, message: BotMessage): Promise<SendResult>;
  /** Manda un archivo. Opcional: un transporte sin esto deja el aviso como pendiente. */
  sendDocument?(to: string, doc: OutgoingDocument): Promise<SendResult>;
}

class SimulatorTransport implements MessagingTransport {
  readonly name = "SIMULADOR";
  async send(): Promise<SendResult> {
    return { status: "SIMULADO" };
  }
  async sendDocument(): Promise<SendResult> {
    return { status: "SIMULADO" };
  }
}

class NotConfiguredTransport implements MessagingTransport {
  readonly name = "SIN_PROVEEDOR";
  async send(): Promise<SendResult> {
    return { status: "PENDIENTE", error: "Proveedor de WhatsApp no configurado (faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID)." };
  }
  async sendDocument(): Promise<SendResult> {
    return this.send();
  }
}

/** Cuerpo del mensaje para la API de Meta (botones de respuesta o lista interactiva). */
export function metaPayload(to: string, message: BotMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: metaRecipient(to) };
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
      const res = await fetch(`${graphBase()}/${this.version}/${this.phoneNumberId}/messages`, {
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

  /**
   * Manda un archivo: primero se sube a Meta (queda como "media" del número, privado) y después se envía como
   * documento (PDF) o imagen. El archivo nunca se publica en una URL: Meta lo recibe directo del servidor.
   * Fuera de la ventana de 24 horas desde el último mensaje de la persona, Meta lo rechaza (hace falta una plantilla).
   */
  async sendDocument(to: string, doc: OutgoingDocument): Promise<SendResult> {
    let mediaId: string | undefined;
    try {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", doc.mimeType);
      form.append("file", new Blob([new Uint8Array(doc.bytes)], { type: doc.mimeType }), doc.fileName);
      const res = await fetch(`${graphBase()}/${this.version}/${this.phoneNumberId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; code?: number } };
      if (!res.ok || !json.id) {
        return { status: "FALLIDO", error: `Subida del archivo: HTTP ${res.status}${json.error?.code ? ` · código ${json.error.code}` : ""}: ${json.error?.message ?? "sin detalle"}` };
      }
      mediaId = json.id;
    } catch (err) {
      return { status: "FALLIDO", error: `Subida del archivo: ${err instanceof Error ? err.message : "error de red"}` };
    }
    const isImage = doc.mimeType.startsWith("image/");
    const caption = doc.caption?.slice(0, 1024);
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaRecipient(to),
      type: isImage ? "image" : "document",
      [isImage ? "image" : "document"]: isImage ? { id: mediaId, ...(caption ? { caption } : {}) } : { id: mediaId, filename: doc.fileName, ...(caption ? { caption } : {}) },
    });
  }

  /** Descarga un adjunto recibido: primero se pide la URL (vence en 5 minutos) y después el archivo, ambos con el token. */
  async downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    try {
      const meta = await fetch(`${graphBase()}/${this.version}/${encodeURIComponent(mediaId)}`, {
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
