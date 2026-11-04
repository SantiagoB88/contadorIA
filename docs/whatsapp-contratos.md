# Bot de WhatsApp: contratos de integración

El bot vive dentro de la web (mismo proyecto, misma base). No hay una API interna entre dos servicios: el bot llama a los **mismos servicios** que usan las pantallas. Lo que sigue son los puntos de entrada y las reglas que cumple cada uno.

## 1. Webhook de WhatsApp: `/api/whatsapp/webhook`

Archivo: `src/app/api/whatsapp/webhook/route.ts`.

| Método | Entrada | Respuesta | Errores |
|---|---|---|---|
| GET | `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` | 200 con el `hub.challenge` | 403 si el token no coincide con `WHATSAPP_VERIFY_TOKEN` |
| POST | Cuerpo JSON de Meta y encabezado `X-Hub-Signature-256: sha256=<HMAC-SHA256 del cuerpo con WHATSAPP_APP_SECRET>` | 200 cuando el evento quedó guardado (procesado o no) | 503 si falta `WHATSAPP_APP_SECRET`; 401 si la firma no coincide; 400 si el JSON es inválido |

Del cuerpo se lee:
- `entry[].changes[].value.messages[]`: `from` (número del cliente), `id` (id del mensaje, se usa para deduplicar), `type` y `text.body`.
- Para botones o listas: `interactive.button_reply.id` o `list_reply.id`.
- Otros tipos (audio, foto) responden "solo puedo leer texto".
- `entry[].changes[].value.statuses[]`: `id` del mensaje enviado y `status`. Un `failed` deja el envío en `FALLIDO` con su código de error.

## 2. Recepción común: `receiveInbound(input, options)`

Archivo: `src/modules/bot/inbound.ts`. La usan el webhook y el simulador.

- **Entrada**:
  - `provider`: `META` o `SIMULADOR`.
  - `providerId`: id del mensaje en el proveedor.
  - `rawAddress`: número tal como lo informa el canal.
  - `text`.
- **Opciones**:
  - `transport`: cómo salen las respuestas.
  - `origin`: URL para los enlaces.
  - `fault`: falla simulada, solo en el simulador.
- **Resultado**: `procesado` (con las respuestas), `duplicado`, `invalido` (número no válido) o `fallido` (con el error).
- **Reglas**:
  1. El número se normaliza a E.164 con `libphonenumber-js`. Nunca se arma a mano.
  2. El evento se guarda en `InboundEvent` **antes** de procesarlo. `(provider, providerId)` es único: un reenvío devuelve `duplicado` y no hace nada.
  3. Los mensajes de un mismo número se procesan de a uno, en el orden en que llegan a este servidor.
  4. Si falla:
     - el evento queda `FALLIDO`;
     - el cliente recibe una sola vez "Tuvimos un problema…";
     - `retryPendingInbound` lo reintenta, hasta 3 veces en total.
  5. Las acciones con efecto usan el id del evento como clave: una solicitud creada desde el bot registra la clave `WA:<evento>` en `IdempotencyKey` (única), así que un reintento no la duplica.
  6. Cada respuesta queda en `OutboundMessage` con su estado real:
     - `ENVIADO`: Meta la aceptó (no garantiza la entrega);
     - `FALLIDO`;
     - `PENDIENTE`: no hay proveedor configurado;
     - `SIMULADO`.

## 3. Motor de conversación: `handleMessage(input)`

Archivo: `src/modules/bot/engine.ts`. No sabe nada de WhatsApp.

- **Identidad**: sale **solo** del vínculo activo del número (`ChannelLink`). Nada de lo que escribe la persona cambia quién es ni qué puede ver.
- **Sin vínculo**: solo bienvenida, enlace de alta en la web, enlace o código de vinculación y explicación para hablar con el estudio. Nunca muestra datos.
- **Con vínculo**: cada consulta vuelve a validar al usuario (activo, rol cliente) y el contribuyente (`getAuthorizedTaxpayer`). Las opciones son:

| Opción | Servicio de la web que usa | Notas |
|---|---|---|
| 1. Estado de mi alta | `AccessRequest`, `getAccessibleTaxpayers` | No revela si un CUIT existe |
| 2. Facturación | `getDashboardData` (el mismo del tablero) | Muestra el período, la fecha de actualización y "información incompleta" o "datos parciales" cuando corresponde |
| 3. Margen de categoría | `getDashboardData().margin` | Se presenta como orientativo; sin datos completos, "No se puede calcular" |
| 4. Deudas y vencimientos | `getDebtSummary` + `debtStateText` | Sin revisión del estudio, nunca dice "sin deuda" |
| 5. Nueva solicitud | `createRequest` (canal `WHATSAPP`, idempotente) | Aparece en la Bandeja |
| 6. Mis solicitudes | `listRequestsForUser`, `getRequestForUser`, `addMessage` | Para un cliente, la consulta excluye las notas internas |
| 7. Hablar con una persona | `createRequest` con prioridad alta | |
| 8. Cambiar de contribuyente | `getAccessibleTaxpayers` | Solo de la lista habilitada |
| "factura" | Enlace a `/facturas/nueva` | El facturador sigue en modo demo, con revisión previa. Nunca emite desde el chat |

## 4. Vinculación: `src/modules/bot/links.ts`

| Función | Quién | Reglas |
|---|---|---|
| `createWebLinkCode(user)` | Cliente logueado (Mi perfil) | 6 dígitos guardados como hash; vence en 10 minutos; un solo uso; anula los anteriores sin usar |
| `consumeWebLinkCode(número, código)` | El bot, cuando llegan 6 dígitos | Rechaza un código incorrecto, vencido o usado; 5 fallas en 15 minutos bloquean ese número; el consumo es condicionado (dos mensajes iguales no lo usan dos veces) |
| `createBotInvite(estudio, número)` | El bot (opciones 1 y 2) | Enlace de un solo uso que vence en 24 horas |
| `consumeBotInvite(user, token)` | Cliente logueado (`/whatsapp/vincular`) | Pide confirmación explícita; un solo uso |
| `unlinkChannel(actor, vínculo, motivo)` | El dueño o un administrador de su estudio | Corta el acceso en el mensaje siguiente |

Reglas comunes:
- **Conflictos**: si el número ya está vinculado a **otra** cuenta, no se transfiere (hay que desvincularlo antes). Si la cuenta tenía otro número, ese vínculo se cierra, porque el código nuevo prueba el número nuevo.
- **Unicidad**: `ChannelLink.activeKey` es único, así que no puede haber dos vínculos activos del mismo número aunque lleguen dos pedidos a la vez.
- **Solo clientes**: una cuenta del estudio no se vincula, porque vería todos los contribuyentes.
- **Auditoría**: queda registro de código generado, vínculo, desvínculo e intento fallido, sin el código ni el texto de los mensajes.

## 5. Avisos del estudio: `notifyRequestReply`

Archivo: `src/modules/bot/notify.ts`.

Cuando el estudio responde en público una solicitud de canal `WHATSAPP` y el cliente tiene su número vinculado, se registra un aviso. El aviso no incluye el texto de la respuesta: el cliente la lee con la opción 6. Una nota interna no genera aviso.

Cómo sale el aviso:
- Si Meta está configurado, se envía por Meta.
- En el simulador local, a los números de prueba.
- En cualquier otro caso queda `PENDIENTE`.

La solicitud muestra el estado de cada aviso en "Avisos por WhatsApp".

## 6. Simulador local: `/dev/whatsapp`

Archivos: `src/app/dev/whatsapp/*` y `src/modules/bot/simulator-actions.ts`.

- **Cuándo está disponible**: en modo DEMO, fuera de producción y fuera de Vercel. Para las pruebas automáticas de producción local se habilita con `ENABLE_BOT_SIMULATOR=1`. En cualquier otro caso devuelve 404.
- **Números**: solo acepta el rango ficticio +54 9 11 5555-0000 a 5555-0999.
- **Qué hace**: usa `receiveInbound` y el motor real contra la base real. Solo reemplaza el transporte.
- **Herramientas**: reenviar un evento duplicado, enviar dos veces el mismo evento a la vez, simular una falla antes o después de la acción, y reintentar los fallidos.

## 7. Variables de entorno

| Variable | Uso |
|---|---|
| `WHATSAPP_APP_SECRET` | Firma del webhook. Sin ella, el webhook responde 503 |
| `WHATSAPP_VERIFY_TOKEN` | Verificación de la suscripción |
| `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` | Envío por Meta. Sin ellas, las respuestas quedan `PENDIENTE` |
| `WHATSAPP_GRAPH_API_VERSION` | Por defecto `v23.0` |
| `APP_URL` | URL pública para los enlaces que manda el bot |
