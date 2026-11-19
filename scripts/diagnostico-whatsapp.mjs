// Diagnóstico del número de prueba de Meta con celulares argentinos (error 131030, "no está en la lista").
// Toma el último número que le escribió al bot y le manda la plantilla "hello_world" (la misma que manda la página de
// Meta) en los formatos posibles: 549 + área + número, 54 + área + número y 54 + área + 15 + número (solo área 11).
// Muestra cuál acepta Meta, con el número tapado. Cada formato aceptado llega a tu WhatsApp como "Hello World".
// Uso en el VPS (lee los secretos del archivo privado, no los muestra):
//   set -a; . /etc/contadorsmart/contadorsmart.env; set +a; node scripts/diagnostico-whatsapp.mjs
import { PrismaClient } from "@prisma/client";

const token = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const version = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
if (!token || !phoneId) {
  console.log("Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID.");
  process.exit(1);
}
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL || "file:/var/lib/contadorsmart/contadorsmart.db" });
const last = await prisma.inboundEvent.findFirst({ where: { provider: "META" }, orderBy: { receivedAt: "desc" } });
await prisma.$disconnect();
if (!last) {
  console.log("Todavía no llegó ningún mensaje de WhatsApp al servidor.");
  process.exit(1);
}
const digits = last.address.replace(/\D/g, "");
const mask = (n) => `${n.slice(0, n.length - 6)}…${n.slice(-2)}`;
const formats = [["como llega (con 9)", digits]];
if (/^549\d{10}$/.test(digits)) {
  formats.push(["sin 9", `54${digits.slice(3)}`]);
  if (digits.startsWith("54911")) formats.push(["sin 9 y con 15", `5411${"15"}${digits.slice(5)}`]);
}
console.log(`Último número que escribió: ${mask(digits)}`);
for (const [label, to] of formats) {
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: "hello_world", language: { code: "en_US" } } }),
  });
  const json = await res.json().catch(() => ({}));
  console.log(`  ${label.padEnd(20)} ${mask(to).padEnd(16)} → ${res.ok ? "ACEPTADO" : `rechazado (${json.error?.code ?? res.status}: ${json.error?.message ?? ""})`}`);
}
