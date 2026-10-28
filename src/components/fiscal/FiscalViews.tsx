import { Badge, type Tone } from "@/components/ui";
import { OBLIGATION_STATUS_LABEL } from "@/lib/constants";
import { formatARS } from "@/lib/money";
import { formatDateAR, monthLabelLong, parseYmd } from "@/lib/dates";
import type { DebtState, DebtSummary } from "@/modules/fiscal/obligations";

// Piezas de solo lectura de categorías, escalas y deudas (las usan el cliente y el estudio).

export const DEBT_STATE: Record<DebtState, { label: string; tone: Tone }> = {
  SIN_DATOS: { label: "No disponible", tone: "neutral" },
  PENDIENTE_REVISION: { label: "Pendiente de revisión", tone: "warning" },
  DEUDA_INFORMADA: { label: "Deuda informada", tone: "danger" },
  SIN_DEUDA_INFORMADA: { label: "Sin deuda informada", tone: "success" },
};

export function ScaleStatusBadge({ status }: { status: string }) {
  return status === "VALIDADA" ? <Badge tone="success">Validada</Badge> : <Badge tone="warning">Ficticia</Badge>;
}

export function formatPeriod(period: string): string {
  const { year, month } = parseYmd(`${period}-01`);
  return monthLabelLong(year, month);
}

export function validityText(s: { validFrom: string; validTo: string | null }): string {
  return s.validTo ? `${formatDateAR(s.validFrom)} al ${formatDateAR(s.validTo)}` : `desde ${formatDateAR(s.validFrom)}`;
}

type Row = DebtSummary["all"][number];

/** Estado visible de un vencimiento. "Vencida" se deriva: pendiente con fecha anterior a hoy. */
export function obligationBadge(o: Row, today: string) {
  if (o.status === "PENDIENTE") {
    return o.dueDate < today ? <Badge tone="danger">Vencida</Badge> : <Badge tone="info">Por vencer</Badge>;
  }
  const tone: Tone = o.status === "PAGO_VERIFICADO" ? "success" : o.status === "PAGO_INFORMADO" ? "warning" : "neutral";
  return <Badge tone={tone}>{OBLIGATION_STATUS_LABEL[o.status] ?? o.status}</Badge>;
}

export function amountText(o: Row) {
  return o.amountCents === null ? <span className="text-slate-500">No informado</span> : formatARS(o.amountCents);
}

/** Explicación en una línea del estado de deuda (nunca "sin deuda" sin una revisión con fecha). */
export function debtStateText(summary: DebtSummary): string {
  switch (summary.state) {
    case "SIN_DATOS":
      return "El estudio todavía no cargó información de deudas. Que no haya datos no significa que no haya deuda.";
    case "PENDIENTE_REVISION":
      return summary.paymentInformed.length > 0 && summary.review?.status === "REVISADA"
        ? "Hay pagos informados que el estudio todavía no verificó."
        : "La información de deudas está pendiente de revisión por el estudio.";
    case "DEUDA_INFORMADA":
      return `Hay ${summary.overdue.length} ${summary.overdue.length === 1 ? "vencimiento impago" : "vencimientos impagos"} según la última revisión.`;
    case "SIN_DEUDA_INFORMADA":
      return `Sin deuda informada al ${formatDateAR(summary.review!.asOfDate)}, según la revisión del estudio.`;
  }
}
