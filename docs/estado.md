# Estado · 28/10/2026 (entrega 5 + revisión visual y pruebas)

## Entrega 1 — Login y primer tablero ✅

- Login / logout con sesiones en base y cookie HttpOnly. Límite de 5 intentos fallidos cada 10 minutos (en memoria).
- Permisos desde la sesión; un ID manipulado en la URL muestra "No tenés acceso".
- Tablero con 4 períodos, gráfico de 12 meses, margen y alertas, cobertura de datos.
- Movimientos con filtro de fechas; backoffice con carga manual, categoría, cobertura y auditoría.

## Entrega 2 — Alta y administración de accesos ✅

- **Registro** (nombre, correo, teléfono, contraseña). Si el correo ya existe, la pantalla responde igual y al dueño del correo le llega un aviso.
- **Verificación de correo** con enlace de un solo uso (24 h), que se confirma con un botón. Sin verificar no se puede ingresar, y al intentarlo se reenvía el enlace.
- **Recuperación de contraseña** con enlace de un solo uso (1 h). La respuesta es la misma exista o no el correo. Al cambiarla se cierran todas las sesiones.
- **Correo local**: `LocalMailProvider` guarda los correos en la base y se leen en `/dev/correos` (solo en DEMO).
- **Asociación por CUIT**: el cliente declara CUIT, nombre, actividad, categoría e inicio. Se valida el dígito verificador. Queda PENDIENTE y no da acceso ni revela si el CUIT existe.
- **Backoffice → Accesos**:
  - aprobar, que usa el contribuyente existente o lo crea;
  - rechazar con motivo, que ve el cliente;
  - revocar accesos con motivo;
  - suspender y reactivar usuarios (al suspender se cierran sus sesiones).
  Todo queda en la auditoría.
- **Mi perfil**: datos personales, cambio de contraseña, contribuyentes habilitados, estado de solicitudes y estado de vinculación fiscal ("No conectada").
- **Actualización de bases existentes**: `prisma/upgrade.ts` corre en `npm run dev` y deja a los usuarios previos como verificados. También convierte los accesos pendientes en solicitudes y corrige los CUIT de demo para que tengan dígito válido. Se aplica una sola vez.

## Entrega 3 — Facturador en modo demo ✅

- **Facturación** (`/facturas`): listado con búsqueda, filtros por estado y fechas, paginación y orden estable.
- **Nueva factura**: Factura C del monotributista.
  - Receptor guardado o nuevo (CUIT, DNI o sin identificar, con su condición frente al IVA). Se puede guardar para la próxima.
  - Conceptos con cantidad (hasta 3 decimales) y precio. El total que vale lo calcula el servidor; el del formulario es solo una vista previa.
  - Fecha hasta 10 días anterior a hoy, nunca futura.
- **Borrador → revisión → emisión simulada**:
  - Antes de confirmar se muestra el modo de trabajo.
  - El borrador se puede editar o eliminar. Una factura emitida no.
  - Se puede simular un rechazo, que no suma ni consume número.
  - Desde cualquier factura se puede "crear borrador a partir de esta".
- **Idempotencia**:
  - La clave única por estudio, contribuyente, ambiente y operación se guarda junto con un hash del pedido.
  - El intento queda registrado antes de llamar al proveedor.
  - Misma clave con el mismo pedido devuelve el mismo resultado; con otro pedido da conflicto.
  - Un intento trabado más de 2 minutos se reconcilia solo.
- **Numeración interna** por contribuyente, ambiente, punto de venta y tipo (`C 00001-00000001`), sin CAE.
- **PDF** (`/facturas/[id]/pdf`):
  - Marca de agua y leyendas "SIMULACIÓN SIN VALIDEZ FISCAL", sin CAE ni QR.
  - Se autoriza en cada descarga: si se revoca el acceso, la URL deja de funcionar.
- **Proveedor**: `SimulatedInvoiceProvider` detrás de `InvoiceProvider`. En otro modo falla de forma visible, nunca cae en silencio a la simulación.
- **Tablero**: las facturas simuladas suman en los indicadores de la demo (ambiente DEMO), y hay un botón "Nueva factura".

## Entrega 4 — Categorías, escalas, deudas y vencimientos ✅

- **Escalas** (Backoffice → Escalas):
  - versiones por estudio con nombre, fuente, estado (ficticia o validada) y vigencia;
  - las vigencias no se superponen; una versión nueva cierra sola la vigente abierta;
  - editar exige motivo y queda en la auditoría.
- **Categoría registrada con historial**: el estudio la registra con fecha "rige desde" y motivo. Cada fecha de corte usa la categoría y la escala de su momento. El sistema nunca la cambia solo.
- **Detalle de categoría** (`/dashboard/categoria`):
  - categoría registrada;
  - categoría orientativa por ingresos, que no se sugiere si falta historial, la actividad es reciente o no hay escala;
  - la cuenta del margen y el consumo paso a paso;
  - la escala aplicada con su fuente.
- **Margen**: muestra el período de referencia. El exceso sobre el límite se ve con su valor real.
- **Deudas y vencimientos**:
  - el estudio carga concepto, período, vencimiento e importe opcional;
  - estados: pendiente, pago informado, pago verificado con evidencia, o anulada;
  - registra a qué fecha revisó la deuda.
- **Estados de deuda**:
  - "No disponible", si no hay datos;
  - "Pendiente de revisión";
  - "Deuda informada";
  - "Sin deuda informada al…", solo con una revisión.
  "Vencida" se deriva de la fecha. Los vencimientos próximos no suman como deuda. No incluye intereses.
- **Tablero**:
  - tarjetas de deudas y próximos vencimientos;
  - enlace al detalle de categoría;
  - la categoría a la fecha de corte.
- **Movimientos**: avisa si el rango tiene datos incompletos y aclara que el total coincide con el del tablero.
- **Backoffice**: columna de estado de deuda por contribuyente.
- **Actualización de bases existentes**: `prisma/upgrade.ts` asigna la escala existente a cada estudio y crea el historial de categorías. Probado sobre una copia de `dev.db`: conserva las 201 facturas y se aplica una sola vez.

## Entrega 5 — Operación del estudio ✅

- **Solicitudes** (cliente, `/solicitudes`):
  - crear con contribuyente, tema, asunto, mensaje y hasta 3 adjuntos;
  - historial con filtros "En curso", "Resueltas" y "Todas";
  - conversación con la respuesta y el estado del estudio. Si el cliente responde a una solicitud que esperaba su respuesta o estaba resuelta, vuelve a "En curso".
- **Bandeja del estudio** (`/admin/solicitudes`):
  - filtros por estado (nueva, en curso, esperando al cliente, resuelta) y por asignación (todas, mías, sin asignar);
  - conteos en el título y en el resumen del backoffice, con enlace al listado filtrado.
- **Detalle de una solicitud para el estudio**:
  - asignar a una persona del estudio, cambiar el estado y la prioridad;
  - responder al cliente o escribir una **nota interna** con adjuntos internos;
  - la primera respuesta pública toma la solicitud si nadie la tenía.
  Todo queda en la auditoría.
- **Notas internas**: se filtran en la consulta del servidor, así que nunca llegan a una pantalla, respuesta o correo del cliente. Sus adjuntos son internos y no se pueden compartir.
- **Avisos por correo** (bandeja local): llegan al estudio cuando hay una solicitud o un mensaje nuevo, y al cliente cuando el estudio responde o resuelve. No incluyen el texto de los mensajes, solo el enlace.
- **Documentos**:
  - el estudio sube archivos en la ficha del contribuyente con categoría, nota y visibilidad ("lo ve el cliente" o "solo el estudio"), y puede compartirlos o dejar de compartirlos;
  - `/documentos` lista con filtros por contribuyente, categoría y nombre;
  - el cliente ve solo lo compartido y los adjuntos públicos de sus solicitudes.
- **Archivos**:
  - solo PDF, PNG o JPG, de hasta 10 MB y hasta 3 por envío;
  - se valida la extensión, el tipo declarado y el contenido real (firma), así que no se acepta un HTML renombrado;
  - se guardan en `storage/`, fuera de `public/`, con un nombre aleatorio y un hash SHA-256.
- **Descarga** (`/documentos/[id]/descargar`):
  - se autoriza en cada pedido con los permisos actuales;
  - verifica el hash;
  - responde con `attachment`, `nosniff`, `no-store` y una CSP restrictiva;
  - nunca expone la ruta física.
- **Informar pago**: desde Deudas, el cliente adjunta el comprobante de una cuota pendiente.
  - El vencimiento pasa a "pago informado" con un cambio condicionado, así que no se informa dos veces.
  - Se crea una solicitud "Pago informado" vinculada.
  - El estudio la verifica como antes.
- **Canal**: las solicitudes y los mensajes guardan `channel` (hoy siempre WEB). Los servicios de `src/modules/requests` no dependen de Next, así que un canal futuro podría reutilizarlos. WhatsApp no está construido.
- **Tablero**: tarjeta de solicitudes recientes del contribuyente.
- **Datos de demo**:
  - usuaria `contadora@contadorsmart.local`;
  - tres solicitudes: Ana resuelta con la constancia, Martín esperando al cliente con una nota interna, Bruno nueva sin asignar y con prioridad alta;
  - un documento interno de Martín y el detalle de deuda de Bruno.
- **Actualización de bases existentes**: solo se agregan tablas nuevas. Probado sobre una copia de `dev.db`: conserva las 201 facturas.

## Revisión visual y pruebas de punta a punta ✅

**Pruebas nuevas** (`npm run test:e2e`, Playwright con el Edge instalado):
- 17 recorridos en el navegador sobre una copia aparte (puerto 3100, base `prisma/e2e.db` nueva en cada arranque).
- Recorridos de uso:
  - ingreso, error de contraseña, cierre de sesión y menú del celular;
  - registro, confirmación de correo, asociación por CUIT, aprobación, revocación y suspensión;
  - recuperación de contraseña (con enlace de un solo uso) y perfil;
  - facturador: error de validación, borrador, emisión, PDF, rechazo, duplicado y borrado;
  - solicitudes: cliente → estudio (asignación, nota interna, respuesta) → cliente, sin que la nota interna aparezca en ninguna pantalla del cliente;
  - informar un pago con comprobante;
  - documentos: HTML disfrazado rechazado, interno invisible para el cliente, compartir y descargar con las cabeceras correctas;
  - vencimientos y verificación de pagos, categoría y escalas;
  - acceso cruzado por URL;
  - conciliación tablero ↔ movimientos.
- Revisión visual de 29 pantallas en celular (390 px), tablet (768 px) y escritorio (1440 px): sin scroll horizontal, sin errores de consola ni de Next, con captura de cada una.

**Errores encontrados y corregidos**:
- **Formularios**: después de enviar, React los vaciaba y los desarmaba.
  - En una solicitud, tras guardar una nota interna se veía marcada "Respuesta al cliente" pero el botón decía "nota interna": lo marcado podía no coincidir con lo que se enviaba.
  - En la gestión de solicitudes, después de asignar volvía a mostrar "Sin asignar".
  - En Nueva factura, un error de validación desmarcaba "Uno nuevo".
  - Corrección: todos los formularios usan `ActionForm`, que envía exactamente lo que se ve y solo vacía los de alta después de guardar.
- **Adjuntos**: con el nuevo envío, una respuesta sin adjunto mandaba un "archivo vacío" que el servidor rechazaba. Corregido en los dos lados.
- **Escalas**: una versión con fecha de fin superpuesta cerraba la vigente y dejaba días sin escala después de esa fecha. Ahora se rechaza y explica cómo hacerlo; está cubierto en `npm run verify`.
- **Celular**: todas las pantallas con tablas se podían desplazar 400 px de costado, por un texto oculto para lectores de pantalla.
- **Facturador**: diferencia de HTML entre servidor y navegador en Nueva factura (aviso de hidratación en consola).
- **Accesos**: al aprobar, rechazar o revocar no había confirmación visible. Ahora hay un aviso.
- **Base desactualizada**: en lugar del error técnico de Prisma, se muestra "Falta reiniciar la aplicación" con los pasos.

**Mejoras de diseño**:
- En celular y tablet, botón "Menú" con todas las secciones y el cierre de sesión, en lugar de una fila cortada.
- La barra lateral queda fija desde 1024 px.
- En celular, Deudas, Movimientos, Facturación, Documentos y Bandeja se ven como tarjetas, con el estado, "Informar pago" y "Descargar" a la vista.
- El gráfico mensual muestra los 12 meses en el celular.
- Selector de archivos en español que muestra lo elegido.
- Actividad reciente en español, sin códigos como `LOGIN`.
- Tarjeta propia de "Con deuda informada".
- "Pago informado" muestra el mes como "octubre 2026".

## Demo en Vercel ✅

- Sin servicios externos: al compilar en Vercel se arma `prisma/demo.db` con los datos de ejemplo y `demo-storage/` con sus PDF (`scripts/vercel-prepare.mjs`). Al arrancar se copian a la carpeta temporal (`src/lib/vercel-demo.ts`). En la compu no cambia nada.
- Límite de adjuntos en Vercel: 4 MB en total por envío. En la compu sigue en 10 MB por archivo.
- Aviso en la franja DEMO: "Los cambios se borran cada tanto y vuelven los datos de ejemplo".
- Probado con una simulación de Vercel en la compu: compilación con `VERCEL=1`, sin `DATABASE_URL` y servidor de producción. Pasan **18/18** pruebas de navegador.
- **Errores encontrados al probar la versión compilada** (no aparecían en modo desarrollo):
  - Con `loading.tsx`, después de guardar un formulario la pantalla quedaba en "Guardando…" para siempre. Se quitó `loading.tsx`: al cambiar de pantalla queda visible la anterior hasta que carga la nueva.
  - Distintas partes del servidor podían usar distinta carpeta de archivos. Ahora la decisión se comparte y hay una sola conexión a la base.
  - Si alguien tocaba "Ingresar" antes de que cargara la página, el navegador mandaba los datos en la URL (contraseña incluida). Ahora los formularios siempre van por POST y no ejecutan nada hasta que la página cargó.
- No probado: un deploy real en Vercel (lo hace el usuario).

## Verificaciones ejecutadas

- `npm run typecheck` → OK
- `npm run build` → OK (compilado en carpeta aparte para no pisar un `npm run dev` abierto)
- `npm run test:e2e` → **18/18 OK** en desarrollo y **18/18 OK** contra la simulación de Vercel (producción). Antes: **17/17 OK** (recorridos y revisión visual en 3 tamaños, sobre base nueva).
- `npm run verify` → **86/86 OK** (se sumó el caso de escala con fecha de fin). Antes: **85/85 OK** en base aparte (y carpeta de archivos aparte, `storage-verify/`). La entrega 5 suma:
  - validación de archivos (HTML disfrazado, tipo y extensión que no coinciden, vacío, más de 10 MB, más de 3);
  - persistencia al reiniciar y clave que no sale de la carpeta;
  - recorrido cliente → estudio → cliente, en el que la nota interna no aparece en ninguna respuesta del cliente;
  - correos sin notas internas;
  - el cliente no puede escribir notas ni cambiar estados;
  - acceso cruzado a solicitudes y documentos (otro cliente y otro estudio);
  - asignación solo a personal del estudio;
  - descarga rechazada tras revocar el acceso;
  - carga del estudio con visibilidad;
  - hash alterado;
  - pago informado sin duplicados;
  - campo de canal.
- Hasta la entrega 4 (69 verificaciones): La entrega 4 suma escalas por estudio, borde de año, superposiciones, margen con exceso, escala ausente, categoría orientativa, categoría que no cambia sola, historial por fecha, conciliación tablero ↔ movimientos (3 perfiles), estados de deuda, vencimiento del día y verificación de pagos.
- El facturador (entrega 3) cubre:
  - subtotales exactos;
  - validaciones;
  - acceso cruzado;
  - **dos emisiones simultáneas con la misma clave → un solo comprobante**;
  - conflicto de clave y reemisión con otra clave;
  - suma en el tablero;
  - numeración en orden;
  - rechazo sin efecto en totales;
  - edición y borrado solo en borrador;
  - generación del PDF;
  - revocación.
- PDF revisado visualmente (incluye conceptos largos en varias líneas).

## No ejecutado todavía

- Las pruebas usan Edge en Windows. No se probó en Safari ni en un celular físico (solo con el tamaño de pantalla).
- Los campos de fecha muestran el formato del idioma del navegador (`dd/mm/aaaa` en un Edge en español).
- Sin tests E2E (Playwright) ni capturas a 390 / 1440 px.

## Próximo paso

Entrega 6: calidad y preparación para hosting (PostgreSQL, Docker Compose, tests E2E, backup y restauración de base **y archivos**, revisión visual a 390 / 768 / 1440 px).
