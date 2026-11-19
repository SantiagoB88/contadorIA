# Decisiones y supuestos

| Tema | Decisión | Motivo |
|---|---|---|
| Base de datos | SQLite (archivo `prisma/dev.db`) con Prisma 6.19 | Pedido explícito de algo simple y local. El plan pide PostgreSQL: se migra en la entrega 6 cambiando `provider` en `schema.prisma`. |
| Docker | No en esta entrega | Mismo motivo. |
| Framework | Next.js 15.5 (App Router), React 19.2, Tailwind 4.1 | Versiones estables conocidas. Next 16 y Prisma 7/8 tienen cambios mayores: se evalúan antes del hosting. |
| Autenticación | Propia: bcryptjs + tabla `Session` + cookie HttpOnly SameSite=Lax | Simple, sin proveedores externos. Las Server Actions de Next verifican el origen (protección CSRF). |
| Importes | Centavos en `BigInt` | Nunca sumar dinero con coma flotante. |
| Fechas contables | Texto `YYYY-MM-DD` en hora de Argentina | Evita corrimientos por zona horaria. |
| Enums | Texto, valores en `src/lib/constants.ts` | SQLite no tiene enums. |
| Escala de categorías | **Ficticia**, marcada "Ficticia" en pantalla | El plan pide no sembrar valores fiscales reales sin fuente. |
| Cobertura de datos | Tabla `DataCoverage` (desde cuándo hay datos y si están completos) | Distinguir cero real de dato faltante. |
| Qué suma | Solo comprobantes `VERIFICADO` del ambiente `DEMO` | Borradores y rechazos no cuentan. |
| Alertas | <80 % normal · 80–95 % preventivo · 95–100 % próximo · >100 % superado | Umbrales de producto del plan, comparados en enteros. |
| Gráfico | Barras hechas con HTML/CSS, sin librería | Menos dependencias. |
| Seed | Fechas relativas a "hoy" | La demo se ve bien cualquier día que se pruebe. |

| Correo | `LocalMailProvider` guarda en la tabla `OutboxEmail`; se lee en `/dev/correos` (404 fuera de DEMO) | Sin proveedor pago; la interfaz `NotificationProvider` permite cambiarlo después. |
| Tokens de correo | Aleatorios de 32 bytes, guardados con hash SHA-256, un solo uso, verificación 24 h / recuperación 1 h | Pedido del plan. El consumo usa un `updateMany` condicionado para evitar doble uso. |
| Confirmación de correo | Con botón (POST), no al abrir el enlace | Las vistas previas de correo no consumen el token. |
| Asociación por CUIT | Tabla `AccessRequest`; el acceso solo existe como APROBADO o REVOCADO | Declarar un CUIT no da acceso ni revela si existe. |
| Alta pública | Crea usuarios en el estudio con `acceptsSignups = true` | Un solo estudio operativo en V1. |
| Actualizar bases existentes | `prisma db push` (sin `--accept-data-loss`) + `prisma/upgrade.ts` con marcas en `AppMeta` | No obliga a resetear la base del usuario al cambiar de entrega. |
| `npm run verify` | Usa `prisma/verify.db`, que borra y recrea solo ese archivo | Nunca toca `dev.db`. |
| Tipo de comprobante | Solo Factura C, punto de venta 1 de demostración | El alcance es monotributo. Tipos y puntos de venta reales se definen en el hito fiscal. |
| Fecha de la factura | Hasta 10 días anterior a hoy, nunca futura | Regla de producto simple para la demo; validar con el estudio la regla real por actividad. |
| Simuladas en el tablero | `SIMULADO` suma junto con `VERIFICADO`, siempre filtrando por ambiente | El plan pide que en DEMO los simulados alimenten solo las métricas de demo. |
| Idempotencia | `InvoiceAttempt` con clave única + hash del pedido; la clave la genera el servidor al dibujar la revisión | Doble clic y reintentos no duplican. El proveedor se llama fuera de transacciones. |
| PDF | `pdf-lib` 1.17.1, fuentes estándar | Sin dependencias nativas; marca de agua y leyendas en cada página. |
| Borrado | Solo borradores | Un comprobante emitido nunca se elimina ni se edita. |
| Escalas | Por estudio, versionadas, sin vigencias superpuestas. Una versión nueva cierra la vigente abierta el día anterior | El plan pide escalas versionadas y no mezclar ficticias con oficiales. Por estudio, para que un estudio no cambie los cálculos de otro. |
| Escala aplicada | La vigente a la fecha de corte (si hubiera dos, la VALIDADA) | Cada mes del selector se calcula con la escala de su momento. |
| Estado de una escala | DEMO (ficticia) o VALIDADA, que exige una fuente concreta | No presentar valores inventados como oficiales. |
| Categoría registrada | Historial con fecha "rige desde"; la categoría de cada fecha de corte sale del historial | Nunca se cambia sola. La sugerencia por ingresos es "orientativa" y no se calcula si falta historial, la actividad tiene menos de 12 meses o no hay escala. |
| Deudas | `Obligation` (concepto, período, vencimiento, importe opcional, estado) + `DebtReview` (información a una fecha) | Lista vacía ≠ sin deuda. "Vencida" se deriva (pendiente con vencimiento anterior a hoy). Las próximas no suman como deuda. Sin intereses. |
| Estado de pago | Pendiente, pago informado, pago verificado (con evidencia), anulada | Sin confirmación bancaria inventada: verificar exige una nota con la evidencia. |
| Solicitudes | `ServiceRequest` + `RequestMessage` (PUBLICA o INTERNA). Estados: nueva, en curso, esperando al cliente y resuelta | Simple y suficiente para el recorrido del plan. Las notas internas se excluyen en la consulta (no en la pantalla), así una respuesta para el cliente nunca las contiene. |
| Asignación | Entre los administradores activos del estudio | El rol operador sigue postergado. Cuando exista, la asignación ya está modelada (`assignedToId`). |
| Canal | Campo `channel` en solicitudes y mensajes (hoy WEB); servicios sin dependencias de Next | El plan pide dejar el punto de extensión sin construir WhatsApp. |
| Avisos | Correo local con enlace, sin el texto del mensaje | No sacar contenido del sistema por correo; una nota interna no avisa al cliente. |
| Archivos | Carpeta `storage/` (o `STORAGE_DIR`), nombre aleatorio sin extensión, hash SHA-256; PDF/PNG/JPEG hasta 10 MB y 3 por envío, validados por extensión, tipo declarado y firma del contenido | Pedido del plan. Sin servicios externos. El análisis antimalware queda pendiente para un piloto con archivos reales. |
| Documentos | Una sola tabla `Document` para cargas del estudio y adjuntos (con `messageId`); visibilidad CLIENTE o INTERNO | Un único lugar con la misma autorización para listar y descargar. Un adjunto hereda la visibilidad de su mensaje. |
| Descarga | Ruta `/documentos/[id]/descargar` con autorización en cada pedido, `attachment`, `nosniff`, `no-store`, CSP `sandbox` | Una URL guardada deja de servir al revocar el acceso o al dejar de compartir. |
| Informar pago | El cliente adjunta el comprobante; el vencimiento pasa a PAGO_INFORMADO y se crea una solicitud "Pago informado" | No se da por pagado hasta que el estudio lo verifica. El cambio es condicionado para no informar dos veces. |
| Tamaño de envío | `serverActions.bodySizeLimit = 32mb` | Permite 3 archivos de 10 MB; el servidor vuelve a validar cada archivo. |
| Envío de formularios | `ActionForm` + `useActionForm`: envío manual a la Server Action, sin el reinicio automático de React 19 | Con `<form action>` React restablece el formulario después de cada envío: selects y radios mostraban valores viejos o distintos de lo enviado. Ahora lo que se ve es lo que se envía. |
| Pruebas de punta a punta | Playwright 1.63 con el Edge instalado (`channel: "msedge"`), sobre una copia en el puerto 3100 con `prisma/e2e.db` | No descarga navegadores y nunca toca la base del usuario. |
| Base desactualizada | `AppMeta` guarda `schema-version`; si no coincide con `SCHEMA_VERSION`, se muestra "Falta reiniciar la aplicación" | Pasa si el servidor queda abierto mientras se actualiza el código. Es mejor que un error técnico. |
| Menú en celular y tablet | Botón "Menú" hasta 1024 px; barra lateral fija desde ahí | Con 11 secciones, una fila desplazable no se entendía y en tablet la barra lateral comía un tercio del ancho. |
| Menú agrupado (UX, parte 1) | Grupos por tarea con una línea de descripción y contadores de pendientes (solicitudes que esperan al cliente; sin asignar y pedidos de acceso para el estudio). El estudio entra a "Hoy en el estudio" (`/admin`) y su menú ya no tiene las pantallas del cliente: se abren desde la ficha o la tabla (`/dashboard?c=…`); `/dashboard` sin `c` lo lleva a Hoy | Pedido del usuario: "no se sabe dónde está cada cosa". Ver `docs/propuesta-ux.md`. |
| Nombres de secciones | Se renombró solo lo que existe únicamente en la web: Movimientos → **Mis ingresos**, Backoffice → **Hoy en el estudio**, Accesos → **Accesos y usuarios**. Facturación, Deudas, Solicitudes y Mi perfil no cambian | Esos nombres los usan también el asistente de WhatsApp y los correos: cambiarlos solo en la web confundiría. Se pueden cambiar en todos lados si el usuario lo decide. |
| Tablas en celular | Tarjetas por fila debajo de 640 px; tabla desde ahí | Las acciones (descargar, informar pago) no deben quedar escondidas detrás de un scroll lateral. |
| Demo en Vercel | Base SQLite de demo armada al compilar y copiada a la carpeta temporal al arrancar; archivos igual. Se activa solo con `VERCEL` y sin `DATABASE_URL` | El usuario no quiere una base online por ahora. Es una demo: los datos vuelven a los de ejemplo cuando Vercel recicla la instancia. Para datos persistentes hará falta una base real (entrega 6). |
| Pantalla de carga (`loading.tsx`) | Quitada | En la versión compilada (Next 15.5) dejaba los formularios trabados en "Guardando…" después de guardar. |
| Formularios antes de cargar la página | `method="post"` sin ejecutar nada; el envío real lo hace `onSubmit` | Una contraseña nunca va en la URL. Ejecutar la acción también sin JavaScript generaba errores en modo desarrollo. |
| Sesión en la demo de Vercel | Cookie firmada (HMAC) con usuario, vencimiento y huella de la contraseña; secreto nuevo por deploy guardado en la base de demo | Cada instancia de Vercel tiene su copia de la base: una sesión guardada en la base no sirve entre instancias. En la compu siguen las sesiones en la base. |
| Paleta | Azul profundo #112D4E, azul #2457D6, turquesa #20C4B6, menta #E1F5F2 | Pedido del usuario: confianza, claridad, tecnología. |
| Bot de WhatsApp | Adentro de la web (mismo proyecto y base), no como servidor aparte | Una sola lógica de negocio sin API interna ni credenciales entre servicios. El motor está separado del transporte por si después se quiere separar. |
| Identidad en el bot | Solo por `ChannelLink` verificado con código o enlace de un solo uso | Un teléfono, correo o CUIT no prueban titularidad. Nunca se transfiere un número vinculado a otra cuenta. |
| Clave fiscal | El bot no la pide ni la guarda | El plan del proyecto lo prohíbe. El bot de origen la pedía por chat. |
| Teléfonos | `libphonenumber-js` 1.13.15, formato E.164 | Los números argentinos con 9 o con 15 se normalizan igual, sin reglas a mano. |
| Mensajes entrantes | Se guardan antes de procesar, se deduplican por (proveedor, id), se procesan de a uno por número y se reintentan hasta 3 veces | Meta reintenta hasta 7 días y puede duplicar. |
| Envíos | Estado real: ENVIADO (Meta lo aceptó), FALLIDO, PENDIENTE (sin proveedor) o SIMULADO | No se promete entrega. Fuera de la ventana de 24 h haría falta una plantilla (no implementado). |
| Simulador | `/dev/whatsapp` solo en DEMO, fuera de producción y de Vercel, con números del rango +54 9 11 5555-0xxx | Probar todo sin WhatsApp sin poder hacerse pasar por números reales. |
| Bot en Vercel | Simulador sobre la base temporal de la demo, con aviso si la demo se reinicia; WhatsApp real no | Permite que un cliente recorra el bot sin crear cuentas en otros servicios. Una base compartida (Turso) se evaluó y se descartó por necesitar una cuenta externa. |
| Opciones del bot | Botones y listas con id opaco `<token>.<n>`; la acción vive en el servidor y solo vale la del último mensaje | Un id no puede llevar datos manipulables y un toque viejo o repetido no ejecuta nada. |
| Confirmaciones del bot | Solo con botón, después de un resumen | Un "sí" escrito es ambiguo (puede responder otra cosa). |
| Formularios del bot | Pasos guiados en el chat, sin WhatsApp Flows | Flows requiere configuración en Meta que todavía no está confirmada. |
| Factura desde el bot | Mismo facturador demo (borrador en el servidor + emisión simulada con clave del evento) | El total lo calcula el servidor y un reintento nunca emite dos veces. |
| Solicitud de alta sin contribuyente | `ServiceRequest.taxpayerId` opcional solo para el motivo "Alta o acceso", sin adjuntos | Una persona pendiente necesita poder consultar al estudio. Solo la ve quien la creó y el estudio. |
| Número de solicitud | `S-` + últimos 6 caracteres del id, igual en web, avisos y bot | Cliente y estudio hablan del mismo número sin agregar otra columna. |
| Simulador en la web | Solo en DEMO, con sesión iniciada, en la compu y en la demo de Vercel; se abre desde el menú | Probar el bot al lado de la dashboard sin poder escribir como un número real. |
| Alta desde WhatsApp | Se completa en el chat; se da una contraseña temporal (vence a las 72 h, cambio obligatorio al entrar) | Pedirle a la persona que vaya a la web a registrarse cortaba el recorrido. Nunca se le pide una contraseña por chat: se le da una temporal y se la obliga a cambiarla. Solo se dan temporales a cuentas que todavía no eligieron la suya. |
| Ingreso sin correo confirmado | Permitido si la cuenta tiene un WhatsApp vinculado | El número vinculado ya prueba la identidad; el correo se sigue confirmando por mail. |
| Alta de clientes | CUIT nuevo en el estudio: acceso inmediato y aviso al estudio; CUIT ya cargado: aprobación del estudio | Pedido del producto: no tiene sentido que el estudio apruebe a cada cliente nuevo. Se mantiene la aprobación cuando el CUIT ya es de otro cliente, para no exponer datos ajenos. Contra: quien prueba un CUIT puede deducir si ya es cliente del estudio. |
| Fecha de inicio de actividad | Opcional; se pide al emitir y se completa desde el panel | Pedido del estudio en el testing. Nunca se completa con una fecha supuesta. El cliente la carga si falta; corregirla es del estudio. |
| Receptores | Razón social (dato fiscal) y alias (nombre interno) separados; un documento guardado una sola vez por contribuyente | El alias no puede reemplazar los datos fiscales del comprobante. |
| Consulta de razón social | Conector de padrón con estado "no disponible" y carga manual | No hay integración con ARCA; no se muestran datos inventados. Validar el dígito verificador no confirma la inscripción. |
| Ayuda / pedido de llamada | Solicitud con tema `AYUDA`, una abierta por persona, sin horario prometido | Reutiliza la Bandeja; evita duplicados y no sirve para guardar contraseñas. |
| Texto del "margen" | "Podés facturar $X más antes de alcanzar el límite de tu categoría", con período y límites | Pedido del testing. Describe exactamente la fórmula actual (límite anual − últimos 12 meses). Para validar con el estudio: la recategorización oficial es semestral; este cálculo móvil es una referencia. |
| Piloto en servidor propio | VPS con SQLite en disco, systemd y Caddy; base inicial sin datos de ejemplo; herramientas de demo cerradas | Un solo servidor siempre prendido: la base persiste sin servicios externos. Con números reales no pueden quedar a la vista contraseñas de ejemplo ni enlaces de recuperación. |
| Archivos al chat | Se suben a Meta y se mandan como documento (no como enlace público) | El PDF del contador no queda en ninguna URL abierta; Meta solo lo acepta dentro de las 24 h desde el último mensaje de la persona. |
| Datos de la demo de Vercel | Copia cifrada en cookies (hasta ~9 KB) de todo lo creado o cambiado en la demo; cada página y acción la reconstruye | Sin base compartida (no se quiere un servicio externo), es la forma de que lo creado en una copia del servidor se vea en las demás. Si no entra, se deja afuera lo más viejo. Los archivos no viajan. |
| Cuentas en la demo de Vercel | Copia cifrada en una cookie del navegador, reconstruida en cada copia del servidor; gana siempre lo más nuevo (`updatedAt`) | Sin base compartida (no se quiere un servicio externo), es la única forma de que una cuenta creada en la demo pueda ingresar y ver su panel en cualquier copia. Solo en la demo; no cubre solicitudes, facturas ni documentos. |
| Conversación del simulador en la demo de Vercel | Copia cifrada en el almacenamiento del navegador, enviada en cada acción del simulador | Vercel recicla las copias seguido y la conversación del alta se perdía al actualizar. Va en el almacenamiento del navegador y no en una cookie porque pasa de 4 KB. |
| Secreto de la demo de Vercel | Se reusa entre publicaciones (caché de compilación de Vercel) | Si cambiara en cada publicación, se perderían las sesiones y las cuentas creadas en la demo. Si Vercel borra la caché, se genera otro y eso se pierde una vez. |
| Blanqueo de contraseña por el estudio | Contraseña temporal de 72 horas, mostrada una sola vez al administrador; el usuario la cambia al entrar | El estudio necesita destrabar a un cliente sin acceso al correo. El correo de aviso no lleva la contraseña. |
| Operadores | Postergados | Mantener la entrega 2 simple; el rol requiere un backoffice filtrado por asignación. |

## Supuestos

- Un solo estudio operativo; el segundo es solo para pruebas de aislamiento.
- Monotributo y pesos argentinos únicamente.
- Los usuarios creados antes de la entrega 2 se consideran con correo verificado.
- El estudio verifica la titularidad del CUIT por fuera del sistema antes de aprobar.

## Ingreso, correo real y planes (19/11/2026)

| Tema | Decisión | Motivo |
|---|---|---|
| Correo real | SMTP genérico con `nodemailer` 10.3.1 (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). Sin esas variables, los correos solo quedan en `OutboxEmail`. Siempre se guarda la copia. | Sirve cualquier proveedor (Gmail con contraseña de aplicación, Brevo, Resend, el correo de Hostinger) sin atarse a uno. Se eligió 10.3.1 porque las versiones hasta 10.1.3 tienen fallas de seguridad publicadas. Un error al enviar se registra y no corta el registro ni el ingreso. |
| Confirmar la cuenta | Primero WhatsApp: al ingresar sin cuenta confirmada, la web da un código de 6 dígitos (el mismo `LinkCode` de la vinculación, 10 minutos, un solo uso) para mandarlo al asistente. Al vincular el número, la cuenta queda confirmada. Después, un aviso pide confirmar el correo, con botón para reenviarlo. | Es lo más rápido y prueba que el número es de la persona. El correo sigue siendo un segundo paso que no bloquea. El código solo se muestra después de validar la contraseña. |
| Ingreso con CUIT o DNI | El campo acepta correo, CUIT (11 dígitos) o DNI (7 u 8). Por CUIT o DNI solo cuentan los clientes con acceso **aprobado** a ese CUIT (el DNI se busca dentro del CUIT, dígitos 3 a 10). Si hay varias cuentas, entra la única cuya contraseña coincide. El mensaje de error es el mismo exista o no la cuenta. | Un pedido sin aprobar no alcanza: cualquiera puede declarar un CUIT. No se guarda el DNI aparte. Los administradores ingresan con correo. |
| Planes de suscripción | Tabla `Plan` por estudio con la lista de módulos (`MOVIMIENTOS`, `CATEGORIA`, `DEUDAS`, `FACTURACION`, `DOCUMENTOS`, `SOLICITUDES`, `WHATSAPP`) y `User.planId`. Un cliente sin plan usa el plan por defecto; si no hay ninguno, ve todo. El estudio ve todo siempre. | Se controla en el servidor: las pantallas mandan a "Mi plan", las acciones devuelven error, y el bot oculta las opciones o avisa que el asistente no está incluido. Sin cobros (fuera de alcance). No se puede borrar un plan con clientes asignados. |
