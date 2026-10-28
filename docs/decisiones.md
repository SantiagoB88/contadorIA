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
| Operadores | Postergados | Mantener la entrega 2 simple; el rol requiere un backoffice filtrado por asignación. |

## Supuestos

- Un solo estudio operativo; el segundo es solo para pruebas de aislamiento.
- Monotributo y pesos argentinos únicamente.
- Los usuarios creados antes de la entrega 2 se consideran con correo verificado.
- El estudio verifica la titularidad del CUIT por fuera del sistema antes de aprobar.
