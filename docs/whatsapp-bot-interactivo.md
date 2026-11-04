# Bot de WhatsApp con botones y listas

Esta versión reemplaza al menú de texto ("escribí 1, 2, 3…"). La persona toca botones y listas reales de WhatsApp. Todo pasa por los mismos servicios que la web.

Código en `src/modules/bot/`:

| Archivo | Qué hace |
|---|---|
| `ui.ts` | Mensajes independientes del proveedor (texto, botones, lista), límites de WhatsApp y versión en texto numerado |
| `core.ts` | Estado de la conversación, opciones vigentes con id interno, paginación |
| `copy.ts` | Todos los textos fijos del bot (catálogo) |
| `registry.ts` | Registro de acciones, pasos que esperan texto y pasos que esperan archivo |
| `engine.ts` | Despachador: identidad, opción vigente o vencida, palabras clave, retomar, derivación al estudio, salida siempre disponible |
| `flows-home.ts` | Bienvenida, alta pendiente, menú, cambio de contribuyente, Mi cuenta, cancelar y retomar |
| `flows-info.ts` | Mi resumen, Categoría y límites, Deudas (consultas), Ver documentos |
| `flows-billing.ts` | Facturación: factura guiada, comprobantes, borradores, consulta de una operación |
| `flows-ops.ts` | Informar pago, consultar diferencia, enviar documentación, solicitar un documento |
| `flows-requests.ts` | Mis solicitudes, crear solicitud, hablar con el estudio (derivación) |
| `uploads.ts` | Archivos recibidos: validación igual que en la web y almacenamiento privado |

## Reglas que cumple

- **Opciones con id interno y validadas en el servidor.**
  - Cada mensaje con opciones guarda sus acciones en la conversación con un token nuevo. El id que viaja a WhatsApp es `<token>.<n>` y no contiene datos.
  - Tocar una opción de un mensaje anterior, un id inventado o un doble toque no ejecuta nada. El bot responde *"Esa opción es de un mensaje anterior…"* y repite las opciones vigentes.
- **Cada acción vuelve a validar permisos** sobre el contribuyente, la solicitud, el comprobante o el documento. Forzar una opción con el id de un recurso ajeno devuelve "no está disponible" (prueba 25).
- **Clientes sin botones.**
  - Si Meta rechaza el mensaje interactivo, se manda la versión en texto con las opciones numeradas.
  - Responder con el número equivale a tocar la opción.
  - Mientras el bot espera un dato (una cantidad o un importe), un número escrito es el dato, no una opción.
- **Confirmación solo con botón.**
  - Antes de crear, emitir o informar algo se muestra un resumen.
  - Un "sí" escrito nunca confirma: el bot lo explica y repite los botones.
- **Nunca un callejón sin salida.**
  - Todo turno termina con opciones o con un dato pedido que se puede cancelar.
  - *menú* y *cancelar* funcionan siempre.
- **Cambio de contribuyente con una operación a medio cargar.** Se resuelve explícitamente con tres opciones: seguir con la anterior, guardar el borrador y cambiar, o cancelar y cambiar. La operación queda atada al contribuyente con el que se armó.
- **Retomar.** Si un recorrido quedó sin tocar más de 2 horas, el bot pregunta si retomarlo o descartarlo.
- **Errores.**
  - Si falla una consulta, se ofrece *Reintentar*.
  - Si falla una operación con efecto, se reintenta sola con la misma clave de idempotencia y nunca se duplica. La persona ve *"Estoy verificando si quedó registrado: no hace falta que lo repitas"*.
- **Archivos.**
  - Solo PDF, PNG y JPG, validados por contenido, igual que en la web.
  - Un archivo rechazado se explica y se repite el pedido vigente.
  - Un archivo que llega sin que el bot lo espere queda en el almacenamiento privado sin asociarse a nada, y el bot explica dónde enviarlo. Todavía no hay una limpieza automática de esos archivos (pendiente).
- **Seguridad.**
  - Nunca se pide la clave fiscal ni contraseñas.
  - Las notas internas y los documentos internos no llegan nunca al chat.
  - Todo lo simulado se marca como tal: factura simulada, sin validez fiscal ni CAE.

## Mapa de recorridos

```
Sin vincular ─► [Ya tengo cuenta] [Quiero registrarme] [Conocer el servicio]
               (código de 6 dígitos escrito → vincula)
Suspendido   ─► mensaje fijo, sin opciones de datos
Pendiente    ─► [Ver estado] [Corregir datos (web)] [Consultar al estudio → solicitud "Alta o acceso"]
Activo       ─► Menú (lista):
  Mi resumen ─► período (este mes · mes anterior · este año · otro mes) ─► resumen ─► movimientos · vencimientos · consultar
  Facturación ─► Preparar factura ─► contribuyente ─► receptor (guardado · buscar · nuevo: nombre → IVA → doc → número → guardar?)
                 ─► concepto (frecuentes o escrito) → cantidad → precio → [otro concepto | continuar] → fecha
                 ─► borrador guardado + resumen calculado por el servidor
                 ─► [Confirmar simulación] [Corregir datos] [Guardar borrador] [Cancelar → descartar con confirmación]
              ─► Ver comprobantes ─► período → estado → lista paginada → detalle → PDF (web) · consultar
              ─► Continuar borrador ─► lista → continuar · descartar
              ─► Consultar una operación ─► comprobante → mensaje → resumen → enviar
  Categoría y límites ─► detalle de escala · simular un importe · consultar
  Deudas y vencimientos ─► próximos · registradas
                        ─► Informar un pago ─► vencimiento (u otro concepto) → fecha → importe → comprobante (obligatorio) → resumen → informar
                        ─► Consultar una diferencia ─► vencimiento → mensaje → resumen → enviar
  Documentos ─► ver (por tipo, paginado, enlace seguro a la web)
             ─► enviar (a una solicitud abierta o nueva)
             ─► solicitar (catálogo → período → comentario opcional → resumen → pedir)
  Mis solicitudes ─► abiertas / anteriores ─► detalle ─► conversación · mensaje · adjuntar · marcar resuelta · pedir revisión
                  ─► crear (motivo → evita duplicados → mensaje → adjunto opcional → resumen → enviar)
  Hablar con el estudio ─► igual que crear, y después derivación: lo que escribe va a la solicitud hasta [Volver al asistente]
  Mi cuenta ─► datos · cambiar contribuyente · avisos (solo los que existen) · corregir datos (web) · desvincular (con confirmación) · ayuda
  Cambiar contribuyente (solo si tiene más de uno)
```

## Catálogo de acciones (ids internos)

El id visible en WhatsApp es siempre `<token>.<n>`. La acción y su valor quedan guardados en el servidor.

| Acción | Qué hace | Efecto en datos |
|---|---|---|
| `g.tengo`, `g.registro`, `g.conocer` | Entrada sin vincular; crea un enlace de vinculación de 24 h | Enlace de un solo uso |
| `p.estado`, `p.corregir`, `p.consultar` | Alta pendiente | `p.consultar` crea una solicitud ALTA sin contribuyente |
| `menu`, `cancel`, `help`, `resume`, `discard` | Navegación | — |
| `tp.sel`, `m.cambiar`, `op.seguir`, `op.guardar`, `op.cancelar` | Contribuyente y operación pendiente | — |
| `m.resumen`, `r.otro`, `r.ver`, `r.mov` | Mi resumen | Solo lectura |
| `m.cat`, `k.detalle`, `k.simular` (+ texto `k.monto`) | Categoría | Solo lectura (la simulación no guarda nada) |
| `m.deudas`, `d.prox`, `d.reg` | Deudas | Solo lectura |
| `d.pago*` (+ texto `d.pago.fecha`/`d.pago.importe`, archivo `d.pago.archivo`), `d.pago.ok` | Informar pago | `informPayment` con clave `WA:<evento>` |
| `d.dif`, `d.dif.sel` | Diferencia | Crea solicitud DEUDAS al confirmar |
| `m.docs`, `doc.ver`, `doc.lista`, `doc.uno` | Ver documentos | Solo lectura; descarga por la web |
| `doc.enviar`, `doc.nueva` | Enviar documentación | Agrega a una solicitud o crea una nueva |
| `doc.pedir*`, `doc.pedir.ok` | Pedir documento | Crea solicitud DOCUMENTACION con clave `WA:<evento>` |
| `m.fact`, `f.*` | Facturación | `saveDraft`, `emitInvoice` (clave `wa-<evento>`), `deleteDraft` |
| `m.sol`, `s.lista`, `s.ver`, `s.conv` | Mis solicitudes | Solo lectura |
| `s.msg`, `s.revision`, `s.adj`, `s.resuelta.ok` | Acciones sobre una solicitud | `addMessage`, `closeByClient` |
| `s.nueva`, `s.tema`, `s.cuerpo`, `s.adjuntar`, `s.resumen`, `s.corregir`, `s.enviar` | Crear solicitud | `createRequest` con clave `WA:<evento>` |
| `m.estudio` | Hablar con el estudio | Igual que crear, más la derivación |
| `m.cuenta`, `c.*` | Mi cuenta | `setPreference`, `unlinkChannel` |

Textos fijos: `copy.ts` (constante `T`). Los textos que dependen de datos (resúmenes, importes) se arman en cada recorrido con los servicios.

## Límites de WhatsApp aplicados

Fuente: documentación oficial de Cloud API, consultada el 04/11/2026.

- Botones: hasta 3, con títulos de hasta 20 caracteres.
- Listas: hasta 10 filas, con títulos de hasta 24 y descripciones de hasta 72. Los títulos largos se recortan con "…".
- Las listas largas se paginan de a 8, con "Ver más" y "Volver".
- Hay una prueba que revisa que ninguna opción supere los límites.

## Guion de prueba manual (simulador)

1. Cerrá cualquier `npm run dev` que esté usando `dev.db`, o probá sobre una base de prueba. El esquema cambió (`whatsapp-2`): al iniciar, la app actualiza la base. Las columnas y tablas nuevas no borran datos (probado sobre una copia de `dev.db`).
2. Abrí `http://localhost:3000/dev/whatsapp` (solo en la compu y en modo DEMO).
3. **Persona nueva** (+54 9 11 5555-0003):
   - escribí *hola* y tocá *Conocer el servicio* y después *Quiero registrarme*;
   - verificá que no te pida datos fiscales y que el enlace vaya a la web.
4. **Ana** (+54 9 11 5555-0001):
   - escribí *hola*, elegí *Ana Gómez* en la lista y abrí *Ver opciones*;
   - **Mi resumen** → Este mes: compará los importes con el tablero de la web;
   - **Facturación** → Preparar factura: nuevo receptor, consumidor final, DNI (probá primero uno inválido), concepto, cantidad *1,5*, precio *abc* (rechazado) y después *10000*, hoy;
   - revisá el resumen, escribí *sí* (no confirma) y tocá **Confirmar simulación**;
   - en la web, Facturador: la factura simulada aparece.
5. Tocá un botón de un mensaje viejo: tiene que decir que ya no está vigente.
6. **Deudas** → Informar un pago:
   - elegí la cuota, Hoy y "Sí, ese importe";
   - escribí texto (pide un archivo) y después adjuntá un PDF con 📎;
   - informá. En la web, Bandeja: aparece la solicitud con canal WhatsApp y el mismo número S-XXXXXX.
7. **Hablar con el estudio** → motivo, mensaje, sin adjunto, enviar:
   - escribí otro mensaje: se suma a la solicitud;
   - tocá *Volver al asistente*.
8. Desde la web (admin), respondé esa solicitud: al chat llega el aviso con el número.
9. Elegí **Facturación → Preparar factura → Otro contribuyente**: tiene que pedir resolver la factura a medio cargar.
10. Tildá *Ver como un cliente sin botones*: las opciones se ven numeradas y responder con el número funciona.
11. Elegí *Simular una falla* → "después de hacer la acción", confirmá una solicitud y tocá *Reintentar fallidos*: queda una sola.

## Resultados de las pruebas (04/11/2026)

- `npm run typecheck` → OK.
- `npm run verify` → **112/112 OK**. De esas, 25 son del bot:
  - alta con botones, pendiente y consulta sin contribuyente;
  - aprobación y menú completo;
  - vinculación con código;
  - CUIT conocido sin autorización;
  - contribuyente forzado;
  - vínculos ajenos;
  - códigos inválidos y bloqueo;
  - evento duplicado y simultáneo y doble toque;
  - estado que sobrevive al reinicio y cancelar;
  - revocación en medio de la conversación, suspensión y desvinculación;
  - mismos números que el tablero;
  - solicitud, respuesta y aviso;
  - nota interna nunca enviada;
  - falla antes y después con reintento sin duplicar;
  - operación guardada con la respuesta fallida;
  - datos incompletos;
  - opción vencida;
  - "sí" escrito y número sin botones;
  - límites de WhatsApp;
  - cambio de contribuyente con factura pendiente;
  - factura guiada completa con correcciones y emisión única;
  - pago informado con archivo rechazado y aceptado;
  - retomar después de horas;
  - derivación al estudio;
  - recurso ajeno forzado.
- Pruebas en el navegador (Edge) contra la versión compilada (puerto 3300, base `e2e.db` recién sembrada) → **23/23 OK**:
  - recorrido completo tocando botones y listas, con adjunto, código S-XXXXXX en la Bandeja, aviso y respuesta;
  - opción vencida, duplicado, falla y reintento, y modo sin botones;
  - webhook con botones, listas, foto y audio en formato Meta.
- La prueba en el navegador del alta usa el número +54 9 11 5555-0004. Si se vuelve a correr sobre la misma base sin volver a sembrarla, ese número ya está vinculado y la prueba falla. Hay que correrla sobre una base nueva.

## Pendiente o no verificado

- **Nada probado con WhatsApp real.** Los botones y listas se validaron con el simulador y con pedidos firmados en el formato de Meta. Falta probar con el número de prueba de Meta (`docs/whatsapp-prueba-real.md`):
  - descarga de fotos y PDF con el token;
  - el respaldo a texto si Meta rechaza un interactivo;
  - el formato del número argentino.
- **WhatsApp Flows** (formularios nativos) no se usan: requieren configuración en Meta que no está confirmada.
- **Recordatorios de vencimientos** no existen: no hay un proceso periódico. Por eso no se ofrecen en Avisos.
- **Avisos fuera de la ventana de 24 h** requieren plantillas aprobadas por Meta (no implementado). El envío queda FALLIDO con su motivo.
- **Rechazo simulado en la factura**: desde el bot no se ofrece; sí en la web.
- **Archivo rechazado**: el motivo se informa en el primer intento. Si ese evento se reintenta después de una caída, el bot responde "no te entendí" y repite las opciones.
- **El bot en Vercel no funciona**: cada instancia tiene su propia copia de la base. Hace falta una base compartida (PostgreSQL).
