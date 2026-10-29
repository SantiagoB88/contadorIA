import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Demo1234!";

export const USERS = {
  admin: "admin@contadorsmart.local",
  contadora: "contadora@contadorsmart.local",
  clienteA: "cliente.a@contadorsmart.local",
  clienteB: "cliente.b@contadorsmart.local",
  otroEstudio: "admin.otro@contadorsmart.local",
} as const;

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/dashboard/, { waitUntil: "commit" });
}

/** Junta errores de consola y de página (excepto los que genera Next en desarrollo y no son de la app). */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // "Failed to load resource" se informa abajo con su URL.
    if (/Download the React DevTools|\[HMR\]|\[Fast Refresh\]|Failed to load resource/.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (res) => {
    if (res.status() >= 400 && res.request().resourceType() !== "document") errors.push(`${res.status()} ${res.url()}`);
  });
  return errors;
}

/** No debe haber scroll horizontal en la página (todo entra en el ancho de la pantalla). */
export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const extra = doc.scrollWidth - doc.clientWidth;
    if (extra <= 1) return null;
    // Elemento más ancho que la pantalla, para saber qué corregir.
    const offender = [...document.querySelectorAll<HTMLElement>("body *")].find((el) => {
      const r = el.getBoundingClientRect();
      if (r.right <= doc.clientWidth + 1) return false;
      // Las tablas con scroll propio (overflow-x-auto) están bien.
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        const s = getComputedStyle(p);
        if (s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden") return false;
        p = p.parentElement;
      }
      return true;
    });
    const describe = (el: Element) => `${el.tagName.toLowerCase()}.${String(el.className)}`.slice(0, 120);
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 6)
      .map((el) => `${describe(el)} → ${Math.round(el.getBoundingClientRect().right)}px`);
    return { extra, offender: offender ? describe(offender) : "?", wide };
  });
  expect(overflow, `${label}: hay scroll horizontal`).toBeNull();
}

/** Ninguna pantalla debe mostrar el error de Next ni la pantalla de error de la app. */
export async function expectHealthyPage(page: Page, label: string) {
  await expect(page.locator("nextjs-portal [data-nextjs-dialog]"), `${label}: error de Next`).toHaveCount(0);
  await expect(page.getByText("No pudimos cargar esta pantalla"), `${label}: pantalla de error`).toHaveCount(0);
  await expect(page.getByText("Falta reiniciar la aplicación"), `${label}: base desactualizada`).toHaveCount(0);
}
