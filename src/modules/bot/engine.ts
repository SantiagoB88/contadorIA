import { CHANNEL } from "@/lib/constants";
import type { CurrentUser } from "@/lib/auth";
import { getAccessibleTaxpayers } from "@/modules/taxpayers/access";
import { getActiveLink } from "./links";
import { Ctx, loadConv, resolveChoice, saveConv, type Action, type Identity } from "./core";
import { T } from "./copy";
import { textMessage, type BotMessage } from "./ui";
import { actions, readOnly, textSteps, uploadSteps, withoutTaxpayer, type Upload } from "./registry";
import { OPERATIONS, showMenu, showPending, showWelcome, tryLinkCode } from "./flows-home";
import { handoffMessage } from "./flows-requests";
// Los recorridos se registran al importarse.
import "./flows-info";
import "./flows-billing";
import "./flows-ops";
import { SIGNUP_STEPS } from "./flows-signup";

// Motor de conversación del bot. No sabe nada de WhatsApp: recibe lo que mandó un número ya validado por el
// transporte (un texto, una opción tocada o un archivo ya guardado) y devuelve los mensajes a responder.
// Toda la información sale de los mismos servicios que usa la web y cada acción vuelve a validar permisos.
// No hay IA: opciones interactivas con identificadores internos validados contra el paso vigente.

export type BotInput = {
  channel: typeof CHANNEL.WHATSAPP;
  address: string; // número normalizado (E.164), derivado del canal validado
  text: string;
  choiceId?: string | null; // id de la opción tocada (botón o fila de lista)
  upload?: Upload | null; // archivo recibido y ya validado
  uploadError?: string | null; // archivo recibido pero rechazado (tipo, tamaño o contenido)
  eventRef: string; // id del evento: hace idempotentes las acciones con efecto
  origin: string; // URL de la web para los enlaces
  fault?: "antes" | "despues"; // solo el simulador local: simula una caída antes o después de la acción
};

/** Un recorrido sin tocar durante este tiempo se ofrece retomar o descartar antes de seguir. */
export const RESUME_AFTER_MS = 2 * 60 * 60 * 1000;

const MENU_WORDS = ["menu", "menú", "hola", "inicio", "buenas", "buen dia", "buen día", "volver", "0"];
const CANCEL_WORDS = ["cancelar", "salir", "basta"];
const HELP_WORDS = ["ayuda", "help"];
const YES_WORDS = ["si", "sí", "dale", "ok", "confirmo", "confirmar", "listo", "de acuerdo"];

async function identify(address: string): Promise<Identity> {
  const link = await getActiveLink(address);
  if (!link) return { kind: "guest" };
  if (!link.user.active) return { kind: "suspended", name: link.user.name };
  // El bot es para clientes: un número vinculado a otro rol se trata como no vinculado.
  if (link.user.role !== "CLIENTE") return { kind: "guest" };
  const user: CurrentUser = {
    id: link.user.id,
    studyId: link.user.studyId,
    studyName: link.user.study.name,
    email: link.user.email,
    name: link.user.name,
    role: link.user.role,
  };
  return { kind: "user", user };
}


async function runAction(ctx: Ctx, action: Action) {
  const handler = actions[action.a];
  if (!handler) return showMenu(ctx);
  ctx.conv.step = null;
  if (!withoutTaxpayer.has(action.a) && (await getAccessibleTaxpayers(ctx.user)).length === 0) return showPending(ctx);
  if (!readOnly.has(action.a)) return handler(ctx, action.v);
  // Las consultas que fallan se ofrecen reintentar: no tienen efectos, no hay riesgo de duplicar.
  try {
    await handler(ctx, action.v);
  } catch (err) {
    console.error(`[bot] Falló la consulta ${action.a}: ${err instanceof Error ? err.message : "error"}`);
    ctx.out.length = 0;
    ctx.say(T.queryFailed);
    ctx.buttons("¿Qué hacemos?", [
      { title: T.retry, a: action.a, v: action.v },
      { title: T.menu, a: "menu" },
    ]);
  }
}

const SIGNUP_WORDS = /\b(alta|registr\w*|crear (una |mi )?cuenta|soy nuev[oa]|quiero empezar)\b/i;

async function guestTurn(ctx: Ctx, action: Action | null | "stale", text: string) {
  if (action && action !== "stale" && action.a.startsWith("g.") && actions[action.a]) return actions[action.a](ctx, action.v);
  const norm = text.toLowerCase().replace(/[.!¡¿?]/g, "").trim();
  if (MENU_WORDS.includes(norm) || CANCEL_WORDS.includes(norm)) return showWelcome(ctx);
  // Alta en curso: el dato que pidió el paso (nombre, correo, CUIT...).
  const step = ctx.conv.step;
  if (step && SIGNUP_STEPS.has(step) && textSteps[step]) {
    if (!text) {
      ctx.say(T.notUnderstood);
      ctx.repeatPrompt();
      return;
    }
    return textSteps[step](ctx, text);
  }
  if (/^\d{6}$/.test(text)) return tryLinkCode(ctx, text);
  if (SIGNUP_WORDS.test(text)) return actions["g.registro"](ctx);
  if (ctx.conv.flow === "alta" && ctx.conv.prompt.length) {
    ctx.say(YES_WORDS.includes(norm) ? T.noYes : T.notUnderstood);
    ctx.repeatPrompt();
    return;
  }
  return showWelcome(ctx);
}

async function userTurn(ctx: Ctx, input: BotInput, action: Action | null, text: string) {
  const norm = text.toLowerCase().replace(/[.!¡¿?]/g, "").trim();
  const conv = ctx.conv;

  if (!action && !input.upload) {
    if (MENU_WORDS.includes(norm)) action = { a: "menu" };
    else if (CANCEL_WORDS.includes(norm)) action = { a: conv.flow || conv.handoffRequestId ? "cancel" : "menu" };
    else if (HELP_WORDS.includes(norm)) action = { a: "help" };
  }

  // Recorrido viejo sin terminar: antes de seguir, se pregunta si retomarlo.
  const stale = Date.now() - ctx.updatedAt.getTime() > RESUME_AFTER_MS;
  if (!action && stale && conv.flow && OPERATIONS[conv.flow]) {
    conv.step = null;
    ctx.buttons(T.resumeAsk(OPERATIONS[conv.flow]), [
      { title: T.resume, a: "resume" },
      { title: T.discard, a: "discard" },
      { title: T.menu, a: "menu" },
    ]);
    return;
  }

  if (action) return runAction(ctx, action);

  // Conversación derivada al estudio: lo que escribe va a la solicitud.
  if (conv.handoffRequestId && !conv.step) return handoffMessage(ctx, text, input.upload ?? null);

  if (input.upload) {
    const handler = conv.step ? uploadSteps[conv.step] : undefined;
    if (handler) return handler(ctx, input.upload);
    ctx.say(T.notExpectingFile);
    if (!ctx.repeatPrompt()) return showMenu(ctx);
    return;
  }

  const textHandler = conv.step ? textSteps[conv.step] : undefined;
  if (textHandler) {
    if (!text) {
      ctx.say(T.notUnderstood);
      ctx.repeatPrompt();
      return;
    }
    return textHandler(ctx, text);
  }
  if (conv.step && uploadSteps[conv.step]) {
    ctx.say("Estoy esperando un archivo (foto JPG o PNG, o un PDF). Si no lo tenés ahora, tocá una opción.");
    if (!ctx.repeatPrompt()) return showMenu(ctx);
    return;
  }

  // Un "sí" escrito nunca confirma una operación.
  if (YES_WORDS.includes(norm) && conv.prompt.length) {
    ctx.say(T.noYes);
    ctx.repeatPrompt();
    return;
  }
  if (conv.flow) {
    ctx.say(T.notUnderstood);
    if (!ctx.repeatPrompt()) return showMenu(ctx);
    return;
  }
  return showMenu(ctx);
}

/** Punto de entrada: un mensaje entrante → respuestas. */
export async function handleMessage(input: BotInput): Promise<BotMessage[]> {
  if (input.fault === "antes") throw new Error("Falla simulada antes de procesar (simulador).");
  const text = input.text.trim();
  const identity = await identify(input.address);
  if (identity.kind === "suspended") return [textMessage(T.suspended)];

  const { conv, taxpayerId, updatedAt } = await loadConv(input.channel, input.address);
  const ctx = new Ctx(input.channel, input.address, conv, taxpayerId, identity, input.eventRef, input.origin, updatedAt);

  // Mientras se espera un texto, un número escrito es el dato (una cantidad, un importe), no una opción.
  const action = resolveChoice(conv, input.choiceId ?? null, conv.step ? "" : text);

  if (input.uploadError) {
    ctx.say(`No pude recibir el archivo: ${input.uploadError}`);
    if (!ctx.repeatPrompt()) {
      if (identity.kind === "user") await showMenu(ctx);
      else await showWelcome(ctx);
    }
  } else if (action === "stale") {
    // Opción de un mensaje anterior: no se ejecuta. Se ofrecen las opciones vigentes.
    ctx.say(T.stale);
    if (!ctx.repeatPrompt()) {
      if (identity.kind === "user") await showMenu(ctx);
      else await showWelcome(ctx);
    }
  } else if (identity.kind === "guest") {
    await guestTurn(ctx, action, text);
  } else {
    await userTurn(ctx, input, action, text);
  }

  if (input.fault === "despues") throw new Error("Falla simulada después de la acción (simulador).");

  // Nunca un callejón sin salida: si el turno no dejó opciones ni espera un dato, se ofrece volver al menú.
  if (!ctx.hasPrompt && !ctx.conv.step && ctx.out.length > 0 && identity.kind === "user") {
    ctx.buttons("¿Seguimos?", [{ title: T.menu, a: "menu" }]);
  }
  if (ctx.out.length === 0) {
    if (identity.kind === "user") await showMenu(ctx);
    else await showWelcome(ctx);
  }

  const saved = ctx.finish();
  await saveConv(input.channel, input.address, saved.conv, saved.taxpayerId);
  return ctx.out;
}
