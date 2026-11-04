import { expect, test, type Page } from "@playwright/test";
import { USERS, login } from "./helpers";

// Recorrido completo del bot con el simulador visual y la web, tocando botones y listas como en WhatsApp:
// alta desde el bot, aprobación del estudio, vinculación, consulta, solicitud con adjunto y respuesta del estudio.

const uid = () => Date.now().toString(36).slice(-5);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const conversation = (page: Page) => page.getByLabel("Conversación");
const lastReply = (page: Page, text: RegExp) => expect(conversation(page).getByText(text).last()).toBeVisible();
const outCount = (page: Page) => page.locator('[data-dir="out"]').count();

/** Hace algo en el chat y espera a que llegue una respuesta nueva que coincida. */
async function act(page: Page, action: () => Promise<void>, expectReply: RegExp) {
  const before = await outCount(page);
  await action();
  await newReply(page, before, expectReply);
}

/** Espera una respuesta del bot posterior a `before` (cantidad de mensajes salientes) que coincida. */
async function newReply(page: Page, before: number, expectReply: RegExp) {
  await expect
    .poll(async () => (await page.locator('[data-dir="out"]').allInnerTexts()).slice(before).some((t) => expectReply.test(t)), { timeout: 20_000 })
    .toBe(true);
}

async function chat(page: Page, text: string, expectReply: RegExp) {
  await act(
    page,
    async () => {
      await page.locator("#sim-text").fill(text);
      await page.getByRole("button", { name: "Enviar", exact: true }).click();
    },
    expectReply,
  );
}

/** Toca un botón de respuesta del último mensaje que lo tenga. */
async function tap(page: Page, title: string, expectReply: RegExp) {
  await act(page, () => conversation(page).getByRole("button", { name: title, exact: true }).last().click(), expectReply);
}

/** Abre la última lista y elige una fila (el nombre accesible de la fila empieza con su título). */
async function pick(page: Page, row: string, expectReply: RegExp) {
  await act(
    page,
    async () => {
      // La lista se abre con ☰; si un refresco del chat la cerró antes de ver la fila, se vuelve a abrir.
      const option = conversation(page).getByRole("button", { name: new RegExp(`^${esc(row)}`) }).last();
      await expect(async () => {
        if (!(await option.isVisible())) await conversation(page).getByRole("button", { name: /^☰/ }).last().click();
        await expect(option).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });
      await option.click();
    },
    expectReply,
  );
}

const pdf = { name: "constancia.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% prueba\n%%EOF\n") };

test("alta por WhatsApp → aprobación → vinculación → consulta → solicitud con adjunto → respuesta del estudio", async ({ page, browser }) => {
  const id = uid();
  const email = `wa.${id}@ejemplo.com`;
  const name = `Monotributista WA ${id}`;

  // 1. Una persona nueva le escribe al bot (número ficticio del simulador) y elige con botones.
  await login(page, USERS.admin); // el simulador pide una sesión iniciada
  await page.goto("/dev/whatsapp");
  await page.getByLabel("Quién escribe").selectOption("+5491155550004");
  // Se puede repetir sobre la misma base: el número ficticio arranca desvinculado y sin conversación.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reiniciar este número" }).click();
  await expect(page.getByText(/Número reiniciado/)).toBeVisible();
  await expect(conversation(page).getByText(/Todavía no hay mensajes/)).toBeVisible();
  await chat(page, "hola", /¿Cómo querés empezar\?/);
  await tap(page, "Quiero registrarme", /Creá tu cuenta/);
  const inviteText = await conversation(page).getByText(/vincular\?t=/).last().innerText();
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

  // Pide asociarse a un CUIT nuevo. Hasta que el estudio apruebe, el bot no muestra datos fiscales.
  await web.locator("#as-cuit").fill(fakeCuit());
  await web.locator("#as-name").fill(name);
  await web.locator("#as-activity").fill("Servicios de prueba");
  await web.locator("#as-startDate").fill("2023-05-01");
  await web.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(web.getByText(/Solicitud enviada/)).toBeVisible();
  await chat(page, "hola", /pendiente de revisión por el estudio/);
  await tap(page, "Ver estado", /pendiente de revisión del estudio/);

  // 4. El estudio aprueba en Accesos y ve el WhatsApp vinculado.
  await login(web, USERS.admin);
  await web.goto("/admin/accesos");
  await web.locator("section", { hasText: name }).last().getByRole("button", { name: "Aprobar acceso" }).click();
  await expect(web.getByText(/Solicitud aprobada/)).toBeVisible();
  await expect(web.locator("li", { hasText: email }).getByText(/WhatsApp \+54 9 11/)).toBeVisible();

  // 5. Ahora el bot muestra el menú y datos reales del contribuyente (sin facturación cargada: lo dice).
  await chat(page, "menu", new RegExp(`Estás consultando ${esc(name)}`));
  await pick(page, "Mi resumen", /¿Qué período querés ver\?/);
  await pick(page, "Este mes", /no cargó la facturación/);
  await chat(page, "menu", /¿Qué necesitás\?/);
  await pick(page, "Deudas y vencimientos", /¿Qué querés ver\?/);
  await pick(page, "Próximos vencimientos", /no cargó información/);

  // 6. Crea una solicitud desde el bot, con un PDF adjunto, y la confirma.
  const body = `Necesito la constancia ${id}`;
  await chat(page, "menu", /¿Qué necesitás\?/);
  await pick(page, "Mis solicitudes", /¿Qué querés ver\?/);
  await pick(page, "Crear solicitud", /¿Sobre qué es\?/);
  await pick(page, "Documentación", /Contame en un mensaje/);
  await chat(page, body, /¿Querés adjuntar un archivo/);
  await tap(page, "Adjuntar archivo", /Mandá el archivo/);
  await act(page, () => page.locator("#sim-file").setInputFiles(pdf), /Adjunto: constancia\.pdf/);
  // Un "sí" escrito no confirma.
  await chat(page, "sí", /No tomo un "sí" escrito/);
  await tap(page, "Enviar al estudio", /quedó enviada al estudio/);
  const code = (await conversation(page).getByText(/Tu solicitud S-\w{6}/).last().innerText()).match(/S-\w{6}/)![0];

  // 7. El estudio la ve en la Bandeja con canal WhatsApp y el mismo número, deja una nota interna y responde.
  await web.goto("/admin/solicitudes?estado=activas&asignado=sin");
  await expect(web.getByText(new RegExp(`${code} · .*canal WhatsApp`)).first()).toBeVisible();
  await web.getByRole("link", { name: body }).first().click();
  await web.waitForURL(/\/admin\/solicitudes\/c/, { waitUntil: "commit" });
  await expect(web.getByText("constancia.pdf").first()).toBeVisible();
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
  await expect(conversation(page).getByText(new RegExp(`El estudio respondió tu solicitud ${code}`)).last()).toBeVisible({ timeout: 15_000 });
  await chat(page, "menu", /¿Qué necesitás\?/);
  await pick(page, "Mis solicitudes", /¿Qué querés ver\?/);
  await pick(page, "Ver abiertas", /Tus solicitudes abiertas/);
  await pick(page, body.slice(0, 20), new RegExp(`Te la mandamos hoy ${id}`));
  await expect(conversation(page).getByText(`SECRETO-${id}`)).toHaveCount(0);

  // 9. Reiniciar (recargar) conserva la conversación: está en la base.
  await page.reload();
  await page.getByLabel("Quién escribe").selectOption("+5491155550004");
  await lastReply(page, new RegExp(`Te la mandamos hoy ${id}`));
  await web.close();
});

test("opción vencida, evento duplicado, falla del servidor y modo sin botones", async ({ page }) => {
  // Sin sesión, el simulador manda a ingresar; desde la dashboard se abre con el acceso del menú.
  await page.context().clearCookies();
  await page.goto("/dev/whatsapp");
  await page.waitForURL(/\/login\?next=%2Fdev%2Fwhatsapp|\/login\?next=\/dev\/whatsapp/, { waitUntil: "commit" });
  await login(page, USERS.admin);
  const botLink = page.getByRole("link", { name: /Probar bot de WhatsApp \(DEMO\)/ }).first();
  await expect(botLink).toHaveAttribute("href", "/dev/whatsapp");
  await expect(botLink).toHaveAttribute("target", "_blank");
  await page.goto("/dev/whatsapp");
  await page.getByLabel("Quién escribe").selectOption("+5491155550001");
  // Ana tiene varios contribuyentes: elige uno desde la lista.
  await chat(page, "menu", /¿Qué contribuyente querés consultar\?|Estás consultando/);
  if (/¿Qué contribuyente querés consultar\?/.test(await page.locator('[data-dir="out"]').last().innerText())) {
    await pick(page, "Ana Gómez", /Ahora estás consultando Ana Gómez/);
  }
  await pick(page, "Mi cuenta", /Mi cuenta\. ¿Qué querés hacer\?/);
  // Una opción de un mensaje anterior (el menú) ya no está vigente: no hace nada y repite las opciones actuales.
  const menus = conversation(page).getByRole("button", { name: /^☰ Ver opciones/ });
  await act(
    page,
    async () => {
      await menus.nth((await menus.count()) - 2).click();
      await conversation(page).getByRole("button", { name: /^Facturación/ }).last().click();
    },
    /ya no está vigente/,
  );

  await page.getByRole("button", { name: "Reenviar el último mensaje (duplicado)" }).click();
  await expect(page.getByText(/Evento duplicado: se descartó/)).toBeVisible();

  await chat(page, "menu", /¿Qué necesitás\?/);
  await page.getByLabel("Simular una falla del servidor").selectOption("antes");
  const beforeFail = await outCount(page);
  await conversation(page).getByRole("button", { name: /^☰/ }).last().click();
  await conversation(page).getByRole("button", { name: /^Mi resumen/ }).last().click();
  await expect(page.getByText(/El servidor falló \(simulado\)/)).toBeVisible();
  await newReply(page, beforeFail, /Estoy verificando si quedó registrado/);
  const beforeRetry = await outCount(page);
  await page.getByLabel("Simular una falla del servidor").selectOption("");
  await page.getByRole("button", { name: "Reintentar fallidos" }).click();
  await expect(page.getByText(/Reintentados: [1-9]/)).toBeVisible();
  await newReply(page, beforeRetry, /¿Qué período querés ver\?/);

  // Cliente sin botones: las opciones se ven numeradas y responder con el número equivale a tocarlas.
  await page.getByLabel("Ver como un cliente sin botones (opciones numeradas)").check();
  await lastReply(page, /1\. Este mes/);
  await chat(page, "1", /Resumen de Ana Gómez/);
});

test("restablecer la demo: solo el administrador; vuelve a los datos de ejemplo", async ({ page }) => {
  // Un cliente no ve el botón.
  await login(page, USERS.clienteA);
  await page.goto("/dev/whatsapp");
  await expect(page.getByRole("button", { name: "Restablecer demo (todos los datos)" })).toHaveCount(0);

  // El administrador lo usa: se borra lo creado y se cierran las sesiones.
  await login(page, USERS.admin);
  await page.goto("/dev/whatsapp");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restablecer demo (todos los datos)" }).click();
  await page.waitForURL(/\/login/, { timeout: 120_000, waitUntil: "commit" });
  await login(page, USERS.admin);
  await page.goto("/admin/solicitudes?estado=activas");
  await expect(page.getByText(/Necesito la constancia/)).toHaveCount(0);
});
