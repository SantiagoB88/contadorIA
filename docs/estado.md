# Estado · 28/10/2026 (entrega 5)

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

## Verificaciones ejecutadas

- `npm run typecheck` → OK
- `npm run build` → OK (compilado en carpeta aparte para no pisar un `npm run dev` abierto)
- `npm run verify` → **85/85 OK** en base aparte (y carpeta de archivos aparte, `storage-verify/`). La entrega 5 suma:
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

- Las pantallas de facturación, escalas, categoría, deudas, solicitudes y documentos no se probaron en navegador. Tampoco se probó la subida real de un archivo desde el navegador ni la ruta HTTP de descarga: los servicios que usan sí están cubiertos por `npm run verify`.
- Sin tests E2E (Playwright) ni capturas a 390 / 1440 px.

## Próximo paso

Entrega 6: calidad y preparación para hosting (PostgreSQL, Docker Compose, tests E2E, backup y restauración de base **y archivos**, revisión visual a 390 / 768 / 1440 px).
