# Estado · 28/10/2026

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

## Verificaciones ejecutadas

- `npm run typecheck` → OK
- `npm run build` → OK (compilado en carpeta aparte para no pisar un `npm run dev` abierto)
- `npm run verify` → **49/49 OK** en base aparte. Además de lo anterior, el facturador cubre:
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

- Las pantallas de facturación no se probaron en navegador.
- Sin tests E2E (Playwright) ni capturas a 390 / 1440 px.

## Próximo paso

Entrega 4: categorías y tablero completo (escalas versionadas editables, detalle de indicadores, deudas y vencimientos).
