import { expect, test, type Page } from "@playwright/test";

// Recorrido de la persona con reinicios de Vercel en el medio (las copias vuelven a la base de ejemplo).
const recycle = async (page: Page, copia = "todas") => {
  const r = await page.request.get(`/__reciclar?copia=${copia}`, { timeout: 120_000 });
  expect(r.ok()).toBe(true);
};
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
const conversation = (page: Page) => page.getByLabel("Conversación");
const outTexts = (page: Page) => page.locator('[data-dir="out"]').allInnerTexts();
async function waitReply(page: Page, before: number, re: RegExp) {
  await expect.poll(async () => (await outTexts(page)).slice(before).some((t) => re.test(t)), { timeout: 30_000 }).toBe(true);
}
async function chat(page: Page, text: string, re: RegExp) {
  const before = (await outTexts(page)).length;
  await page.locator("#sim-text").fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await waitReply(page, before, re);
}
async function tap(page: Page, title: string, re: RegExp) {
  const before = (await outTexts(page)).length;
  await conversation(page).getByRole("button", { name: title, exact: true }).last().click();
  await waitReply(page, before, re);
}
async function loginUI(page: Page, email: string, password: string, expectUrl = /\/(dashboard|perfil)/) {
  await page.goto("/login");
  const other = page.getByRole("button", { name: /Cerrar sesión y entrar con otra cuenta/ });
  if (await other.isVisible()) {
    await other.click();
    await page.waitForURL(/\/login$/, { waitUntil: "commit" });
  }
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(expectUrl, { waitUntil: "commit" });
}

test.skip(!process.env.E2E_REINICIOS, "Solo con el simulador de copias de Vercel (E2E_REINICIOS=1).");

test("alta por chat y uso del panel con reinicios de Vercel en el medio", async ({ page }) => {
  test.setTimeout(400_000);
  const id = uid();
  const email = `rei.${id}@ejemplo.com`;
  const name = `Reinicio ${id}`;
  await loginUI(page, "admin@contadorsmart.local", "Demo1234!");
  await page.goto("/dev/whatsapp");
  await page.getByRole("button", { name: "Usar un número nuevo" }).click();
  await chat(page, "hola", /¿Cómo querés empezar\?/);
  await tap(page, "Quiero registrarme", /Te creo la cuenta acá mismo/);
  await tap(page, "Empezar", /nombre y apellido/);
  await chat(page, name, /correo electrónico/);

  // Vercel recicla en el medio del alta y la persona actualiza la página: la conversación sigue.
  await recycle(page);
  await page.reload();
  await expect(conversation(page).getByText(name).first()).toBeVisible();
  await expect(page.getByText(/La demo se reinició/)).toHaveCount(0);
  await chat(page, email, /CUIT/);
  await chat(page, fakeCuit(), /A qué te dedicás/);
  await recycle(page, "0");
  await chat(page, "Servicios de prueba", /mes y año/);
  await chat(page, "05/2023", /Revisá tus datos/);
  await tap(page, "Crear mi cuenta", /Creamos tu cuenta/);
  const credentials = (await outTexts(page)).filter((t) => t.includes("Contraseña temporal")).pop()!;
  const temp = credentials.match(/Contraseña temporal: (\S+)/)![1];
  await recycle(page);
  await page.reload();
  await expect(conversation(page).getByText(/Contraseña temporal/).first()).toBeVisible();

  // Ingresa con la temporal, la cambia y recorre módulos con reinicios en el medio.
  const web = await page.context().newPage();
  await loginUI(web, email, temp, /\/perfil/);
  await web.getByLabel("Contraseña actual").fill(temp);
  await web.getByLabel("Contraseña nueva", { exact: true }).fill("MiClave2026");
  await web.getByLabel("Repetí la contraseña nueva").fill("MiClave2026");
  await web.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(web.getByText("Contraseña actualizada.")).toBeVisible();
  for (const ruta of ["/dashboard", "/facturas", "/solicitudes", "/documentos", "/perfil"]) {
    await recycle(web);
    await web.goto(ruta);
    await expect(web, `sigue adentro en ${ruta}`).not.toHaveURL(/\/login/);
  }
  await expect(web.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await recycle(web);
  await loginUI(web, email, "MiClave2026");
  await web.goto("/dashboard");
  await expect(web.getByRole("heading", { level: 1 })).toHaveText(name);
  // Una publicación nueva (otro deploy): la cuenta creada en la demo sigue sirviendo con la contraseña elegida.
  if (process.env.E2E_REPUBLICAR) {
    const r = await web.request.get("/__republicar", { timeout: 300_000 });
    expect(r.ok()).toBe(true);
    await web.goto("/dashboard");
    await expect(web).not.toHaveURL(/\/login/);
    await loginUI(web, email, "MiClave2026");
    await web.goto("/dashboard");
    await expect(web.getByRole("heading", { level: 1 })).toHaveText(name);
  }
  // El chat también sigue después de todo eso.
  await recycle(page);
  await chat(page, "menu", new RegExp(`Estás consultando`));
});
