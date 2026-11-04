import { formatARS, parseAmountToCents } from "@/lib/money";
import { addDaysYmd, formatDateAR, todayAR } from "@/lib/dates";
import { CHANNEL } from "@/lib/constants";
import { getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { getDebtSummary } from "@/modules/fiscal/obligations";
import { createRequest, informPayment, listRequestsForUser } from "@/modules/requests/service";
import { activeTaxpayer, chooseTaxpayer, showMenu } from "./flows-home";
import { monthName, T } from "./copy";
import { ymOffset } from "./flows-info";
import { requestCode } from "./notify";
import { markUploadUsed, takeUpload } from "./uploads";
import type { Ctx } from "./core";
import { actions, on, textSteps, uploadSteps } from "./registry";

// Operaciones de Deudas (informar pago, consultar diferencia) y Documentos (enviar, solicitar).
// Todas terminan en los servicios de la web: el pago informado queda igual que si se informara desde la web.

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Arranca una solicitud con motivo y asunto ya definidos y pide el mensaje. */
async function startRequest(ctx: Ctx, topic: string, subject: string, taxpayerId: string) {
  ctx.conv.flow = "solicitud";
  ctx.conv.step = null;
  ctx.conv.data = { mode: "crear", topic, subject: clip(subject, 120), taxpayerId };
  return actions["s.cuerpo"](ctx);
}

// ───────────── Informar un pago ─────────────

type Payment = {
  taxpayerId: string;
  obligationId: string;
  label: string;
  expectedCents: string | null;
  paidOn?: string;
  amountCents?: string;
  uploadId?: string;
  uploadName?: string;
  lastPrompt?: string;
};
const pay = (ctx: Ctx) => ctx.conv.data as unknown as Payment;
const inPay = (ctx: Ctx) => ctx.conv.flow === "pago";

on(
  "d.pago",
  async (ctx) => {
    const tp = await activeTaxpayer(ctx);
    if (!tp) return chooseTaxpayer(ctx, "d.pago");
    const d = await getDebtSummary(tp.id);
    const pending = [...d.overdue, ...d.upcoming].slice(0, 8);
    ctx.list(
      pending.length
        ? "¿Qué pago querés informar? Elegí el vencimiento. Si pagaste otra cosa, elegí Otro concepto."
        : "No hay vencimientos pendientes cargados por el estudio. Si pagaste algo, informalo como Otro concepto.",
      "Elegir vencimiento",
      [
        ...pending.map((o) => ({
          title: o.concept,
          desc: `${monthName(o.period)} · vence ${formatDateAR(o.dueDate)}${o.amountCents === null ? "" : ` · ${formatARS(o.amountCents)}`}`,
          a: "d.pago.sel",
          v: o.id,
        })),
        { title: "Otro concepto", desc: "Lo revisa el estudio", a: "d.pago.otro" },
        { title: T.back, a: "m.deudas" },
      ],
    );
  },
  { readOnly: true },
);

on("d.pago.otro", async (ctx) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "d.pago");
  return startRequest(ctx, "DEUDAS", "Informo un pago de otro concepto", tp.id);
});

on("d.pago.sel", async (ctx, id) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp || !id) return showMenu(ctx);
  const d = await getDebtSummary(tp.id);
  const o = [...d.overdue, ...d.upcoming].find((x) => x.id === id);
  if (!o) {
    ctx.say("Ese vencimiento ya no está pendiente.");
    return showMenu(ctx);
  }
  ctx.conv.flow = "pago";
  ctx.conv.step = null;
  ctx.conv.data = {
    taxpayerId: tp.id,
    obligationId: o.id,
    label: `${o.concept} de ${monthName(o.period)}`,
    expectedCents: o.amountCents === null ? null : o.amountCents.toString(),
  } satisfies Payment;
  return askDate(ctx);
});

async function askDate(ctx: Ctx) {
  const today = todayAR();
  pay(ctx).lastPrompt = "d.pago.fecha";
  ctx.buttons(`¿Cuándo pagaste ${pay(ctx).label}?`, [
    { title: "Hoy", a: "d.pago.f", v: today },
    { title: "Ayer", a: "d.pago.f", v: addDaysYmd(today, -1) },
    { title: "Otra fecha", a: "d.pago.fotra" },
  ]);
}
on("d.pago.fecha", async (ctx) => (inPay(ctx) ? askDate(ctx) : showMenu(ctx)));
on("d.pago.fotra", async (ctx) => {
  if (!inPay(ctx)) return showMenu(ctx);
  const today = todayAR();
  ctx.list("Elegí la fecha del pago:", "Elegir fecha", [
    ...Array.from({ length: 8 }, (_, i) => addDaysYmd(today, -(i + 2))).map((d) => ({ title: formatDateAR(d), a: "d.pago.f", v: d })),
    { title: "Hace más tiempo", desc: "Escribir la fecha", a: "d.pago.fescribir" },
    { title: T.cancel, a: "cancel" },
  ]);
});
on("d.pago.fescribir", async (ctx) => {
  if (!inPay(ctx)) return showMenu(ctx);
  ctx.buttons("Escribí la fecha del pago como dd/mm/aaaa.", [{ title: T.cancel, a: "cancel" }]);
  ctx.expect("d.pago.fecha");
});
textSteps["d.pago.fecha"] = async (ctx, text) => {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const ymd = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
  const valid = m && addDaysYmd(ymd, 0) === ymd && ymd <= todayAR() && ymd >= addDaysYmd(todayAR(), -366);
  if (!valid) {
    ctx.say("No pude interpretar la fecha. Escribila como 15/10/2026 (no puede ser futura ni de hace más de un año).");
    ctx.expect("d.pago.fecha");
    return;
  }
  ctx.conv.step = null;
  return actions["d.pago.f"](ctx, ymd);
};
on("d.pago.f", async (ctx, v) => {
  if (!inPay(ctx) || !v || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v > todayAR()) return showMenu(ctx);
  pay(ctx).paidOn = v;
  if (pay(ctx).uploadId) return showPaySummary(ctx); // corrección: conserva lo demás
  return askAmount(ctx);
});

async function askAmount(ctx: Ctx) {
  const p = pay(ctx);
  p.lastPrompt = "d.pago.importe";
  if (p.expectedCents !== null) {
    ctx.buttons(`¿Pagaste el importe informado, ${formatARS(BigInt(p.expectedCents))}?`, [
      { title: "Sí, ese importe", a: "d.pago.imp", v: p.expectedCents },
      { title: "Otro importe", a: "d.pago.impotro" },
      { title: T.cancel, a: "cancel" },
    ]);
    return;
  }
  ctx.buttons("¿Qué importe pagaste? Escribilo, por ejemplo 15000 o 15000,50.", [{ title: T.cancel, a: "cancel" }]);
  ctx.expect("d.pago.importe");
}
on("d.pago.importe", async (ctx) => (inPay(ctx) ? askAmount(ctx) : showMenu(ctx)));
on("d.pago.impotro", async (ctx) => {
  if (!inPay(ctx)) return showMenu(ctx);
  ctx.buttons("Escribí el importe que pagaste, por ejemplo 15000 o 15000,50.", [{ title: T.cancel, a: "cancel" }]);
  ctx.expect("d.pago.importe");
});
textSteps["d.pago.importe"] = async (ctx, text) => {
  const cents = parseAmountToCents(text);
  if (cents === null || cents <= 0n) {
    ctx.say(T.invalidAmount);
    ctx.expect("d.pago.importe");
    return;
  }
  ctx.conv.step = null;
  return actions["d.pago.imp"](ctx, cents.toString());
};
on("d.pago.imp", async (ctx, v) => {
  if (!inPay(ctx) || !v || !/^\d+$/.test(v)) return showMenu(ctx);
  pay(ctx).amountCents = v;
  if (pay(ctx).uploadId) return showPaySummary(ctx);
  return askReceipt(ctx);
});

async function askReceipt(ctx: Ctx) {
  pay(ctx).lastPrompt = "d.pago.archivo";
  // El comprobante es obligatorio, igual que en la web.
  ctx.buttons("Mandá el comprobante de pago (foto JPG o PNG, o un PDF). Es obligatorio para informar el pago.", [{ title: T.cancel, a: "cancel" }]);
  ctx.expect("d.pago.archivo");
}
on("d.pago.archivo", async (ctx) => (inPay(ctx) ? askReceipt(ctx) : showMenu(ctx)));
uploadSteps["d.pago.archivo"] = async (ctx, upload) => {
  pay(ctx).uploadId = upload.id;
  pay(ctx).uploadName = upload.fileName;
  ctx.conv.step = null;
  return showPaySummary(ctx);
};

async function showPaySummary(ctx: Ctx) {
  const p = pay(ctx);
  if (!inPay(ctx) || !p.paidOn || !p.amountCents || !p.uploadId) return showMenu(ctx);
  p.lastPrompt = "d.pago.resumen";
  const tp = await getAuthorizedTaxpayer(ctx.user, p.taxpayerId);
  ctx.say(
    `Revisá el pago que vas a informar:\n• Contribuyente: ${tp?.name ?? "—"}\n• Vencimiento: ${p.label}\n• Fecha de pago: ${formatDateAR(p.paidOn)}\n• Importe: ${formatARS(
      BigInt(p.amountCents),
    )}\n• Comprobante: ${p.uploadName}\n\nEl estudio lo revisa: hasta entonces queda como "pago informado", no como pagado.`,
  );
  ctx.buttons("¿Lo informamos?", [
    { title: "Informar pago", a: "d.pago.ok" },
    { title: "Corregir", a: "d.pago.corregir" },
    { title: T.cancel, a: "cancel" },
  ]);
}
on("d.pago.resumen", async (ctx) => showPaySummary(ctx));
on("d.pago.corregir", async (ctx) => {
  if (!inPay(ctx)) return showMenu(ctx);
  ctx.list("¿Qué querés corregir?", "Elegir", [
    { title: "Fecha de pago", a: "d.pago.fecha" },
    { title: "Importe", a: "d.pago.impotro" },
    { title: "Comprobante", a: "d.pago.archivo" },
    { title: "Volver al resumen", a: "d.pago.resumen" },
  ]);
});

on("d.pago.ok", async (ctx) => {
  const p = pay(ctx);
  if (!inPay(ctx) || !p.paidOn || !p.amountCents || !p.uploadId) return showMenu(ctx);
  const file = await takeUpload(p.uploadId, ctx.address);
  if (!file) {
    ctx.say("No encuentro el comprobante que mandaste. Mandalo de nuevo, por favor.");
    return askReceipt(ctx);
  }
  const note = `Informo el pago de ${p.label}: ${formatARS(BigInt(p.amountCents))}, pagado el ${formatDateAR(p.paidOn)}. Adjunto el comprobante (enviado por WhatsApp).`;
  const result = await informPayment(ctx.user, p.obligationId, note, [file], ctx.origin, `WA:${ctx.eventRef}`);
  if (!result.ok) {
    ctx.resetFlow();
    const detail = "fieldErrors" in result && result.fieldErrors ? Object.values(result.fieldErrors).join(" ") : "";
    ctx.say(`No pudimos informar el pago: ${result.message} ${detail}`.trim());
    ctx.buttons("¿Qué hacemos?", [
      { title: "Ver deudas", a: "d.reg" },
      { title: T.menu, a: "menu" },
    ]);
    return;
  }
  await markUploadUsed(p.uploadId);
  ctx.resetFlow();
  ctx.say(`Listo: informamos el pago de ${p.label}. Quedó en la solicitud ${requestCode(result.requestId)} para que el estudio lo verifique.`);
  ctx.buttons("¿Algo más?", [
    { title: "Ver la solicitud", a: "s.ver", v: result.requestId },
    { title: T.menu, a: "menu" },
  ]);
});

// ───────────── Consultar una diferencia ─────────────

on(
  "d.dif",
  async (ctx) => {
    const tp = await activeTaxpayer(ctx);
    if (!tp) return chooseTaxpayer(ctx, "d.dif");
    const d = await getDebtSummary(tp.id);
    const rows = d.all.slice(0, 8);
    ctx.list("¿Sobre qué vencimiento es la diferencia?", "Elegir", [
      ...rows.map((o) => ({
        title: o.concept,
        desc: `${monthName(o.period)} · ${formatDateAR(o.dueDate)}${o.amountCents === null ? "" : ` · ${formatARS(o.amountCents)}`}`,
        a: "d.dif.sel",
        v: o.id,
      })),
      { title: "Otro tema", a: "d.dif.sel", v: "otro" },
      { title: T.back, a: "m.deudas" },
    ]);
  },
  { readOnly: true },
);
on("d.dif.sel", async (ctx, id) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return showMenu(ctx);
  const o = id && id !== "otro" ? (await getDebtSummary(tp.id)).all.find((x) => x.id === id) : null;
  return startRequest(ctx, "DEUDAS", o ? `Diferencia en ${o.concept} de ${monthName(o.period)}` : "Consulta por una diferencia en deudas", tp.id);
});

// ───────────── Enviar documentación ─────────────

on(
  "doc.enviar",
  async (ctx) => {
    const tp = await activeTaxpayer(ctx);
    if (!tp) return chooseTaxpayer(ctx, "doc.enviar");
    const open = (await listRequestsForUser(ctx.user, { taxpayerId: tp.id, view: "activas" }, 50)).slice(0, 7);
    ctx.list(
      open.length ? "¿La documentación es para una solicitud abierta o para una nueva?" : "Vamos a crear una solicitud nueva con la documentación.",
      "Elegir",
      [
        ...open.map((r) => ({ title: r.subject, desc: `${requestCode(r.id)} · Agregar a esta solicitud`, a: "s.adj", v: r.id })),
        { title: "Nueva solicitud", desc: "Documentación", a: "doc.nueva" },
        { title: T.back, a: "m.docs" },
      ],
    );
  },
  { readOnly: true },
);
on("doc.nueva", async (ctx) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "doc.enviar");
  return startRequest(ctx, "DOCUMENTACION", "Envío documentación", tp.id);
});

// ───────────── Solicitar un documento ─────────────

const CATALOG: Record<string, { label: string; periodic: boolean }> = {
  constancia: { label: "Constancia de inscripción", periodic: false },
  cuota: { label: "Comprobante de pago de la cuota", periodic: true },
  recategorizacion: { label: "Constancia de recategorización", periodic: false },
  declaracion: { label: "Declaración o formulario", periodic: true },
  facturacion: { label: "Resumen de facturación", periodic: true },
};
type DocAsk = { taxpayerId: string; key: string; period?: string; note?: string; lastPrompt?: string };
const ask = (ctx: Ctx) => ctx.conv.data as unknown as DocAsk;

on("doc.pedir", async (ctx) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "doc.pedir");
  ctx.list("¿Qué documento necesitás? Lo prepara el estudio y te lo comparte.", "Elegir documento", [
    ...Object.entries(CATALOG).map(([k, c]) => ({ title: c.label, a: "doc.pedir.sel", v: k })),
    { title: "Otro documento", desc: "Contalo en un mensaje", a: "doc.pedir.otro" },
    { title: T.back, a: "m.docs" },
  ]);
});
on("doc.pedir.otro", async (ctx) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "doc.pedir");
  return startRequest(ctx, "DOCUMENTACION", "Solicito un documento", tp.id);
});
on("doc.pedir.sel", async (ctx, key) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp || !key || !CATALOG[key]) return showMenu(ctx);
  ctx.conv.flow = "pedido";
  ctx.conv.step = null;
  ctx.conv.data = { taxpayerId: tp.id, key, lastPrompt: "doc.pedir.resumen" } satisfies DocAsk;
  if (!CATALOG[key].periodic) return showDocSummary(ctx);
  ctx.list("¿De qué período?", "Elegir período", [
    ...[0, -1, -2, -3].map((n) => ({ title: monthName(ymOffset(n)), a: "doc.pedir.per", v: ymOffset(n) })),
    { title: `Año ${todayAR().slice(0, 4)}`, a: "doc.pedir.per", v: todayAR().slice(0, 4) },
    { title: `Año ${Number(todayAR().slice(0, 4)) - 1}`, a: "doc.pedir.per", v: String(Number(todayAR().slice(0, 4)) - 1) },
    { title: T.cancel, a: "cancel" },
  ]);
});
on("doc.pedir.per", async (ctx, v) => {
  if (ctx.conv.flow !== "pedido" || !v || !/^\d{4}(-\d{2})?$/.test(v)) return showMenu(ctx);
  ask(ctx).period = v;
  return showDocSummary(ctx);
});
const periodText = (p?: string) => (!p ? "" : p.length === 4 ? `año ${p}` : monthName(p));

async function showDocSummary(ctx: Ctx) {
  const a = ask(ctx);
  if (ctx.conv.flow !== "pedido" || !CATALOG[a.key]) return showMenu(ctx);
  const tp = await getAuthorizedTaxpayer(ctx.user, a.taxpayerId);
  ctx.say(`Vas a pedirle al estudio:\n• ${CATALOG[a.key].label}${a.period ? ` (${periodText(a.period)})` : ""}\n• Contribuyente: ${tp?.name ?? "—"}${a.note ? `\n• Comentario: ${a.note}` : ""}`);
  ctx.buttons("¿Lo pedimos?", [
    { title: "Pedir documento", a: "doc.pedir.ok" },
    { title: a.note ? "Cambiar comentario" : "Agregar comentario", a: "doc.pedir.nota" },
    { title: T.cancel, a: "cancel" },
  ]);
}
on("doc.pedir.nota", async (ctx) => {
  if (ctx.conv.flow !== "pedido") return showMenu(ctx);
  ctx.buttons("Escribí el comentario para el estudio.", [{ title: "Sin comentario", a: "doc.pedir.resumen" }]);
  ctx.expect("doc.pedir.nota");
});
on("doc.pedir.resumen", async (ctx) => showDocSummary(ctx));
textSteps["doc.pedir.nota"] = async (ctx, text) => {
  const note = text.trim();
  if (note.length < 2 || note.length > 1000) {
    ctx.say("El comentario tiene que tener entre 2 y 1.000 caracteres.");
    ctx.expect("doc.pedir.nota");
    return;
  }
  ask(ctx).note = note;
  ctx.conv.step = null;
  return showDocSummary(ctx);
};
on("doc.pedir.ok", async (ctx) => {
  const a = ask(ctx);
  if (ctx.conv.flow !== "pedido" || !CATALOG[a.key]) return showMenu(ctx);
  if (!(await getAuthorizedTaxpayer(ctx.user, a.taxpayerId))) {
    ctx.resetFlow();
    ctx.say(T.noLongerAccess);
    return showMenu(ctx);
  }
  const what = `${CATALOG[a.key].label}${a.period ? ` (${periodText(a.period)})` : ""}`;
  const result = await createRequest(
    ctx.user,
    {
      taxpayerId: a.taxpayerId,
      topic: "DOCUMENTACION",
      subject: clip(`Pido: ${what}`, 120),
      body: `Necesito: ${what}.${a.note ? `\n${a.note}` : ""}`,
      channel: CHANNEL.WHATSAPP,
      externalRef: `WA:${ctx.eventRef}`,
    },
    [],
    ctx.origin,
  );
  ctx.resetFlow();
  if (!result.ok) {
    ctx.say(`No pudimos enviar el pedido: ${result.message}`);
    ctx.buttons("¿Qué hacemos?", [
      { title: "Documentos", a: "m.docs" },
      { title: T.menu, a: "menu" },
    ]);
    return;
  }
  ctx.say(T.requestSent(requestCode(result.requestId)));
  ctx.buttons("¿Algo más?", [
    { title: "Ver la solicitud", a: "s.ver", v: result.requestId },
    { title: T.menu, a: "menu" },
  ]);
});

