# Backlog

## Próximas entregas (ver plan-desarrollo.md)

- [x] Registro, verificación de correo local, recuperación de contraseña
- [x] Solicitud de asociación por CUIT, aprobación / rechazo / revocación, suspensión de usuarios
- [ ] Rol **operador** con clientes asignados (quedó fuera de la entrega 2 para mantenerla simple)
- [ ] Facturador demo con idempotencia y PDF sin validez fiscal
- [ ] Escalas versionadas editables, deudas y vencimientos
- [ ] Solicitudes al contador, mensajes, notas internas, documentos
- [ ] Migrar a PostgreSQL + Docker Compose + migraciones versionadas, backup y restauración
- [ ] Tests E2E (Playwright) y revisión visual a 390 / 768 / 1440 px

## Deuda técnica conocida

- El límite de intentos (login, registro, recuperación) vive en memoria: se reinicia al reiniciar el servidor y no sirve con varias instancias.
- `npm audit` reporta vulnerabilidades en herramientas de build (postcss interno de Next 15, deepmerge-ts de Prisma CLI). Se resuelven con Next 16 / Prisma 7, que son cambios mayores: evaluar antes de publicar.
- No hay ESLint configurado (el build lo omite; los tipos se chequean con `npm run typecheck`).
- Las sesiones y tokens vencidos no se limpian de la base (no afecta el funcionamiento).
- El esquema se aplica con `prisma db push` (sin historial de migraciones). Pasar a `prisma migrate` junto con PostgreSQL.
- El correo no se puede cambiar desde el perfil (requiere re-verificación).
