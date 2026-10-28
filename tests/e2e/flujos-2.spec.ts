import { expect, test, type Page } from "@playwright/test";
import { USERS, expectHealthyPage, login, trackErrors } from "./helpers";

// Más recorridos: asociación por CUIT con aprobación del estudio, revocación y suspensión,
// recuperación de contraseña, perfil, escalas, casos del facturador y conciliación con Movimientos.

const uid = () => Date.now().toString(36).slice(-5);

/** CUIT ficticio con dígito verificador válido (prefijo 20). */
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

async function register(page: Page, email: string, password: string, name: string) {
  await page.goto("/registro");
  await page.getByLabel("Nombre y apellido").fill(name);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Teléfono").fill("+54 11 5555-0000");
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByLabel("Repetí la contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText(/Te enviamos un correo/)).toBeVisible();
  await page.goto("/dev/correos");
  const href = await page.locator(`a[href*="/verificar?token="]`).first().getAttribute("href");
  await page.goto(href!);
  await page.getByRole("button", { name: "Confirmar mi correo" }).click();
  await expect(page.getByText("Tu correo quedó confirmado")).toBeVisible();
}

test("asociación por CUIT: pedido, aprobación, revocación y suspensión", async ({ page }) => {
  const errors = trackErrors(page);
  const id = uid();
  const email = `asoc.${id}@ejemplo.com`;
  const name = `Contribuyente E2E ${id}`;
  const cuit = fakeCuit();
  await register(page, email, "Prueba1234!", `Usuario ${id}`);

  // El cliente pide asociarse; no ve datos hasta que el estudio aprueba.
  await login(page, email, "Prueba1234!");
  await page.goto("/perfil");
  await page.locator("#as-cuit").fill(cuit);
  await page.locator("#as-name").fill(name);
  await page.locator("#as-activity").fill("Pruebas automáticas");
  await page.locator("#as-startDate").fill("2022-03-01");
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByText(/Solicitud enviada/)).toBeVisible();
  // El formulario queda vacío para otra solicitud.
  await expect(page.locator("#as-cuit")).toHaveValue("");
  await page.goto("/dashboard");
  await expect(page.getByText(name)).toHaveCount(0);

  // El estudio aprueba.
  await login(page, USERS.admin);
  await page.goto("/admin/accesos");
  const card = page.locator("section", { hasText: name }).last();
  await card.getByRole("button", { name: "Aprobar acceso" }).click();
  await expect(page.getByText(/Solicitud aprobada/)).toBeVisible();

  // Ahora el cliente ve su contribuyente.
  await login(page, email, "Prueba1234!");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // El estudio revoca el acceso: el cliente deja de verlo.
  await login(page, USERS.admin);
  await page.goto("/admin/accesos");
  const access = page.locator("li", { hasText: email }).filter({ has: page.getByRole("button", { name: "Revocar" }) });
  await access.getByRole("textbox").fill("Prueba de revocación E2E");
  await access.getByRole("button", { name: "Revocar" }).click();
  await expect(page.getByText(/Acceso revocado/)).toBeVisible();
  await expect(page.locator("li", { hasText: email }).filter({ has: page.getByRole("button", { name: "Revocar" }) })).toHaveCount(0);
  await login(page, email, "Prueba1234!");
  await expect(page.getByText(name)).toHaveCount(0);

  // El estudio suspende al usuario: ya no puede ingresar.
  await login(page, USERS.admin);
  await page.goto("/admin/accesos");
  await page.locator("li", { hasText: email }).getByRole("button", { name: "Suspender" }).click();
  await expect(page.locator("li", { hasText: email }).getByRole("button", { name: "Reactivar" })).toBeVisible();
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("Prueba1234!");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("alert").filter({ hasText: /./ }).first()).toBeVisible();
  await expectHealthyPage(page, "asociación");
  expect(errors).toEqual([]);
});

test("recuperar la contraseña y editar el perfil", async ({ page }) => {
  const errors = trackErrors(page);
  const id = uid();
  const email = `recupero.${id}@ejemplo.com`;
  await register(page, email, "Original123!", `Usuario ${id}`);

  await page.goto("/recuperar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: /Enviar/ }).click();
  await expect(page.getByText(/te enviamos un enlace/i)).toBeVisible();
  await page.goto("/dev/correos");
  const href = await page.locator(`a[href*="/restablecer?token="]`).first().getAttribute("href");
  await page.goto(href!);
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("Nueva12345!");
  await page.getByLabel("Repetí la contraseña").fill("Nueva12345!");
  await page.getByRole("button", { name: /Guardar|Cambiar/ }).click();
  await expect(page.getByText("Listo, tu contraseña cambió").first()).toBeVisible();
  // El enlace sirve una sola vez: al volver a abrirlo ya no muestra el formulario.
  await page.goto(href!);
  await expect(page.getByText(/no es válido|venció|ya se usó/i).first()).toBeVisible();
  await expect(page.getByLabel("Contraseña nueva", { exact: true })).toHaveCount(0);

  await login(page, email, "Nueva12345!");
  await page.goto("/perfil");
  await page.getByLabel("Nombre y apellido").fill(`Nombre Editado ${id}`);
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByRole("status").filter({ hasText: /guardad|actualizad/i }).first()).toBeVisible();
  await expect(page.getByLabel("Nombre y apellido")).toHaveValue(`Nombre Editado ${id}`);

  await page.getByLabel("Contraseña actual").fill("incorrecta");
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("Otra12345!");
  await page.getByLabel("Repetí la contraseña nueva").fill("Otra12345!");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByText(/actual no es correcta|no coincide/i).first()).toBeVisible();
  await expectHealthyPage(page, "perfil");
  expect(errors).toEqual([]);
});

test("escalas: no se superponen y una nueva cierra la vigente", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, USERS.admin);
  await page.goto("/admin/escalas");
  const year = new Date().getFullYear();

  // Superpuesta con la vigente: no se guarda.
  await page.locator("#name").fill("Escala superpuesta E2E");
  await page.locator("#source").fill("Prueba automática");
  await page.locator("#validFrom").fill(`${year}-03-01`);
  await page.locator("#validTo").fill(`${year}-04-01`);
  await page.locator("#limit-A").fill("1000");
  await page.locator("#limit-B").fill("2000");
  await page.getByRole("button", { name: "Crear versión" }).click();
  await expect(page.getByText(/superpone/i).first()).toBeVisible();
  // Lo cargado no se pierde con el error.
  await expect(page.locator("#name")).toHaveValue("Escala superpuesta E2E");

  // Una versión futura sin fin: cierra la vigente el día anterior.
  const future = year + 5;
  await page.locator("#name").fill(`Escala ${future} E2E`);
  await page.locator("#validFrom").fill(`${future}-01-01`);
  await page.locator("#validTo").fill("");
  await page.getByRole("button", { name: "Crear versión" }).click();
  await page.waitForURL(/\/admin\/escalas\/c.*creada=1/);
  await page.goto("/admin/escalas");
  await expect(page.getByText(`31/12/${future - 1}`).first()).toBeVisible();
  await expectHealthyPage(page, "escalas");
  expect(errors).toEqual([]);
});

test("facturador: rechazo simulado, borrador a partir de otra y eliminar borrador", async ({ page }) => {
  const errors = trackErrors(page);
  const concept = `Rechazo E2E ${uid()}`;
  await login(page, USERS.clienteA);
  await page.goto("/facturas/nueva");
  await page.getByLabel("Uno guardado").check();
  await page.getByLabel("Receptor", { exact: true }).selectOption({ index: 1 });
  await page.locator("#d-1").fill(concept);
  await page.getByLabel("Precio unitario").fill("1000");
  await page.getByRole("button", { name: "Guardar borrador y revisar" }).click();
  await page.waitForURL(/\/facturas\/c/);

  await page.getByLabel(/Simular un rechazo/).check();
  await page.getByRole("button", { name: "Confirmar emisión simulada" }).click();
  await expect(page.getByText("Rechazada").first()).toBeVisible();

  await page.getByRole("button", { name: "Crear borrador a partir de esta" }).click();
  await page.waitForURL(/\/facturas\/c.*\/editar|\/facturas\/c/);
  await expect(page.locator("#d-1")).toHaveValue(concept);
  await page.getByRole("button", { name: "Guardar borrador y revisar" }).click();
  await page.waitForURL(/\/facturas\/c[^/]*$/);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar borrador" }).click();
  await page.waitForURL(/\/facturas(\?|$)/);
  await expectHealthyPage(page, "facturador");
  expect(errors).toEqual([]);
});

test("cada total del tablero coincide con sus movimientos", async ({ page }) => {
  await login(page, USERS.clienteA);
  for (const label of ["Mes", "Semestre", "Año", "Últimos 12 meses"]) {
    await page.goto("/dashboard");
    const card = page.locator("section", { has: page.getByRole("heading", { name: label, exact: true }) });
    const total = (await card.locator("p.text-2xl, p.text-3xl").first().innerText()).trim();
    await card.getByRole("link", { name: /Ver \d+ comprobantes?/ }).click();
    await page.waitForURL(/\/dashboard\/movimientos/);
    await expect(page.locator("tfoot").getByText(total)).toBeVisible();
  }
});
