# ContadorSmart

Proyecto separado de PullMen. Portal para monotributistas + backoffice del estudio. Spec original: `ContadorSmart_Plan_para_Claude.docx` (resumido en `docs/plan-desarrollo.md`).

## Antes de trabajar

Leé `docs/estado.md`, `docs/decisiones.md` y `docs/backlog.md`. Mantenelos actualizados al terminar cada entrega. No declares como probado algo que no corriste.

## Comandos

- `npm run dev` (crea la base si falta), `npm run typecheck`, `npm run build`, `npm run verify`
- `npm run db:reset` borra todo: no correrlo sin confirmación del usuario.
- El usuario prueba la app por su cuenta con `npm run dev`; no levantar el servidor salvo que lo pida.

## Reglas del código

- Todo cálculo en el servidor, en `src/modules/*`. Las pantallas solo muestran.
- Importes en centavos `BigInt`; fechas contables como texto `YYYY-MM-DD` (hora de Argentina).
- El estudio y los permisos salen de la sesión (`requireUser` / `requireAdmin` + `getAuthorizedTaxpayer`), nunca de parámetros del navegador.
- Nunca mostrar un cero cuando faltan datos: usar la cobertura (`DataCoverage`).
- Interfaz en español de Argentina. Todo lo simulado se marca como DEMO.
- Fuera de alcance por ahora: WhatsApp, IA, ARCA real, cobros.
