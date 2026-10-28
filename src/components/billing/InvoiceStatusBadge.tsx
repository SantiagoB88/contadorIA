import { STATUS_LABEL } from "@/lib/constants";
import { Badge, type Tone } from "@/components/ui";

const TONE: Record<string, Tone> = {
  BORRADOR: "neutral",
  EN_PROCESO: "info",
  SIMULADO: "success",
  RECHAZADO: "danger",
  VERIFICADO: "success",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  return <Badge tone={TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
}
