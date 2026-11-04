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
