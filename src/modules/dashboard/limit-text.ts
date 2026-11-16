import { formatARS } from "@/lib/money";
import { formatDateAR } from "@/lib/dates";
import type { MarginInfo } from "./metrics";

// Textos del importe que queda hasta el límite de la categoría (antes "margen", que confundía en el testing).
// Lo usan el bot y la web para que digan lo mismo. Describe exactamente lo que calcula computeMargin:
//   límite anual de la categoría registrada − lo facturado en los últimos 12 meses hasta la fecha de corte.
// Es una referencia: no cambia ninguna regla ni valor de la escala.

type Available = Extract<MarginInfo, { available: true }>;

/** Título corto para la tarjeta o el renglón. */
export const LIMIT_TITLE = "Hasta el límite de tu categoría";

/** Período usado, en palabras. */
export function limitPeriod(m: Available): string {
  return `lo facturado en los últimos 12 meses (del ${formatDateAR(m.referenceFrom)} al ${formatDateAR(m.referenceTo)})`;
}

/** La frase principal: cuánto se puede facturar todavía, que llegó al límite o por cuánto lo superó. */
export function limitHeadline(m: Available): string {
  const category = `tu categoría ${m.categoryCode}`;
  if (m.marginCents > 0n) return `Podés facturar ${formatARS(m.marginCents)} más antes de alcanzar el límite de ${category}.`;
  if (m.marginCents === 0n) return `Llegaste justo al límite de ${category}: cualquier factura nueva lo supera.`;
  return `Superaste el límite de ${category} por ${formatARS(-m.marginCents)}.`;
}

/** Detalle: con qué se calcula y qué límite se usa (categoría y, si corresponde, máximo del régimen). */
export function limitDetail(m: Available): string {
  const base = `Se calcula con ${limitPeriod(m)}: ${formatARS(m.incomeCents)}, contra el límite anual de la categoría ${m.categoryCode} (${formatARS(
    m.limitCents,
  )}, escala ${m.scaleName}${m.scaleStatus === "DEMO" ? ", ficticia" : ""}).`;
  const regime =
    m.topCode && m.topLimitCents !== null
      ? m.topCode === m.categoryCode
        ? ` La ${m.categoryCode} es la categoría más alta de la escala: su límite es también el máximo del monotributo.`
        : ` El máximo del monotributo (categoría ${m.topCode}) es ${formatARS(m.topLimitCents)}.`
      : "";
  const over =
    m.marginCents < 0n ? " En la próxima recategorización podría corresponderte otra categoría: consultalo con el estudio." : "";
  return `${base}${regime}${over}`;
}

/** Todo junto, para el bot. */
export function limitText(m: MarginInfo): string {
  if (!m.available) return `Hasta el límite de tu categoría: no se puede calcular (${m.reason})`;
  return `${limitHeadline(m)} ${limitDetail(m)}${m.note ? ` ${m.note}` : ""} Es una referencia, no la recategorización oficial.`;
}
