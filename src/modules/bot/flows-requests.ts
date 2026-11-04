import { formatDateAR, formatDateTimeAR } from "@/lib/dates";
import {
  SR_STATUS,
  SR_STATUS_LABEL,
  SR_TOPIC_LABEL,
  CHANNEL,
} from "@/lib/constants";
import { getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import {
  addMessage,
  closeByClient,
  createRequest,
  getRequestForUser,
  listRequestsForUser,
} from "@/modules/requests/service";
import {
  activeTaxpayer,
  chooseTaxpayer,
  showMenu,
  showPending,
} from "./flows-home";
import { requestCode } from "./notify";
import { markUploadUsed, takeUpload } from "./uploads";
import { paginate, type Ctx } from "./core";
import { T } from "./copy";
import { actions, on, textSteps, uploadSteps, type Upload } from "./registry";

// Mis solicitudes, Crear solicitud y Hablar con el estudio. Todo sobre el servicio de solicitudes de la web:
// lo que se crea acá aparece en la Bandeja con canal WhatsApp, y las notas internas nunca llegan al cliente.

const TOPICS = [
  "ALTA",
  "FACTURACION",
  "CATEGORIA",
  "DEUDAS",
  "DOCUMENTACION",
  "OTRO",
] as const;
const EXAMPLES: Record<string, string> = {
  ALTA: "¿Cuándo van a revisar mi pedido de acceso?",
  FACTURACION: "¿Cómo le facturo a un cliente del exterior?",
  CATEGORIA: "¿Me conviene cambiar de categoría?",
  DEUDAS: "Me figura una cuota que ya pagué",
  DOCUMENTACION: "Necesito la constancia de inscripción actualizada",
  OTRO: "Quiero hacer una consulta",
};
const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;
const subjectFrom = (topic: string, body: string) => {
  const text = body.replace(/\s+/g, " ").trim();
  return clip(
    text.length >= 3 ? text : `${SR_TOPIC_LABEL[topic]}: ${text}`,
    100,
  );
};

type Draft = {
  mode: "crear" | "hablar";
  topic: string;
  subject?: string;
  autoSubject?: boolean;
  body?: string;
  uploadId?: string;
  uploadName?: string;
  taxpayerId: string | null;
};
const draft = (ctx: Ctx) => ctx.conv.data as unknown as Draft;

/** Opción "Mis solicitudes" del menú. */
on("m.sol", async (ctx) => {
  const tp = await activeTaxpayer(ctx);
  if (!tp) return chooseTaxpayer(ctx, "m.sol");
  ctx.list(`Solicitudes de ${tp.name}. ¿Qué querés ver?`, "Ver opciones", [
    { title: "Ver abiertas", a: "s.lista", v: "activas|0" },
    {
      title: "Ver anteriores",
      desc: "Resueltas",
      a: "s.lista",
      v: "resueltas|0",
    },
    { title: "Crear solicitud", a: "s.nueva", v: "crear" },
    { title: T.menu, a: "menu" },
  ]);
});

on(
  "s.lista",
  async (ctx, v) => {
    const tp = await activeTaxpayer(ctx);
    if (!tp) return chooseTaxpayer(ctx, "m.sol");
    const [view, pageRaw] = (v ?? "activas|0").split("|");
    const rows = await listRequestsForUser(
      ctx.user,
      {
        taxpayerId: tp.id,
        view: view === "resueltas" ? "resueltas" : "activas",
      },
      100,
    );
    const { slice, hasMore, page } = paginate(rows, Number(pageRaw ?? 0));
    if (slice.length === 0) {
      ctx.say(
        view === "resueltas"
          ? "No tenés solicitudes resueltas."
          : "No tenés solicitudes abiertas.",
      );
      ctx.buttons("¿Querés crear una?", [
        { title: "Crear solicitud", a: "s.nueva", v: "crear" },
        { title: T.menu, a: "menu" },
      ]);
      return;
    }
    ctx.list(
      view === "resueltas"
        ? "Tus solicitudes resueltas:"
        : "Tus solicitudes abiertas:",
      "Ver solicitudes",
      [
        ...slice.map((r) => ({
          title: r.subject,
          desc: `${requestCode(r.id)} · ${SR_TOPIC_LABEL[r.topic] ?? r.topic} · ${SR_STATUS_LABEL[r.status] ?? r.status} · ${formatDateAR(r.createdAt.toISOString().slice(0, 10))}`,
          a: "s.ver",
          v: r.id,
        })),
        ...(hasMore
          ? [{ title: T.more, a: "s.lista", v: `${view}|${page + 1}` }]
          : []),
        { title: T.back, a: "m.sol" },
      ],
    );
  },
  { readOnly: true },
);

/** Detalle de una solicitud. Se valida en el servidor que sea del usuario (para un cliente, sin notas internas). */
async function showRequest(ctx: Ctx, id?: string) {
  const request = id ? await getRequestForUser(ctx.user, id) : null;
  if (
    !request ||
    (request.taxpayer && request.taxpayer.id !== ctx.taxpayerId)
  ) {
    ctx.say("Esa solicitud no está disponible.");
    return showMenu(ctx);
  }
  const lastStudy = [...request.messages]
    .reverse()
    .find((m) => m.author.fromStudy);
  ctx.say(
    `Solicitud ${requestCode(request.id)}\nMotivo: ${SR_TOPIC_LABEL[request.topic] ?? request.topic} — ${request.subject}\nCreada el ${formatDateTimeAR(request.createdAt)}\nEstado: ${
      SR_STATUS_LABEL[request.status] ?? request.status
    }\nÚltima respuesta del estudio: ${lastStudy ? `${formatDateTimeAR(lastStudy.createdAt)}: ${clip(lastStudy.body, 400)}` : "todavía no hay"}`,
  );
  const resolved = request.status === SR_STATUS.RESUELTA;
  ctx.list("¿Qué querés hacer?", "Ver opciones", [
    { title: "Ver conversación", a: "s.conv", v: request.id },
    { title: "Agregar mensaje", a: "s.msg", v: request.id },
    ...(request.taxpayer
      ? [{ title: "Adjuntar documentación", a: "s.adj", v: request.id }]
      : []),
    resolved
      ? {
          title: "Pedir revisión",
          desc: "Vuelve a quedar en curso",
          a: "s.revision",
          v: request.id,
        }
      : { title: "Marcar como resuelta", a: "s.resuelta", v: request.id },
    { title: T.back, a: request.taxpayer ? "m.sol" : "menu" },
  ]);
}
on("s.ver", showRequest, { readOnly: true, noTaxpayer: true });

on(
  "s.conv",
  async (ctx, id) => {
    const request = id ? await getRequestForUser(ctx.user, id) : null;
    if (!request) return showMenu(ctx);
    const last = request.messages.slice(-5);
    ctx.say(
      `Conversación de ${requestCode(request.id)} (últimos ${last.length} mensajes):\n\n${last
        .map(
          (m) =>
            `${m.author.fromStudy ? "Estudio" : "Vos"} · ${formatDateTimeAR(m.createdAt)}\n${clip(m.body, 500)}${m.documents.length ? `\n📎 ${m.documents.map((d) => d.fileName).join(", ")}` : ""}`,
        )
        .join("\n\n")}`,
    );
    ctx.buttons("¿Qué querés hacer?", [
      { title: "Agregar mensaje", a: "s.msg", v: request.id },
      { title: T.back, a: "s.ver", v: request.id },
      { title: T.menu, a: "menu" },
    ]);
  },
  { readOnly: true, noTaxpayer: true },
);

on(
  "s.msg",
  async (ctx, id) => {
    ctx.conv.data = { ...ctx.conv.data, requestId: id, lastPrompt: "s.msg" };
    ctx.buttons("Escribí tu mensaje para el estudio.", [
      { title: T.cancel, a: "s.ver", v: id },
    ]);
    ctx.expect("s.msg");
  },
  { noTaxpayer: true },
);
textSteps["s.msg"] = async (ctx, text) => {
  const id = ctx.conv.data.requestId as string;
  const result = await addMessage(
    ctx.user,
    id,
    { body: text, visibility: "PUBLICA", channel: CHANNEL.WHATSAPP },
    [],
    ctx.origin,
  );
  ctx.conv.step = null;
  if (!result.ok) {
    ctx.say(`No pude agregar el mensaje: ${result.message}`);
    return showRequest(ctx, id);
  }
  ctx.say(
    `Agregué tu mensaje a la solicitud ${requestCode(id)}. El estudio lo ve en su bandeja.`,
  );
  ctx.buttons("¿Algo más?", [
    { title: "Ver la solicitud", a: "s.ver", v: id },
    { title: T.menu, a: "menu" },
  ]);
};

on(
  "s.revision",
  async (ctx, id) => {
    ctx.conv.data = { ...ctx.conv.data, requestId: id };
    ctx.buttons("Contame brevemente qué falta o qué no quedó resuelto.", [
      { title: T.cancel, a: "s.ver", v: id },
    ]);
    ctx.expect("s.revision");
  },
  { noTaxpayer: true },
);
textSteps["s.revision"] = async (ctx, text) => {
  const id = ctx.conv.data.requestId as string;
  // Regla existente: si el cliente escribe en una solicitud resuelta, vuelve a "En curso".
  const result = await addMessage(
    ctx.user,
    id,
    {
      body: `Pido revisión: ${text}`,
      visibility: "PUBLICA",
      channel: CHANNEL.WHATSAPP,
    },
    [],
    ctx.origin,
  );
  ctx.conv.step = null;
  ctx.say(
    result.ok
      ? `Pediste revisión de ${requestCode(id)}. Volvió a quedar en curso y el estudio lo ve en su bandeja.`
      : `No pude pedir la revisión: ${result.message}`,
  );
  ctx.buttons("¿Algo más?", [{ title: T.menu, a: "menu" }]);
};

on(
  "s.resuelta",
  async (ctx, id) => {
    ctx.buttons(
      `¿Confirmás que la solicitud ${id ? requestCode(id) : ""} está resuelta? El estudio lo va a ver.`,
      [
        { title: "Sí, está resuelta", a: "s.resuelta.ok", v: id },
        { title: T.back, a: "s.ver", v: id },
      ],
    );
  },
  { noTaxpayer: true },
);
on(
  "s.resuelta.ok",
  async (ctx, id) => {
    const result = await closeByClient(
      ctx.user,
      id ?? "",
      ctx.origin,
      CHANNEL.WHATSAPP,
    );
    ctx.say(
      result.ok
        ? `Listo: marcamos la solicitud ${requestCode(id ?? "")} como resuelta.`
        : result.message,
    );
    ctx.buttons("¿Algo más?", [{ title: T.menu, a: "menu" }]);
  },
  { noTaxpayer: true },
);

on("s.adj", async (ctx, id) => {
  ctx.conv.data = { ...ctx.conv.data, requestId: id, lastPrompt: "s.adj" };
  ctx.buttons("Mandá el archivo (foto JPG o PNG, o un PDF).", [
    { title: T.cancel, a: "s.ver", v: id },
  ]);
  ctx.expect("s.adj");
});
uploadSteps["s.adj"] = async (ctx, upload: Upload) => {
  const id = ctx.conv.data.requestId as string;
  const file = await takeUpload(upload.id, ctx.address);
  if (!file) {
    ctx.say("No pude leer el archivo. Probá mandarlo de nuevo.");
    return;
  }
  const result = await addMessage(
    ctx.user,
    id,
    {
      body: `Te envío documentación: ${file.name}`,
      visibility: "PUBLICA",
      channel: CHANNEL.WHATSAPP,
    },
    [file],
    ctx.origin,
  );
  ctx.conv.step = null;
  if (!result.ok) {
    ctx.say(`No pude guardar el archivo: ${result.message}`);
    return showRequest(ctx, id);
  }
  await markUploadUsed(upload.id);
  ctx.say(
    `Recibimos ${file.name} y quedó guardado en la solicitud ${requestCode(id)}.`,
  );
  ctx.buttons("¿Algo más?", [
    { title: "Ver la solicitud", a: "s.ver", v: id },
    { title: T.menu, a: "menu" },
  ]);
};

// ───────────── Crear solicitud / Hablar con el estudio ─────────────

on("m.estudio", async (ctx) => {
  return actions["s.nueva"](ctx, "hablar");
});

on(
  "p.consultar",
  async (ctx) => {
    // Con el alta pendiente no hay contribuyente: la consulta es de "Alta o acceso".
    ctx.conv.flow = "solicitud";
    ctx.conv.data = {
      mode: "hablar",
      topic: "ALTA",
      taxpayerId: null,
    } satisfies Draft;
    return askBody(ctx);
  },
  { noTaxpayer: true },
);

on("s.nueva", async (ctx, v) => {
  const [mode, topic] = (v ?? "crear").split("|");
  const tp = await activeTaxpayer(ctx);
  if (!tp) {
    const { getAccessibleTaxpayers } =
      await import("@/modules/taxpayers/access");
    if ((await getAccessibleTaxpayers(ctx.user)).length === 0)
      return showPending(ctx);
    return chooseTaxpayer(ctx, "m.estudio");
  }
  ctx.conv.flow = "solicitud";
  ctx.conv.step = null;
  ctx.conv.data = {
    mode: mode === "hablar" ? "hablar" : "crear",
    topic: "",
    taxpayerId: tp.id,
  } satisfies Draft;
  if (topic && (TOPICS as readonly string[]).includes(topic))
    return chooseTopic(ctx, topic);
  ctx.conv.data.lastPrompt = "s.temas";
  ctx.list(
    `${mode === "hablar" ? "Hablar con el estudio" : "Nueva solicitud"} para ${tp.name}. ¿Sobre qué es?`,
    "Elegir motivo",
    [
      ...TOPICS.filter((t) => t !== "ALTA").map((t) => ({ title: SR_TOPIC_LABEL[t], a: "s.tema", v: t })),
      { title: T.cancel, a: "cancel" },
    ],
  );
});
on("s.temas", async (ctx) => {
  return actions["s.nueva"](ctx, draft(ctx).mode);
});

async function chooseTopic(ctx: Ctx, topic: string) {
  const d = draft(ctx);
  d.topic = topic;
  // Evitar duplicados: si ya hay una abierta del mismo motivo, se ofrece continuarla o crear otra explícitamente.
  const open = (
    await listRequestsForUser(
      ctx.user,
      { taxpayerId: d.taxpayerId ?? undefined, view: "activas" },
      50,
    )
  ).find((r) => r.topic === topic);
  if (open) {
    ctx.buttons(
      `Ya tenés una solicitud abierta sobre ${SR_TOPIC_LABEL[topic].toLowerCase()}: ${requestCode(open.id)} "${clip(open.subject, 80)}". ¿Querés continuarla o crear una nueva?`,
      [
        { title: "Continuar esa", a: "s.ver", v: open.id },
        { title: "Crear una nueva", a: "s.cuerpo" },
        { title: T.cancel, a: "cancel" },
      ],
    );
    return;
  }
  return askBody(ctx);
}
on("s.tema", async (ctx, v) => {
  if (
    ctx.conv.flow !== "solicitud" ||
    !v ||
    !(TOPICS as readonly string[]).includes(v)
  )
    return showMenu(ctx);
  return chooseTopic(ctx, v);
});

async function askBody(ctx: Ctx) {
  ctx.conv.data.lastPrompt = "s.cuerpo";
  ctx.buttons(
    `Contame en un mensaje qué necesitás (${SR_TOPIC_LABEL[draft(ctx).topic].toLowerCase()}). Por ejemplo: "${EXAMPLES[draft(ctx).topic] ?? EXAMPLES.OTRO}". No incluyas contraseñas ni tu clave fiscal.`,
    [{ title: T.cancel, a: "cancel" }],
  );
  ctx.expect("s.cuerpo");
}
on(
  "s.cuerpo",
  async (ctx) => (ctx.conv.flow === "solicitud" ? askBody(ctx) : showMenu(ctx)),
  { noTaxpayer: true },
);

textSteps["s.cuerpo"] = async (ctx, text) => {
  const d = draft(ctx);
  if (text.trim().length < 2 || text.length > 4000) {
    ctx.say(
      "El mensaje tiene que tener entre 2 y 4.000 caracteres. Probá de nuevo.",
    );
    ctx.expect("s.cuerpo");
    return;
  }
  d.body = text.trim();
  // El asunto es el comienzo del mensaje (el motivo ya va aparte): así se distinguen en las listas.
  if (!d.subject || d.autoSubject) {
    d.subject = subjectFrom(d.topic, d.body);
    d.autoSubject = true;
  }
  ctx.conv.step = null;
  if (!d.taxpayerId) return showSummary(ctx); // sin contribuyente no se admiten adjuntos
  if (d.uploadId) return showSummary(ctx); // corrección del mensaje: conserva el adjunto
  ctx.conv.data.lastPrompt = "s.adjq";
  ctx.buttons("¿Querés adjuntar un archivo (foto o PDF)?", [
    { title: "Adjuntar archivo", a: "s.adjuntar" },
    { title: "Sin adjunto", a: "s.resumen" },
    { title: T.cancel, a: "cancel" },
  ]);
};
on("s.adjq", async (ctx) => textSteps["s.cuerpo"](ctx, draft(ctx).body ?? ""));

on("s.adjuntar", async (ctx) => {
  if (ctx.conv.flow !== "solicitud") return showMenu(ctx);
  ctx.conv.data.lastPrompt = "s.adjuntar";
  ctx.buttons("Mandá el archivo (foto JPG o PNG, o un PDF).", [
    { title: "Sin adjunto", a: "s.resumen" },
    { title: T.cancel, a: "cancel" },
  ]);
  ctx.expect("s.archivo");
});
uploadSteps["s.archivo"] = async (ctx, upload) => {
  const d = draft(ctx);
  d.uploadId = upload.id;
  d.uploadName = upload.fileName;
  ctx.conv.step = null;
  return showSummary(ctx);
};

async function showSummary(ctx: Ctx) {
  const d = draft(ctx);
  if (ctx.conv.flow !== "solicitud" || !d.body) return showMenu(ctx);
  ctx.conv.data.lastPrompt = "s.resumen";
  const tp = d.taxpayerId
    ? await getAuthorizedTaxpayer(ctx.user, d.taxpayerId)
    : null;
  ctx.say(
    `Revisá tu solicitud:\n• Para: ${tp?.name ?? "alta o acceso (sin contribuyente)"}\n• Motivo: ${SR_TOPIC_LABEL[d.topic]}\n• Mensaje: ${clip(d.body, 600)}\n• Adjunto: ${d.uploadName ?? "ninguno"}`,
  );
  ctx.buttons("¿La enviamos al estudio?", [
    { title: "Enviar al estudio", a: "s.enviar" },
    { title: "Corregir", a: "s.corregir" },
    { title: T.cancel, a: "cancel" },
  ]);
}
on("s.resumen", showSummary, { noTaxpayer: true });

on(
  "s.corregir",
  async (ctx) => {
    const d = draft(ctx);
    ctx.list("¿Qué querés corregir? Lo demás queda como está.", "Elegir", [
      { title: "Motivo", a: "s.fix.tema" },
      { title: "Mensaje", a: "s.fix.cuerpo" },
      ...(d.taxpayerId
        ? [
            {
              title: d.uploadId ? "Cambiar adjunto" : "Agregar adjunto",
              a: "s.adjuntar",
            },
          ]
        : []),
      ...(d.uploadId ? [{ title: "Quitar adjunto", a: "s.fix.sinadj" }] : []),
      { title: "Volver al resumen", a: "s.resumen" },
    ]);
  },
  { noTaxpayer: true },
);
on(
  "s.fix.tema",
  async (ctx) => {
    ctx.list("Elegí el motivo:", "Elegir motivo", [
      ...TOPICS.filter((t) => draft(ctx).taxpayerId || t === "ALTA").map(
        (t) => ({ title: SR_TOPIC_LABEL[t], a: "s.fix.tema.ok", v: t }),
      ),
      { title: "Volver al resumen", a: "s.resumen" },
    ]);
  },
  { noTaxpayer: true },
);
on(
  "s.fix.tema.ok",
  async (ctx, v) => {
    if (v && (TOPICS as readonly string[]).includes(v)) {
      draft(ctx).topic = v;
      if (draft(ctx).autoSubject)
        draft(ctx).subject = subjectFrom(v, draft(ctx).body ?? "");
    }
    return showSummary(ctx);
  },
  { noTaxpayer: true },
);
on("s.fix.cuerpo", async (ctx) => askBody(ctx), { noTaxpayer: true });
on("s.fix.sinadj", async (ctx) => {
  delete draft(ctx).uploadId;
  delete draft(ctx).uploadName;
  return showSummary(ctx);
});

on(
  "s.enviar",
  async (ctx) => {
    const d = draft(ctx);
    if (ctx.conv.flow !== "solicitud" || !d.body) return showMenu(ctx);
    // La operación se hace sobre el contribuyente con el que se armó, nunca sobre otro por cambio de contexto.
    if (
      d.taxpayerId &&
      !(await getAuthorizedTaxpayer(ctx.user, d.taxpayerId))
    ) {
      ctx.resetFlow();
      ctx.say(T.noLongerAccess);
      return showMenu(ctx);
    }
    const file = await takeUpload(d.uploadId, ctx.address);
    if (d.uploadId && !file) {
      // El adjunto ya no está (se guarda 24 horas): se pide de nuevo en lugar de enviar sin él.
      delete d.uploadId;
      delete d.uploadName;
      ctx.say("No encuentro el archivo que habías adjuntado (pasó mucho tiempo). Mandalo de nuevo o seguí sin adjunto.");
      return actions["s.adjuntar"](ctx);
    }
    const result = await createRequest(
      ctx.user,
      {
        taxpayerId: d.taxpayerId ?? "",
        topic: d.topic,
        subject: d.subject ?? SR_TOPIC_LABEL[d.topic],
        body: d.body,
        channel: CHANNEL.WHATSAPP,
        externalRef: `WA:${ctx.eventRef}`,
      },
      file ? [file] : [],
      ctx.origin,
    );
    if (!result.ok) {
      const detail =
        "fieldErrors" in result && result.fieldErrors
          ? Object.values(result.fieldErrors).join(" ")
          : "";
      ctx.say(
        `No pudimos enviar la solicitud: ${result.message} ${detail}`.trim(),
      );
      ctx.buttons("¿Qué hacemos?", [
        { title: "Corregir", a: "s.corregir" },
        { title: T.cancel, a: "cancel" },
      ]);
      return;
    }
    await markUploadUsed(d.uploadId);
    const code = requestCode(result.requestId);
    const mode = d.mode;
    ctx.resetFlow();
    ctx.say(T.requestSent(code));
    if (mode === "hablar") {
      // Derivación: mientras la persona siga escribiendo, sus mensajes van a la solicitud y el bot no responde
      // automáticamente sobre el tema. Sale con el botón o escribiendo "menú".
      ctx.conv.handoffRequestId = result.requestId;
      ctx.buttons(T.handoffOn(code), [{ title: T.backToBot, a: "menu" }]);
      return;
    }
    ctx.buttons("¿Algo más?", [
      { title: "Ver la solicitud", a: "s.ver", v: result.requestId },
      { title: T.menu, a: "menu" },
    ]);
  },
  { noTaxpayer: true },
);

/** Mensaje libre durante la derivación al estudio: se agrega a la solicitud. */
export async function handoffMessage(
  ctx: Ctx,
  text: string,
  upload: Upload | null,
) {
  const id = ctx.conv.handoffRequestId!;
  const request = await getRequestForUser(ctx.user, id);
  if (!request || request.status === SR_STATUS.RESUELTA) {
    ctx.conv.handoffRequestId = null;
    ctx.say(
      request
        ? `La solicitud ${requestCode(id)} ya está resuelta. Volvemos al asistente.`
        : "Esa solicitud ya no está disponible.",
    );
    return showMenu(ctx);
  }
  const file = upload ? await takeUpload(upload.id, ctx.address) : null;
  const result = await addMessage(
    ctx.user,
    id,
    {
      body: text.trim() || (file ? `Te envío documentación: ${file.name}` : ""),
      visibility: "PUBLICA",
      channel: CHANNEL.WHATSAPP,
    },
    file ? [file] : [],
    ctx.origin,
  );
  if (!result.ok) {
    ctx.say(`No pude agregar tu mensaje: ${result.message}`);
  } else {
    if (upload) await markUploadUsed(upload.id);
    ctx.say(T.handoffAdded(requestCode(id)));
  }
  ctx.buttons("Cuando quieras, volvé a las opciones.", [
    { title: T.backToBot, a: "menu" },
  ]);
}
