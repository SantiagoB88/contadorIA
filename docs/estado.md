# Estado · 28/10/2026

## Hecho (Entrega 1)

- Login / logout con sesiones en base y cookie HttpOnly. Límite de 5 intentos fallidos cada 10 minutos (en memoria).
- Permisos: el estudio y los contribuyentes visibles salen de la sesión; un ID manipulado en la URL muestra "No tenés acceso".
- Tablero con los 4 períodos, gráfico de 12 meses, margen y alertas, estado de cobertura de datos.
- Movimientos con filtro de fechas; borradores visibles pero sin sumar.
- Backoffice: resumen, carga manual de comprobantes, categoría, cobertura, auditoría.
- Estados de carga (`loading.tsx`), error (`error.tsx`), vacío, sin permiso e información incompleta.

## Verificaciones ejecutadas

- `npm run typecheck` → OK
- `npm run build` → OK (Next.js 15.5.28)
- `npm run verify` → 20/20 OK (importes, períodos, umbrales exactos 80/95/100 %, perfiles de demo, aislamiento entre clientes y entre estudios, hash de contraseña)

## No ejecutado todavía

- No se levantó el servidor ni se probó en navegador (lo prueba el usuario con `npm run dev`).
- Sin tests E2E (Playwright) ni capturas a 390 / 1440 px.
- Prueba de persistencia tras reinicio: por diseño (SQLite en disco), pero no verificada en navegador.

## Próximo paso

Entrega 2: alta de usuarios, verificación de correo, recuperación de contraseña y aprobación de accesos.
