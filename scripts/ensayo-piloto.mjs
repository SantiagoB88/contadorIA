// Ensayo del piloto en la compu, con el mismo arranque que el VPS (scripts/server-start.mjs) y sin salir a internet:
//  - un "WhatsApp" de prueba manda mensajes firmados al webhook, como Meta;
//  - una "API de Meta" de prueba (WHATSAPP_GRAPH_BASE_URL) recibe lo que el servidor manda: textos, botones y el PDF;
//  - el contador entra a la web y responde con un PDF;
//  - el servidor se reinicia y los datos siguen.
// Uso: compilar antes (`NEXT_DIST_DIR=.next-prodtest npm run build`) y correr `npm run ensayo:piloto`.
// Todo con datos ficticios; la base del ensayo va a una carpeta temporal que se borra al empezar.
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "http://127.0.0.1:3600";
const GRAPH_PORT = 3900;
const SECRET = "secreto-de-ensayo-no-real";
const USER_WA = "5491155558888"; // número ficticio de la persona
const ADMIN = { email: "contador.ensayo@ejemplo.com", password: "ClaveDeEnsayo2026" };
const dataDir = mkdtempSync(path.join(os.tmpdir(), "contadorsmart-ensayo-"));
const results = [];
const ok = (cond, label) => {
  results.push({ ok: !!cond, label });
  console.log(`${cond ? "  ✓" : "  ✗"} ${label}`);
  if (!cond) throw new Error(label);
};

// ───────────── API de Meta de prueba ─────────────
const graph = { messages: [], media: [] };
const graphServer = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/json");
    if (req.url.endsWith("/media")) {
      const text = body.toString("latin1");
      graph.media.push({ size: body.length, filename: text.match(/filename="([^"]+)"/)?.[1], isPdf: text.includes("%PDF-") });
      return res.end(JSON.stringify({ id: `media-${graph.media.length}` }));
    }
    if (req.url.endsWith("/messages")) {
      graph.messages.push(JSON.parse(body.toString("utf8")));
      return res.end(JSON.stringify({ messages: [{ id: `wamid.ensayo.${graph.messages.length}` }] }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
});
await new Promise((r) => graphServer.listen(GRAPH_PORT, "127.0.0.1", r));

// ───────────── Servidor (igual que en el VPS) ─────────────
let app;
const startApp = async () => {
  app = spawn(process.execPath, [path.join(root, "scripts/server-start.mjs")], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-prodtest",
      DATA_DIR: dataDir,
      PORT: "3600",
      APP_URL: APP,
      PILOT_STUDY_NAME: "Estudio Ensayo",
      PILOT_ADMIN_NAME: "Contador Ensayo",
      PILOT_ADMIN_EMAIL: ADMIN.email,
      PILOT_ADMIN_PASSWORD: ADMIN.password,
      WHATSAPP_TOKEN: "token-de-ensayo",
      WHATSAPP_PHONE_NUMBER_ID: "123456",
      WHATSAPP_APP_SECRET: SECRET,
      WHATSAPP_VERIFY_TOKEN: "verify-de-ensayo",
      WHATSAPP_GRAPH_BASE_URL: `http://127.0.0.1:${GRAPH_PORT}`,
      ENABLE_BOT_SIMULATOR: "",
      PUBLIC_DEMO_TOOLS: "",
    },
  });
  app.stdout.on("data", (d) => process.env.ENSAYO_VERBOSE && process.stdout.write(d));
  app.stderr.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${APP}/login`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("El servidor no arrancó");
};
const stopApp = () =>
  new Promise((r) => {
    app.once("exit", r);
    app.kill("SIGTERM");
    if (process.platform === "win32") spawn("taskkill", ["/T", "/F", "/PID", String(app.pid)]);
  });

// ───────────── WhatsApp de prueba (mensajes firmados como Meta) ─────────────
let seq = 0;
async function incoming(content) {
  const message = { from: USER_WA, id: `wamid.in.${Date.now()}.${seq++}`, timestamp: String(Math.floor(Date.now() / 1000)) };
  if (typeof content === "string") Object.assign(message, { type: "text", text: { body: content } });
  else Object.assign(message, { type: "interactive", interactive: { [content.list ? "list_reply" : "button_reply"]: { id: content.id, title: content.title } } });
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "123456" }, contacts: [{ wa_id: USER_WA }], messages: [message] } }] }],
  });
  const before = graph.messages.length;
  const res = await fetch(`${APP}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}` },
    body,
  });
  if (!res.ok) throw new Error(`Webhook respondió ${res.status}`);
  // Espera las respuestas que el servidor mande a "Meta".
  for (let i = 0; i < 50 && graph.messages.length === before; i++) await new Promise((r) => setTimeout(r, 100));
  return graph.messages.slice(before);
}
const textOf = (m) => m.text?.body ?? m.interactive?.body?.text ?? m.document?.filename ?? "";
const allText = (msgs) => msgs.map(textOf).join("\n");
/** Toca una opción (botón o fila de lista) de los últimos mensajes recibidos. */
async function choose(msgs, title) {
  for (const m of [...msgs].reverse()) {
    const buttons = m.interactive?.action?.buttons?.map((b) => b.reply) ?? [];
    const rows = (m.interactive?.action?.sections ?? []).flatMap((s) => s.rows);
    const hit = buttons.find((b) => b.title === title) ?? rows.find((r) => r.title === title);
    if (hit) return incoming({ id: hit.id, title: hit.title, list: rows.includes(hit) });
  }
  throw new Error(`No apareció la opción "${title}". Último mensaje:\n${allText(msgs)}`);
}

function cuitWithDigit(first10) {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let n = Number(first10); ; n++) {
    const b = String(n).padStart(10, "0");
    let d = 11 - (w.reduce((a, x, i) => a + x * Number(b[i]), 0) % 11);
    if (d === 11) d = 0;
    if (d !== 10) return b + d;
  }
}

let browser;
try {
  console.log(`Ensayo del piloto (base temporal en ${dataDir})`);
  await startApp();

  console.log("Seguridad del servidor");
  const login = await (await fetch(`${APP}/login`)).text();
  ok(!login.includes("Demo1234!"), "Ingresar no muestra usuarios ni contraseñas de ejemplo");
  const correos = await fetch(`${APP}/dev/correos`, { redirect: "manual" });
  ok([302, 303, 307, 308].includes(correos.status), "/dev/correos pide iniciar sesión");
  ok((await fetch(`${APP}/dev/whatsapp`)).status === 404, "El simulador de WhatsApp no existe en el servidor");
  ok((await fetch(`${APP}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-de-ensayo&hub.challenge=42`).then((r) => r.text())) === "42", "Meta puede verificar el webhook");

  console.log("Alta por WhatsApp");
  let r = await incoming("hola");
  r = await choose(r, "Quiero registrarme");
  r = await choose(r, "Empezar");
  r = await incoming("Persona Ensayo");
  r = await incoming("persona.ensayo@ejemplo.com");
  const cuit = cuitWithDigit("2044556677");
  r = await incoming(cuit);
  r = await incoming("Servicios de prueba");
  ok(/Revisá tus datos/.test(allText(r)), "El bot muestra el resumen del alta");
  r = await choose(r, "Crear mi cuenta");
  ok(/Creamos tu cuenta y vinculamos este WhatsApp/.test(allText(r)), "Cuenta creada y WhatsApp vinculado");

  console.log("Pedido de constancia con opciones");
  r = await incoming("menu");
  r = await choose(r, "Documentos");
  r = await choose(r, "Solicitar un documento");
  r = await choose(r, "Constancia inscripción");
  r = await choose(r, "Pedir documento");
  const code = allText(r).match(/S-[A-Z0-9]{6}/)?.[0];
  ok(code, `Solicitud creada (${code})`);

  console.log("El contador responde con un PDF desde la web");
  browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage();
  await page.goto(`${APP}/login`);
  await page.getByLabel("Correo electrónico").fill(ADMIN.email);
  await page.getByLabel("Contraseña").fill(ADMIN.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(`${APP}/admin/solicitudes`);
  const links = page.getByRole("link", { name: /Pido: Constancia de inscripción/ });
  ok((await page.locator("li").filter({ hasText: "Pido: Constancia de inscripción" }).count()) === 1, "El contador ve una única solicitud");
  ok((await page.locator("li").filter({ hasText: "Pido: Constancia de inscripción" }).filter({ hasText: "Persona Ensayo" }).count()) === 1, "Asociada al cliente correcto");
  await links.first().click();
  await page.waitForURL(/\/admin\/solicitudes\/c/);
  await page.locator("#replyBody").fill("Te adjunto la constancia.");
  await page.locator("#replyFiles").setInputFiles({ name: "constancia-ensayo.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% constancia de ensayo\n%%EOF\n") });
  const sentBefore = graph.messages.length;
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByText("Mensaje enviado.").waitFor();
  for (let i = 0; i < 50 && graph.messages.length < sentBefore + 2; i++) await new Promise((res) => setTimeout(res, 100));
  const out = graph.messages.slice(sentBefore);
  ok(out.some((m) => m.to === USER_WA && /respondió tu solicitud/.test(textOf(m))), "Llega el aviso de respuesta al mismo chat");
  const doc = out.find((m) => m.type === "document");
  ok(doc && doc.to === USER_WA && doc.document.filename === "constancia-ensayo.pdf", "Llega el PDF al mismo chat");
  ok(graph.media.some((m) => m.filename === "constancia-ensayo.pdf" && m.isPdf), "El PDF se subió a Meta como archivo (no como enlace)");

  console.log("Reinicio del servicio");
  await stopApp();
  await startApp();
  const page2 = await browser.newPage();
  await page2.goto(`${APP}/login`);
  await page2.getByLabel("Correo electrónico").fill(ADMIN.email);
  await page2.getByLabel("Contraseña").fill(ADMIN.password);
  await page2.getByRole("button", { name: "Ingresar" }).click();
  await page2.waitForURL(/\/dashboard/);
  await page2.goto(`${APP}/admin/solicitudes`);
  ok((await page2.locator("li").filter({ hasText: "Pido: Constancia de inscripción" }).count()) === 1, "Después de reiniciar, la solicitud sigue ahí (una sola)");
  r = await incoming("menu");
  ok(/Persona Ensayo/.test(allText(r)), "Después de reiniciar, el bot reconoce el número vinculado");
  console.log(`\nEnsayo OK: ${results.length} comprobaciones.`);
} catch (err) {
  console.error(`\nEnsayo con fallas: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (app) await stopApp();
  graphServer.close();
  rmSync(dataDir, { recursive: true, force: true });
}
