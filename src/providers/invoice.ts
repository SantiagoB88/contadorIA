import { prisma } from "@/lib/db";

// Contrato del proveedor de facturación. La integración real con ARCA será otra implementación
// (hito fiscal), no un condicional repartido por las pantallas.

export type IssueRequest = {
  invoiceId: string;
  taxpayerId: string;
  environment: string;
  pointOfSale: number;
  invoiceType: string;
  totalCents: bigint;
  /** Solo en DEMO: fuerza un rechazo para probar ese recorrido. */
  simulateRejection?: boolean;
};

export type IssueResult =
  | { status: "SIMULADO"; number: number; issuedAt: Date }
  | { status: "RECHAZADO"; reason: string };

export interface InvoiceProvider {
  readonly name: string;
  issue(request: IssueRequest): Promise<IssueResult>;
}

/** Emisión simulada: no se conecta a nada externo, no genera CAE y numera internamente. */
export class SimulatedInvoiceProvider implements InvoiceProvider {
  readonly name = "Simulador local (sin validez fiscal)";

  async issue(request: IssueRequest): Promise<IssueResult> {
    if (request.simulateRejection) {
      return { status: "RECHAZADO", reason: "Rechazo simulado a pedido del usuario (modo DEMO)." };
    }
    if (request.totalCents <= 0n) {
      return { status: "RECHAZADO", reason: "El total tiene que ser mayor a cero." };
    }
    const number = await nextNumber(request);
    return { status: "SIMULADO", number, issuedAt: new Date() };
  }
}

/**
 * Siguiente número de la secuencia. El incremento es atómico en la base (no hay repetidos);
 * si dos emisiones crean la secuencia a la vez, la que pierde reintenta con el incremento.
 */
async function nextNumber(request: IssueRequest): Promise<number> {
  const key = {
    taxpayerId: request.taxpayerId,
    environment: request.environment,
    pointOfSale: request.pointOfSale,
    invoiceType: request.invoiceType,
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const seq = await prisma.invoiceSequence.upsert({
        where: { taxpayerId_environment_pointOfSale_invoiceType: key },
        update: { lastNumber: { increment: 1 } },
        create: { ...key, lastNumber: 1 },
      });
      return seq.lastNumber;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error("No se pudo numerar el comprobante.");
}

export function getInvoiceProvider(mode: string): InvoiceProvider {
  if (mode === "DEMO") return new SimulatedInvoiceProvider();
  // Sin proveedor real configurado se falla de forma visible: nunca se cae en silencio a la simulación.
  throw new Error(`No hay un proveedor de facturación configurado para el modo ${mode}.`);
}
