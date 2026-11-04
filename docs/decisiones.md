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
| Bot en Vercel | Solo con la base compartida de Turso (ver más abajo) | Con la copia de la base por instancia se perderían vínculos y conversaciones. |
| Opciones del bot | Botones y listas con id opaco `<token>.<n>`; la acción vive en el servidor y solo vale la del último mensaje | Un id no puede llevar datos manipulables y un toque viejo o repetido no ejecuta nada. |
| Confirmaciones del bot | Solo con botón, después de un resumen | Un "sí" escrito es ambiguo (puede responder otra cosa). |
| Formularios del bot | Pasos guiados en el chat, sin WhatsApp Flows | Flows requiere configuración en Meta que todavía no está confirmada. |
| Factura desde el bot | Mismo facturador demo (borrador en el servidor + emisión simulada con clave del evento) | El total lo calcula el servidor y un reintento nunca emite dos veces. |
| Solicitud de alta sin contribuyente | `ServiceRequest.taxpayerId` opcional solo para el motivo "Alta o acceso", sin adjuntos | Una persona pendiente necesita poder consultar al estudio. Solo la ve quien la creó y el estudio. |
| Número de solicitud | `S-` + últimos 6 caracteres del id, igual en web, avisos y bot | Cliente y estudio hablan del mismo número sin agregar otra columna. |
| Base de la demo en Vercel | Turso (libSQL) con el adaptador oficial de Prisma, esquema SQLite sin cambios | Con una base por instancia, el bot perdía el estado entre clics. Turso mantiene el mismo tipo de base que la compu y tiene plan gratis. |
| Archivos con Turso | Dentro de la base (`StoredFile`) en vez de un servicio de archivos aparte | Un solo servicio para configurar; los adjuntos de la demo son chicos (máximo 4 MB por envío en Vercel). |
| Esquema en Turso | Se recrea con los datos de demo cuando cambia `SCHEMA_VERSION`, solo en el deploy de producción | Es una demo con datos ficticios; evita migraciones manuales y que una vista previa borre la demo publicada. |
| Simulador en la web | Solo en DEMO, con sesión iniciada; en Vercel solo con Turso | Permite probar el bot desde la dashboard sin poder escribir como un número real. |
| Operadores | Postergados | Mantener la entrega 2 simple; el rol requiere un backoffice filtrado por asignación. |

## Supuestos

- Un solo estudio operativo; el segundo es solo para pruebas de aislamiento.
- Monotributo y pesos argentinos únicamente.
- Los usuarios creados antes de la entrega 2 se consideran con correo verificado.
- El estudio verifica la titularidad del CUIT por fuera del sistema antes de aprobar.
