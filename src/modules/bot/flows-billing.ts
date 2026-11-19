import { prisma } from "@/lib/db";
import { APP_MODE, INVOICE_SOURCE, INVOICE_STATUS, STATUS_LABEL, TAX_CONDITION_LABEL } from "@/lib/constants";
import { formatARS, formatQuantity, parseAmountToCents, parseQuantityMilli } from "@/lib/money";
import { addDaysYmd, formatDateAR, todayAR } from "@/lib/dates";
import { cuitProblem, formatCuit, isValidCuit, normalizeCuit } from "@/lib/cuit";
import { lookupCuit } from "@/providers/padron";
import { getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { setStartDate } from "@/modules/taxpayers/start-date";
import {
  deleteDraft,
  emitInvoice,
  formatInvoiceNumber,
  getAuthorizedInvoice,
  listInvoices,
  listRecipients,
  findSavedRecipient,
  recipientLabel,
  MAX_DAYS_BACK,
  MAX_ITEMS,
  saveDraft,
  START_DATE_MISSING_TO_EMIT,
  type DraftInput,
} from "@/modules/billing/service";
import { activeTaxpayer, chooseTaxpayer, showMenu } from "./flows-home";
import { ymOffset } from "./flows-info";
import { paginate, type Ctx } from "./core";
import { T } from "./copy";
import { actions, on, textSteps } from "./registry";

// Facturación guiada sobre el facturador existente (modo demo): el borrador se guarda con saveDraft, el total lo
// calcula el servidor y la confirmación usa emitInvoice (simulación, sin validez fiscal). No hay emisión real.

type Item = { description: string; quantity: string; unitPrice: string };
type Recipient =
  | { mode: "existente"; id: string; label: string }
  | { mode: "nuevo"; name: string; docType: string; docNumber: string; taxCondition: string; save: boolean; alias?: string | null };
type InvoiceDraft = {
  taxpayerId: string;
  draftId?: string;
  recipient?: Recipient;
  newRecipient?: Record<string, unknown>;
  items: Item[];
  current?: Partial<Item>;
  issueDate?: string;
  editing?: "receptor" | "conceptos" | "fecha";
  freq?: string[];
  lastPrompt?: string;
};
const inv = (ctx: Ctx) => ctx.conv.data as unknown as InvoiceDraft;
const inFlow = (ctx: Ctx) => ctx.conv.flow === "factura";

on("m.fact", async (ctx) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "m.fact");
  ctx.list(`Facturación de ${tp.name} (simulada: todavía sin conexión con ARCA). ¿Qué querés hacer?`, "Ver opciones", [
    { title: "Preparar factura", a: "f.nueva" },
    { title: "Ver comprobantes", a: "f.ver" },
    { title: "Continuar borrador", a: "f.borradores", v: "0" },
    { title: "Consultar una operación", desc: "Preguntarle al estudio", a: "f.op" },
    { title: T.menu, a: "menu" },
  ]);
});

// ───────────── Preparar factura ─────────────

on("f.nueva", async (ctx) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "f.nueva");
  ctx.conv.flow = "factura";
  ctx.conv.data = { taxpayerId: tp.id, items: [], lastPrompt: "f.contrib" } satisfies InvoiceDraft;
  ctx.buttons(`Vas a preparar una factura C para ${tp.name}. Es una simulación: no tiene validez fiscal ni se envía a ARCA. ¿Seguimos?`, [
    { title: "Sí, continuar", a: "f.receptor", v: "0" },
    { title: "Otro contribuyente", a: "m.cambiar" },
    { title: T.cancel, a: "cancel" },
  ]);
});
on("f.contrib", async (ctx) => {
  return actions["f.nueva"](ctx);
});

on("f.receptor", async (ctx, v) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  const d = inv(ctx);
  d.lastPrompt = "f.receptor";
  const recipients = await listRecipients(d.taxpayerId);
  const page = Number(v ?? 0);
  const per = 6;
  const slice = recipients.slice(page * per, page * per + per);
  ctx.list(
    recipients.length ? "¿A quién le facturás? Elegí un receptor guardado o agregá uno." : "Todavía no tenés receptores guardados. Agregá uno.",
    "Elegir receptor",
    [
      ...slice.map((r) => ({ title: recipientLabel(r), desc: `${TAX_CONDITION_LABEL[r.taxCondition] ?? r.taxCondition}${r.docNumber ? ` · ${r.docType} ${r.docNumber}` : ""}`, a: "f.rsel", v: r.id })),
      ...(recipients.length > (page + 1) * per ? [{ title: T.more, a: "f.receptor", v: String(page + 1) }] : []),
      ...(recipients.length > per ? [{ title: "Buscar receptor", a: "f.buscar" }] : []),
      { title: "Nuevo receptor", a: "f.rnuevo" },
      { title: T.cancel, a: "f.cancelar" },
    ],
  );
});

on("f.rsel", async (ctx, id) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  const d = inv(ctx);
  // El receptor tiene que ser de este contribuyente.
  const r = id ? (await listRecipients(d.taxpayerId)).find((x) => x.id === id) : null;
  if (!r) return showMenu(ctx);
  d.recipient = { mode: "existente", id: r.id, label: recipientLabel(r) };
  return afterRecipient(ctx);
});

on("f.buscar", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  ctx.buttons("Escribí parte del nombre o del CUIT/DNI del receptor.", [{ title: T.back, a: "f.receptor", v: "0" }]);
  ctx.expect("f.buscar");
});
textSteps["f.buscar"] = async (ctx, text) => {
  const d = inv(ctx);
  const q = text.trim().toLowerCase();
  const found = (await listRecipients(d.taxpayerId)).filter((r) => recipientLabel(r).toLowerCase().includes(q) || (r.docNumber ?? "").includes(q.replace(/\D/g, "") || "§"));
  ctx.conv.step = null;
  if (found.length === 0) {
    ctx.buttons(`No encontré receptores con "${text.trim()}".`, [
      { title: "Buscar de nuevo", a: "f.buscar" },
      { title: "Nuevo receptor", a: "f.rnuevo" },
      { title: T.back, a: "f.receptor", v: "0" },
    ]);
    return;
  }
  ctx.list("Encontré estos receptores:", "Elegir receptor", [
    ...found.slice(0, 8).map((r) => ({ title: recipientLabel(r), desc: r.docNumber ? `${r.docType} ${r.docNumber}` : undefined, a: "f.rsel", v: r.id })),
    { title: T.back, a: "f.receptor", v: "0" },
  ]);
};

// Receptor nuevo (orden pedido en el testing): CUIT → validación → datos fiscales (del padrón si hay consulta
// conectada; si no, a mano) → nombre para guardarlo → confirmación. Para consumidor final sin CUIT: DNI o sin
// identificar. La razón social es el dato fiscal; el alias solo identifica al receptor dentro de ContadorIA.
type NewRecipient = {
  docType?: string;
  docNumber?: string;
  name?: string;
  taxCondition?: string;
  source?: string; // de dónde salió la razón social (solo si la dio una consulta real)
  alias?: string | null;
  save?: boolean;
};
const nr = (ctx: Ctx) => (inv(ctx).newRecipient ??= {}) as NewRecipient;
const backToList = { title: T.back, a: "f.receptor", v: "0" };

on("f.rnuevo", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  inv(ctx).newRecipient = {};
  inv(ctx).lastPrompt = "f.rnuevo";
  ctx.buttons("Escribí el CUIT del receptor (11 números, con o sin guiones). Si es un consumidor final sin CUIT, tocá Sin CUIT.", [
    { title: "Sin CUIT", a: "f.rsincuit" },
    backToList,
  ]);
  ctx.expect("f.rcuit");
});

textSteps["f.rcuit"] = async (ctx, text) => {
  const d = inv(ctx);
  const cuit = normalizeCuit(text);
  if (!isValidCuit(cuit)) {
    // Solo se valida el formato y el dígito verificador: eso no confirma que el CUIT esté inscripto.
    ctx.say(`Ese CUIT no es válido: ${cuitProblem(cuit)} Revisalo y escribilo de nuevo.`);
    ctx.expect("f.rcuit");
    return;
  }
  ctx.conv.step = null;
  // Ya guardado para este contribuyente: se ofrece reutilizarlo en lugar de duplicarlo.
  const saved = await findSavedRecipient(d.taxpayerId, "CUIT", cuit);
  if (saved) {
    ctx.buttons(`Ya tenés guardado a ${recipientLabel(saved)} con el CUIT ${formatCuit(cuit)}.`, [
      { title: "Usar ese receptor", a: "f.rsel", v: saved.id },
      { title: "Escribir otro CUIT", a: "f.rnuevo" },
      backToList,
    ]);
    return;
  }
  d.newRecipient = { docType: "CUIT", docNumber: cuit };
  const found = await lookupCuit(cuit);
  if (found.status === "ENCONTRADO") {
    Object.assign(nr(ctx), { name: found.legalName, source: found.source, taxCondition: found.taxCondition ?? undefined });
    ctx.say(
      `Datos de ${found.source} para el CUIT ${formatCuit(cuit)}:\n• Razón social: ${found.legalName}${
        found.taxCondition ? `\n• Condición frente al IVA: ${TAX_CONDITION_LABEL[found.taxCondition] ?? found.taxCondition}` : ""
      }`,
    );
    return found.taxCondition && TAX_CONDITION_LABEL[found.taxCondition] ? askHowToSave(ctx) : askTaxCondition(ctx);
  }
  ctx.say(
    found.status === "NO_ENCONTRADO"
      ? `${found.source} no tiene datos para el CUIT ${formatCuit(cuit)}. Revisá el número; si es correcto, cargá los datos a mano.`
      : `No pude consultar la razón social: ${found.reason}. El CUIT tiene un formato válido, pero eso no confirma que esté inscripto.`,
  );
  ctx.buttons("Escribí la razón social tal como figura en la constancia de inscripción del receptor.", [
    { title: "Escribir otro CUIT", a: "f.rnuevo" },
    backToList,
  ]);
  ctx.expect("f.rrazon");
};

textSteps["f.rrazon"] = async (ctx, text) => {
  const name = text.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) {
    ctx.say("La razón social tiene que tener entre 2 y 120 caracteres. Probá de nuevo.");
    ctx.expect("f.rrazon");
    return;
  }
  ctx.conv.step = null;
  nr(ctx).name = name;
  return askTaxCondition(ctx);
};

function askTaxCondition(ctx: Ctx) {
  const n = nr(ctx);
  // Con CUIT se puede facturar a cualquier condición; sin CUIT, solo a consumidor final.
  const options = Object.entries(TAX_CONDITION_LABEL).filter(([value]) => n.docType === "CUIT" || value === "CONSUMIDOR_FINAL");
  ctx.list(`¿Cuál es la condición frente al IVA de ${n.name}?`, "Elegir condición", [
    ...options.map(([value, label]) => ({ title: label, a: "f.riva", v: value })),
    backToList,
  ]);
}

on("f.riva", async (ctx, v) => {
  const n = inv(ctx).newRecipient as NewRecipient | undefined;
  if (!inFlow(ctx) || !n?.name || !n.docType || !v || !TAX_CONDITION_LABEL[v]) return showMenu(ctx);
  if (n.docType !== "CUIT" && v !== "CONSUMIDOR_FINAL") return askTaxCondition(ctx);
  n.taxCondition = v;
  return askHowToSave(ctx);
});

on("f.rsincuit", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  inv(ctx).newRecipient = { taxCondition: "CONSUMIDOR_FINAL" };
  ctx.buttons("Sin CUIT solo se puede facturar a un consumidor final. ¿Cómo se identifica?", [
    { title: "DNI", a: "f.rdoc", v: "DNI" },
    { title: "Sin identificar", a: "f.rdoc", v: "SIN_IDENTIFICAR" },
    backToList,
  ]);
});
on("f.rdoc", async (ctx, v) => {
  if (!inFlow(ctx) || (v !== "DNI" && v !== "SIN_IDENTIFICAR")) return showMenu(ctx);
  const n = nr(ctx);
  n.docType = v;
  n.taxCondition = "CONSUMIDOR_FINAL";
  if (v === "DNI") {
    ctx.buttons("Escribí el DNI (7 u 8 números).", [backToList]);
    ctx.expect("f.rnum");
    return;
  }
  n.docNumber = "";
  ctx.buttons("¿A nombre de quién va la factura? Escribí el nombre y apellido (o Consumidor final).", [backToList]);
  ctx.expect("f.rnombre");
});
textSteps["f.rnum"] = async (ctx, text) => {
  const d = inv(ctx);
  // Conversación empezada con el recorrido anterior (pedía el CUIT en este paso): sigue con el nuevo.
  if ((d.newRecipient as NewRecipient | undefined)?.docType === "CUIT") return textSteps["f.rcuit"](ctx, text);
  const digits = text.replace(/\D/g, "");
  if (!/^\d{7,8}$/.test(digits)) {
    ctx.say("El DNI tiene que tener 7 u 8 números.");
    ctx.expect("f.rnum");
    return;
  }
  ctx.conv.step = null;
  const saved = await findSavedRecipient(d.taxpayerId, "DNI", digits);
  if (saved) {
    ctx.buttons(`Ya tenés guardado a ${recipientLabel(saved)} con el DNI ${digits}.`, [
      { title: "Usar ese receptor", a: "f.rsel", v: saved.id },
      { title: "Cargar otro", a: "f.rnuevo" },
      backToList,
    ]);
    return;
  }
  nr(ctx).docNumber = digits;
  ctx.buttons("¿A nombre de quién va la factura? Escribí el nombre y apellido.", [backToList]);
  ctx.expect("f.rnombre");
};
textSteps["f.rnombre"] = async (ctx, text) => {
  // Conversación empezada con el recorrido anterior (pedía el nombre antes del documento): se retoma con el nuevo
  // orden, sin trabar a la persona.
  if (!nr(ctx).docType) {
    ctx.say("Cambiamos el orden para cargar receptores: primero el CUIT y después los datos.");
    return actions["f.rnuevo"](ctx);
  }
  const name = text.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) {
    ctx.say("El nombre tiene que tener entre 2 y 120 caracteres. Probá de nuevo.");
    ctx.expect("f.rnombre");
    return;
  }
  ctx.conv.step = null;
  nr(ctx).name = name;
  return askHowToSave(ctx);
};

function askHowToSave(ctx: Ctx) {
  const n = nr(ctx);
  ctx.buttons(`¿Cómo guardamos a ${n.name} para las próximas facturas?`, [
    { title: n.docType === "CUIT" ? "Con la razón social" : "Con ese nombre", a: "f.rguardar", v: "nombre" },
    { title: "Con otro nombre", a: "f.ralias" },
    { title: "Solo esta vez", a: "f.rguardar", v: "no" },
  ]);
}
on("f.ralias", async (ctx) => {
  if (!inFlow(ctx) || !nr(ctx).name) return showMenu(ctx);
  ctx.buttons(`Escribí cómo querés verlo en tu lista (por ejemplo "Cliente del alquiler"). En la factura sigue saliendo ${nr(ctx).name}.`, [
    { title: T.back, a: "f.rcomo" },
  ]);
  ctx.expect("f.raliastxt");
});
on("f.rcomo", async (ctx) => (inFlow(ctx) && nr(ctx).name ? askHowToSave(ctx) : showMenu(ctx)));
textSteps["f.raliastxt"] = async (ctx, text) => {
  const alias = text.trim().replace(/\s+/g, " ");
  if (alias.length < 2 || alias.length > 60) {
    ctx.say("Ese nombre tiene que tener entre 2 y 60 caracteres. Probá de nuevo.");
    ctx.expect("f.raliastxt");
    return;
  }
  ctx.conv.step = null;
  Object.assign(nr(ctx), { alias, save: true });
  return confirmRecipient(ctx);
};
on("f.rguardar", async (ctx, v) => {
  const n = inv(ctx).newRecipient as NewRecipient | undefined;
  if (!inFlow(ctx) || !n?.name || !n.taxCondition || !n.docType) return showMenu(ctx);
  Object.assign(n, { alias: null, save: v !== "no" });
  return confirmRecipient(ctx);
});

function confirmRecipient(ctx: Ctx) {
  const n = nr(ctx);
  const doc = n.docType === "SIN_IDENTIFICAR" ? "sin identificar" : `${n.docType} ${n.docType === "CUIT" ? formatCuit(n.docNumber!) : n.docNumber}`;
  ctx.say(
    `Receptor:\n• ${n.docType === "CUIT" ? "Razón social" : "Nombre"}: ${n.name}${n.source ? ` (dato de ${n.source})` : ""}\n• Documento: ${doc}\n• Condición frente al IVA: ${
      TAX_CONDITION_LABEL[n.taxCondition!] ?? n.taxCondition
    }\n• ${n.save ? `Se guarda como: ${n.alias ?? n.name}` : "No se guarda (solo esta factura)"}`,
  );
  ctx.buttons("¿Está bien?", [
    { title: "Confirmar y seguir", a: "f.rok" },
    { title: "Corregir", a: "f.rnuevo" },
    { title: T.cancel, a: "f.cancelar" },
  ]);
}
on("f.rok", async (ctx) => {
  const d = inv(ctx);
  const n = d.newRecipient as NewRecipient | undefined;
  if (!inFlow(ctx) || !n?.name || !n.taxCondition || !n.docType) return showMenu(ctx);
  d.recipient = {
    mode: "nuevo",
    name: n.name,
    docType: n.docType,
    docNumber: n.docNumber ?? "",
    taxCondition: n.taxCondition,
    save: Boolean(n.save),
    alias: n.alias ?? null,
  };
  delete d.newRecipient;
  return afterRecipient(ctx);
});

async function afterRecipient(ctx: Ctx) {
  const d = inv(ctx);
  if (d.editing === "receptor") {
    d.editing = undefined;
    return saveAndSummarize(ctx);
  }
  return askConcept(ctx);
}

async function askConcept(ctx: Ctx) {
  const d = inv(ctx);
  d.lastPrompt = "f.concepto";
  // Conceptos frecuentes: los de las facturas anteriores de este contribuyente.
  const items = await prisma.invoiceItem.findMany({
    where: { invoice: { taxpayerId: d.taxpayerId, source: INVOICE_SOURCE.FACTURADOR } },
    orderBy: { invoice: { createdAt: "desc" } },
    select: { description: true },
    take: 50,
  });
  d.freq = [...new Set(items.map((i) => i.description))].slice(0, 6);
  const n = d.items.length + 1;
  if (d.freq.length === 0) {
    ctx.buttons(`Concepto ${n}: escribí la descripción (por ejemplo "Diseño de logo").`, [{ title: T.cancel, a: "f.cancelar" }]);
    ctx.expect("f.cdesc");
    return;
  }
  ctx.list(`Concepto ${n}: elegí uno que ya usaste o escribí uno nuevo.`, "Elegir concepto", [
    ...d.freq.map((desc, i) => ({ title: desc, a: "f.cfreq", v: String(i) })),
    { title: "Escribir otro concepto", a: "f.cotro" },
    { title: T.cancel, a: "f.cancelar" },
  ]);
}
on("f.concepto", async (ctx) => (inFlow(ctx) ? askConcept(ctx) : showMenu(ctx)));
on("f.cotro", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  ctx.buttons("Escribí la descripción del concepto.", [{ title: T.cancel, a: "f.cancelar" }]);
  ctx.expect("f.cdesc");
});
on("f.cfreq", async (ctx, v) => {
  const d = inv(ctx);
  const desc = d.freq?.[Number(v)];
  if (!inFlow(ctx) || !desc) return showMenu(ctx);
  d.current = { description: desc };
  return askQuantity(ctx);
});
textSteps["f.cdesc"] = async (ctx, text) => {
  const desc = text.trim();
  if (desc.length < 2 || desc.length > 200) {
    ctx.say("La descripción tiene que tener entre 2 y 200 caracteres.");
    ctx.expect("f.cdesc");
    return;
  }
  inv(ctx).current = { description: desc };
  ctx.conv.step = null;
  return askQuantity(ctx);
};
async function askQuantity(ctx: Ctx) {
  ctx.buttons(`¿Qué cantidad de "${inv(ctx).current!.description}"?`, [
    { title: "1", a: "f.cant", v: "1" },
    { title: "2", a: "f.cant", v: "2" },
    { title: "Otra cantidad", a: "f.cantotra" },
  ]);
}
on("f.cant", async (ctx, v) => {
  if (!inFlow(ctx) || !inv(ctx).current) return showMenu(ctx);
  inv(ctx).current!.quantity = v === "2" ? "2" : "1";
  return askPrice(ctx);
});
on("f.cantotra", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  ctx.buttons("Escribí la cantidad (hasta 3 decimales, por ejemplo 1,5).", [{ title: T.cancel, a: "f.cancelar" }]);
  ctx.expect("f.cantidad");
});
textSteps["f.cantidad"] = async (ctx, text) => {
  const q = parseQuantityMilli(text);
  if (q === null || q <= 0) {
    ctx.say("No pude interpretar la cantidad. Escribila como 3 o 1,5.");
    ctx.expect("f.cantidad");
    return;
  }
  inv(ctx).current!.quantity = text.trim();
  ctx.conv.step = null;
  return askPrice(ctx);
};
async function askPrice(ctx: Ctx) {
  ctx.buttons("Escribí el precio unitario. Por ejemplo 15000 o 15000,50.", [{ title: T.cancel, a: "f.cancelar" }]);
  ctx.expect("f.precio");
}
textSteps["f.precio"] = async (ctx, text) => {
  const price = parseAmountToCents(text);
  if (price === null || price <= 0n) {
    ctx.say(T.invalidAmount);
    ctx.expect("f.precio");
    return;
  }
  const d = inv(ctx);
  d.items.push({ description: d.current!.description!, quantity: d.current!.quantity ?? "1", unitPrice: text.trim() });
  d.current = undefined;
  ctx.conv.step = null;
  if (d.editing === "conceptos") return editConcepts(ctx);
  return askMore(ctx);
};
async function askMore(ctx: Ctx) {
  const d = inv(ctx);
  d.lastPrompt = "f.mas";
  ctx.buttons(`Agregué "${d.items.at(-1)!.description}". Llevás ${d.items.length} ${d.items.length === 1 ? "concepto" : "conceptos"}.`, [
    ...(d.items.length < MAX_ITEMS ? [{ title: "Otro concepto", a: "f.concepto" }] : []),
    { title: "Continuar", a: "f.fecha" },
    { title: T.cancel, a: "f.cancelar" },
  ]);
}
on("f.mas", async (ctx) => (inFlow(ctx) && inv(ctx).items.length ? askMore(ctx) : showMenu(ctx)));

on("f.fecha", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  inv(ctx).lastPrompt = "f.fecha";
  const today = todayAR();
  ctx.buttons(`¿Qué fecha lleva la factura? Puede ser hasta ${MAX_DAYS_BACK} días anterior a hoy.`, [
    { title: `Hoy (${formatDateAR(today).slice(0, 5)})`, a: "f.fsel", v: today },
    { title: "Otra fecha", a: "f.fotra" },
    { title: T.cancel, a: "f.cancelar" },
  ]);
});
on("f.fotra", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  const today = todayAR();
  ctx.list("Elegí la fecha:", "Elegir fecha", [
    ...Array.from({ length: Math.min(MAX_DAYS_BACK, 9) }, (_, i) => addDaysYmd(today, -(i + 1))).map((d) => ({ title: formatDateAR(d), a: "f.fsel", v: d })),
    { title: T.back, a: "f.fecha" },
  ]);
});
on("f.fsel", async (ctx, v) => {
  if (!inFlow(ctx) || !v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return showMenu(ctx);
  inv(ctx).issueDate = v;
  inv(ctx).editing = undefined;
  return saveAndSummarize(ctx);
});

function draftInput(d: InvoiceDraft): DraftInput {
  const r = d.recipient!;
  return {
    issueDate: d.issueDate ?? todayAR(),
    recipientMode: r.mode,
    recipientId: r.mode === "existente" ? r.id : "",
    recipientName: r.mode === "nuevo" ? r.name : "",
    docType: r.mode === "nuevo" ? r.docType : "",
    docNumber: r.mode === "nuevo" ? r.docNumber : "",
    taxCondition: r.mode === "nuevo" ? r.taxCondition : "",
    saveRecipient: r.mode === "nuevo" ? r.save : false,
    recipientAlias: r.mode === "nuevo" ? (r.alias ?? "") : "",
    items: d.items,
  };
}

/** Guarda el borrador (el servidor calcula el total) y muestra el resumen con lo que quedó guardado. */
async function saveAndSummarize(ctx: Ctx) {
  const d = inv(ctx);
  if (!inFlow(ctx) || !d.recipient || d.items.length === 0) return showMenu(ctx);
  if (!(await getAuthorizedTaxpayer(ctx.user, d.taxpayerId))) {
    ctx.resetFlow();
    ctx.say(T.noLongerAccess);
    return showMenu(ctx);
  }
  const result = await saveDraft(ctx.user, d.taxpayerId, draftInput(d), d.draftId);
  if (!result.ok || !result.invoiceId) {
    const detail = "fieldErrors" in result && result.fieldErrors ? Object.values(result.fieldErrors).join(" ") : "";
    ctx.say(`No pude guardar el borrador: ${result.message} ${detail}`.trim());
    ctx.buttons("¿Qué hacemos?", [
      { title: "Corregir datos", a: "f.corregir" },
      { title: T.cancel, a: "f.cancelar" },
    ]);
    return;
  }
  d.draftId = result.invoiceId;
  // Si se guardó un receptor nuevo, de acá en adelante se usa el guardado.
  const saved = await getAuthorizedInvoice(ctx.user, result.invoiceId);
  if (saved?.recipientId && d.recipient.mode === "nuevo") d.recipient = { mode: "existente", id: saved.recipientId, label: saved.recipientName };
  return showSummary(ctx);
}

async function showSummary(ctx: Ctx) {
  const d = inv(ctx);
  const invoice = d.draftId ? await getAuthorizedInvoice(ctx.user, d.draftId) : null;
  if (!invoice || invoice.status !== INVOICE_STATUS.BORRADOR) {
    ctx.resetFlow();
    ctx.say("Ese borrador ya no está disponible.");
    return showMenu(ctx);
  }
  d.lastPrompt = "f.resumen";
  ctx.say(
    `Borrador guardado. Revisá la factura (calculada por el servidor):\n• Emisor: ${invoice.taxpayer.name}\n• Receptor: ${invoice.recipientName}${
      invoice.recipientDocNumber ? ` (${invoice.recipientDocType} ${invoice.recipientDocNumber})` : ""
    } · ${TAX_CONDITION_LABEL[invoice.recipientTaxCondition ?? ""] ?? ""}\n• Fecha: ${formatDateAR(invoice.issueDate)}\n${invoice.items
      .map((i) => `• ${i.description}: ${formatQuantity(i.quantityMilli)} × ${formatARS(i.unitPriceCents)} = ${formatARS(i.subtotalCents)}`)
      .join("\n")}\n• Total: ${formatARS(invoice.amountCents)}\n\nConfirmar genera una factura simulada, sin CAE y sin validez fiscal (todavía no hay conexión con ARCA).`,
  );
  ctx.list("¿Qué querés hacer?", "Ver opciones", [
    { title: "Confirmar simulación", desc: "Emitir la factura simulada", a: "f.emitir" },
    { title: "Corregir datos", a: "f.corregir" },
    { title: "Guardar borrador", desc: "Seguir en otro momento", a: "f.guardarb" },
    { title: T.cancel, desc: "Descartar el borrador", a: "f.cancelar" },
  ]);
}
on("f.resumen", async (ctx) => (inFlow(ctx) ? showSummary(ctx) : showMenu(ctx)));

on("f.emitir", async (ctx) => {
  const d = inv(ctx);
  if (!inFlow(ctx) || !d.draftId) return showMenu(ctx);
  if (!(await getAuthorizedTaxpayer(ctx.user, d.taxpayerId))) {
    ctx.resetFlow();
    ctx.say(T.noLongerAccess);
    return showMenu(ctx);
  }
  // La fecha de inicio de actividad va impresa en la factura y ya no se pide en el alta: se pide acá si falta.
  const tp = await getAuthorizedTaxpayer(ctx.user, d.taxpayerId);
  if (tp && !tp.startDate) {
    d.lastPrompt = "f.resumen";
    ctx.buttons(
      `${START_DATE_MISSING_TO_EMIT}\n\nEscribí la fecha de inicio de actividad de ${tp.name} como figura en la constancia de inscripción de ARCA (por ejemplo 15/03/2022).`,
      [
        { title: "Guardar borrador", a: "f.guardarb" },
        { title: "Ver resumen", a: "f.resumen" },
      ],
    );
    ctx.expect("f.inicio");
    return;
  }
  // La clave sale del evento: si el mismo mensaje se reintenta, no se emite dos veces.
  const result = await emitInvoice(ctx.user, d.draftId, `wa-${ctx.eventRef}`, false);
  const invoice = await getAuthorizedInvoice(ctx.user, d.draftId);
  if (!result.ok || !invoice) {
    ctx.say(`No se pudo emitir: ${result.message}`);
    ctx.buttons("¿Qué hacemos?", [
      { title: "Ver resumen", a: "f.resumen" },
      { title: T.menu, a: "menu" },
    ]);
    return;
  }
  ctx.resetFlow();
  ctx.say(
    invoice.status === INVOICE_STATUS.SIMULADO
      ? `Factura simulada ${formatInvoiceNumber(invoice.invoiceType, invoice.pointOfSale, invoice.number)} emitida a ${invoice.recipientName} por ${formatARS(
          invoice.amountCents,
        )}. Es simulada: sin CAE y sin validez fiscal.\nEl PDF se descarga en la web con tu sesión: ${ctx.origin}/facturas/${invoice.id}/pdf`
      : `Resultado: ${STATUS_LABEL[invoice.status] ?? invoice.status}. ${invoice.rejectionReason ?? ""}`.trim(),
  );
  ctx.buttons("¿Algo más?", [
    { title: "Ver comprobantes", a: "f.ver" },
    { title: T.menu, a: "menu" },
  ]);
});

textSteps["f.inicio"] = async (ctx, text) => {
  const d = inv(ctx);
  if (!inFlow(ctx) || !d.draftId) return showMenu(ctx);
  const result = await setStartDate(ctx.user, d.taxpayerId, text);
  if (!result.ok) {
    ctx.say(`${Object.values(result.fieldErrors ?? {})[0] ?? result.message} Escribila de nuevo (dd/mm/aaaa).`);
    ctx.expect("f.inicio");
    return;
  }
  ctx.conv.step = null;
  // Se vuelve al resumen: la emisión se confirma de nuevo, a propósito.
  ctx.say(result.message);
  return showSummary(ctx);
};

on("f.guardarb", async (ctx) => {
  const d = inv(ctx);
  if (!inFlow(ctx) || !d.draftId) return showMenu(ctx);
  ctx.resetFlow();
  ctx.say("El borrador quedó guardado. Lo retomás en Facturación → Continuar borrador, acá o en la web.");
  ctx.buttons("¿Algo más?", [{ title: T.menu, a: "menu" }]);
});

on("f.cancelar", async (ctx) => {
  const d = inv(ctx);
  if (!inFlow(ctx)) return showMenu(ctx);
  if (!d.draftId) {
    ctx.resetFlow();
    ctx.say(T.cancelled);
    return showMenu(ctx);
  }
  ctx.buttons("¿Descartamos el borrador? No se puede deshacer.", [
    { title: "Descartar borrador", a: "f.descartar", v: d.draftId },
    { title: "Guardar borrador", a: "f.guardarb" },
    { title: "Volver al resumen", a: "f.resumen" },
  ]);
});

on("f.descartar", async (ctx, id) => {
  // Solo borradores: un comprobante emitido nunca se descarta (lo valida deleteDraft).
  const result = id ? await deleteDraft(ctx.user, id) : { ok: false, message: "No encontramos el borrador." };
  ctx.resetFlow();
  ctx.say(result.ok ? "Descartamos el borrador." : result.message);
  ctx.buttons("¿Algo más?", [
    { title: "Facturación", a: "m.fact" },
    { title: T.menu, a: "menu" },
  ]);
});

on("f.corregir", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  ctx.list("¿Qué querés corregir? Lo demás se conserva.", "Elegir", [
    { title: "Receptor", a: "f.ed", v: "receptor" },
    { title: "Conceptos", a: "f.ed", v: "conceptos" },
    { title: "Fecha", a: "f.ed", v: "fecha" },
    { title: "Volver al resumen", a: "f.resumen" },
  ]);
});
on("f.ed", async (ctx, v) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  const d = inv(ctx);
  if (v === "receptor") {
    d.editing = "receptor";
    return actions["f.receptor"](ctx, "0");
  }
  if (v === "fecha") {
    d.editing = "fecha";
    return actions["f.fecha"](ctx);
  }
  d.editing = "conceptos";
  return editConcepts(ctx);
});
async function editConcepts(ctx: Ctx) {
  const d = inv(ctx);
  ctx.list(
    `Conceptos actuales:\n${d.items.map((i, n) => `${n + 1}. ${i.description} — ${i.quantity} × ${i.unitPrice}`).join("\n")}`,
    "Elegir",
    [
      ...(d.items.length > 1 ? d.items.slice(0, 6).map((i, n) => ({ title: `Quitar ${n + 1}`, desc: i.description, a: "f.quitar", v: String(n) })) : []),
      ...(d.items.length < MAX_ITEMS ? [{ title: "Agregar concepto", a: "f.concepto" }] : []),
      { title: "Listo", desc: "Guardar y ver el resumen", a: "f.edlisto" },
    ],
  );
}
on("f.quitar", async (ctx, v) => {
  const d = inv(ctx);
  if (!inFlow(ctx) || d.items.length < 2) return showMenu(ctx);
  d.items.splice(Number(v), 1);
  return editConcepts(ctx);
});
on("f.edlisto", async (ctx) => {
  if (!inFlow(ctx)) return showMenu(ctx);
  inv(ctx).editing = undefined;
  return saveAndSummarize(ctx);
});

// ───────────── Ver comprobantes y borradores ─────────────

const PERIODS: Record<string, { label: string; range: () => { from: string; to: string } }> = {
  mes: { label: "Este mes", range: () => ({ from: `${ymOffset(0)}-01`, to: todayAR() }) },
  prev: { label: "Mes anterior", range: () => ({ from: `${ymOffset(-1)}-01`, to: addDaysYmd(`${ymOffset(0)}-01`, -1) }) },
  anio: { label: "Este año", range: () => ({ from: `${todayAR().slice(0, 4)}-01-01`, to: todayAR() }) },
  doce: { label: "Últimos 12 meses", range: () => ({ from: `${ymOffset(-11)}-01`, to: todayAR() }) },
};
const STATES: Record<string, { label: string; status?: string }> = {
  todos: { label: "Todos" },
  emitidas: { label: "Emitidas (simulación)", status: INVOICE_STATUS.SIMULADO },
  borradores: { label: "Borradores", status: INVOICE_STATUS.BORRADOR },
  rechazadas: { label: "Rechazadas", status: INVOICE_STATUS.RECHAZADO },
};

on("f.ver", async (ctx) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "f.ver");
  ctx.list("¿De qué período?", "Elegir período", [
    ...Object.entries(PERIODS).map(([k, p]) => ({ title: p.label, a: "f.ver.p", v: k })),
    { title: T.back, a: "m.fact" },
  ]);
});
on("f.ver.p", async (ctx, v) => {
  if (!v || !PERIODS[v]) return showMenu(ctx);
  ctx.list("¿Qué comprobantes?", "Elegir estado", [
    ...Object.entries(STATES).map(([k, s]) => ({ title: s.label, a: "f.ver.l", v: `${v}|${k}|1` })),
    { title: T.back, a: "f.ver" },
  ]);
});
on(
  "f.ver.l",
  async (ctx, v) => {
    const tp = await activeTaxpayer(ctx);
    if (!tp) return chooseTaxpayer(ctx, "f.ver");
    const [per, st, pageRaw] = (v ?? "").split("|");
    if (!PERIODS[per] || !STATES[st]) return showMenu(ctx);
    const { from, to } = PERIODS[per].range();
    const page = Math.max(1, Number(pageRaw) || 1);
    const { rows, pageCount } = await listInvoices(tp.id, { status: STATES[st].status, from, to, page }, 8);
    if (rows.length === 0) {
      ctx.say(`Sin comprobantes ${STATES[st].label.toLowerCase()} del ${formatDateAR(from)} al ${formatDateAR(to)}.`);
      ctx.buttons("¿Qué hacemos?", [
        { title: "Otro período", a: "f.ver" },
        { title: "Preparar factura", a: "f.nueva" },
        { title: T.menu, a: "menu" },
      ]);
      return;
    }
    ctx.list(`Comprobantes del ${formatDateAR(from)} al ${formatDateAR(to)} (página ${page} de ${pageCount}):`, "Ver comprobantes", [
      ...rows.map((i) => ({
        title: i.number ? formatInvoiceNumber(i.invoiceType, i.pointOfSale, i.number) : "Borrador",
        desc: `${formatDateAR(i.issueDate)} · ${i.recipientName} · ${formatARS(i.amountCents)}`,
        a: "f.det",
        v: i.id,
      })),
      ...(page < pageCount ? [{ title: T.more, a: "f.ver.l", v: `${per}|${st}|${page + 1}` }] : []),
      { title: T.back, a: "f.ver" },
    ]);
  },
  { readOnly: true },
);

on(
  "f.det",
  async (ctx, id) => {
    const invoice = id ? await getAuthorizedInvoice(ctx.user, id) : null;
    if (!invoice || invoice.taxpayerId !== ctx.taxpayerId || invoice.source !== INVOICE_SOURCE.FACTURADOR) {
      ctx.say("Ese comprobante no está disponible.");
      return showMenu(ctx);
    }
    ctx.say(
      `${invoice.number ? formatInvoiceNumber(invoice.invoiceType, invoice.pointOfSale, invoice.number) : "Borrador"} · ${STATUS_LABEL[invoice.status] ?? invoice.status}\n• Fecha: ${formatDateAR(
        invoice.issueDate,
      )}\n• Receptor: ${invoice.recipientName}\n${invoice.items.map((i) => `• ${i.description}: ${formatARS(i.subtotalCents)}`).join("\n")}\n• Total: ${formatARS(invoice.amountCents)}`,
    );
    ctx.list("¿Qué querés hacer?", "Ver opciones", [
      ...(invoice.status === INVOICE_STATUS.SIMULADO ? [{ title: "Obtener comprobante", desc: "PDF en la web, con tu sesión", a: "f.pdf", v: invoice.id }] : []),
      ...(invoice.status === INVOICE_STATUS.BORRADOR ? [{ title: "Retomar borrador", a: "f.retomar", v: invoice.id }] : []),
      { title: "Consultar al estudio", a: "f.op.sel", v: invoice.id },
      { title: T.back, a: "f.ver" },
    ]);
  },
  { readOnly: true },
);
on(
  "f.pdf",
  async (ctx, id) => {
    const invoice = id ? await getAuthorizedInvoice(ctx.user, id) : null;
    if (!invoice || invoice.status !== INVOICE_STATUS.SIMULADO) return showMenu(ctx);
    ctx.say(`El PDF (simulación, sin validez fiscal) se descarga en la web con tu sesión iniciada: ${ctx.origin}/facturas/${invoice.id}/pdf\nEl enlace no sirve para otra persona.`);
    ctx.buttons("¿Algo más?", [{ title: T.menu, a: "menu" }]);
  },
  { readOnly: true },
);

on(
  "f.borradores",
  async (ctx, v) => {
    const tp = await activeTaxpayer(ctx);
    if (!tp) return chooseTaxpayer(ctx, "m.fact");
    const page = Math.max(1, Number(v) || 1);
    const { rows, pageCount } = await listInvoices(tp.id, { status: INVOICE_STATUS.BORRADOR, page }, 8);
    if (rows.length === 0) {
      ctx.say("No tenés borradores guardados.");
      ctx.buttons("¿Querés preparar una factura?", [
        { title: "Preparar factura", a: "f.nueva" },
        { title: T.menu, a: "menu" },
      ]);
      return;
    }
    ctx.list("Tus borradores:", "Ver borradores", [
      ...rows.map((i) => ({ title: i.recipientName, desc: `${formatDateAR(i.issueDate)} · ${formatARS(i.amountCents)}`, a: "f.bdet", v: i.id })),
      ...(page < pageCount ? [{ title: T.more, a: "f.borradores", v: String(page + 1) }] : []),
      { title: T.back, a: "m.fact" },
    ]);
  },
  { readOnly: true },
);
on("f.bdet", async (ctx, id) => {
  const invoice = id ? await getAuthorizedInvoice(ctx.user, id) : null;
  if (!invoice || invoice.status !== INVOICE_STATUS.BORRADOR || invoice.taxpayerId !== ctx.taxpayerId) {
    ctx.say("Ese borrador ya no está disponible.");
    return showMenu(ctx);
  }
  ctx.buttons(`Borrador para ${invoice.recipientName}, del ${formatDateAR(invoice.issueDate)}, por ${formatARS(invoice.amountCents)}. ¿Qué hacemos?`, [
    { title: "Continuar", a: "f.retomar", v: invoice.id },
    { title: "Descartar", a: "f.descartar.conf", v: invoice.id },
    { title: T.back, a: "f.borradores", v: "1" },
  ]);
});
on("f.descartar.conf", async (ctx, id) => {
  ctx.buttons("¿Seguro que descartamos este borrador? No se puede deshacer.", [
    { title: "Sí, descartar", a: "f.descartar", v: id },
    { title: T.back, a: "f.borradores", v: "1" },
  ]);
});

/** Retoma un borrador guardado (en la web o en el bot) y vuelve al resumen. */
on("f.retomar", async (ctx, id) => {
  const invoice = id ? await getAuthorizedInvoice(ctx.user, id) : null;
  if (!invoice || invoice.status !== INVOICE_STATUS.BORRADOR || invoice.source !== INVOICE_SOURCE.FACTURADOR) {
    ctx.say("Ese borrador ya no está disponible.");
    return showMenu(ctx);
  }
  ctx.taxpayerId = invoice.taxpayerId;
  ctx.conv.flow = "factura";
  ctx.conv.data = {
    taxpayerId: invoice.taxpayerId,
    draftId: invoice.id,
    issueDate: invoice.issueDate,
    recipient: invoice.recipientId
      ? { mode: "existente", id: invoice.recipientId, label: invoice.recipientName }
      : {
          mode: "nuevo",
          name: invoice.recipientName,
          docType: invoice.recipientDocType ?? "SIN_IDENTIFICAR",
          docNumber: invoice.recipientDocNumber ?? "",
          taxCondition: invoice.recipientTaxCondition ?? "CONSUMIDOR_FINAL",
          save: false,
        },
    items: invoice.items.map((i) => ({
      description: i.description,
      quantity: formatQuantity(i.quantityMilli),
      unitPrice: (Number(i.unitPriceCents) / 100).toFixed(2).replace(".", ","),
    })),
  } satisfies InvoiceDraft;
  return showSummary(ctx);
});

// ───────────── Consultar una operación ─────────────

on(
  "f.op",
  async (ctx) => {
    const tp = await activeTaxpayer(ctx);
    if (!tp) return chooseTaxpayer(ctx, "f.op");
    const { rows } = await listInvoices(tp.id, {}, 8);
    if (rows.length === 0) {
      ctx.say("No hay comprobantes del facturador para consultar.");
      return showMenu(ctx);
    }
    ctx.list("¿Sobre qué comprobante es la consulta?", "Elegir comprobante", [
      ...rows.map((i) => ({
        title: i.number ? formatInvoiceNumber(i.invoiceType, i.pointOfSale, i.number) : "Borrador",
        desc: `${formatDateAR(i.issueDate)} · ${i.recipientName} · ${formatARS(i.amountCents)}`,
        a: "f.op.sel",
        v: i.id,
      })),
      { title: T.back, a: "m.fact" },
    ]);
  },
  { readOnly: true },
);
on("f.op.sel", async (ctx, id) => {
  const invoice = id ? await getAuthorizedInvoice(ctx.user, id) : null;
  if (!invoice || invoice.taxpayerId !== ctx.taxpayerId) return showMenu(ctx);
  const ref = invoice.number ? formatInvoiceNumber(invoice.invoiceType, invoice.pointOfSale, invoice.number) : `borrador del ${formatDateAR(invoice.issueDate)}`;
  ctx.conv.flow = "solicitud";
  ctx.conv.data = {
    mode: "crear",
    topic: "FACTURACION",
    subject: `Consulta sobre ${ref} (${invoice.recipientName})`.slice(0, 120),
    taxpayerId: invoice.taxpayerId,
  };
  return actions["s.cuerpo"](ctx);
});
