import { prisma } from "@/lib/db";
import {
  ACCESS_STATUS,
  APP_MODE,
  CHANNEL,
  REQUEST_STATUS,
  ROLES,
  SR_STATUS,
} from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatDateTimeAR } from "@/lib/dates";
import { maskPhone } from "@/lib/phone";
import type { CurrentUser } from "@/lib/auth";
import { createRequest } from "@/modules/requests/service";

// Estado real de la configuración de un cliente: lo mismo en la web (Mi perfil) y en el bot (Mi cuenta → Mi
// configuración). Cada paso sale de la base; nada se marca como listo si no lo está. La conexión con ARCA no existe
// todavía y se informa así: nunca como "vinculada".

export type SetupStatus = "LISTO" | "PENDIENTE" | "OPCIONAL" | "NO_DISPONIBLE";
export type SetupItem = {
  key: string;
  label: string;
  status: SetupStatus;
  detail: string;
  href?: string;
};
export type Setup = {
  items: SetupItem[];
  nextStep: SetupItem | null; // primer paso pendiente, en orden
  help: { id: string; status: string; createdAt: Date } | null; // pedido de ayuda abierto, si hay
};

export const SETUP_STATUS_LABEL: Record<SetupStatus, string> = {
  LISTO: "Listo",
  PENDIENTE: "Pendiente",
  OPCIONAL: "Opcional",
  NO_DISPONIBLE: "Todavía no disponible",
};

export const ARCA_NOT_AVAILABLE =
  "ContadorSmart todavía no se conecta con ARCA: no emite facturas reales ni consulta tus datos fiscales. No hace falta que hagas nada ahora; cuando esté disponible, el estudio te va a guiar. Nunca te vamos a pedir tu clave fiscal por WhatsApp ni por la web.";

export async function getSetup(user: CurrentUser): Promise<Setup> {
  const [dbUser, link, accesses, pending, help] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.channelLink.findFirst({
      where: { userId: user.id, status: "ACTIVO" },
      orderBy: { linkedAt: "desc" },
    }),
    prisma.taxpayerAccess.findMany({
      where: {
        userId: user.id,
        status: ACCESS_STATUS.APROBADO,
        taxpayer: { studyId: user.studyId },
      },
      include: { taxpayer: true },
    }),
    prisma.accessRequest.findMany({
      where: { userId: user.id, status: REQUEST_STATUS.PENDIENTE },
    }),
    findOpenHelp(user),
  ]);
  const taxpayers = accesses.map((a) => a.taxpayer);
  const withoutStart = taxpayers.filter((t) => !t.startDate);
  const items: SetupItem[] = [
    {
      key: "cuenta",
      label: "Cuenta de ContadorSmart",
      status: "LISTO",
      detail: `Ingresás a la web con ${dbUser.email}.`,
    },
    dbUser.mustChangePassword
      ? {
          key: "clave",
          label: "Tu contraseña",
          status: "PENDIENTE",
          detail: `Estás con una contraseña temporal${
            dbUser.tempPasswordExpiresAt
              ? ` (vence el ${formatDateTimeAR(dbUser.tempPasswordExpiresAt)})`
              : ""
          }. Entrá a la web y elegí la tuya en Mi perfil.`,
          href: "/perfil#clave",
        }
      : {
          key: "clave",
          label: "Tu contraseña",
          status: "LISTO",
          detail: "Ya elegiste tu contraseña.",
        },
    dbUser.emailVerifiedAt
      ? {
          key: "correo",
          label: "Correo confirmado",
          status: "LISTO",
          detail: `Confirmaste ${dbUser.email}.`,
        }
      : {
          key: "correo",
          label: "Correo confirmado",
          status: "PENDIENTE",
          detail: `Abrí el enlace que te mandamos a ${dbUser.email}.${
            APP_MODE === "DEMO"
              ? " En la demo los correos no salen: se ven en Correos de prueba."
              : ""
          } Si venció, al ingresar a la web te mandamos uno nuevo.`,
          href: APP_MODE === "DEMO" ? "/dev/correos" : undefined,
        },
    link
      ? {
          key: "whatsapp",
          label: "WhatsApp vinculado",
          status: "LISTO",
          detail: `Número ${maskPhone(link.address)}.`,
        }
      : {
          key: "whatsapp",
          label: "WhatsApp vinculado",
          status: "OPCIONAL",
          detail:
            "Vinculalo desde Mi perfil → WhatsApp para consultar por chat.",
          href: "/perfil#whatsapp",
        },
    taxpayers.length
      ? {
          key: "cuit",
          label: "Acceso a tu CUIT",
          status: "LISTO",
          detail:
            taxpayers
              .map((t) => `${t.name} (CUIT ${formatCuit(t.cuit)})`)
              .join(", ") + ".",
        }
      : pending.length
        ? {
            key: "cuit",
            label: "Acceso a tu CUIT",
            status: "PENDIENTE",
            detail: `El estudio tiene que confirmar el acceso a ${pending.map((r) => `CUIT ${formatCuit(r.cuit)}`).join(", ")} porque ya es de un cliente del estudio. Te avisamos cuando lo apruebe.`,
          }
        : {
            key: "cuit",
            label: "Acceso a tu CUIT",
            status: "PENDIENTE",
            detail: "Asociá tu CUIT para ver tu información.",
            href: "/perfil#asociar",
          },
  ];
  if (taxpayers.length) {
    items.push(
      withoutStart.length
        ? {
            key: "inicio",
            label: "Fecha de inicio de actividad",
            status: "PENDIENTE",
            detail: `Falta en ${withoutStart.map((t) => t.name).join(", ")}. Hace falta para emitir facturas; está en tu constancia de inscripción.`,
            href: `/dashboard?c=${withoutStart[0].id}`,
          }
        : {
            key: "inicio",
            label: "Fecha de inicio de actividad",
            status: "LISTO",
            detail: "Cargada.",
          },
    );
  }
  items.push({
    key: "arca",
    label: "Conexión con ARCA",
    status: "NO_DISPONIBLE",
    detail: ARCA_NOT_AVAILABLE,
  });
  return {
    items,
    nextStep: items.find((i) => i.status === "PENDIENTE") ?? null,
    help: help
      ? { id: help.id, status: help.status, createdAt: help.createdAt }
      : null,
  };
}

// ───────────── Pedido de ayuda (llamada del estudio) ─────────────

export const HELP_REASONS: Record<string, string> = {
  WEB: "Entrar a la web",
  CUENTA: "Configurar mi cuenta",
  FISCAL: "Datos fiscales o ARCA",
  FACTURAR: "Facturar",
  OTRO: "Otra consulta",
};

async function findOpenHelp(user: CurrentUser) {
  return prisma.serviceRequest.findFirst({
    where: {
      createdById: user.id,
      topic: "AYUDA",
      status: { not: SR_STATUS.RESUELTA },
    },
    orderBy: { createdAt: "desc" },
  });
}

export type HelpResult =
  | { ok: true; message: string; requestId: string; existing: boolean }
  | { ok: false; message: string };

/**
 * La persona pide que el estudio la llame para ayudarla con la configuración. Usa las solicitudes existentes (tema
 * AYUDA): el estudio la ve en la Bandeja con su motivo y estado. Un pedido abierto por persona: tocar de nuevo (o un
 * doble clic, o un mensaje repetido) no crea otro. No se promete un horario. El pedido lleva solo el motivo elegido y
 * el teléfono de contacto: nunca contraseñas ni la clave fiscal.
 */
export async function requestHelp(
  user: CurrentUser,
  reason: string,
  channel: string,
  origin: string,
): Promise<HelpResult> {
  if (user.role !== ROLES.CLIENTE)
    return { ok: false, message: "El pedido de ayuda es para clientes." };
  const label = HELP_REASONS[reason];
  if (!label) return { ok: false, message: "Elegí con qué necesitás ayuda." };
  const open = await findOpenHelp(user);
  if (open) {
    return {
      ok: true,
      existing: true,
      requestId: open.id,
      message: `Ya tenés un pedido de ayuda abierto (S-${open.id.slice(-6).toUpperCase()}) del ${formatDateTimeAR(open.createdAt)}. El estudio te va a contactar; podés seguirlo en Mis solicitudes.`,
    };
  }
  const [dbUser, link, resolved, taxpayers] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.channelLink.findFirst({
      where: { userId: user.id, status: "ACTIVO" },
    }),
    prisma.serviceRequest.count({
      where: { createdById: user.id, topic: "AYUDA" },
    }),
    prisma.taxpayerAccess.findMany({
      where: { userId: user.id, status: ACCESS_STATUS.APROBADO },
      select: { taxpayerId: true },
      take: 1,
    }),
  ]);
  const phone = link ? link.address : dbUser.phone;
  const alreadyOpen = async (): Promise<HelpResult> => {
    const existing = await findOpenHelp(user);
    if (!existing)
      return {
        ok: false,
        message:
          "No pudimos registrar el pedido. Probá de nuevo en un momento.",
      };
    return {
      ok: true,
      existing: true,
      requestId: existing.id,
      message: `Ya tenés un pedido de ayuda abierto (S-${existing.id.slice(-6).toUpperCase()}). El estudio te va a contactar; podés seguirlo en Mis solicitudes.`,
    };
  };
  let result: Awaited<ReturnType<typeof createRequest>>;
  try {
    result = await createRequest(
      user,
      {
        taxpayerId: taxpayers[0]?.taxpayerId ?? "",
        topic: "AYUDA",
        subject: `Pide una llamada: ${label}`,
        body: `Necesito ayuda con: ${label}.\nPedido desde ${channel === CHANNEL.WHATSAPP ? "WhatsApp" : "la web"}. Teléfono de contacto: ${
          phone ?? "no informado (pedíselo por este medio)"
        }.`,
        channel,
        // Un solo pedido abierto aunque lleguen dos a la vez: la clave es la misma hasta que se resuelva.
        externalRef: `AYUDA:${user.id}:${resolved}`,
      },
      [],
      origin,
    );
  } catch (err) {
    // Dos pedidos exactamente a la vez (doble clic): la clave única deja pasar uno; el otro devuelve ese mismo.
    if ((err as { code?: string }).code === "P2002") return alreadyOpen();
    throw err;
  }
  if (!result.ok) return { ok: false, message: result.message };
  return {
    ok: true,
    existing: false,
    requestId: result.requestId,
    message: `Recibimos tu pedido de ayuda (S-${result.requestId.slice(-6).toUpperCase()}). El estudio te va a contactar${
      phone
        ? ` al ${maskPhone(phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`)}`
        : ""
    } para acompañarte; no podemos asegurarte un horario. No compartas contraseñas ni tu clave fiscal en el pedido.`,
  };
}
