import { test, type Page } from "@playwright/test";
import { USERS, expectHealthyPage, expectNoHorizontalOverflow, login, trackErrors } from "./helpers";

// Revisión visual: cada pantalla en celular (390), tablet (768) y escritorio (1440).
// Comprueba que no haya scroll horizontal, errores de consola ni pantallas de error,
// y guarda una captura de cada una en capturas-e2e/ para revisarlas a ojo.

const SIZES = [
  { name: "celular", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "escritorio", width: 1440, height: 900 },
];

async function firstHref(page: Page, from: string, selector: string) {
  await page.goto(from);
  const href = await page.locator(selector).first().getAttribute("href");
  if (!href) throw new Error(`No encontré un enlace ${selector} en ${from}`);
  return href;
}

async function audit(page: Page, paths: { name: string; path: string }[], prefix: string) {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const p of paths) {
      const errors = trackErrors(page);
      await page.goto(p.path);
      await page.waitForLoadState("networkidle");
      const label = `${prefix} ${p.name} (${size.name})`;
      await page.screenshot({ path: `capturas-e2e/${size.name}/${prefix}-${p.name}.png`, fullPage: true });
      await expectHealthyPage(page, label);
      await expectNoHorizontalOverflow(page, label);
      if (errors.length) throw new Error(`${label}: errores en consola:\n${errors.join("\n")}`);
      page.removeAllListeners("console");
      page.removeAllListeners("pageerror");
      page.removeAllListeners("response");
    }
  }
}

test("pantallas públicas", async ({ page }) => {
  await audit(
    page,
    [
      { name: "login", path: "/login" },
      { name: "registro", path: "/registro" },
      { name: "recuperar", path: "/recuperar" },
      { name: "restablecer", path: "/restablecer?token=invalido" },
      { name: "verificar", path: "/verificar?token=invalido" },
      { name: "correos", path: "/dev/correos" },
      { name: "no-existe", path: "/no-existe" },
    ],
    "publico",
  );
});

test("pantallas del cliente", async ({ page }) => {
  await login(page, USERS.clienteA);
  const request = await firstHref(page, "/solicitudes?ver=todas", 'a[href^="/solicitudes/c"]');
  const invoice = await firstHref(page, "/facturas", 'a[href^="/facturas/c"]').catch(() => null);
  const informar = await firstHref(page, "/dashboard/deudas", 'a[href^="/dashboard/deudas/informar/"]');
  await audit(
    page,
    [
      { name: "inicio", path: "/dashboard" },
      { name: "movimientos", path: "/dashboard/movimientos" },
      { name: "categoria", path: "/dashboard/categoria" },
      { name: "deudas", path: "/dashboard/deudas" },
      { name: "informar-pago", path: informar },
      { name: "facturas", path: "/facturas" },
      { name: "nueva-factura", path: "/facturas/nueva" },
      ...(invoice ? [{ name: "factura", path: invoice }] : []),
      { name: "solicitudes", path: "/solicitudes" },
      { name: "nueva-solicitud", path: "/solicitudes/nueva" },
      { name: "solicitud", path: request },
      { name: "documentos", path: "/documentos" },
      { name: "perfil", path: "/perfil" },
    ],
    "cliente",
  );
});

test("pantallas del estudio", async ({ page }) => {
  await login(page, USERS.admin);
  const taxpayer = await firstHref(page, "/admin", 'a[href^="/admin/contribuyentes/"]');
  const scale = await firstHref(page, "/admin/escalas", 'a[href^="/admin/escalas/c"]');
  const request = await firstHref(page, "/admin/solicitudes?estado=todas", 'a[href^="/admin/solicitudes/c"]');
  await audit(
    page,
    [
      { name: "backoffice", path: "/admin" },
      { name: "contribuyente", path: taxpayer },
      { name: "bandeja", path: "/admin/solicitudes" },
      { name: "solicitud", path: request },
      { name: "escalas", path: "/admin/escalas" },
      { name: "escala", path: scale },
      { name: "accesos", path: "/admin/accesos" },
      { name: "documentos", path: "/documentos" },
      { name: "inicio", path: "/dashboard" },
    ],
    "estudio",
  );
});
