import { expect, test, type Page } from "@playwright/test";
import { USERS, login } from "./helpers";

// Recorrido completo del bot con el simulador visual y la web: alta desde el bot, aprobación del estudio,
// vinculación, consulta, solicitud y respuesta del estudio que llega al chat.

const uid = () => Date.now().toString(36).slice(-5);

function fakeCuit(): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const body = "20" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const sum = weights.reduce((acc, w, i) => acc + w * Number(body[i]), 0);
    let check = 11 - (sum % 11);
    if (check === 11) check = 0;
    if (check !== 10) return body + check;
  }
}

async function chat(page: Page, text: string, expectReply: RegExp) {
  await page.locator("#sim-text").fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByLabel("Conversación").getByText(expectReply).last()).toBeVisible();
}

test("alta por WhatsApp → aprobación → vinculación → consulta → solicitud → respuesta del estudio", async ({ page, browser }) => {
  const id = uid();
  const email = `wa.${id}@ejemplo.com`;
  const name = `Monotributista WA ${id}`;

  // 1. Una persona nueva le escribe al bot (número ficticio del simulador).
  await page.goto("/dev/whatsapp");
  await page.getByLabel("Quién escribe").selectOption("+5491155550004");
  await chat(page, "hola", /no está vinculado/);
  await chat(page, "1", /Creá tu cuenta/);
  const inviteText = await page.getByLabel("Conversación").getByText(/vincular\?t=/).last().innerText();
  const invite = inviteText.match(/(\/whatsapp\/vincular\?t=[\w-]+)/)![1];

  // 2. Crea la cuenta en la web, confirma el correo y pide asociarse a un CUIT.
  const web = await browser.newPage();
  await web.goto("/registro");
  await web.getByLabel("Nombre y apellido").fill(`Persona ${id}`);
  await web.getByLabel("Correo electrónico").fill(email);
  await web.getByLabel("Teléfono").fill("+54 11 5555-0004");
  await web.getByLabel("Contraseña", { exact: true }).fill("Prueba1234!");
  await web.getByLabel("Repetí la contraseña").fill("Prueba1234!");
  await web.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(web.getByText(/Te enviamos un correo/)).toBeVisible();
  await web.goto("/dev/correos");
  await web.goto((await web.locator('a[href*="/verificar?token="]').first().getAttribute("href"))!);
  await web.getByRole("button", { name: "Confirmar mi correo" }).click();
  await expect(web.getByText("Tu correo quedó confirmado")).toBeVisible();

  // 3. Abre el enlace del bot: le pide ingresar y vuelve solo a confirmar la vinculación.
  await web.goto(invite);
  await web.getByRole("link", { name: "Ingresar y vincular" }).click();
  await web.getByLabel("Correo electrónico").fill(email);
  await web.getByLabel("Contraseña").fill("Prueba1234!");
  await web.getByRole("button", { name: "Ingresar" }).click();
  await web.waitForURL(/\/whatsapp\/vincular/, { waitUntil: "commit" });
  await web.getByRole("button", { name: "Vincular este WhatsApp a mi cuenta" }).click();
  await web.waitForURL(/\/perfil\?whatsapp=vinculado/, { waitUntil: "commit" });
  await expect(web.getByText("Listo: tu WhatsApp quedó vinculado")).toBeVisible();

  // Pide asociarse a un CUIT nuevo. Hasta que el estudio apruebe, el bot no muestra datos.
  await web.locator("#as-cuit").fill(fakeCuit());
  await web.locator("#as-name").fill(name);
  await web.locator("#as-activity").fill("Servicios de prueba");
  await web.locator("#as-startDate").fill("2023-05-01");
  await web.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(web.getByText(/Solicitud enviada/)).toBeVisible();
  await chat(page, "2", /Todavía no podés consultar/);
  await chat(page, "1", /pendiente de aprobación/);

  // 4. El estudio aprueba en Accesos y ve el WhatsApp vinculado.
  await login(web, USERS.admin);
  await web.goto("/admin/accesos");
  await web.locator("section", { hasText: name }).last().getByRole("button", { name: "Aprobar acceso" }).click();
  await expect(web.getByText(/Solicitud aprobada/)).toBeVisible();
  await expect(web.locator("li", { hasText: email }).getByText(/WhatsApp \+54 9 11/)).toBeVisible();

  // 5. Ahora el bot responde con datos reales del contribuyente (sin facturación cargada: lo dice).
  await chat(page, "menu", /Estás consultando/);
  await expect(page.getByLabel("Conversación").getByText(name).last()).toBeVisible();
  await chat(page, "2", /no cargó la facturación/);
  await chat(page, "4", /no cargó información/);

  // 6. Crea una solicitud desde el bot.
  const subject = `Consulta por WhatsApp ${id}`;
  await chat(page, "5", /Sobre qué es tu consulta/);
  await chat(page, "4", /asunto corto/);
  await chat(page, subject, /detalle en un mensaje/);
  await chat(page, "Necesito la constancia de inscripción", /creamos tu solicitud/);

  // 7. El estudio la ve en la Bandeja con canal WhatsApp, deja una nota interna y responde.
  await web.goto("/admin/solicitudes?estado=activas&asignado=sin");
  await expect(web.getByText(/canal WhatsApp/).first()).toBeVisible();
  await web.getByRole("link", { name: subject }).first().click();
  await web.waitForURL(/\/admin\/solicitudes\/c/, { waitUntil: "commit" });
  await web.getByRole("radio", { name: "Nota interna (el cliente no la ve)" }).click();
  await web.getByLabel("Nota interna", { exact: true }).fill(`SECRETO-${id}`);
  await web.getByRole("button", { name: "Guardar nota interna" }).click();
  await expect(web.getByText("Nota interna guardada")).toBeVisible();
  await web.getByRole("radio", { name: "Respuesta al cliente" }).click();
  await web.getByLabel("Respuesta", { exact: true }).fill(`Te la mandamos hoy ${id}`);
  await web.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(web.getByText("Mensaje enviado.")).toBeVisible();
  await expect(web.getByText("Entregado en el simulador")).toBeVisible();

  // 8. Al chat llega el aviso; el cliente ve la respuesta y nunca la nota interna.
  await expect(page.getByLabel("Conversación").getByText(/El estudio respondió tu solicitud/).last()).toBeVisible({ timeout: 15_000 });
  await chat(page, "6", /Tus últimas solicitudes/);
  await chat(page, "1", new RegExp(`Te la mandamos hoy ${id}`));
  await expect(page.getByLabel("Conversación").getByText(`SECRETO-${id}`)).toHaveCount(0);

  // 9. Reiniciar (recargar) conserva la conversación: está en la base.
  await page.reload();
  await page.getByLabel("Quién escribe").selectOption("+5491155550004");
  await expect(page.getByLabel("Conversación").getByText(new RegExp(`Te la mandamos hoy ${id}`)).last()).toBeVisible();
  await web.close();
});

test("evento duplicado y falla del servidor desde el simulador", async ({ page }) => {
  await page.goto("/dev/whatsapp");
  await page.getByLabel("Quién escribe").selectOption("+5491155550001");
  await chat(page, "menu", /Hola, Ana/);
  // Ana tiene dos contribuyentes: elige el primero.
  await chat(page, "8", /Qué contribuyente querés consultar/);
  await chat(page, "1", /ahora consultás/);
  await page.getByRole("button", { name: "Reenviar el último mensaje (duplicado)" }).click();
  await expect(page.getByText(/Evento duplicado: se descartó/)).toBeVisible();
  await page.getByLabel("Simular una falla del servidor").selectOption("antes");
  await page.locator("#sim-text").fill("2");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText(/El servidor falló \(simulado\)/)).toBeVisible();
  await expect(page.getByLabel("Conversación").getByText(/Tuvimos un problema/).last()).toBeVisible();
  await page.getByLabel("Simular una falla del servidor").selectOption("");
  await page.getByRole("button", { name: "Reintentar fallidos" }).click();
  await expect(page.getByText(/Reintentados: [1-9]/)).toBeVisible();
  await expect(page.getByLabel("Conversación").getByText(/Facturación de/).last()).toBeVisible();
});
