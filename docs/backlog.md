# Backlog

## Próximas entregas (ver plan-desarrollo.md)

- [ ] Registro, verificación de correo local, recuperación de contraseña
- [ ] Aprobación / revocación de accesos por CUIT, operadores asignados
- [ ] Facturador demo con idempotencia y PDF sin validez fiscal
- [ ] Escalas versionadas editables, deudas y vencimientos
- [ ] Solicitudes, mensajes, notas internas, documentos
- [ ] Migrar a PostgreSQL + Docker Compose, backup y restauración
- [ ] Tests E2E (Playwright) y revisión visual a 390 / 768 / 1440 px

## Deuda técnica conocida

- El límite de intentos de login vive en memoria: se reinicia al reiniciar el servidor y no sirve con varias instancias.
- `npm audit` reporta vulnerabilidades en herramientas de build (postcss interno de Next 15, deepmerge-ts de Prisma CLI). Se resuelven con Next 16 / Prisma 7, que son cambios mayores: evaluar antes de publicar.
- No hay ESLint configurado (el build lo omite; los tipos se chequean con `npm run typecheck`).
- Las sesiones vencidas no se limpian de la base (no afecta el funcionamiento).
