import { formatARS, parseAmountToCents } from "@/lib/money";
import { formatDateAR, formatDateTimeAR, todayAR } from "@/lib/dates";
import { COUNTED_INVOICE_STATUSES, DOC_CATEGORY_LABEL } from "@/lib/constants";
import { computeMargin, getDashboardData, getInvoices, resolveCutDate, type MarginInfo } from "@/modules/dashboard/metrics";
import { debtStateText, getDebtSummary } from "@/modules/fiscal/obligations";
import { formatBytes, getAuthorizedDocument, listDocuments } from "@/modules/documents/service";
import { listRequestsForUser } from "@/modules/requests/service";
import { activeTaxpayer, chooseTaxpayer, showMenu } from "./flows-home";
import { paginate, type Ctx } from "./core";
import { monthName, T } from "./copy";
import { on, textSteps } from "./registry";

// Consultas: Mi resumen, Categoría y límites, Deudas y vencimientos, Ver documentos.
// Mismos servicios que el tablero: los importes coinciden con la web para el mismo contribuyente y período.

const LEVEL: Record<string, string> = {
  NORMAL: "normal",
  PREVENTIVO: "preventivo (más del 80 % del límite)",
  PROXIMO: "próximo al límite (más del 95 %)",
  SUPERADO: "superado",
};
const percent = (tenths: number) => `${(tenths / 10).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

/** Contribuyente activo o, si hay varios sin elegir, pedirlo y volver a esta acción. */
async function needTaxpayer(ctx: Ctx, action: string) {
  const tp = await activeTaxpayer(ctx);
  if (!tp) await chooseTaxpayer(ctx, action);
  return tp;
}

function marginLine(m: MarginInfo) {
  if (!m.available) return `Margen por ingresos: no se puede calcular (${m.reason})`;
  const value = m.marginCents >= 0n ? `margen disponible ${formatARS(m.marginCents)}` : `excedido en ${formatARS(-m.marginCents)}`;
  return `Margen por ingresos (orientativo), período ${formatDateAR(m.referenceFrom)} al ${formatDateAR(m.referenceTo)}: ${value} · ${percent(
    m.percentTenths,
  )} del límite de la categoría ${m.categoryCode} · nivel ${LEVEL[m.level] ?? m.level}`;
}

function ymOffset(delta: number) {
  const [y, m] = todayAR().split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// ───────────── Mi resumen ─────────────

on("m.resumen", async (ctx) => {
  const tp = await needTaxpayer(ctx, "m.resumen");
  if (!tp) return;
  ctx.list(`Mi resumen de ${tp.name}. ¿Qué período querés ver?`, "Elegir período", [
    { title: "Este mes", desc: monthName(ymOffset(0)), a: "r.ver", v: "mes" },
    { title: "Mes anterior", desc: monthName(ymOffset(-1)), a: "r.ver", v: ymOffset(-1) },
    { title: "Este año", desc: `Enero a hoy de ${todayAR().slice(0, 4)}`, a: "r.ver", v: "anio" },
    { title: "Otro período", desc: "Elegir un mes", a: "r.otro", v: "0" },
    { title: T.menu, a: "menu" },
  ]);
});

on("r.otro", async (ctx, v) => {
  const page = Number(v ?? 0);
  const months = Array.from({ length: 22 }, (_, i) => ymOffset(-(i + 2))); // de hace 2 meses hasta 23 meses atrás
  const { slice, hasMore } = paginate(months, page);
  ctx.list(
    "¿Qué mes querés ver?",
    "Elegir mes",
    [
      ...slice.map((ym) => ({ title: monthName(ym), a: "r.ver", v: ym })),
      ...(hasMore ? [{ title: "Meses anteriores", a: "r.otro", v: String(page + 1) }] : []),
      { title: T.back, a: "m.resumen" },
    ],
  );
});

on(
  "r.ver",
  async (ctx, v) => {
    const tp = await needTaxpayer(ctx, "m.resumen");
    if (!tp) return;
    const key = v === "anio" ? "anual" : "mensual";
    const cut = v === "mes" || v === "anio" || !v ? todayAR() : resolveCutDate(v);
    const [data, debt, open] = await Promise.all([
      getDashboardData(tp, cut),
      getDebtSummary(tp.id),
      listRequestsForUser(ctx.user, { taxpayerId: tp.id, view: "activas" }, 50),
    ]);
    const period = data.periods.find((p) => p.key === key)!;
    const billed =
      period.totalCents === null
        ? "Información incompleta: el estudio no cargó todos los comprobantes de este período."
        : `${formatARS(period.totalCents)} en ${period.invoiceCount} ${period.invoiceCount === 1 ? "comprobante" : "comprobantes"}${
            period.coverage === "PARCIAL" ? " (datos parciales)" : ""
          }`;
    const next = debt.upcoming[0];
    const lines = [
      `Resumen de ${tp.name}`,
      `Facturación del ${formatDateAR(period.from)} al ${formatDateAR(period.to)}: ${billed}`,
      marginLine(data.margin),
      `Próximo vencimiento: ${
        next
          ? `${next.concept}, ${formatDateAR(next.dueDate)}${next.amountCents === null ? "" : ` — ${formatARS(next.amountCents)}`}`
          : debt.state === "SIN_DATOS"
            ? "el estudio todavía no cargó vencimientos"
            : "sin registros"
      }`,
      `Solicitudes abiertas: ${open.length}`,
      data.coverage
        ? `Datos ${data.coverage.complete ? "completos" : "parciales"} · ${data.coverage.source} · actualizado ${formatDateTimeAR(data.coverage.updatedAt)}`
        : "El estudio todavía no cargó la facturación de este contribuyente.",
    ];
    ctx.say(lines.join("\n"));
    ctx.list("¿Qué querés hacer?", "Ver opciones", [
      { title: "Ver movimientos", desc: "Comprobantes de este período", a: "r.mov", v: `${period.from}|${period.to}` },
      { title: "Ver vencimientos", a: "d.prox" },
      { title: "Consultar al estudio", a: "s.nueva", v: "crear|FACTURACION" },
      { title: "Cambiar período", a: "m.resumen" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true },
);

on(
  "r.mov",
  async (ctx, v) => {
    const tp = await needTaxpayer(ctx, "m.resumen");
    if (!tp) return;
    const [from, to] = (v ?? "").split("|");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? "")) return showMenu(ctx);
    const rows = (await getInvoices(tp.id, from, to)).filter((i) => COUNTED_INVOICE_STATUSES.includes(i.status));
    const shown = rows.slice(0, 8);
    ctx.say(
      rows.length === 0
        ? `Sin comprobantes computables del ${formatDateAR(from)} al ${formatDateAR(to)}.`
        : `Comprobantes del ${formatDateAR(from)} al ${formatDateAR(to)}${rows.length > 8 ? ` (los 8 más recientes de ${rows.length})` : ""}:\n${shown
            .map((i) => `• ${formatDateAR(i.issueDate)} · ${i.recipientName} · ${formatARS(i.amountCents)}`)
            .join("\n")}\nLista completa en la web: ${ctx.origin}/dashboard/movimientos?c=${tp.id}&desde=${from}&hasta=${to}`,
    );
    ctx.buttons("¿Algo más?", [
      { title: "Cambiar período", a: "m.resumen" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true },
);

// ───────────── Categoría y límites ─────────────

on(
  "m.cat",
  async (ctx) => {
    const tp = await needTaxpayer(ctx, "m.cat");
    if (!tp) return;
    const data = await getDashboardData(tp, todayAR());
    const rolling = data.periods.find((p) => p.key === "movil12")!;
    const m = data.margin;
    const lines = [
      `Categoría y límites de ${tp.name}`,
      `Categoría registrada: ${data.category.code ?? "sin cargar"}${data.category.since ? ` (desde el ${formatDateAR(data.category.since)})` : ""}`,
      `Período utilizado: ${formatDateAR(rolling.from)} al ${formatDateAR(rolling.to)}`,
      `Ingresos computables: ${rolling.totalCents === null ? "información incompleta" : formatARS(rolling.totalCents)}`,
      m.available ? `Límite de la escala aplicada (${m.scaleName}${m.scaleStatus === "DEMO" ? ", ficticia" : ""}): ${formatARS(m.limitCents)}` : "",
      m.available
        ? m.marginCents >= 0n
          ? `Margen: ${formatARS(m.marginCents)} (${percent(m.percentTenths)} del límite)`
          : `Exceso: ${formatARS(-m.marginCents)} (${percent(m.percentTenths)} del límite)`
        : `Margen: no se puede calcular (${m.reason})`,
      data.coverage
        ? `Datos ${data.coverage.complete ? "completos" : "parciales"} · actualizado ${formatDateTimeAR(data.coverage.updatedAt)}`
        : "Sin datos de facturación cargados.",
      "Es una referencia por ingresos: no reemplaza la recategorización oficial.",
    ].filter(Boolean);
    ctx.say(lines.join("\n"));
    ctx.list("¿Qué querés hacer?", "Ver opciones", [
      { title: "Ver detalle", desc: "Escala aplicada y categoría orientativa", a: "k.detalle" },
      { title: "Simular un importe", desc: "Cómo cambiaría el margen", a: "k.simular" },
      { title: "Consultar mi categoría", desc: "Mandar una consulta al estudio", a: "s.nueva", v: "crear|CATEGORIA" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true },
);

on(
  "k.detalle",
  async (ctx) => {
    const tp = await needTaxpayer(ctx, "k.detalle");
    if (!tp) return;
    const data = await getDashboardData(tp, todayAR());
    const scale = data.category.scale;
    const s = data.category.suggestion;
    if (!scale) {
      ctx.say("No hay una escala vigente cargada por el estudio: sin escala no se calcula el margen.");
    } else {
      const limits = scale.limits.map((l) => `${l.code === data.category.code ? "▶ " : ""}${l.code}: ${formatARS(l.annualLimitCents)}`).join("\n");
      ctx.say(
        `Escala ${scale.name}${scale.status === "DEMO" ? " (ficticia)" : ""}, fuente: ${scale.source}\n${limits}\n\nCategoría orientativa por ingresos: ${
          s.available ? (s.code ?? "por encima de la escala") : `no disponible (${s.reason})`
        }. Solo mira los ingresos; no es una determinación oficial.\nDetalle en la web: ${ctx.origin}/dashboard/categoria?c=${tp.id}`,
      );
    }
    ctx.buttons("¿Algo más?", [
      { title: "Simular un importe", a: "k.simular" },
      { title: "Consultar categoría", a: "s.nueva", v: "crear|CATEGORIA" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true },
);

on(
  "k.simular",
  async (ctx) => {
    const tp = await needTaxpayer(ctx, "k.simular");
    if (!tp) return;
    const data = await getDashboardData(tp, todayAR());
    if (!data.margin.available) {
      ctx.say(`No puedo simular: ${data.margin.reason} Si necesitás saber cómo estás, consultá al estudio.`);
      ctx.buttons("¿Qué hacemos?", [
        { title: "Consultar categoría", a: "s.nueva", v: "crear|CATEGORIA" },
        { title: T.menu, a: "menu" },
      ]);
      return;
    }
    ctx.conv.data.lastPrompt = "k.simular";
    ctx.buttons("¿Qué importe querés simular? Escribilo, por ejemplo 150000 o 150000,50. Esta simulación no crea una factura ni modifica tu categoría.", [
      { title: T.cancel, a: "m.cat" },
    ]);
    ctx.expect("k.monto");
  },
  { readOnly: true },
);

textSteps["k.monto"] = async (ctx, text) => {
  const amount = parseAmountToCents(text);
  if (amount === null || amount <= 0n) {
    ctx.say(T.invalidAmount);
    ctx.expect("k.monto");
    ctx.buttons("Probá de nuevo o volvé.", [{ title: T.cancel, a: "m.cat" }]);
    return;
  }
  const tp = await activeTaxpayer(ctx);
  if (!tp) return showMenu(ctx);
  const data = await getDashboardData(tp, todayAR());
  const rolling = data.periods.find((p) => p.key === "movil12")!;
  const now = data.margin;
  const sim = computeMargin(data.category.code, tp.startDate, { ...rolling, totalCents: (rolling.totalCents ?? 0n) + amount }, data.category.scale);
  ctx.conv.step = null;
  if (!now.available || !sim.available || rolling.totalCents === null) {
    ctx.say("No pude simular con los datos disponibles. Consultá al estudio.");
  } else {
    ctx.say(
      `Si sumás ${formatARS(amount)} a los ingresos del período ${formatDateAR(now.referenceFrom)} al ${formatDateAR(now.referenceTo)}:\n• Hoy: ${
        now.marginCents >= 0n ? `margen ${formatARS(now.marginCents)}` : `exceso ${formatARS(-now.marginCents)}`
      } (${percent(now.percentTenths)}, ${LEVEL[now.level]})\n• Con ese importe: ${
        sim.marginCents >= 0n ? `margen ${formatARS(sim.marginCents)}` : `exceso ${formatARS(-sim.marginCents)}`
      } (${percent(sim.percentTenths)}, ${LEVEL[sim.level]})\n\nEsta simulación no crea una factura ni modifica tu categoría, y no es una recomendación. Ante cualquier decisión, consultá al estudio.`,
    );
  }
  ctx.buttons("¿Qué querés hacer?", [
    { title: "Simular otro importe", a: "k.simular" },
    { title: "Consultar al estudio", a: "s.nueva", v: "crear|CATEGORIA" },
    { title: T.menu, a: "menu" },
  ]);
};

// ───────────── Deudas y vencimientos ─────────────

on("m.deudas", async (ctx) => {
  const tp = await needTaxpayer(ctx, "m.deudas");
  if (!tp) return;
  ctx.list(`Deudas y vencimientos de ${tp.name}. ¿Qué querés ver?`, "Ver opciones", [
    { title: "Próximos vencimientos", a: "d.prox" },
    { title: "Deudas registradas", a: "d.reg" },
    { title: "Informar un pago", desc: "Con el comprobante", a: "d.pago" },
    { title: "Consultar una diferencia", a: "d.dif" },
    { title: T.menu, a: "menu" },
  ]);
});

on(
  "d.prox",
  async (ctx) => {
    const tp = await needTaxpayer(ctx, "d.prox");
    if (!tp) return;
    const d = await getDebtSummary(tp.id);
    ctx.say(
      d.state === "SIN_DATOS"
        ? `El estudio todavía no cargó información de vencimientos de ${tp.name}. Que no haya datos no significa que no haya vencimientos.`
        : d.upcoming.length === 0
          ? `${tp.name}: sin registros de próximos vencimientos.`
          : `Próximos vencimientos de ${tp.name}:\n${d.upcoming
              .slice(0, 8)
              .map((o) => `• ${o.concept} (${o.period}): ${formatDateAR(o.dueDate)} — ${o.amountCents === null ? "importe no informado" : formatARS(o.amountCents)} · ${o.source}`)
              .join("\n")}`,
    );
    ctx.buttons("¿Algo más?", [
      { title: "Informar un pago", a: "d.pago" },
      { title: "Deudas registradas", a: "d.reg" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true },
);

on(
  "d.reg",
  async (ctx) => {
    const tp = await needTaxpayer(ctx, "d.reg");
    if (!tp) return;
    const d = await getDebtSummary(tp.id);
    const lines = [`Deudas de ${tp.name}`, debtStateText(d)];
    for (const o of d.overdue.slice(0, 8)) {
      lines.push(`• ${o.concept} (${o.period}): venció ${formatDateAR(o.dueDate)} — ${o.amountCents === null ? "importe no informado" : formatARS(o.amountCents)} · pendiente`);
    }
    if (d.overdue.length) lines.push(`Total vencido con importe informado: ${formatARS(d.overdueTotalCents)}. No incluye intereses.`);
    for (const o of d.paymentInformed.slice(0, 5)) lines.push(`• ${o.concept} (${o.period}): pago informado, pendiente de verificación del estudio`);
    if (d.review) lines.push(`Información al ${formatDateAR(d.review.asOfDate)} · ${d.review.source}`);
    ctx.say(lines.join("\n"));
    ctx.buttons("¿Algo más?", [
      { title: "Informar un pago", a: "d.pago" },
      { title: "Consultar diferencia", a: "d.dif" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true },
);

// ───────────── Documentos ─────────────

on("m.docs", async (ctx) => {
  const tp = await needTaxpayer(ctx, "m.docs");
  if (!tp) return;
  ctx.list(`Documentos de ${tp.name}. ¿Qué necesitás?`, "Ver opciones", [
    { title: "Ver mis documentos", a: "doc.ver" },
    { title: "Enviar documentación", desc: "Foto o PDF", a: "doc.enviar" },
    { title: "Solicitar un documento", desc: "Lo prepara el estudio", a: "doc.pedir" },
    { title: T.menu, a: "menu" },
  ]);
});

on(
  "doc.ver",
  async (ctx) => {
    const tp = await needTaxpayer(ctx, "doc.ver");
    if (!tp) return;
    const docs = await listDocuments(ctx.user, { taxpayerId: tp.id });
    if (docs.length === 0) {
      ctx.say(`${tp.name} no tiene documentos compartidos todavía.`);
      ctx.buttons("¿Algo más?", [
        { title: "Pedir un documento", a: "doc.pedir" },
        { title: T.menu, a: "menu" },
      ]);
      return;
    }
    const categories = [...new Set(docs.map((d) => d.category))];
    if (categories.length === 1) return listDocs(ctx, `${categories[0]}|0`);
    ctx.list("¿Qué tipo de documento?", "Elegir tipo", [
      { title: "Todos", desc: `${docs.length} documentos`, a: "doc.lista", v: "TODOS|0" },
      ...categories.slice(0, 7).map((c) => ({ title: DOC_CATEGORY_LABEL[c] ?? c, desc: `${docs.filter((d) => d.category === c).length} documentos`, a: "doc.lista", v: `${c}|0` })),
      { title: T.back, a: "m.docs" },
    ]);
  },
  { readOnly: true },
);

async function listDocs(ctx: Ctx, v?: string) {
  const tp = await needTaxpayer(ctx, "doc.ver");
  if (!tp) return;
  const [category, pageRaw] = (v ?? "TODOS|0").split("|");
  const all = (await listDocuments(ctx.user, { taxpayerId: tp.id, category: category === "TODOS" ? undefined : category })).filter(
    (d) => category === "TODOS" || d.category === category,
  );
  const { slice, hasMore, page } = paginate(all, Number(pageRaw ?? 0));
  if (slice.length === 0) {
    ctx.say(T.sinRegistros);
    return showMenu(ctx);
  }
  ctx.list("Elegí un documento:", "Ver documentos", [
    ...slice.map((d) => ({ title: d.fileName, desc: `${formatDateAR(d.createdAt.toISOString().slice(0, 10))} · ${formatBytes(d.sizeBytes)}`, a: "doc.uno", v: d.id })),
    ...(hasMore ? [{ title: T.more, a: "doc.lista", v: `${category}|${page + 1}` }] : []),
    { title: T.back, a: "m.docs" },
  ]);
}
on("doc.lista", listDocs, { readOnly: true });

on(
  "doc.uno",
  async (ctx, v) => {
    // Se valida en el servidor: el documento tiene que ser visible para este usuario ahora.
    const doc = v ? await getAuthorizedDocument(ctx.user, v) : null;
    if (!doc || doc.taxpayerId !== ctx.taxpayerId) {
      ctx.say("Ese documento no está disponible.");
      return showMenu(ctx);
    }
    ctx.say(
      `${doc.fileName} (${DOC_CATEGORY_LABEL[doc.category] ?? doc.category}, ${formatBytes(doc.sizeBytes)}).\nPara descargarlo, abrilo en la web con tu sesión iniciada: ${ctx.origin}/documentos/${doc.id}/descargar\nEl enlace solo funciona para vos: pide iniciar sesión y revisa tus permisos.`,
    );
    ctx.buttons("¿Algo más?", [
      { title: "Ver otro documento", a: "doc.ver" },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true },
);

export { ymOffset, needTaxpayer };
