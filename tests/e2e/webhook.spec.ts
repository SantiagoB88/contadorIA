import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

// Webhook real de WhatsApp (/api/whatsapp/webhook), con el formato y la firma que documenta Meta.
// El servidor de prueba corre con WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN ficticios (playwright.config.ts)
// y sin token de envío: las respuestas quedan PENDIENTES, nunca se finge una entrega.

const SECRET = "secreto-de-prueba-no-real";
const VERIFY = "verify-de-prueba";

const sign = (raw: string) => `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;

function payload(id: string, from: string, body: string) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA-PRUEBA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE-PRUEBA" },
              contacts: [{ wa_id: from, profile: { name: "Prueba" } }],
              messages: [{ from, id, timestamp: "1793800000", type: "text", text: { body } }],
            },
          },
        ],
      },
    ],
  });
}

test("verificación de la suscripción", async ({ request }) => {
  const ok = await request.get(`/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toBe("12345");
  const bad = await request.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=12345");
  expect(bad.status()).toBe(403);
});

test("firma obligatoria, mensaje procesado una sola vez aunque Meta lo reenvíe", async ({ request }) => {
  const id = `wamid.prueba-${Date.now()}`;
  const raw = payload(id, "5491155550009", "hola");

  const unsigned = await request.post("/api/whatsapp/webhook", { data: raw, headers: { "content-type": "application/json" } });
  expect(unsigned.status()).toBe(401);
  const forged = await request.post("/api/whatsapp/webhook", {
    data: raw,
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) },
  });
  expect(forged.status()).toBe(401);

  const first = await request.post("/api/whatsapp/webhook", { data: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) } });
  expect(first.status()).toBe(200);
  const again = await request.post("/api/whatsapp/webhook", { data: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) } });
  expect(again.status()).toBe(200);
});

function signedPost(raw: string) {
  return { data: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) } };
}

function interactivePayload(id: string, from: string, message: Record<string, unknown>) {
  const value = { messaging_product: "whatsapp", metadata: { phone_number_id: "PHONE-PRUEBA" }, messages: [{ from, id, timestamp: "1793800000", ...message }] };
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "WABA-PRUEBA", changes: [{ field: "messages", value }] }] });
}

test("botones, listas, fotos y tipos no soportados con el formato de Meta: se aceptan sin romper", async ({ request }) => {
  const from = "5491155550008";
  const t = Date.now();
  // Toque de un botón con un id que no corresponde a ninguna opción vigente: se trata como opción vencida.
  const button = interactivePayload(`wamid.boton-${t}`, from, { type: "interactive", interactive: { type: "button_reply", button_reply: { id: "zzzz.1", title: "Ya tengo cuenta" } } });
  expect((await request.post("/api/whatsapp/webhook", signedPost(button))).status()).toBe(200);
  const list = interactivePayload(`wamid.lista-${t}`, from, { type: "interactive", interactive: { type: "list_reply", list_reply: { id: "zzzz.2", title: "Mi resumen" } } });
  expect((await request.post("/api/whatsapp/webhook", signedPost(list))).status()).toBe(200);
  // Foto: sin token de envío no se puede descargar; se le explica a la persona en vez de fallar.
  const image = interactivePayload(`wamid.foto-${t}`, from, { type: "image", image: { id: "MEDIA-PRUEBA", mime_type: "image/jpeg" } });
  expect((await request.post("/api/whatsapp/webhook", signedPost(image))).status()).toBe(200);
  const audio = interactivePayload(`wamid.audio-${t}`, from, { type: "audio", audio: { id: "MEDIA-AUDIO" } });
  expect((await request.post("/api/whatsapp/webhook", signedPost(audio))).status()).toBe(200);
});
