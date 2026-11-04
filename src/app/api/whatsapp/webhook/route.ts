import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { getOrigin } from "@/lib/origin";
import { alreadyReceived, receiveInbound, retryPendingInbound, type InboundInput } from "@/modules/bot/inbound";
import { saveBotUpload } from "@/modules/bot/uploads";
import { normalizePhone } from "@/lib/phone";
import { whatsappTransport } from "@/providers/messaging";

// Webhook de WhatsApp Business (Meta Cloud API).
// GET: verificación de la suscripción (hub.mode / hub.verify_token / hub.challenge).
// POST: mensajes y estados de envío. Se exige la firma X-Hub-Signature-256 (HMAC-SHA256 del cuerpo con el
// App Secret): sin WHATSAPP_APP_SECRET configurado, el webhook no acepta nada.
// Cada mensaje se guarda antes de procesarlo y se deduplica por su id (Meta reintenta y puede duplicar).

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    verifyToken &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === verifyToken
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type MetaMedia = { id: string; mime_type?: string; filename?: string; caption?: string };
type MetaMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  interactive?: { button_reply?: { id: string; title?: string }; list_reply?: { id: string; title?: string } };
  image?: MetaMedia;
  document?: MetaMedia;
};
type MetaValue = {
  messages?: MetaMessage[];
  statuses?: { id: string; status: string; errors?: { code?: number; title?: string }[] }[];
};

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new Response("Webhook no configurado", { status: 503 });

  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    console.warn("[whatsapp] Firma inválida: pedido rechazado.");
    return new Response("Firma inválida", { status: 401 });
  }

  let body: { entry?: { changes?: { field?: string; value?: MetaValue }[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const options = { transport: whatsappTransport(), origin: await getOrigin() };
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const m of value.messages ?? []) {
        if (await alreadyReceived("META", m.id)) continue; // reenvío de Meta: ya está registrado
        await receiveInbound(await toInbound(m, options.transport), options);
      }
      // Estados de los mensajes enviados: se registra lo que informa Meta (no se promete entrega).
      for (const s of value.statuses ?? []) {
        const status = s.status === "failed" ? "FALLIDO" : "ENVIADO";
        const error = s.errors?.[0] ? `código ${s.errors[0].code ?? "?"}: ${s.errors[0].title ?? ""}`.trim() : null;
        await prisma.outboundMessage.updateMany({ where: { providerId: s.id }, data: { status, ...(error ? { error } : {}) } });
      }
    }
  }
  // Reintenta lo que haya quedado fallido (por ejemplo, tras una caída) sin bloquear la respuesta a Meta por mucho.
  await retryPendingInbound(options, 5).catch((err) => console.error("[whatsapp] Reintento fallido:", err instanceof Error ? err.message : err));
  return new Response("OK", { status: 200 });
}

/** Mensaje de Meta → entrada del bot. Botones y listas llegan con el id de la opción; fotos y PDF se descargan
 *  y validan con las mismas reglas que la web. Audios, videos, ubicaciones, etc. no se leen. */
async function toInbound(m: MetaMessage, transport: ReturnType<typeof whatsappTransport>): Promise<InboundInput> {
  const base = { provider: "META" as const, providerId: m.id, rawAddress: m.from };
  if (m.type === "text") return { ...base, text: m.text?.body ?? "" };
  if (m.type === "interactive") {
    const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
    return { ...base, text: reply?.title ?? "", choiceId: reply?.id ?? null };
  }
  const media = m.type === "image" ? m.image : m.type === "document" ? m.document : undefined;
  if (media) {
    const address = normalizePhone(m.from);
    const file = transport.downloadMedia && address ? await transport.downloadMedia(media.id) : null;
    if (!file || !address) return { ...base, text: media.caption ?? "", uploadError: "no pude descargarlo de WhatsApp. Probá mandarlo de nuevo." };
    const saved = await saveBotUpload(address, { name: media.filename ?? null, mimeType: (media.mime_type ?? file.mimeType).split(";")[0], bytes: file.bytes });
    return saved.ok ? { ...base, text: media.caption ?? "", uploadId: saved.id } : { ...base, text: media.caption ?? "", uploadError: saved.message };
  }
  return { ...base, text: "", uploadError: "por ahora solo puedo leer texto, opciones, fotos (JPG o PNG) y PDF." };
}
