# Backlog

## Próximas entregas (ver plan-desarrollo.md)

- [x] Registro, verificación de correo local, recuperación de contraseña
- [x] Solicitud de asociación por CUIT, aprobación / rechazo / revocación, suspensión de usuarios
- [ ] Rol **operador** con clientes asignados (quedó fuera de la entrega 2 para mantenerla simple)
- [x] Facturador demo con idempotencia y PDF sin validez fiscal
- [ ] Facturador: notas de crédito, editar/eliminar receptores guardados, otros puntos de venta, umbral de identificación del consumidor final
- [x] Escalas versionadas editables, historial de categoría, deudas y vencimientos
- [x] Deudas: que el cliente pueda informar un pago con un comprobante adjunto
- [ ] Escalas: borrar una versión cargada por error (hoy se corrige editándola)
- [ ] Generador de volumen (50 clientes, 5.000 movimientos) para probar rendimiento
- [x] Solicitudes al contador, mensajes, notas internas, documentos
- [ ] Documentos: borrar o reemplazar un archivo subido por error (hoy se puede dejar de compartir)
- [ ] Análisis antimalware de archivos antes de un piloto con archivos reales
- [ ] Solicitudes: búsqueda por texto y paginación en la bandeja (hoy muestra hasta 200)
- [x] Bot de WhatsApp integrado: alta, vinculación, consultas, solicitudes, simulador y webhook
- [x] WhatsApp: botones y listas, factura guiada, pago informado, documentos, derivación al estudio, retomar y opciones vencidas
- [x] WhatsApp: limpieza de archivos recibidos por el bot (24 horas)
- [ ] WhatsApp: recordatorios de vencimientos (necesita un proceso periódico y plantillas de Meta)
- [ ] WhatsApp: evaluar WhatsApp Flows para formularios largos (requiere configuración en Meta)
- [ ] WhatsApp: probar con el número de prueba de Meta (necesita cuenta de Meta for Developers y túnel)
- [ ] WhatsApp: plantillas aprobadas para avisos fuera de la ventana de 24 h
- [ ] WhatsApp: confirmar el formato del número argentino al responder (la documentación de Meta no lo aclara)
- [x] Simulador del bot desde el menú de la dashboard, también en la demo de Vercel (base temporal, con aviso de reinicio)
- [x] Alta completa por el chat con contraseña temporal; aviso de aprobación por WhatsApp
- [x] Acceso inmediato para CUIT nuevos (aviso al estudio) y cuentas de la demo en todas las copias de Vercel
- [x] Demo de Vercel: la conversación del simulador y la cuenta sobreviven a reinicios y a publicaciones nuevas
- [x] Blanquear clave desde Accesos (contraseña temporal de 72 horas)
- [x] Testing con usuarios: alta sin fecha de inicio, receptores CUIT → datos → alias, configuración y pedido de ayuda, Mi resumen sin derivación, texto del límite
- [ ] Facturación recurrente (propuesta en docs/propuesta-facturacion-recurrente.md, con preguntas)
- [ ] Ingresos Brutos (alcance a definir: docs/propuesta-ingresos-brutos.md)
- [ ] Integración con ARCA: padrón (ws_sr_constancia_inscripcion) y emisión (WSFEv1) con certificado del estudio y delegación (docs/arca-integracion.md)
- [ ] Solicitudes por WhatsApp: dos eventos idénticos exactamente a la vez pueden dar un error de clave duplicada en lugar de devolver la misma solicitud (el pedido de ayuda ya lo maneja)
- [ ] Revisar `src/app/(app)/loading.tsx` (archivo local sin commitear): con él, la navegación a Movimientos no terminaba en la versión compilada
- [x] Demo de Vercel: solicitudes, facturas, documentos (datos) y demás creados en la demo viajan en el navegador y se ven en todas las copias
- [ ] Demo de Vercel: los archivos de documentos quedan en la copia que los recibió (la descarga desde otra copia pide reintentar); para compartirlos hace falta almacenamiento compartido
- [ ] WhatsApp real en un link público: requiere una base compartida (se evaluó Turso y se descartó por necesitar una cuenta externa)
- [x] Piloto VPS: PDF del estudio al chat, herramientas de demo cerradas, arranque con base propia, systemd y Caddy (docs/despliegue-hostinger.md)
- [ ] Piloto VPS: desplegar y probar con Meta real (dominio, app de Meta, recorrido desde el celular)
- [ ] WhatsApp: plantillas aprobadas para avisar fuera de las 24 horas (hoy el PDF solo sale dentro de la ventana)
- [ ] Piloto: copias de seguridad de /var/lib/contadorsmart y correo real
- [ ] WhatsApp real en Railway (prueba temporal, base propia de Railway): código listo (railway.json, scripts/railway-start.mjs, docs/railway-bot.md); falta crear el servicio y probar con Meta
- [ ] Prueba visual intermitente: error de hidratación #418 en Movimientos (probable `<noscript>` dentro del selector de contribuyente)
- [ ] WhatsApp: reintento automático periódico de eventos fallidos (hoy se reintenta al llegar el siguiente mensaje o desde el simulador)
- [ ] Migrar a PostgreSQL + Docker Compose + migraciones versionadas, backup y restauración (base **y** carpeta `storage/`)
- [x] Tests E2E (Playwright) y revisión visual a 390 / 768 / 1440 px
- [ ] Probar en Safari / iPhone real y en Firefox
- [ ] Tablas del backoffice (resumen, escalas, últimos comprobantes) en formato tarjeta para celular: hoy se desplazan dentro de su recuadro

## Deuda técnica conocida

- El límite de intentos (login, registro, recuperación) vive en memoria: se reinicia al reiniciar el servidor y no sirve con varias instancias.
- `npm audit` reporta vulnerabilidades en herramientas de build (postcss interno de Next 15, deepmerge-ts de Prisma CLI). Se resuelven con Next 16 / Prisma 7, que son cambios mayores: evaluar antes de publicar.
- No hay ESLint configurado (el build lo omite; los tipos se chequean con `npm run typecheck`).
- Las sesiones y tokens vencidos no se limpian de la base (no afecta el funcionamiento).
- El esquema se aplica con `prisma db push` (sin historial de migraciones). Pasar a `prisma migrate` junto con PostgreSQL.
- El correo no se puede cambiar desde el perfil (requiere re-verificación).
