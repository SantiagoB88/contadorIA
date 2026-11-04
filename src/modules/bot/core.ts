import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { buttonsMessage, choicesOf, listMessage, textMessage, type BotMessage, type Choice } from "./ui";

// Núcleo del motor: estado persistente de la conversación y opciones vigentes.
// Cada mensaje interactivo registra sus opciones con un identificador interno opaco ("<token>.<n>"). Al tocar una
// opción se busca en las opciones VIGENTES de la conversación: una opción de un mensaje anterior (otro token) no
// ejecuta nada. El texto visible nunca autoriza: la acción y su valor salen del estado guardado en el servidor,
// y cada acción vuelve a validar permisos sobre el recurso (contribuyente, solicitud, comprobante).

export type Action = { a: string; v?: string };
export type Opt = { title: string; desc?: string; a: string; v?: string };

export type Conv = {
  flow: string | null; // recorrido en curso (null = menú)
  step: string | null; // paso que espera un texto o un archivo
  data: Record<string, unknown>; // datos parciales del recorrido
  token: string; // identifica el último mensaje con opciones
  options: Record<string, Action>; // "1", "2"… → acción
  prompt: BotMessage[]; // último mensaje con opciones (para repetirlo)
  handoffRequestId?: string | null; // conversación con el estudio: el texto libre va a esa solicitud
  retry?: Action | null; // acción a repetir después de un error de consulta
};

const emptyConv = (): Conv => ({ flow: null, step: null, data: {}, token: "", options: {}, prompt: [] });

export type Identity =
  | { kind: "guest" }
  | { kind: "suspended"; name: string }
  | { kind: "user"; user: CurrentUser };

export class Ctx {
  readonly out: BotMessage[] = [];
  private pending: Record<string, Action> | null = null;
  private pendingPrompt: BotMessage[] = [];
  private seq = 0;

  constructor(
    readonly channel: string,
    readonly address: string,
    public conv: Conv,
    public taxpayerId: string | null,
    readonly identity: Identity,
    readonly eventRef: string,
    readonly origin: string,
    readonly updatedAt: Date,
  ) {}

  get user(): CurrentUser {
    if (this.identity.kind !== "user") throw new Error("Operación que requiere un usuario vinculado.");
    return this.identity.user;
  }

  private repeated = false;

  /** ¿Este turno ya mostró opciones (nuevas o las vigentes repetidas)? */
  get hasPrompt() {
    return this.pending !== null || this.repeated;
  }

  /** Vuelve a mostrar el último mensaje con opciones; sus opciones siguen vigentes. */
  repeatPrompt(): boolean {
    if (this.conv.prompt.length === 0) return false;
    this.out.push(...this.conv.prompt);
    this.repeated = true;
    return true;
  }

  /** Mensaje de texto (sin opciones). */
  say(text: string) {
    this.out.push(textMessage(text));
  }

  private register(opts: Opt[]): Choice[] {
    // Un turno tiene un solo grupo de opciones vigentes: el último mensaje interactivo.
    const token = randomBytes(4).toString("hex");
    this.pending = {};
    this.pendingPrompt = [];
    this.seq = 0;
    return opts.map((o) => {
      const key = String(++this.seq);
      this.pending![key] = { a: o.a, ...(o.v !== undefined ? { v: o.v } : {}) };
      return { id: `${token}.${key}`, title: o.title, ...(o.desc ? { description: o.desc } : {}) };
    });
  }

  /** Hasta 3 botones. */
  buttons(text: string, opts: Opt[], footer?: string) {
    const msg = buttonsMessage(text, this.register(opts), footer);
    this.out.push(msg);
    this.pendingPrompt = [msg];
  }

  /** Lista de hasta 10 opciones (para más, paginar). */
  list(text: string, button: string, opts: Opt[], footer?: string) {
    const msg = listMessage(text, button, [{ rows: this.register(opts) }], footer);
    this.out.push(msg);
    this.pendingPrompt = [msg];
  }

  /** Espera un texto o un archivo en `step` (las opciones del mensaje siguen vigentes, p. ej. "Cancelar"). */
  expect(step: string) {
    this.conv.step = step;
  }

  /** Cierra el turno: guarda las opciones nuevas (si las hubo) y el estado. */
  finish(): { conv: Conv; taxpayerId: string | null } {
    if (this.pending) {
      const first = choicesOf(this.pendingPrompt[0]!)[0];
      this.conv.token = first ? first.id.split(".")[0] : "";
      this.conv.options = this.pending;
      this.conv.prompt = this.pendingPrompt;
    }
    return { conv: this.conv, taxpayerId: this.taxpayerId };
  }

  resetFlow() {
    this.conv.flow = null;
    this.conv.step = null;
    this.conv.data = {};
  }
}

/** Opción tocada (o número escrito) → acción vigente, o null si no corresponde al último mensaje. */
export function resolveChoice(conv: Conv, choiceId: string | null, text: string): Action | null | "stale" {
  if (choiceId) {
    const [token, key] = choiceId.split(".");
    if (!token || !key || token !== conv.token || !conv.options[key]) return "stale";
    return conv.options[key];
  }
  // Clientes sin mensajes interactivos: el número de la opción equivale a tocarla.
  if (/^\d{1,2}$/.test(text.trim()) && conv.options[text.trim()]) return conv.options[text.trim()];
  return null;
}

export async function loadConv(channel: string, address: string) {
  const row = await prisma.botConversation.upsert({
    where: { channel_address: { channel, address } },
    update: {},
    create: { channel, address, state: JSON.stringify(emptyConv()) },
  });
  let conv: Conv;
  try {
    const parsed = JSON.parse(row.state) as Partial<Conv>;
    conv = { ...emptyConv(), ...parsed, data: parsed.data ?? {}, options: parsed.options ?? {}, prompt: parsed.prompt ?? [] };
  } catch {
    conv = emptyConv();
  }
  return { conv, taxpayerId: row.taxpayerId, updatedAt: row.updatedAt };
}

export async function saveConv(channel: string, address: string, conv: Conv, taxpayerId: string | null) {
  await prisma.botConversation.update({
    where: { channel_address: { channel, address } },
    data: { state: JSON.stringify(conv), taxpayerId },
  });
}

/** Paginación de listas: 8 elementos por página + "Ver más" + "Volver" (máximo 10 filas). */
export const PAGE = 8;
export function paginate<T>(items: T[], page: number) {
  const start = page * PAGE;
  return { slice: items.slice(start, start + PAGE), hasMore: items.length > start + PAGE, page };
}
