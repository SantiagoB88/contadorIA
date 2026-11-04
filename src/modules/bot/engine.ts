import { prisma } from "@/lib/db";
import { CHANNEL, REQUEST_STATUS, SR_STATUS_LABEL, SR_TOPIC_LABEL } from "@/lib/constants";
import { formatARS } from "@/lib/money";
import { formatDateAR, formatDateTimeAR, todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { getDashboardData } from "@/modules/dashboard/metrics";
import { debtStateText, getDebtSummary } from "@/modules/fiscal/obligations";
import { addMessage, createRequest, getRequestForUser, listRequestsForUser } from "@/modules/requests/service";
import { consumeWebLinkCode, createBotInvite, getActiveLink } from "./links";

// Motor de conversación del bot. No sabe nada de WhatsApp: recibe un texto de un número ya validado por el
// transporte y devuelve los textos a responder. Toda la información sale de los mismos servicios que usa la web
// (tablero, deudas, solicitudes) y cada operación vuelve a validar los permisos del usuario vinculado.
// No hay IA: un menú numerado, comprobable sin depender de ningún modelo.

export type BotInput = {
  channel: typeof CHANNEL.WHATSAPP;
  address: string; // número normalizado (E.164), derivado del canal validado
  text: string;
  eventRef: string; // id del evento: hace idempotentes las acciones con efecto
  origin: string; // URL de la web para los enlaces
  fault?: "antes" | "despues"; // solo el simulador local: simula una caída antes o después de la acción
};

type State =
  | { step: "menu" }
  | { step: "elegir_contribuyente"; ids: string[] }
  | { step: "solicitud_tema" }
  | { step: "solicitud_asunto"; topic: string }
  | { step: "solicitud_mensaje"; topic: string; subject: string }
  | { step: "ver_solicitudes"; ids: string[] }
  | { step: "solicitud_detalle"; requestId: string }
  | { step: "solicitud_respuesta"; requestId: string }
  | { step: "factura" };

const TOPICS = ["FACTURACION", "CATEGORIA", "DEUDAS", "DOCUMENTACION", "OTRO"] as const;
const LEVEL_LABEL: Record<string, string> = {
  NORMAL: "Normal",
  PREVENTIVO: "Preventivo (más del 80 % del límite)",
  PROXIMO: "Próximo al límite (más del 95 %)",
  SUPERADO: "Superado",
};
const MENU_WORDS = ["menu", "menú", "hola", "inicio", "buenas", "buen dia", "buen día", "0"];

const percent = (tenths: number) => `${(tenths / 10).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;
const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function loadConversation(input: BotInput) {
  const row = await prisma.botConversation.upsert({
    where: { channel_address: { channel: input.channel, address: input.address } },
    update: {},
    create: { channel: input.channel, address: input.address, state: JSON.stringify({ step: "menu" }) },
  });
  let state: State;
  try {
    state = JSON.parse(row.state) as State;
  } catch {
    state = { step: "menu" };
  }
  return { row, state };
}

async function saveConversation(input: BotInput, state: State, taxpayerId: string | null | undefined) {
  await prisma.botConversation.update({
    where: { channel_address: { channel: input.channel, address: input.address } },
    data: { state: JSON.stringify(state), ...(taxpayerId !== undefined ? { taxpayerId } : {}) },
  });
}

/** Punto de entrada: un mensaje entrante → respuestas. */
export async function handleMessage(input: BotInput): Promise<string[]> {
  if (input.fault === "antes") throw new Error("Falla simulada antes de procesar (simulador).");
  const text = input.text.trim();
  const norm = text.toLowerCase();
  const { row, state } = await loadConversation(input);
  const link = await getActiveLink(input.address);

  // Sin vínculo (o vínculo de una cuenta que ya no está activa): solo alta y vinculación.
  if (!link || !link.user.active || link.user.role !== "CLIENTE") {
    if (link && !link.user.active) {
      return ["Tu cuenta está suspendida, así que por acá no podemos mostrarte información. Comunicate con el estudio."];
    }
    return guestFlow(input, text, norm);
  }

  const user: CurrentUser = {
    id: link.user.id,
    studyId: link.user.studyId,
    studyName: link.user.study.name,
    email: link.user.email,
    name: link.user.name,
    role: link.user.role,
  };

  if (MENU_WORDS.includes(norm) || norm === "cancelar") {
    const replies = norm === "cancelar" && state.step !== "menu" ? ["Listo, lo dejamos ahí."] : [];
    const tp = await currentTaxpayer(user, row.taxpayerId);
    await saveConversation(input, { step: "menu" }, tp?.id ?? null);
    return [...replies, await menuText(user, tp?.name ?? null)];
  }

  const replies = await linkedFlow(input, user, state, text, norm, row.taxpayerId);
  if (input.fault === "despues") throw new Error("Falla simulada después de la acción (simulador).");
  return replies;
}

// ───────────── Sin vínculo ─────────────

async function guestFlow(input: BotInput, text: string, norm: string): Promise<string[]> {
  // Un código de 6 dígitos generado en la web vincula la cuenta.
  if (/^\d{6}$/.test(text)) {
    const result = await consumeWebLinkCode(input.address, text);
    if (!result.ok) return [result.message];
    return [`${result.message} Hola, ${result.userName.split(" ")[0]}.`, "Escribí *menú* para ver qué podés consultar."];
  }

  const study = await prisma.study.findFirst({ where: { acceptsSignups: true } });
  if (!study) return ["El servicio no está disponible en este momento."];

  if (norm === "1" || norm.includes("cuenta") || norm.includes("alta") || norm.includes("registr")) {
    const invite = await createBotInvite(study.id, input.address);
    return [
      "Para darte de alta no te pedimos datos por acá: se hace en la web, de forma segura.",
      `1. Creá tu cuenta: ${input.origin}/registro`,
      "2. Confirmá tu correo y, en *Mi perfil*, cargá tu CUIT. El estudio revisa y aprueba la asociación.",
      `3. Con la sesión iniciada, abrí este enlace para vincular este WhatsApp (vence en 24 horas): ${input.origin}/whatsapp/vincular?t=${invite.token}`,
      "Nunca te vamos a pedir tu clave fiscal ni tu contraseña por WhatsApp.",
    ];
  }
  if (norm === "2" || norm.includes("vincul")) {
    const invite = await createBotInvite(study.id, input.address);
    return [
      "Si ya tenés cuenta en la web, tenés dos formas de vincular este WhatsApp:",
      "• En la web, entrá a *Mi perfil → WhatsApp*, tocá *Generar código* y mandame acá los 6 números.",
      `• O, con la sesión iniciada, abrí este enlace (vence en 24 horas): ${input.origin}/whatsapp/vincular?t=${invite.token}`,
    ];
  }
  if (norm === "3" || norm.includes("persona") || norm.includes("humano") || norm.includes("contador")) {
    return [
      "Para que alguien del estudio te atienda por acá necesitamos saber quién sos: vinculá este WhatsApp a tu cuenta (opción 2) o creá una (opción 1).",
      `Mientras tanto podés escribirle al estudio desde la web: ${input.origin}/login`,
    ];
  }
  return [
    `¡Hola! Soy el asistente de ${study.name}.`,
    "Este WhatsApp todavía no está vinculado a una cuenta, así que no puedo mostrarte información fiscal.\n\n1. Quiero crear mi cuenta\n2. Ya tengo cuenta: vincular este WhatsApp\n3. Hablar con alguien del estudio\n\nSi generaste un código en la web, mandame los 6 números.",
  ];
}

// ───────────── Con vínculo ─────────────

async function currentTaxpayer(user: CurrentUser, taxpayerId: string | null) {
  if (taxpayerId) {
    const tp = await getAuthorizedTaxpayer(user, taxpayerId);
    if (tp) return tp;
  }
  const all = await getAccessibleTaxpayers(user);
  return all.length === 1 ? all[0] : null;
}

async function menuText(user: CurrentUser, taxpayerName: string | null) {
  const taxpayers = await getAccessibleTaxpayers(user);
  const first = user.name.split(" ")[0];
  if (taxpayers.length === 0) {
    return `Hola, ${first}. Tu cuenta todavía no tiene contribuyentes habilitados: el estudio tiene que aprobar la asociación con tu CUIT.\n\n1. Estado de mi alta\n\nEscribí *menú* para volver a este listado.`;
  }
  const header = taxpayerName ? `Hola, ${first}. Estás consultando *${taxpayerName}*.` : `Hola, ${first}.`;
  return `${header}\n\n1. Estado de mi alta\n2. Facturación\n3. Margen de categoría\n4. Deudas y vencimientos\n5. Nueva solicitud al contador\n6. Mis solicitudes\n7. Hablar con una persona\n${
    taxpayers.length > 1 ? "8. Cambiar de contribuyente\n" : ""
  }\nEscribí *menú* en cualquier momento para volver acá, o *cancelar* para dejar lo que estás haciendo.`;
}

async function linkedFlow(
  input: BotInput,
  user: CurrentUser,
  state: State,
  text: string,
  norm: string,
  savedTaxpayerId: string | null,
): Promise<string[]> {
  const taxpayers = await getAccessibleTaxpayers(user);
  const tp = await currentTaxpayer(user, savedTaxpayerId);

  // Pasos en curso.
  switch (state.step) {
    case "elegir_contribuyente": {
      const n = Number(norm);
      const id = Number.isInteger(n) ? state.ids[n - 1] : undefined;
      const chosen = id ? await getAuthorizedTaxpayer(user, id) : null;
      if (!chosen) return ["Elegí uno de los números de la lista, o escribí *menú*."];
      await saveConversation(input, { step: "menu" }, chosen.id);
      return [`Listo: ahora consultás *${chosen.name}*.`, await menuText(user, chosen.name)];
    }
    case "solicitud_tema": {
      const n = Number(norm);
      const topic = Number.isInteger(n) ? TOPICS[n - 1] : undefined;
      if (!topic) return ["Elegí un número del 1 al 5, o escribí *cancelar*."];
      await saveConversation(input, { step: "solicitud_asunto", topic }, undefined);
      return ["Escribí un asunto corto (por ejemplo: *Necesito la constancia de inscripción*)."];
    }
    case "solicitud_asunto": {
      if (text.length < 3 || text.length > 120) return ["El asunto tiene que tener entre 3 y 120 caracteres. Probá de nuevo."];
      await saveConversation(input, { step: "solicitud_mensaje", topic: state.topic, subject: text }, undefined);
      return ["Ahora contame el detalle en un mensaje. No incluyas contraseñas ni tu clave fiscal."];
    }
    case "solicitud_mensaje":
      return createRequestFromBot(input, user, tp?.id ?? null, state.topic, state.subject, text, "NORMAL");
    case "ver_solicitudes": {
      const n = Number(norm);
      const id = Number.isInteger(n) ? state.ids[n - 1] : undefined;
      if (!id) return ["Elegí uno de los números de la lista, o escribí *menú*."];
      return showRequest(input, user, id);
    }
    case "solicitud_detalle": {
      if (norm === "1") {
        await saveConversation(input, { step: "solicitud_respuesta", requestId: state.requestId }, undefined);
        return ["Escribí tu respuesta para el estudio."];
      }
      return ["Escribí *1* para responder o *menú* para volver."];
    }
    case "solicitud_respuesta": {
      const result = await addMessage(user, state.requestId, { body: text, visibility: "PUBLICA", channel: CHANNEL.WHATSAPP }, [], input.origin);
      await saveConversation(input, { step: "menu" }, undefined);
      if (!result.ok) return [result.message, "Escribí *menú* para volver."];
      return ["Listo, le mandamos tu mensaje al estudio. Te avisamos por acá cuando responda.", "Escribí *menú* para volver."];
    }
    case "factura": {
      if (norm === "1") {
        await saveConversation(input, { step: "solicitud_asunto", topic: "FACTURACION" }, undefined);
        return ["Escribí un asunto corto para tu pedido de facturación."];
      }
      return ["Escribí *1* para pedirle ayuda al estudio o *menú* para volver."];
    }
  }

  // Menú principal (también entiende algunas palabras).
  const option = norm.includes("factura") && !/^\d$/.test(norm) ? "factura" : norm.includes("persona") || norm.includes("humano") ? "7" : norm;

  if (option === "1") return [await accessStatus(user)];
  if (taxpayers.length === 0) {
    return ["Todavía no podés consultar información: el estudio tiene que aprobar la asociación con tu CUIT.", "Escribí *1* para ver el estado de tu alta."];
  }
  if (!tp) {
    await saveConversation(input, { step: "elegir_contribuyente", ids: taxpayers.map((t) => t.id) }, null);
    return [`¿Qué contribuyente querés consultar?\n\n${taxpayers.map((t, i) => `${i + 1}. ${t.name}`).join("\n")}`];
  }

  switch (option) {
    case "2":
      return [await billingSummary(input, tp)];
    case "3":
      return [await marginSummary(tp)];
    case "4":
      return [await debtSummaryText(input, tp.id, tp.name)];
    case "5":
      await saveConversation(input, { step: "solicitud_tema" }, tp.id);
      return [`¿Sobre qué es tu consulta?\n\n${TOPICS.map((t, i) => `${i + 1}. ${SR_TOPIC_LABEL[t]}`).join("\n")}`];
    case "6": {
      const rows = await listRequestsForUser(user, { taxpayerId: tp.id, view: "todas" }, 5);
      if (rows.length === 0) return [`*${tp.name}* no tiene solicitudes. Escribí *5* para crear una.`];
      await saveConversation(input, { step: "ver_solicitudes", ids: rows.map((r) => r.id) }, tp.id);
      return [
        `Tus últimas solicitudes:\n\n${rows.map((r, i) => `${i + 1}. ${r.subject} — ${SR_STATUS_LABEL[r.status] ?? r.status}`).join("\n")}\n\nElegí un número para ver el detalle.`,
      ];
    }
    case "7":
      return createRequestFromBot(input, user, tp.id, "OTRO", "Pedido de atención por WhatsApp", "El cliente pidió hablar con una persona del estudio.", "ALTA");
    case "8":
      if (taxpayers.length < 2) break;
      await saveConversation(input, { step: "elegir_contribuyente", ids: taxpayers.map((t) => t.id) }, tp.id);
      return [`¿Qué contribuyente querés consultar?\n\n${taxpayers.map((t, i) => `${i + 1}. ${t.name}`).join("\n")}`];
    case "factura":
      await saveConversation(input, { step: "factura" }, tp.id);
      return [
        `Las facturas se hacen en la web, con revisión antes de emitir (es una demo: no tienen validez fiscal): ${input.origin}/facturas/nueva?c=${tp.id}`,
        "¿Querés que el estudio te ayude?\n\n1. Sí, crear una solicitud de facturación\n\nO escribí *menú* para volver.",
      ];
  }
  return ["No te entendí. Elegí un número del menú, o escribí *menú* para verlo de nuevo."];
}

async function createRequestFromBot(
  input: BotInput,
  user: CurrentUser,
  taxpayerId: string | null,
  topic: string,
  subject: string,
  body: string,
  priority: "NORMAL" | "ALTA",
): Promise<string[]> {
  if (!taxpayerId) {
    await saveConversation(input, { step: "menu" }, undefined);
    return ["Primero elegí un contribuyente. Escribí *menú*."];
  }
  const result = await createRequest(
    user,
    { taxpayerId, topic, subject, body, channel: CHANNEL.WHATSAPP, priority, externalRef: `WA:${input.eventRef}` },
    [],
    input.origin,
  );
  await saveConversation(input, { step: "menu" }, undefined);
  if (!result.ok) {
    const detail = "fieldErrors" in result && result.fieldErrors ? Object.values(result.fieldErrors).join(" ") : "";
    return [`No pudimos crear la solicitud: ${result.message} ${detail}`.trim(), "Escribí *menú* para volver."];
  }
  return [
    priority === "ALTA"
      ? "Listo, avisamos al estudio que querés hablar con una persona. Te responden por acá o por la web."
      : `Listo, creamos tu solicitud *${subject}*. El estudio la ve en su bandeja y te avisamos por acá cuando responda.`,
    "Escribí *6* para ver tus solicitudes o *menú* para volver.",
  ];
}

async function showRequest(input: BotInput, user: CurrentUser, requestId: string): Promise<string[]> {
  // Para un cliente, la consulta ya excluye las notas internas.
  const request = await getRequestForUser(user, requestId);
  if (!request) {
    await saveConversation(input, { step: "menu" }, undefined);
    return ["No encontramos esa solicitud. Escribí *menú*."];
  }
  await saveConversation(input, { step: "solicitud_detalle", requestId }, undefined);
  const last = request.messages.slice(-3);
  const lines = last.map((m) => `*${m.author.fromStudy ? "Estudio" : "Vos"}* (${formatDateTimeAR(m.createdAt)}):\n${clip(m.body)}`);
  return [
    `*${request.subject}*\nEstado: ${SR_STATUS_LABEL[request.status] ?? request.status}${request.assignedTo ? ` · la atiende ${request.assignedTo.name}` : ""}`,
    lines.join("\n\n"),
    "Escribí *1* para responder o *menú* para volver.",
  ];
}

async function accessStatus(user: CurrentUser): Promise<string> {
  const [requests, taxpayers] = await Promise.all([
    prisma.accessRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    getAccessibleTaxpayers(user),
  ]);
  const lines: string[] = [];
  if (taxpayers.length) lines.push(`Contribuyentes habilitados: ${taxpayers.map((t) => t.name).join(", ")}.`);
  for (const r of requests.filter((r) => r.status !== REQUEST_STATUS.APROBADO)) {
    lines.push(
      r.status === REQUEST_STATUS.PENDIENTE
        ? `• ${r.declaredName}: pendiente de aprobación del estudio (pedida el ${formatDateTimeAR(r.createdAt)}).`
        : `• ${r.declaredName}: rechazada${r.reviewNote ? ` — ${r.reviewNote}` : ""}.`,
    );
  }
  if (lines.length === 0) lines.push("Todavía no pediste asociarte a ningún CUIT. Hacelo en la web, en *Mi perfil*.");
  return `*Estado de tu alta*\n${lines.join("\n")}`;
}

async function billingSummary(input: BotInput, tp: { id: string; name: string; studyId: string; categoryCode: string | null; startDate: string }) {
  const data = await getDashboardData(tp, todayAR());
  if (!data.coverage) {
    return `*Facturación de ${tp.name}*\nEl estudio todavía no cargó la facturación de este contribuyente: no hay datos para mostrar. Esto no significa que no hayas facturado.`;
  }
  const lines = data.periods.map((p) => {
    const value =
      p.totalCents === null ? "Información incompleta" : `${formatARS(p.totalCents)} (${p.invoiceCount} ${p.invoiceCount === 1 ? "comprobante" : "comprobantes"})`;
    return `• ${p.label} (${formatDateAR(p.from)} al ${formatDateAR(p.to)}): ${value}${p.coverage === "PARCIAL" && p.totalCents !== null ? " — datos parciales" : ""}`;
  });
  return `*Facturación de ${tp.name}*\nFecha de corte: ${formatDateAR(data.cutDate)}\n\n${lines.join("\n")}\n\nDatos ${
    data.coverage.complete ? "completos" : `parciales (desde el ${formatDateAR(data.coverage.fromDate)})`
  } · ${data.coverage.source} · actualizado ${formatDateTimeAR(data.coverage.updatedAt)}\nVer el detalle: ${input.origin}/dashboard?c=${tp.id}`;
}

async function marginSummary(tp: { id: string; name: string; studyId: string; categoryCode: string | null; startDate: string }) {
  const data = await getDashboardData(tp, todayAR());
  const m = data.margin;
  if (!m.available) return `*Margen de categoría de ${tp.name}*\nNo se puede calcular: ${m.reason}`;
  const status = m.marginCents >= 0n ? `Margen disponible: ${formatARS(m.marginCents)}` : `Excedido en ${formatARS(-m.marginCents)}`;
  return `*Margen de categoría de ${tp.name}* (orientativo)\nCategoría registrada: ${m.categoryCode} · escala: ${m.scaleName}${
    m.scaleStatus === "DEMO" ? " (ficticia)" : ""
  }\nPeríodo: ${formatDateAR(m.referenceFrom)} al ${formatDateAR(m.referenceTo)}\nIngresos: ${formatARS(m.incomeCents)} de un límite de ${formatARS(m.limitCents)}\n${status} · ${percent(
    m.percentTenths,
  )} del límite · nivel: ${LEVEL_LABEL[m.level] ?? m.level}\n\nEs una referencia por ingresos: no reemplaza la recategorización oficial. Si tenés dudas, escribí *5* para consultar al estudio.`;
}

async function debtSummaryText(input: BotInput, taxpayerId: string, name: string) {
  const d = await getDebtSummary(taxpayerId);
  const lines = [`*Deudas y vencimientos de ${name}*`, debtStateText(d)];
  if (d.overdue.length) {
    lines.push(
      "",
      ...d.overdue.map((o) => `• ${o.concept} ${o.period}: vence ${formatDateAR(o.dueDate)} — ${o.amountCents === null ? "importe no informado" : formatARS(o.amountCents)}`),
      `Total vencido con importe informado: ${formatARS(d.overdueTotalCents)}. No incluye intereses.`,
    );
  }
  if (d.upcoming.length) {
    lines.push("", "Próximos vencimientos:", ...d.upcoming.slice(0, 3).map((o) => `• ${o.concept}: ${formatDateAR(o.dueDate)}${o.amountCents === null ? "" : ` — ${formatARS(o.amountCents)}`}`));
  }
  if (d.review) lines.push("", `Información al ${formatDateAR(d.review.asOfDate)} · ${d.review.source}.`);
  lines.push(`Ver en la web: ${input.origin}/dashboard/deudas?c=${taxpayerId}`);
  return lines.join("\n");
}
