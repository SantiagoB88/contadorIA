// Mensajes del bot independientes del proveedor. Los límites salen de la documentación oficial de WhatsApp
// Cloud API (consultada el 04/11/2026):
// - Botones de respuesta: hasta 3; título hasta 20 caracteres; id hasta 256; texto hasta 1024; pie hasta 60.
// - Listas: hasta 10 filas en total; título de fila hasta 24; descripción hasta 72; id hasta 200;
//   texto del botón de la lista hasta 20; título de sección hasta 24; texto hasta 4096; pie hasta 60.
// Los títulos se recortan acá para no mandar nunca un mensaje que el proveedor rechace.

export const LIMITS = {
  buttons: 3,
  buttonTitle: 20,
  buttonBody: 1024,
  listRows: 10,
  rowTitle: 24,
  rowDescription: 72,
  listButton: 20,
  sectionTitle: 24,
  listBody: 4096,
  footer: 60,
  text: 4096,
} as const;

export type Choice = { id: string; title: string; description?: string };

export type BotMessage =
  | { kind: "text"; text: string }
  | { kind: "buttons"; text: string; buttons: Choice[]; footer?: string }
  | { kind: "list"; text: string; button: string; sections: { title?: string; rows: Choice[] }[]; footer?: string };

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function textMessage(text: string): BotMessage {
  return { kind: "text", text: clip(text, LIMITS.text) };
}

export function buttonsMessage(text: string, buttons: Choice[], footer?: string): BotMessage {
  if (buttons.length === 0 || buttons.length > LIMITS.buttons) throw new Error(`Un mensaje con botones lleva de 1 a ${LIMITS.buttons} botones.`);
  return {
    kind: "buttons",
    text: clip(text, LIMITS.buttonBody),
    buttons: buttons.map((b) => ({ id: b.id, title: clip(b.title, LIMITS.buttonTitle) })),
    ...(footer ? { footer: clip(footer, LIMITS.footer) } : {}),
  };
}

export function listMessage(text: string, button: string, sections: { title?: string; rows: Choice[] }[], footer?: string): BotMessage {
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  if (total === 0 || total > LIMITS.listRows) throw new Error(`Una lista lleva de 1 a ${LIMITS.listRows} opciones.`);
  return {
    kind: "list",
    text: clip(text, LIMITS.listBody),
    button: clip(button, LIMITS.listButton),
    sections: sections
      .filter((s) => s.rows.length > 0)
      .map((s) => ({
        ...(s.title ? { title: clip(s.title, LIMITS.sectionTitle) } : {}),
        rows: s.rows.map((r) => ({
          id: r.id,
          title: clip(r.title, LIMITS.rowTitle),
          ...(r.description ? { description: clip(r.description, LIMITS.rowDescription) } : {}),
        })),
      })),
    ...(footer ? { footer: clip(footer, LIMITS.footer) } : {}),
  };
}

/** Opciones de un mensaje interactivo, en orden. */
export function choicesOf(message: BotMessage): Choice[] {
  if (message.kind === "buttons") return message.buttons;
  if (message.kind === "list") return message.sections.flatMap((s) => s.rows);
  return [];
}

/**
 * Versión en texto para clientes que no muestran botones ni listas: las opciones van numeradas y la persona
 * puede responder con el número (el motor lo traduce a la misma opción).
 */
export function fallbackText(message: BotMessage): string {
  if (message.kind === "text") return message.text;
  const options = choicesOf(message)
    .map((c, i) => `${i + 1}. ${c.title}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");
  return `${message.text}\n\n${options}\n\nRespondé con el número de la opción.${message.footer ? `\n${message.footer}` : ""}`;
}
