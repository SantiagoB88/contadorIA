# Propuesta: facturación recurrente (alquileres, servicios, abonos)

Estado: **propuesta, no implementada.** Surge del primer testing con usuarios: facilitar la factura mensual de un alquiler o un abono, con aviso por correo y confirmación de la persona antes de emitir.

## Qué existe hoy (revisado en el código)

| Pieza | Estado | Dónde |
|---|---|---|
| Borradores de factura | Sí | `Invoice` con estado `BORRADOR`, `saveDraft` en `src/modules/billing/service.ts` |
| Emisión con confirmación explícita e idempotencia | Sí (simulada, sin ARCA) | `emitInvoice`: clave de idempotencia, `InvoiceAttempt` registra cada intento antes de llamar al proveedor |
| "Crear borrador a partir de otra" | Sí | `duplicateAsDraft` |
| Receptores guardados | Sí | `InvoiceRecipient` (con alias desde esta entrega) |
| Correos | Sí, solo bandeja local | `src/providers/mail.ts` → `OutboxEmail`; en DEMO no sale nada (`/dev/correos`) |
| Programador de tareas | **No** | No hay cron, cola ni `vercel.json` con tareas programadas |
| Plantillas recurrentes | **No** | — |
| Emisión real | **No** | Sin integración con ARCA (ver `docs/arca-integracion.md`) |

## Diseño propuesto (sobre la arquitectura actual)

Tres cosas separadas, sin mezclarlas: **plantilla** (el acuerdo), **instancia por período** (un borrador) y **comprobante emitido** (la factura, que ya existe hoy).

### Modelo

```prisma
model RecurringInvoice {           // plantilla: el acuerdo
  id            String   @id @default(cuid())
  studyId       String
  taxpayerId    String
  recipientId   String             // InvoiceRecipient del mismo contribuyente
  concept       String
  amountCents   BigInt             // o ítems: RecurringInvoiceItem[]
  frequency     String             // MENSUAL (BIMESTRAL, etc. solo si se define)
  dayOfMonth    Int                // día del aviso (1–28, para no chocar con meses cortos)
  startPeriod   String             // YYYY-MM
  endPeriod     String?            // YYYY-MM o abierto
  status        String             // ACTIVA | PAUSADA | FINALIZADA
  createdById   String
  updatedAt     DateTime @updatedAt
}

model RecurringInstance {          // una por período
  id            String   @id @default(cuid())
  recurringId   String
  period        String             // YYYY-MM
  invoiceId     String?            // borrador creado (y después el comprobante)
  status        String             // PENDIENTE_REVISION | CONFIRMADA | OMITIDA | FALLIDA
  notifiedAt    DateTime?
  notifyError   String?
  confirmedById String?
  confirmedAt   DateTime?
  @@unique([recurringId, period])   // una sola instancia por período, aunque la tarea corra dos veces
}
```

### Circuito

1. **Configuración en el panel** (Facturación → Recurrentes): receptor guardado, concepto, importe, periodicidad, día del aviso, desde/hasta. Editar cambia solo los períodos futuros. **Pausar** y **reanudar** sin borrar el historial.
2. **Tarea diaria** (Vercel Cron llamando a una ruta protegida con un secreto, o un proceso equivalente en otro hosting). Para cada plantilla activa cuyo día llegó:
   - crea la `RecurringInstance` del período. El `@@unique` garantiza una sola aunque la tarea se ejecute dos veces o se reintente;
   - crea el **borrador** con `saveDraft` (mismas validaciones que la web);
   - manda el **correo**: "Tu factura de {concepto} de {mes} está lista para revisar", con un enlace a `/facturas/{id}`. El enlace no da acceso: exige iniciar sesión, como cualquier página del portal. Si el correo falla, queda `notifyError` y se reintenta en la próxima corrida. El borrador se ve igual en el panel.
3. **Revisión y confirmación**: la persona abre el borrador, puede editarlo y confirma con el botón existente (`emitInvoice` con clave de idempotencia). **Sin confirmación no se emite nunca.** No hay emisión automática ni por vencimiento de un plazo.
4. **Trazabilidad**: `confirmedById` y `confirmedAt` en la instancia; resultado real de la emisión en `InvoiceAttempt` (ya existe). Si el servicio de facturación falla, la instancia queda `FALLIDA` con el error y el borrador sigue disponible para reintentar.
5. **Duplicados**: doble clic y reintentos ya los cubre la idempotencia de `emitInvoice`; la tarea repetida, el `@@unique([recurringId, period])`.
6. **Bot** (opcional, segunda etapa): el aviso podría llegar también por WhatsApp, con botones "Revisar" (enlace al portal) y "Confirmar" solo si se decide que el chat puede confirmar.

## Preguntas mínimas antes de construir

1. ¿El aviso y la confirmación son solo del cliente, o el estudio también puede confirmar en su nombre?
2. Periodicidades: ¿alcanza con mensual?
3. ¿El importe puede cambiar mes a mes (por ejemplo, alquiler con ajuste por índice)? Si es así, ¿lo carga la persona en cada borrador o se define una regla?
4. ¿Qué fecha lleva la factura: el día del aviso o el de la confirmación?
5. ¿Se puede confirmar desde WhatsApp, o solo desde el portal?
6. Hosting de producción: ¿Vercel con Cron Jobs o un servidor propio? Define cómo se programa la tarea.
7. Emisión real: depende de la integración con ARCA (`docs/arca-integracion.md`). Sin ella, todo esto funciona en simulación.
