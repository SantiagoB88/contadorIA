import { expect, test, type Page } from "@playwright/test";
import { USERS, expectHealthyPage, login, trackErrors } from "./helpers";

// Recorridos completos como los haría una persona, en el navegador.
// Cada prueba crea sus propios datos (con un sufijo único) para no depender de las demás.

const uid = () => Date.now().toString(36).slice(-5);
const pdf = (name: string, text = "demo") => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`),
});

async function expectNoErrors(page: Page, errors: string[], label: string) {
  await expectHealthyPage(page, label);
  expect(errors, `${label}: errores en consola`).toEqual([]);
}

test.describe("acceso y sesión", () => {
  test("contraseña incorrecta, ingreso y cierre de sesión", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(USERS.clienteA);
    await page.getByLabel("Contraseña").fill("incorrecta");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /correo o la contraseña/i })).toBeVisible();

    await login(page, USERS.clienteA);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ana Gómez");
    await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
    await page.waitForURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("un cliente no ve datos ajenos aunque cambie la URL", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/admin");
    const brunoHref = await page.getByRole("row", { name: /Bruno Díaz/ }).getByRole("link", { name: "Administrar" }).getAttribute("href");
    const brunoId = brunoHref!.split("/").pop()!;
    await page.goto(`/documentos?c=${brunoId}`);
    const docHref = await page.locator('a[href$="/descargar"]').first().getAttribute("href");

    await login(page, USERS.clienteA);
    await page.goto(`/dashboard?c=${brunoId}`);
    await expect(page.getByText("No tenés acceso a este contribuyente")).toBeVisible();
    await page.goto(`/dashboard/deudas?c=${brunoId}`);
    await expect(page.getByText("No tenés acceso a este contribuyente")).toBeVisible();
    // Backoffice: un cliente vuelve a su inicio.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard$/);
    // Descarga de un documento de otro cliente: no encontrado.
    const res = await page.request.get(docHref!);
    expect(res.status()).toBe(404);
  });

  test("menú del celular: se abre, navega y se cierra", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, USERS.clienteA);
    await page.getByRole("button", { name: "Menú" }).click();
    await page.locator("#menu-movil").getByRole("link", { name: "Deudas" }).click();
    await page.waitForURL(/\/dashboard\/deudas/);
    await expect(page.locator("#menu-movil")).toHaveCount(0);
    await page.getByRole("button", { name: "Menú" }).click();
    await expect(page.locator("#menu-movil").getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  });
});

test.describe("registro y asociación", () => {
  test("alta de un cliente nuevo hasta ver su contribuyente", async ({ page }) => {
    const errors = trackErrors(page);
    const email = `nuevo.${uid()}@ejemplo.com`;
    await page.goto("/registro");
    await page.getByLabel("Nombre y apellido").fill("Cliente Prueba E2E");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Teléfono").fill("+54 11 5555-0000");
    await page.getByLabel("Contraseña", { exact: true }).fill("Prueba1234!");
    await page.getByLabel("Repetí la contraseña").fill("Prueba1234!");
    await page.getByRole("button", { name: /Crear/ }).click();
    await expect(page.getByText(/Revisá tu correo|te enviamos/i).first()).toBeVisible();

    // Confirmar el correo desde la bandeja local.
    await page.goto("/dev/correos");
    const link = page.getByRole("link", { name: /\/verificar\?token=/ }).first();
    await page.goto((await link.getAttribute("href"))!);
    await page.getByRole("button", { name: /Confirmar/ }).click();
    await expect(page.getByText(/confirmado|verificado/i).first()).toBeVisible();

    await login(page, email, "Prueba1234!");
    await expectNoErrors(page, errors, "alta");
    await expect(page.getByText(/asociar|CUIT/i).first()).toBeVisible();
  });
});

test.describe("facturador", () => {
  test("borrador → revisión → emisión simulada → PDF", async ({ page }) => {
    const errors = trackErrors(page);
    const concept = `Servicio E2E ${uid()}`;
    await login(page, USERS.clienteA);
    await page.goto("/facturas/nueva");
    // Con un error de validación, lo elegido se mantiene (el formulario no se "desarma").
    await page.getByLabel("Uno nuevo").check();
    await page.getByRole("button", { name: "Guardar borrador y revisar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Revisá" }).first()).toBeVisible();
    await expect(page.getByLabel("Uno nuevo")).toBeChecked();
    await expect(page.getByLabel("Nombre o razón social")).toBeVisible();

    await page.getByLabel("Uno guardado").check();
    await page.getByLabel("Receptor", { exact: true }).selectOption({ index: 1 });
    await page.locator("#d-1").fill(concept);
    await page.getByLabel("Cantidad").fill("2");
    await page.getByLabel("Precio unitario").fill("1.500,50");
    await expect(page.getByText("$ 3.001,00").first()).toBeVisible();
    await page.getByRole("button", { name: "Guardar borrador y revisar" }).click();

    await page.waitForURL(/\/facturas\/c/);
    await page.getByRole("button", { name: "Confirmar emisión simulada" }).click();
    await expect(page.getByText(/C 00001-\d{8}/).first()).toBeVisible();
    const pdfHref = await page.getByRole("link", { name: /PDF/ }).first().getAttribute("href");
    const res = await page.request.get(pdfHref!);
    expect(res.status()).toBe(200);
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");

    await page.goto("/facturas");
    await expect(page.getByText(concept).first()).toBeAttached();
    await expectNoErrors(page, errors, "facturador");
  });
});

test.describe("solicitudes, notas internas y documentos", () => {
  test("cliente → estudio → cliente, sin ver notas internas", async ({ page }) => {
    const errors = trackErrors(page);
    const id = uid();
    const subject = `Consulta E2E ${id}`;
    const secret = `NOTA-SECRETA-${id}`;

    // 1. El cliente crea la solicitud con un adjunto.
    await login(page, USERS.clienteB);
    await page.goto("/solicitudes/nueva");
    await page.getByLabel("Tema").selectOption({ label: "Facturación" });
    await page.getByLabel("Asunto").fill(subject);
    await page.getByLabel("Mensaje").fill("¿Cómo facturo a un cliente del exterior?");
    await page.locator("#newFiles").setInputFiles(pdf(`presupuesto-${id}.pdf`));
    await expect(page.getByText(`presupuesto-${id}.pdf`)).toBeVisible();
    await page.getByRole("button", { name: "Enviar solicitud" }).click();
    await page.waitForURL(/\/solicitudes\/c.*enviada=1/);
    await expect(page.getByText("Solicitud enviada")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`presupuesto-${id}`) })).toBeVisible();
    const requestUrl = page.url().split("?")[0];
    const requestId = requestUrl.split("/").pop()!;

    // 2. El estudio la ve en la bandeja, la asigna, deja una nota interna y responde.
    await login(page, USERS.admin);
    await page.goto("/admin/solicitudes?estado=activas&asignado=sin");
    await page.getByRole("link", { name: subject }).first().click();
    await page.waitForURL(new RegExp(`/admin/solicitudes/${requestId}`));
    await page.getByLabel("Asignada a").selectOption({ label: "Laura Méndez (Contadora demo)" });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText(/asignada a Laura/)).toBeVisible();
    // Después de guardar, el formulario muestra lo guardado (no vuelve al valor anterior).
    await expect(page.getByLabel("Asignada a").locator("option:checked")).toHaveText("Laura Méndez (Contadora demo)");

    await page.getByRole("radio", { name: "Nota interna (el cliente no la ve)" }).click();
    await page.getByLabel("Nota interna", { exact: true }).fill(secret);
    await page.locator("#replyFiles").setInputFiles(pdf(`interno-${id}.pdf`));
    await page.getByRole("button", { name: "Guardar nota interna" }).click();
    await expect(page.getByText("Nota interna guardada")).toBeVisible();
    await expect(page.getByText(secret)).toBeVisible();
    // Sigue marcada "Nota interna" y el botón lo dice: lo que se ve es lo que se envía.
    await expect(page.getByRole("radio", { name: "Nota interna (el cliente no la ve)" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Guardar nota interna" })).toBeVisible();

    await page.getByRole("radio", { name: "Respuesta al cliente" }).click();
    await page.getByLabel("Respuesta", { exact: true }).fill("¿Me pasás el CUIT del cliente?");
    await page.getByLabel("Cambiar estado (opcional)").selectOption({ label: "Esperando respuesta del cliente" });
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByText("Mensaje enviado.")).toBeVisible();

    // 3. El cliente ve la respuesta y el estado, nunca la nota ni su adjunto.
    await login(page, USERS.clienteB);
    await page.goto(requestUrl);
    await expect(page.getByText("¿Me pasás el CUIT del cliente?")).toBeVisible();
    await expect(page.getByText("El estudio espera tu respuesta")).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(secret);
    expect(html).not.toContain(`interno-${id}.pdf`);
    await page.goto("/documentos");
    await expect(page.getByText(`interno-${id}.pdf`)).toHaveCount(0);
    await expect(page.getByText(`presupuesto-${id}.pdf`).first()).toBeAttached();

    // 4. Responde: vuelve a "En curso".
    await page.goto(requestUrl);
    await page.getByLabel("Tu mensaje").fill("Es 30-00000007-4");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByText("Mensaje enviado.")).toBeVisible();
    await expect(page.getByText("En curso").first()).toBeVisible();

    // 5. El estudio la resuelve; el cliente lo ve.
    await login(page, USERS.contadora);
    await page.goto(`/admin/solicitudes/${requestId}`);
    await page.getByLabel("Estado", { exact: true }).selectOption({ label: "Resuelta" });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText(/Cambios guardados/)).toBeVisible();
    await login(page, USERS.clienteB);
    await page.goto(requestUrl);
    await expect(page.getByText("Resuelta").first()).toBeVisible();
    await expectNoErrors(page, errors, "solicitudes");
  });

  test("informar un pago con comprobante", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, USERS.clienteB);
    await page.goto("/dashboard/deudas");
    const informar = page.getByRole("link", { name: "Informar pago" }).first();
    await informar.click();
    await page.waitForURL(/\/informar\//);
    // Sin comprobante no se puede.
    await page.getByRole("button", { name: "Informar pago" }).click();
    await expect(page.getByText(/Adjuntá el comprobante/)).toBeVisible();
    await page.locator("#payFiles").setInputFiles(pdf("comprobante-pago.pdf"));
    await page.getByLabel("Comentario (opcional)").fill("Pagué por home banking");
    await page.getByRole("button", { name: "Informar pago" }).click();
    await page.waitForURL(/\/solicitudes\/c.*pago=1/);
    await expect(page.getByText("Pago informado").first()).toBeVisible();
    await page.goto("/dashboard/deudas");
    await expect(page.getByText("Pago informado (sin verificar)").first()).toBeAttached();
    await expectNoErrors(page, errors, "informar pago");
  });

  test("documentos: interno, compartir, descargar y rechazo de archivos inválidos", async ({ page }) => {
    const errors = trackErrors(page);
    const id = uid();
    await login(page, USERS.admin);
    await page.goto("/admin");
    await page.getByRole("row", { name: /Ana Gómez/ }).getByRole("link", { name: "Administrar" }).click();
    await page.waitForURL(/\/admin\/contribuyentes\//);

    // HTML disfrazado de PDF: se rechaza.
    await page.locator("#docFiles").setInputFiles({ name: "factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
    await page.getByRole("button", { name: "Subir documentos" }).click();
    await expect(page.getByText(/no corresponde a un PDF válido/)).toBeVisible();

    // Documento interno: el cliente no lo ve.
    await page.locator("#docFiles").setInputFiles(pdf(`papel-${id}.pdf`));
    await page.getByLabel("Quién lo ve").selectOption("INTERNO");
    await page.getByRole("button", { name: "Subir documentos" }).click();
    await expect(page.getByText("Documento cargado.")).toBeVisible();
    const row = page.locator("li", { hasText: `papel-${id}.pdf` });
    await expect(row.getByText("Solo el estudio")).toBeVisible();
    const docHref = await row.getByRole("link", { name: `papel-${id}.pdf` }).getAttribute("href");

    await login(page, USERS.clienteA);
    await page.goto("/documentos");
    await expect(page.getByText(`papel-${id}.pdf`)).toHaveCount(0);
    expect((await page.request.get(docHref!)).status()).toBe(404);

    // Se comparte: ahora lo ve y lo descarga.
    await login(page, USERS.admin);
    await page.goBack();
    await page.goto("/admin");
    await page.getByRole("row", { name: /Ana Gómez/ }).getByRole("link", { name: "Administrar" }).click();
    await page.locator("li", { hasText: `papel-${id}.pdf` }).getByRole("button", { name: "Compartir con el cliente" }).click();
    await expect(page.locator("li", { hasText: `papel-${id}.pdf` }).getByText("Lo ve el cliente")).toBeVisible();

    await login(page, USERS.clienteA);
    await page.goto("/documentos");
    await expect(page.getByText(`papel-${id}.pdf`).first()).toBeAttached();
    const res = await page.request.get(docHref!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["content-disposition"]).toContain("attachment");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    await expectNoErrors(page, errors, "documentos");
  });
});

test.describe("datos fiscales del estudio", () => {
  test("cargar un vencimiento, verificar el pago y registrar una categoría", async ({ page }) => {
    const errors = trackErrors(page);
    const concept = `Vencimiento E2E ${uid()}`;
    await login(page, USERS.admin);
    await page.goto("/admin");
    await page.getByRole("row", { name: /Martín Gómez/ }).getByRole("link", { name: "Administrar" }).click();
    await page.waitForURL(/\/admin\/contribuyentes\//);

    await page.locator("#concept").fill(concept);
    await page.locator("#dueDate").fill("2026-01-10");
    await page.locator("#obAmount").fill("10.000");
    await page.getByRole("button", { name: "Cargar vencimiento" }).click();
    await expect(page.getByText("Vencimiento cargado.")).toBeVisible();
    await expect(page.getByText(concept)).toBeVisible();

    // Verificar el pago exige evidencia.
    const block = page.locator("li", { hasText: concept });
    await block.getByRole("combobox").selectOption("PAGO_VERIFICADO");
    await block.getByRole("button", { name: "Actualizar" }).click();
    await expect(block.getByText(/Indicá la evidencia/)).toBeVisible();
    await block.getByRole("textbox").fill("Comprobante revisado (E2E)");
    await block.getByRole("button", { name: "Actualizar" }).click();
    await expect(page.getByText("Estado actualizado: Pago verificado por el estudio.")).toBeVisible();

    await page.locator("#categoryCode").selectOption("C");
    await page.locator("#catReason").fill("Prueba E2E de recategorización");
    await page.getByRole("button", { name: "Registrar categoría" }).click();
    await expect(page.getByRole("status").filter({ hasText: /[Cc]ategoría/ }).first()).toBeVisible();
    await expect(page.getByText("C desde el")).toBeVisible();
    await expectNoErrors(page, errors, "datos fiscales");
  });
});
