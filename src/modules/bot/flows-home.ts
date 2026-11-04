import { prisma } from "@/lib/db";
import { REQUEST_STATUS } from "@/lib/constants";
import { formatDateTimeAR } from "@/lib/dates";
import { maskPhone } from "@/lib/phone";
import {
  getAccessibleTaxpayers,
  getAuthorizedTaxpayer,
} from "@/modules/taxpayers/access";
import {
  createBotInvite,
  consumeWebLinkCode,
  getActiveLink,
  unlinkChannel,
} from "./links";
import { getPreferences, NOTICE_TYPES, setPreference } from "./notify";
import type { Ctx, Opt } from "./core";
import { T } from "./copy";
import { actions, on } from "./registry";

// Entrada al bot: persona sin vincular, alta pendiente, menú principal, cambio de contribuyente y Mi cuenta.

/** Recorridos con datos a medio cargar: al cambiar de contribuyente hay que resolverlos explícitamente. */
export const OPERATIONS: Record<string, string> = {
  factura: "una factura",
  solicitud: "una solicitud al estudio",
  pago: "un pago para informar",
  pedido: "un pedido de documento",
};

const firstName = (name: string) => name.split(" ")[0];

// ───────────── Persona sin vincular ─────────────

export async function showWelcome(ctx: Ctx) {
  const study = await prisma.study.findFirst({
    where: { acceptsSignups: true },
  });
  ctx.resetFlow();
  ctx.buttons(T.welcome(study?.name ?? "ContadorSmart"), [
    { title: T.guestHaveAccount, a: "g.tengo" },
    { title: T.guestRegister, a: "g.registro" },
    { title: T.guestAbout, a: "g.conocer" },
  ]);
}

async function invite(ctx: Ctx) {
  const study = await prisma.study.findFirst({
    where: { acceptsSignups: true },
  });
  if (!study) throw new Error("No hay un estudio que acepte altas.");
  const { token } = await createBotInvite(study.id, ctx.address);
  return `${ctx.origin}/whatsapp/vincular?t=${token}`;
}

on("g.registro", async (ctx) => {
  ctx.say(T.registerSteps(ctx.origin, await invite(ctx)));
  ctx.buttons(
    "Cuando termines y el estudio apruebe tu acceso, escribime. ¿Algo más?",
    [
      { title: T.guestHaveAccount, a: "g.tengo" },
      { title: T.guestAbout, a: "g.conocer" },
    ],
  );
});
on("g.tengo", async (ctx) => {
  ctx.say(T.haveAccountSteps(await invite(ctx)));
  ctx.buttons("Si todavía no tenés cuenta, podés crearla.", [
    { title: T.guestRegister, a: "g.registro" },
  ]);
});
on("g.conocer", async (ctx) => {
  ctx.buttons(T.about, [
    { title: T.guestRegister, a: "g.registro" },
    { title: T.guestHaveAccount, a: "g.tengo" },
  ]);
});

/** Un código de 6 dígitos generado en la web vincula la cuenta. */
export async function tryLinkCode(ctx: Ctx, code: string) {
  const result = await consumeWebLinkCode(ctx.address, code);
  if (!result.ok) {
    ctx.say(result.message);
    ctx.buttons("¿Qué querés hacer?", [
      { title: T.guestHaveAccount, a: "g.tengo" },
      { title: T.guestRegister, a: "g.registro" },
    ]);
    return;
  }
  ctx.resetFlow();
  ctx.say(T.linked(firstName(result.userName)));
  ctx.buttons("¿Seguimos?", [{ title: T.menuButton, a: "menu" }]);
}

// ───────────── Usuario vinculado ─────────────

/** Contribuyente activo (validado): si tiene uno solo se elige solo; si tiene varios y ninguno elegido, null. */
export async function activeTaxpayer(ctx: Ctx) {
  if (ctx.taxpayerId) {
    const tp = await getAuthorizedTaxpayer(ctx.user, ctx.taxpayerId);
    if (tp) return tp;
    ctx.taxpayerId = null;
  }
  const all = await getAccessibleTaxpayers(ctx.user);
  if (all.length === 1) {
    ctx.taxpayerId = all[0].id;
    return all[0];
  }
  return null;
}

/** Pantalla sin contribuyentes: alta pendiente o accesos revocados. */
export async function showPending(ctx: Ctx) {
  const pending = await prisma.accessRequest.count({
    where: { userId: ctx.user.id, status: REQUEST_STATUS.PENDIENTE },
  });
  ctx.buttons(pending ? T.pending : T.noTaxpayers, [
    { title: T.pendingStatus, a: "p.estado" },
    { title: T.pendingFix, a: "p.corregir" },
    { title: T.pendingAsk, a: "p.consultar" },
  ]);
}

export async function showMenu(ctx: Ctx) {
  ctx.resetFlow();
  ctx.conv.handoffRequestId = null;
  const taxpayers = await getAccessibleTaxpayers(ctx.user);
  if (taxpayers.length === 0) return showPending(ctx);
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "menu");
  const rows = [
    {
      title: "Mi resumen",
      desc: "Facturación, margen y próximos vencimientos",
      a: "m.resumen",
    },
    {
      title: "Facturación",
      desc: "Preparar factura, comprobantes y borradores",
      a: "m.fact",
    },
    {
      title: "Categoría y límites",
      desc: "Margen, escala y simulación",
      a: "m.cat",
    },
    {
      title: "Deudas y vencimientos",
      desc: "Ver vencimientos e informar pagos",
      a: "m.deudas",
    },
    {
      title: "Documentos",
      desc: "Ver, enviar o pedir documentación",
      a: "m.docs",
    },
    {
      title: "Mis solicitudes",
      desc: "Seguimiento de tus pedidos al estudio",
      a: "m.sol",
    },
    {
      title: "Hablar con el estudio",
      desc: "Mandá una consulta al equipo",
      a: "m.estudio",
    },
    { title: "Mi cuenta", desc: "Datos, avisos y vinculación", a: "m.cuenta" },
  ];
  if (taxpayers.length > 1)
    rows.push({
      title: "Cambiar contribuyente",
      desc: `Hoy: ${tp.name}`,
      a: "m.cambiar",
    });
  ctx.list(T.menuIntro(firstName(ctx.user.name), tp.name), T.menuButton, rows);
}

/** Elegir contribuyente. `then` es la acción a seguir después. */
export async function chooseTaxpayer(ctx: Ctx, then: string) {
  const taxpayers = await getAccessibleTaxpayers(ctx.user);
  if (taxpayers.length === 0) return showPending(ctx);
  ctx.list(
    T.chooseTaxpayer,
    "Elegir",
    taxpayers
      .slice(0, 9)
      .map((t) => ({
        title: t.name,
        desc:
          t.id === ctx.taxpayerId ? "Es el que estás consultando" : undefined,
        a: "tp.sel",
        v: `${t.id}|${then}`,
      })),
  );
}

on("menu", showMenu, { noTaxpayer: true });

on(
  "tp.sel",
  async (ctx, v) => {
    const [id, then] = (v ?? "").split("|");
    const tp = id ? await getAuthorizedTaxpayer(ctx.user, id) : null;
    if (!tp) {
      ctx.say(T.noLongerAccess);
      return showMenu(ctx);
    }
    ctx.taxpayerId = tp.id;
    ctx.say(T.taxpayerChosen(tp.name));
    if (then && then !== "menu" && actions[then]) return actions[then](ctx);
    return showMenu(ctx);
  },
  { noTaxpayer: true },
);

/** Cambiar de contribuyente: si hay una operación a medio cargar, se resuelve explícitamente antes. */
on("m.cambiar", async (ctx) => {
  const flow = ctx.conv.flow;
  const opTaxpayer = ctx.conv.data.taxpayerId as string | undefined;
  if (flow && OPERATIONS[flow] && opTaxpayer) {
    const tp = await getAuthorizedTaxpayer(ctx.user, opTaxpayer);
    const draftId = ctx.conv.data.draftId as string | undefined;
    const opts = [
      { title: `Seguir con ${tp?.name ?? "la anterior"}`, a: "op.seguir" },
    ];
    if (flow === "factura" && draftId)
      opts.push({ title: "Guardar y cambiar", a: "op.guardar" });
    opts.push({ title: "Cancelar y cambiar", a: "op.cancelar" });
    ctx.buttons(
      `Tenés ${OPERATIONS[flow]} a medio cargar para ${tp?.name ?? "otro contribuyente"}. ¿Qué hacemos antes de cambiar?`,
      opts,
    );
    return;
  }
  return chooseTaxpayer(ctx, "menu");
});
on("op.seguir", async (ctx) => {
  // Se repite el último paso de la operación tal como estaba.
  const prompt = ctx.conv.data.lastPrompt as string | undefined;
  if (prompt && actions[prompt]) return actions[prompt](ctx);
  return showMenu(ctx);
});
on("op.guardar", async (ctx) => {
  ctx.say(
    "El borrador quedó guardado. Lo retomás en Facturación → Continuar borrador.",
  );
  ctx.resetFlow();
  return chooseTaxpayer(ctx, "menu");
});
on("op.cancelar", async (ctx) => {
  const draftId = ctx.conv.data.draftId as string | undefined;
  ctx.resetFlow();
  ctx.say(
    draftId
      ? "Dejamos esa operación. El borrador que ya estaba guardado sigue en Continuar borrador."
      : T.cancelled,
  );
  return chooseTaxpayer(ctx, "menu");
});

// ───────────── Alta pendiente ─────────────

on(
  "p.estado",
  async (ctx) => {
    const [requests, taxpayers] = await Promise.all([
      prisma.accessRequest.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      getAccessibleTaxpayers(ctx.user),
    ]);
    const lines: string[] = [];
    if (taxpayers.length)
      lines.push(
        `Contribuyentes habilitados: ${taxpayers.map((t) => t.name).join(", ")}.`,
      );
    for (const r of requests.filter(
      (r) => r.status !== REQUEST_STATUS.APROBADO,
    )) {
      lines.push(
        r.status === REQUEST_STATUS.PENDIENTE
          ? `• ${r.declaredName}: pendiente de revisión del estudio (pedida el ${formatDateTimeAR(r.createdAt)}). Número de solicitud: A-${r.id.slice(-6).toUpperCase()}.`
          : `• ${r.declaredName}: rechazada${r.reviewNote ? ` — motivo: ${r.reviewNote}` : ""}.`,
      );
    }
    if (lines.length === 0)
      lines.push(
        `Todavía no pediste asociarte a ningún CUIT. Hacelo en la web: ${ctx.origin}/perfil#asociar`,
      );
    ctx.say(`Estado de tu alta:\n${lines.join("\n")}`);
    if (taxpayers.length) return showMenu(ctx);
    return showPending(ctx);
  },
  { readOnly: true, noTaxpayer: true },
);
on(
  "p.corregir",
  async (ctx) => {
    ctx.say(T.pendingFixText(ctx.origin));
    return showPending(ctx);
  },
  { noTaxpayer: true },
);

// ───────────── Mi cuenta ─────────────

on(
  "m.cuenta",
  async (ctx) => {
    ctx.list("Mi cuenta. ¿Qué querés hacer?", "Ver opciones", [
      { title: "Ver mis datos", a: "c.datos" },
      { title: "Cambiar contribuyente", a: "m.cambiar" },
      {
        title: "Gestionar avisos",
        desc: "Qué avisos recibís por WhatsApp",
        a: "c.avisos",
      },
      {
        title: "Corregir datos",
        desc: "Nombre, teléfono o correo (en la web)",
        a: "c.corregir",
      },
      { title: "Desvincular WhatsApp", a: "c.desvincular" },
      { title: "Ayuda", a: "help" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { noTaxpayer: true },
);

on(
  "c.datos",
  async (ctx) => {
    const [link, taxpayers] = await Promise.all([
      getActiveLink(ctx.address),
      getAccessibleTaxpayers(ctx.user),
    ]);
    ctx.say(
      `Tus datos:\n• Nombre: ${ctx.user.name}\n• Correo: ${ctx.user.email}\n• WhatsApp: ${link ? maskPhone(link.address) : "—"}${
        link ? `, vinculado el ${formatDateTimeAR(link.linkedAt)}` : ""
      }\n• Contribuyentes: ${taxpayers.map((t) => t.name).join(", ") || "ninguno habilitado"}`,
    );
    ctx.buttons("¿Algo más?", [
      { title: "Corregir datos", a: "c.corregir" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true, noTaxpayer: true },
);

on(
  "c.corregir",
  async (ctx) => {
    ctx.say(
      `Los datos de contacto se cambian en la web, con tu sesión, para poder verificarlos: ${ctx.origin}/perfil\nEl correo todavía no se puede cambiar; si lo necesitás, pedíselo al estudio.`,
    );
    ctx.buttons("¿Algo más?", [{ title: T.menu, a: "menu" }]);
  },
  { noTaxpayer: true },
);

on(
  "c.avisos",
  async (ctx) => {
    const prefs = await getPreferences(ctx.user.id);
    const lines = NOTICE_TYPES.map(
      (t) => `• ${t.label}: ${prefs[t.type] ? "activados" : "desactivados"}`,
    );
    ctx.say(
      `Avisos por WhatsApp:\n${lines.join("\n")}\n• Recordatorios de vencimientos: todavía no disponibles (no hay un envío automático implementado).\n\nWhatsApp solo permite avisos libres dentro de las 24 horas de tu último mensaje.`,
    );
    ctx.buttons("¿Querés cambiar alguno?", [
      ...NOTICE_TYPES.map((t): Opt => ({
        title: `${prefs[t.type] ? "Apagar" : "Activar"} ${t.short}`,
        a: "c.aviso",
        v: `${t.type}|${prefs[t.type] ? "0" : "1"}`,
      })),
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true, noTaxpayer: true },
);

on(
  "c.aviso",
  async (ctx, v) => {
    const [type, value] = (v ?? "").split("|");
    if (!NOTICE_TYPES.some((t) => t.type === type)) return showMenu(ctx);
    await setPreference(ctx.user.id, type, value === "1");
    ctx.say(
      `Guardado: ${NOTICE_TYPES.find((t) => t.type === type)!.label.toLowerCase()} ${value === "1" ? "activados" : "desactivados"}.`,
    );
    return actions["c.avisos"](ctx);
  },
  { noTaxpayer: true },
);

on(
  "c.desvincular",
  async (ctx) => {
    ctx.buttons(
      "¿Desvinculamos este WhatsApp de tu cuenta? Después no vas a poder consultar nada desde este número hasta volver a vincularlo.",
      [
        { title: "Sí, desvincular", a: "c.desvincular.ok" },
        { title: T.cancel, a: "menu" },
      ],
    );
  },
  { noTaxpayer: true },
);
on(
  "c.desvincular.ok",
  async (ctx) => {
    const link = await getActiveLink(ctx.address);
    if (link) {
      const result = await unlinkChannel(
        ctx.user,
        link.id,
        "Desvinculado por el usuario desde WhatsApp",
      );
      if (!result.ok) {
        ctx.say(result.message);
        return showMenu(ctx);
      }
    }
    ctx.resetFlow();
    ctx.taxpayerId = null;
    ctx.say(
      "Listo: desvinculamos este WhatsApp. Desde ahora no se puede consultar información desde este número.",
    );
    ctx.buttons("Si querés volver a vincularlo:", [
      { title: T.guestHaveAccount, a: "g.tengo" },
    ]);
  },
  { noTaxpayer: true },
);

on(
  "help",
  async (ctx) => {
    ctx.say(
      "Cómo usar el asistente:\n• Tocá las opciones de los mensajes; no hace falta escribir comandos.\n• Escribí *menú* para volver al inicio o *cancelar* para dejar lo que estás haciendo.\n• Para hablar con una persona, elegí Hablar con el estudio.\n• Nunca te vamos a pedir tu clave fiscal ni tu contraseña.",
    );
    ctx.buttons("¿Seguimos?", [{ title: T.menu, a: "menu" }]);
  },
  { noTaxpayer: true },
);

on(
  "cancel",
  async (ctx) => {
    const draftId =
      ctx.conv.flow === "factura"
        ? (ctx.conv.data.draftId as string | undefined)
        : undefined;
    ctx.resetFlow();
    ctx.conv.handoffRequestId = null;
    ctx.say(
      draftId
        ? "Dejamos la factura. El borrador que ya estaba guardado sigue en Facturación → Continuar borrador."
        : T.cancelled,
    );
    return showMenu(ctx);
  },
  { noTaxpayer: true },
);

on(
  "resume",
  async (ctx) => {
    const step = ctx.conv.data.lastPrompt as string | undefined;
    if (step && actions[step]) return actions[step](ctx);
    return showMenu(ctx);
  },
  { noTaxpayer: true },
);
on(
  "discard",
  async (ctx) => {
    return actions.cancel(ctx);
  },
  { noTaxpayer: true },
);
