// Textos del bot, centralizados: se corrigen acá sin tocar la lógica.
// Español argentino, claro y breve. Nunca anuncian un éxito antes de que el dato quede guardado.

export const T = {
  // Botones y acciones comunes
  menu: "Menú principal",
  back: "Volver",
  cancel: "Cancelar",
  retry: "Reintentar",
  more: "Ver más",
  help: "Ayuda",
  backToBot: "Volver al asistente",

  // Entrada
  welcome: (study: string) =>
    `Hola 👋 Soy el asistente de ${study}. Te ayudo a consultar tu información y gestionar pedidos con el estudio. ¿Cómo querés empezar?`,
  guestHaveAccount: "Ya tengo cuenta",
  guestRegister: "Quiero registrarme",
  guestAbout: "Conocer el servicio",
  about:
    "Con este asistente, una vez que tu cuenta está vinculada, podés:\n• Ver tu facturación y tu margen de categoría (orientativo).\n• Consultar deudas y vencimientos que cargó el estudio.\n• Preparar facturas en modo demo (sin validez fiscal).\n• Mandar y seguir solicitudes al estudio, con archivos.\n\nLa información la carga y revisa el estudio. No hay conexión con ARCA.",
  registerSteps: (origin: string, inviteUrl: string) =>
    `Para darte de alta no te pedimos datos por acá: se hace en la web, de forma segura.\n\n1. Creá tu cuenta: ${origin}/registro\n2. Confirmá tu correo y, en Mi perfil, cargá tu CUIT. El estudio revisa la solicitud.\n3. Con la sesión iniciada, abrí este enlace para vincular este WhatsApp (vence en 24 horas):\n${inviteUrl}\n\nNunca te vamos a pedir tu clave fiscal ni tu contraseña por WhatsApp.`,
  haveAccountSteps: (inviteUrl: string) =>
    `Para vincular este WhatsApp a tu cuenta:\n• En la web, entrá a Mi perfil → WhatsApp → Generar código y mandame acá los 6 números.\n• O, con la sesión iniciada en la web, abrí este enlace (vence en 24 horas):\n${inviteUrl}`,
  linked: (name: string) => `Listo: vinculamos este WhatsApp con la cuenta de ${name}.`,
  suspended: "Tu acceso no está disponible en este momento. Para resolverlo, comunicate con el estudio por los canales habituales.",

  // Alta pendiente o sin contribuyentes
  pending: "Tu solicitud de acceso está pendiente de revisión por el estudio. Mientras tanto no puedo mostrarte información fiscal.",
  noTaxpayers: "Tu cuenta no tiene contribuyentes habilitados en este momento, así que no puedo mostrarte información fiscal.",
  pendingStatus: "Ver estado",
  pendingFix: "Corregir datos",
  pendingAsk: "Consultar al estudio",
  pendingFixText: (origin: string) =>
    `Los datos de la solicitud no se cambian por acá. Si cargaste algo mal, en la web (Mi perfil) podés enviar una nueva solicitud con los datos correctos: ${origin}/perfil#asociar\nLa anterior la revisa o rechaza el estudio.`,

  // Menú
  menuIntro: (name: string, taxpayer: string | null) =>
    taxpayer ? `Hola, ${name}. Estás consultando ${taxpayer}. ¿Qué necesitás?` : `Hola, ${name}. ¿Qué necesitás?`,
  menuButton: "Ver opciones",
  chooseTaxpayer: "¿Qué contribuyente querés consultar?",
  taxpayerChosen: (name: string) => `Ahora estás consultando ${name}.`,
  noLongerAccess: "Ya no tenés acceso a ese contribuyente. Volvé a elegir desde el menú.",

  // Errores y recuperación
  stale: "Esa opción es de un mensaje anterior y ya no está vigente. Esto es lo que podés hacer ahora:",
  notUnderstood: "No te entendí. Tocá una de las opciones o escribí *menú*.",
  notExpectingFile: "Ahora no esperaba un archivo. Si querés mandar documentación, elegí Documentos → Enviar documentación.",
  queryFailed: "No pude consultar la información en este momento.",
  cancelled: "Listo, cancelamos lo que estabas haciendo. No se guardó nada nuevo.",
  resumeAsk: (what: string) => `Tenías ${what} sin terminar. ¿Querés retomarlo?`,
  resume: "Retomar",
  discard: "Descartar",
  noYes: "Para confirmar, tocá el botón correspondiente. No tomo un \"sí\" escrito como confirmación.",
  invalidAmount: "No pude interpretar el importe. Ingresalo como 15000 o 15000,50.",
  sinRegistros: "Sin registros.",

  // Solicitudes
  requestSent: (code: string) => `Tu solicitud ${code} quedó enviada al estudio. Podés seguirla en Mis solicitudes.`,
  handoffOn: (code: string) =>
    `Lo que escribas ahora se suma a la solicitud ${code} para que lo lea el estudio. Cuando quieras volver a las opciones del asistente, tocá el botón.`,
  handoffAdded: (code: string) => `Agregué tu mensaje a la solicitud ${code}. El estudio lo ve en su bandeja.`,
  verifying: "No pude completar tu pedido en este momento. Estoy verificando si quedó registrado: no hace falta que lo repitas.",
};

export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
