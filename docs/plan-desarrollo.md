# Plan de desarrollo · ContadorSmart

Basado en `ContadorSmart_Plan_para_Claude.docx` (v1.0, 28/10/2026), simplificado a pedido: primero algo que se pueda usar localmente con login, y después crecer.

## Entrega 1 (esta) — Login + primer tablero local ✅

Versión reducida de los pasos 0 y 1 del plan original.

- Next.js 15 + React 19 + Tailwind 4, TypeScript.
- Base **SQLite** con Prisma (en vez de PostgreSQL + Docker, para arrancar con solo `npm run dev`).
- Login real: correo + contraseña con hash (bcrypt), sesión en cookie HttpOnly guardada en base, cierre de sesión, límite de intentos.
- Roles ADMIN / CLIENTE y permisos por contribuyente verificados en el servidor.
- Tablero: selector de contribuyente y período, totales mensual / semestral / anual / 12 meses, gráfico mensual, margen de categoría con alertas 80 / 95 / 100 %, estado de datos ("Información incompleta" en lugar de un falso cero), banner de MODO DEMO.
- Detalle de movimientos que explica cada total.
- Backoffice mínimo: resumen, cargar comprobante manual, cambiar categoría, marcar cobertura de datos, actividad reciente (auditoría).
- Datos de demo con 6 perfiles y un segundo estudio para aislamiento.
- `npm run verify`: 20 verificaciones de cálculos, umbrales y permisos.

## Entrega 2 — Alta y administración de clientes (paso 2) ✅

Registro, verificación de correo local (`/dev/correos`), recuperación de contraseña, perfil, asociación por CUIT con aprobación del estudio, rechazo, revocación de accesos y suspensión de usuarios. Pendiente de esta etapa: rol operador con clientes asignados.

## Entrega 3 — Facturador en modo demo (paso 3) ✅

Receptores, conceptos, borradores, revisión, emisión simulada con idempotencia, rechazo simulado, historial con filtros y PDF "SIMULACIÓN SIN VALIDEZ FISCAL".

## Entrega 4 — Categorías y tablero completo (paso 4) ✅

Escalas versionadas por estudio y editables, historial de categoría registrada, categoría orientativa por ingresos, detalle de cada indicador, conciliación con movimientos y deudas y vencimientos cargados por el estudio.

## Entrega 5 — Operación del estudio (paso 5) ✅

Solicitudes al estudio, bandeja con asignación y estados, mensajes públicos, notas internas, adjuntos, documentos privados con descarga autorizada y pagos informados por el cliente con comprobante. Campo de canal listo para otro canal (sin WhatsApp). Pendiente de esta etapa: rol operador limitado a sus clientes asignados (hoy se asigna entre administradores del estudio).

## Entrega 6 — Calidad y preparación para hosting (paso 6)

Migrar a PostgreSQL (Prisma lo permite cambiando el `provider`), Docker Compose, tests E2E, backup/restauración, revisión a 390 / 768 / 1440 px, actualización de dependencias mayores. Recién ahí conviene subirlo a un hosting.

## Después

Integración fiscal real (WSAA / factura electrónica en homologación), piloto con ~50 usuarios y luego WhatsApp.
