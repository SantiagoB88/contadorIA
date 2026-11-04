import { prisma } from "@/lib/db";
import { APP_MODE, ROLES } from "@/lib/constants";
import { cuitProblem, formatCuit, isValidCuit, normalizeCuit } from "@/lib/cuit";
import { todayAR } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import type { CurrentUser } from "@/lib/auth";
import { issueTempPassword, registerFromChannel, TEMP_PASSWORD_HOURS } from "@/modules/auth/service";
import { requestAssociation } from "@/modules/access/service";
import { createBotInvite, linkNewAccount } from "./links";
import { rememberDemoAccount } from "@/lib/demo-accounts";
import { showWelcome } from "./flows-home";
import type { Ctx } from "./core";
import { monthName, T } from "./copy";
import { actions, on, textSteps } from "./registry";

// Alta de un cliente nuevo desde el chat: nombre y apellido, correo, CUIT, actividad y fecha de inicio.
// Al confirmar (solo con el botón) se crea la cuenta, queda vinculado este número y se pide el acceso al CUIT,
// que el estudio aprueba o rechaza en Accesos. Nunca se pide la clave fiscal ni una contraseña: se da una contraseña
// temporal para entrar a la web, que vence y hay que cambiar al primer ingreso.

type Signup = { name?: string; email?: string; cuit?: string; activity?: string; start?: string; editing?: boolean; lastPrompt?: string };
const data = (ctx: Ctx) => ctx.conv.data as Signup;
const inSignup = (ctx: Ctx) => ctx.conv.flow === "alta";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const firstName = (name: string) => name.trim().split(/\s+/)[0];

/** Pasos que esperan texto durante el alta (la persona todavía no está vinculada). */
export const SIGNUP_STEPS = new Set(["g.nombre", "g.correo", "g.cuit", "g.actividad", "g.desde"]);

on("g.registro", async (ctx) => {
  ctx.resetFlow();
  ctx.conv.flow = "alta";
  ctx.conv.data = { lastPrompt: "g.registro" } satisfies Signup;
  ctx.buttons(
    "Te creo la cuenta acá mismo. Te voy a pedir:\n• nombre y apellido\n• correo electrónico\n• CUIT\n• a qué te dedicás\n• desde cuándo facturás\n\nNunca te voy a pedir tu clave fiscal ni una contraseña.",
    [
      { title: "Empezar", a: "g.alta" },
      { title: "Prefiero la web", a: "g.web" },
      { title: T.cancel, a: "g.salir" },
    ],
  );
});

on("g.salir", async (ctx) => showWelcome(ctx));

/** Alternativa: crear la cuenta en la web y vincular después con un enlace. */
on("g.web", async (ctx) => {
  const study = await prisma.study.findFirst({ where: { acceptsSignups: true } });
  if (!study) throw new Error("No hay un estudio que acepte altas.");
  const { token } = await createBotInvite(study.id, ctx.address);
  ctx.resetFlow();
  ctx.say(T.registerSteps(ctx.origin, `${ctx.origin}/whatsapp/vincular?t=${token}`));
  ctx.buttons("Si preferís hacerlo por acá, también se puede.", [
    { title: "Crear cuenta por acá", a: "g.registro" },
    { title: T.guestHaveAccount, a: "g.tengo" },
  ]);
});

const cancel = { title: T.cancel, a: "g.salir" };

async function ask(ctx: Ctx, step: string, text: string) {
  data(ctx).lastPrompt = step;
  ctx.buttons(text, [cancel]);
  ctx.expect(step);
}
const askName = (ctx: Ctx) => ask(ctx, "g.nombre", "¿Cuál es tu nombre y apellido?");
const askEmail = (ctx: Ctx) => ask(ctx, "g.correo", "¿Cuál es tu correo electrónico? Lo usás para entrar a la web.");
const askCuit = (ctx: Ctx) => ask(ctx, "g.cuit", "¿Cuál es tu CUIT? (11 números, con o sin guiones)");
const askActivity = (ctx: Ctx) => ask(ctx, "g.actividad", "¿A qué te dedicás? Por ejemplo: diseño gráfico, clases particulares, venta de ropa.");
const askStart = (ctx: Ctx) => ask(ctx, "g.desde", "¿Desde qué mes y año facturás como monotributista? Escribilo como mes/año, por ejemplo 03/2022.");

on("g.alta", async (ctx) => {
  if (!inSignup(ctx)) return actions["g.registro"](ctx);
  return askName(ctx);
});

/** Después de cada dato: si se estaba corrigiendo, vuelve al resumen; si no, el paso siguiente. */
async function next(ctx: Ctx, then: (ctx: Ctx) => Promise<void>) {
  ctx.conv.step = null;
  if (data(ctx).editing) {
    data(ctx).editing = false;
    return showSummary(ctx);
  }
  return then(ctx);
}

textSteps["g.nombre"] = async (ctx, text) => {
  const name = text.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80 || !name.includes(" ")) {
    ctx.say("Escribí tu nombre y apellido, por ejemplo: María López.");
    ctx.expect("g.nombre");
    return;
  }
  data(ctx).name = name;
  return next(ctx, askEmail);
};

textSteps["g.correo"] = async (ctx, text) => {
  const email = text.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) {
    ctx.say("Ese correo no parece válido. Escribilo completo, por ejemplo: maria@gmail.com.");
    ctx.expect("g.correo");
    return;
  }
  data(ctx).email = email;
  return next(ctx, askCuit);
};

textSteps["g.cuit"] = async (ctx, text) => {
  const cuit = normalizeCuit(text);
  if (!isValidCuit(cuit)) {
    // No se consulta ningún padrón: solo el formato y el dígito verificador, igual que en la web.
    ctx.say(`Ese CUIT no es válido: ${cuitProblem(cuit)} Revisalo y escribilo de nuevo, o tocá Cancelar.`);
    ctx.expect("g.cuit");
    return;
  }
  data(ctx).cuit = cuit;
  return next(ctx, askActivity);
};

textSteps["g.actividad"] = async (ctx, text) => {
  const activity = text.trim().replace(/\s+/g, " ");
  if (activity.length < 2 || activity.length > 120) {
    ctx.say("Contame en pocas palabras a qué te dedicás (entre 2 y 120 caracteres).");
    ctx.expect("g.actividad");
    return;
  }
  data(ctx).activity = activity;
  return next(ctx, askStart);
};

textSteps["g.desde"] = async (ctx, text) => {
  const m = text.trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{4})$/);
  const month = m ? Number(m[1]) : 0;
  const year = m ? Number(m[2]) : 0;
  const ym = m ? `${year}-${String(month).padStart(2, "0")}` : "";
  if (!m || month < 1 || month > 12 || year < 1990 || ym > todayAR().slice(0, 7)) {
    ctx.say("No pude interpretar la fecha. Escribí mes/año, por ejemplo 03/2022 (no puede ser futura).");
    ctx.expect("g.desde");
    return;
  }
  data(ctx).start = `${ym}-01`;
  return next(ctx, showSummary);
};

async function showSummary(ctx: Ctx) {
  const d = data(ctx);
  if (!inSignup(ctx) || !d.name || !d.email || !d.cuit || !d.activity || !d.start) return showWelcome(ctx);
  d.lastPrompt = "g.resumen";
  ctx.say(
    `Revisá tus datos:\n• Nombre: ${d.name}\n• Correo: ${d.email}\n• CUIT: ${formatCuit(d.cuit)}\n• Actividad: ${d.activity}\n• Facturás desde: ${monthName(
      d.start.slice(0, 7),
    )}\n\nAl confirmar creamos tu cuenta y vinculamos este WhatsApp.`,
  );
  ctx.buttons("¿Creamos la cuenta?", [
    { title: "Crear mi cuenta", a: "g.crear" },
    { title: "Corregir", a: "g.corregir" },
    cancel,
  ]);
}
on("g.resumen", async (ctx) => showSummary(ctx));

on("g.corregir", async (ctx) => {
  if (!inSignup(ctx)) return showWelcome(ctx);
  ctx.list("¿Qué dato querés corregir?", "Elegir", [
    { title: "Nombre", a: "g.fix", v: "nombre" },
    { title: "Correo", a: "g.fix", v: "correo" },
    { title: "CUIT", a: "g.fix", v: "cuit" },
    { title: "Actividad", a: "g.fix", v: "actividad" },
    { title: "Fecha de inicio", a: "g.fix", v: "inicio" },
    { title: "Volver al resumen", a: "g.resumen" },
  ]);
});
on("g.fix", async (ctx, v) => {
  if (!inSignup(ctx)) return showWelcome(ctx);
  data(ctx).editing = true;
  if (v === "nombre") return askName(ctx);
  if (v === "correo") return askEmail(ctx);
  if (v === "cuit") return askCuit(ctx);
  if (v === "actividad") return askActivity(ctx);
  return askStart(ctx);
});

/** Confirmación: crea la cuenta, vincula el número y pide el acceso al CUIT. */
on("g.crear", async (ctx) => {
  const d = data(ctx);
  if (!inSignup(ctx) || !d.name || !d.email || !d.cuit || !d.activity || !d.start) return showWelcome(ctx);
  const created = await registerFromChannel({ name: d.name, email: d.email, phone: formatPhone(ctx.address) }, ctx.origin);
  if (!created.ok) {
    if (created.reason === "EMAIL_EN_USO") {
      ctx.say(
        "No pudimos crear la cuenta con ese correo. Si ya tenés una cuenta, tocá Ya tengo cuenta para vincular este WhatsApp. Si no, probá con otro correo.",
      );
      ctx.buttons("¿Qué hacemos?", [
        { title: "Usar otro correo", a: "g.fix", v: "correo" },
        { title: T.guestHaveAccount, a: "g.tengo" },
        cancel,
      ]);
      return;
    }
    ctx.resetFlow();
    ctx.say(created.message);
    return showWelcome(ctx);
  }

  const linked = await linkNewAccount(created.userId, ctx.address);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.userId }, include: { study: true } });
  const current: CurrentUser = { id: user.id, studyId: user.studyId, studyName: user.study.name, email: user.email, name: user.name, role: ROLES.CLIENTE };
  const association = await requestAssociation(current, { cuit: d.cuit, name: d.name, activity: d.activity, category: "", startDate: d.start });
  await rememberDemoAccount(created.userId);

  ctx.resetFlow();
  ctx.say(
    [
      `¡Listo, ${firstName(d.name)}! Creamos tu cuenta${linked.ok ? " y vinculamos este WhatsApp" : ""}.`,
      !association.ok
        ? `No pudimos registrar el CUIT: ${association.message} Podés cargarlo desde la web (Mi perfil).`
        : association.approved
          ? `Ya tenés acceso a tu panel con el CUIT ${formatCuit(d.cuit)}. El estudio recibió el aviso de tu alta y va a ir cargando tu información.`
          : `Ese CUIT ya está registrado en el estudio: por seguridad, el acceso lo confirma el estudio. Te aviso por acá cuando lo apruebe.`,
      "",
      "Para entrar a la web:",
      `• ${ctx.origin}/login`,
      `• Correo: ${d.email}`,
      `• Contraseña temporal: ${created.tempPassword}`,
      `Vence en ${TEMP_PASSWORD_HOURS} horas y al entrar te pedimos que elijas la tuya.`,
      "",
      `Te mandamos un correo para confirmar tu dirección.${APP_MODE === "DEMO" ? ` (Demo: los correos se ven en ${ctx.origin}/dev/correos)` : ""}`,
    ].join("\n"),
  );
  if (association.ok && association.approved) {
    ctx.buttons("¿Seguimos?", [{ title: T.menuButton, a: "menu" }]);
  } else {
    ctx.buttons("Mientras tanto podés:", [
      { title: T.pendingStatus, a: "p.estado" },
      { title: T.pendingAsk, a: "p.consultar" },
    ]);
  }
});

/** Contraseña temporal para entrar a la web (solo cuentas que todavía no eligieron la suya). */
on(
  "c.clave",
  async (ctx) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!user.mustChangePassword) {
      ctx.say(
        `Para entrar a la web usá tu correo (${user.email}) y tu contraseña: ${ctx.origin}/login\nSi no la recordás, en la web tocá ¿Olvidaste tu contraseña? y te mandamos un enlace al correo. Por seguridad no doy contraseñas nuevas por acá a cuentas que ya eligieron la suya.`,
      );
      ctx.buttons("¿Algo más?", [{ title: T.menu, a: "menu" }]);
      return;
    }
    ctx.say(
      `Para entrar a la web:\n• ${ctx.origin}/login\n• Correo: ${user.email}\n• Contraseña: la temporal que te di al crear la cuenta (vence a las ${TEMP_PASSWORD_HOURS} horas).`,
    );
    ctx.buttons("¿No la tenés o no te funciona?", [
      { title: "Generar otra", a: "c.clave.nueva" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { noTaxpayer: true },
);
on(
  "c.clave.nueva",
  async (ctx) => {
    ctx.buttons("¿Te genero una contraseña temporal nueva? La anterior deja de funcionar.", [
      { title: "Sí, generar", a: "c.clave.ok" },
      { title: T.cancel, a: "menu" },
    ]);
  },
  { noTaxpayer: true },
);
on(
  "c.clave.ok",
  async (ctx) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!user.mustChangePassword) return actions["c.clave"](ctx);
    const password = await issueTempPassword(user.id);
    await rememberDemoAccount(user.id, true);
    ctx.say(
      `Para entrar a la web:\n• ${ctx.origin}/login\n• Correo: ${user.email}\n• Contraseña temporal: ${password}\nVence en ${TEMP_PASSWORD_HOURS} horas y al entrar te pedimos que elijas la tuya.`,
    );
    ctx.buttons("¿Algo más?", [{ title: T.menu, a: "menu" }]);
  },
  { noTaxpayer: true },
);
