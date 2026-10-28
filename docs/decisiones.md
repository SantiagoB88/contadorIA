# Decisiones y supuestos

| Tema | Decisión | Motivo |
|---|---|---|
| Base de datos | SQLite (archivo `prisma/dev.db`) con Prisma 6.19 | Pedido explícito de algo simple y local. El plan pide PostgreSQL: se migra en la entrega 6 cambiando `provider` en `schema.prisma`. |
| Docker | No en esta entrega | Mismo motivo. |
| Framework | Next.js 15.5 (App Router), React 19.2, Tailwind 4.1 | Versiones estables conocidas. Next 16 y Prisma 7/8 tienen cambios mayores: se evalúan antes del hosting. |
| Autenticación | Propia: bcryptjs + tabla `Session` + cookie HttpOnly SameSite=Lax | Simple, sin proveedores externos. Las Server Actions de Next verifican el origen (protección CSRF). |
| Importes | Centavos en `BigInt` | Nunca sumar dinero con coma flotante. |
| Fechas contables | Texto `YYYY-MM-DD` en hora de Argentina | Evita corrimientos por zona horaria. |
| Enums | Texto, valores en `src/lib/constants.ts` | SQLite no tiene enums. |
| Escala de categorías | **Ficticia**, marcada "Ficticia" en pantalla | El plan pide no sembrar valores fiscales reales sin fuente. |
| Cobertura de datos | Tabla `DataCoverage` (desde cuándo hay datos y si están completos) | Distinguir cero real de dato faltante. |
| Qué suma | Solo comprobantes `VERIFICADO` del ambiente `DEMO` | Borradores y rechazos no cuentan. |
| Alertas | <80 % normal · 80–95 % preventivo · 95–100 % próximo · >100 % superado | Umbrales de producto del plan, comparados en enteros. |
| Gráfico | Barras hechas con HTML/CSS, sin librería | Menos dependencias. |
| Seed | Fechas relativas a "hoy" | La demo se ve bien cualquier día que se pruebe. |

| Correo | `LocalMailProvider` guarda en la tabla `OutboxEmail`; se lee en `/dev/correos` (404 fuera de DEMO) | Sin proveedor pago; la interfaz `NotificationProvider` permite cambiarlo después. |
| Tokens de correo | Aleatorios de 32 bytes, guardados con hash SHA-256, un solo uso, verificación 24 h / recuperación 1 h | Pedido del plan. El consumo usa un `updateMany` condicionado para evitar doble uso. |
| Confirmación de correo | Con botón (POST), no al abrir el enlace | Las vistas previas de correo no consumen el token. |
| Asociación por CUIT | Tabla `AccessRequest`; el acceso solo existe como APROBADO o REVOCADO | Declarar un CUIT no da acceso ni revela si existe. |
| Alta pública | Crea usuarios en el estudio con `acceptsSignups = true` | Un solo estudio operativo en V1. |
| Actualizar bases existentes | `prisma db push` (sin `--accept-data-loss`) + `prisma/upgrade.ts` con marcas en `AppMeta` | No obliga a resetear la base del usuario al cambiar de entrega. |
| `npm run verify` | Usa `prisma/verify.db`, que borra y recrea solo ese archivo | Nunca toca `dev.db`. |
| Tipo de comprobante | Solo Factura C, punto de venta 1 de demostración | El alcance es monotributo. Tipos y puntos de venta reales se definen en el hito fiscal. |
| Fecha de la factura | Hasta 10 días anterior a hoy, nunca futura | Regla de producto simple para la demo; validar con el estudio la regla real por actividad. |
| Simuladas en el tablero | `SIMULADO` suma junto con `VERIFICADO`, siempre filtrando por ambiente | El plan pide que en DEMO los simulados alimenten solo las métricas de demo. |
| Idempotencia | `InvoiceAttempt` con clave única + hash del pedido; la clave la genera el servidor al dibujar la revisión | Doble clic y reintentos no duplican. El proveedor se llama fuera de transacciones. |
| PDF | `pdf-lib` 1.17.1, fuentes estándar | Sin dependencias nativas; marca de agua y leyendas en cada página. |
| Borrado | Solo borradores | Un comprobante emitido nunca se elimina ni se edita. |
| Escalas | Por estudio, versionadas, sin vigencias superpuestas. Una versión nueva cierra la vigente abierta el día anterior | El plan pide escalas versionadas y no mezclar ficticias con oficiales. Por estudio, para que un estudio no cambie los cálculos de otro. |
| Escala aplicada | La vigente a la fecha de corte (si hubiera dos, la VALIDADA) | Cada mes del selector se calcula con la escala de su momento. |
| Estado de una escala | DEMO (ficticia) o VALIDADA, que exige una fuente concreta | No presentar valores inventados como oficiales. |
| Categoría registrada | Historial con fecha "rige desde"; la categoría de cada fecha de corte sale del historial | Nunca se cambia sola. La sugerencia por ingresos es "orientativa" y no se calcula si falta historial, la actividad tiene menos de 12 meses o no hay escala. |
| Deudas | `Obligation` (concepto, período, vencimiento, importe opcional, estado) + `DebtReview` (información a una fecha) | Lista vacía ≠ sin deuda. "Vencida" se deriva (pendiente con vencimiento anterior a hoy). Las próximas no suman como deuda. Sin intereses. |
| Estado de pago | Pendiente, pago informado, pago verificado (con evidencia), anulada | Sin confirmación bancaria inventada: verificar exige una nota con la evidencia. |
| Solicitudes | `ServiceRequest` + `RequestMessage` (PUBLICA o INTERNA). Estados: nueva, en curso, esperando al cliente y resuelta | Simple y suficiente para el recorrido del plan. Las notas internas se excluyen en la consulta (no en la pantalla), así una respuesta para el cliente nunca las contiene. |
| Asignación | Entre los administradores activos del estudio | El rol operador sigue postergado. Cuando exista, la asignación ya está modelada (`assignedToId`). |
| Canal | Campo `channel` en solicitudes y mensajes (hoy WEB); servicios sin dependencias de Next | El plan pide dejar el punto de extensión sin construir WhatsApp. |
| Avisos | Correo local con enlace, sin el texto del mensaje | No sacar contenido del sistema por correo; una nota interna no avisa al cliente. |
| Archivos | Carpeta `storage/` (o `STORAGE_DIR`), nombre aleatorio sin extensión, hash SHA-256; PDF/PNG/JPEG hasta 10 MB y 3 por envío, validados por extensión, tipo declarado y firma del contenido | Pedido del plan. Sin servicios externos. El análisis antimalware queda pendiente para un piloto con archivos reales. |
| Documentos | Una sola tabla `Document` para cargas del estudio y adjuntos (con `messageId`); visibilidad CLIENTE o INTERNO | Un único lugar con la misma autorización para listar y descargar. Un adjunto hereda la visibilidad de su mensaje. |
| Descarga | Ruta `/documentos/[id]/descargar` con autorización en cada pedido, `attachment`, `nosniff`, `no-store`, CSP `sandbox` | Una URL guardada deja de servir al revocar el acceso o al dejar de compartir. |
| Informar pago | El cliente adjunta el comprobante; el vencimiento pasa a PAGO_INFORMADO y se crea una solicitud "Pago informado" | No se da por pagado hasta que el estudio lo verifica. El cambio es condicionado para no informar dos veces. |
| Tamaño de envío | `serverActions.bodySizeLimit = 32mb` | Permite 3 archivos de 10 MB; el servidor vuelve a validar cada archivo. |
| Operadores | Postergados | Mantener la entrega 2 simple; el rol requiere un backoffice filtrado por asignación. |

## Supuestos

- Un solo estudio operativo; el segundo es solo para pruebas de aislamiento.
- Monotributo y pesos argentinos únicamente.
- Los usuarios creados antes de la entrega 2 se consideran con correo verificado.
- El estudio verifica la titularidad del CUIT por fuera del sistema antes de aprobar.
