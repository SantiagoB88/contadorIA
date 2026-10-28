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

## Verificaciones ejecutadas

- `npm run typecheck` → OK
- `npm run build` → OK (compilado en carpeta aparte porque había un `npm run dev` corriendo)
- `npm run verify` → **37/37 OK** en base aparte: importes, períodos, umbrales, perfiles, aislamiento, CUIT, registro, verificación, recuperación, solicitudes, aprobación, rechazo, revocación, suspensión y cambio de contraseña.
- Actualización de base: probada sobre una copia de `dev.db`. Conservó los 201 comprobantes, dejó 0 usuarios sin verificar y migró 1 solicitud. Una segunda corrida no cambió nada.

## No ejecutado todavía

- Las pantallas nuevas no se probaron en navegador.
- Sin tests E2E (Playwright) ni capturas a 390 / 1440 px.

## Próximo paso

Entrega 3: facturador en modo demo (receptor, conceptos, borrador, emisión simulada con idempotencia, historial y PDF sin validez fiscal).
