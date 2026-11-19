// Consulta de datos fiscales de un CUIT (razón social y condición frente al IVA) en el padrón de ARCA.
//
// Estado: NO CONECTADO. ContadorIA todavía no tiene integración con ARCA. El servicio que correspondería es el
// "Padrón Constancia de Inscripción" (ws_sr_constancia_inscripcion), que exige autenticarse en el WSAA con un
// certificado digital X.509 de un CUIT autorizado (el del estudio, con el servicio delegado o habilitado). Nunca se usa
// la clave fiscal personal de un cliente. Ver docs/arca-integracion.md.
//
// Mientras tanto, `lookup` responde NO_DISPONIBLE y los recorridos piden la razón social a mano. Nunca se devuelve
// una razón social inventada ni datos de prueba como si vinieran de ARCA. Validar el formato de un CUIT (dígito
// verificador) no confirma que exista ni que esté inscripto: eso solo lo dice el padrón.

export type PadronResult =
  | { status: "ENCONTRADO"; legalName: string; taxCondition: string | null; source: string }
  | { status: "NO_ENCONTRADO"; source: string }
  | { status: "NO_DISPONIBLE"; reason: string };

export interface PadronProvider {
  lookup(cuit: string): Promise<PadronResult>;
}

/** Sin integración: siempre "no disponible". */
export const unavailablePadron: PadronProvider = {
  async lookup() {
    return { status: "NO_DISPONIBLE", reason: "la consulta al padrón de ARCA todavía no está conectada en ContadorIA" };
  },
};

const holder = globalThis as unknown as { contadorSmartPadron?: PadronProvider };

export function padron(): PadronProvider {
  return holder.contadorSmartPadron ?? unavailablePadron;
}

/** Solo para pruebas automáticas: reemplaza el proveedor por un doble de prueba. */
export function setPadronForTests(provider: PadronProvider | null) {
  holder.contadorSmartPadron = provider ?? undefined;
}

/** Hay una consulta real conectada (hoy, nunca fuera de las pruebas). */
export function padronAvailable(): boolean {
  return padron() !== unavailablePadron;
}

/** Consulta con manejo de errores: si el servicio falla, se informa como no disponible (nunca se inventa un dato). */
export async function lookupCuit(cuit: string): Promise<PadronResult> {
  try {
    return await padron().lookup(cuit);
  } catch {
    return { status: "NO_DISPONIBLE", reason: "el servicio de ARCA no respondió" };
  }
}
