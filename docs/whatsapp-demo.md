# Bot de WhatsApp: probar desde cero y guion de demo (10 minutos)

## Probar desde cero (en tu compu, sin WhatsApp)

```bash
npm run dev
```

1. Ingresá a la web y abrí **Probar bot de WhatsApp (DEMO)** en el menú (o `/dev/whatsapp`): es el simulador. Pide tener la sesión iniciada. Funciona en la compu y en la demo de Vercel.
2. En otra pestaña abrí la web, http://localhost:3000.

Si tu base viene de antes, no tiene a Ana con el WhatsApp ya vinculado. Podés vincularla con un código (paso 2 del guion) o correr `npm run db:reset`, que **borra lo que cargaste**.

## Guion de demo

En el simulador se tocan los botones de cada mensaje y, en las listas, el botón ☰ y una fila, igual que en WhatsApp. Lo que dice "escribí" se manda con el cuadro de texto.

**1. Persona nueva que se da de alta por el chat** (Quién escribe: "Tu WhatsApp de prueba")

1. Escribí `hola` → saludo con **Ya tengo cuenta**, **Quiero registrarme** y **Conocer el servicio**.
2. **Quiero registrarme → Empezar** → nombre y apellido, correo, CUIT, actividad y mes/año de inicio. Probá un CUIT con el último número mal: lo rechaza.
3. En el resumen escribí `sí`: no confirma. Tocá **Crear mi cuenta** → cuenta creada, WhatsApp vinculado y contraseña temporal para la web.
4. En la web (admin), **Accesos** → aprobá el pedido. Al chat llega "El estudio aprobó tu acceso" y `menú` muestra el menú completo.
5. En una ventana privada, ingresá con el correo y la contraseña temporal: la web pide elegir una propia.

**2. Cliente existente que vincula** (tocá **Usar un número nuevo** para tener otro número sin cuenta)

1. En la web, ingresá como `cliente.b@contadorsmart.local` / `Demo1234!` y entrá a **Mi perfil → WhatsApp → Generar código**.
2. Escribí el código de 6 números → "Listo: vinculamos este WhatsApp…". Escribirlo otra vez → "no es válido o ya se usó".
3. **Ver opciones** → menú en lista, con "Estás consultando Bruno Díaz".

**3. Consultas iguales a la web** (sigue Bruno)

- **Mi resumen → Este año**: mismos importes que el tablero, con período, margen orientativo, próximo vencimiento y cobertura.
- **Categoría y límites**: límite de la categoría C, margen o exceso y **Simular un importe** (escribí `150000`).
- **Deudas y vencimientos → Deudas registradas**: cuotas impagas con importes y "No incluye intereses".

**4. Factura guiada** (sigue Bruno; es una simulación sin validez fiscal)

**Facturación → Preparar factura → Sí, continuar**, y después:

1. Receptor y concepto:
   - elegí un receptor guardado o **Nuevo receptor**;
   - elegí un concepto ya usado o escribilo;
   - cantidad y precio (probá `abc`: lo rechaza).
2. **Continuar → Hoy** → resumen con el total calculado por el servidor.
3. Escribí `sí`: no confirma. Tocá **Confirmar simulación** → número de factura simulada y enlace al PDF en la web.

**5. Pago informado y solicitudes** (sigue Bruno)

1. Pago informado:
   - **Deudas → Informar un pago** → cuota → **Hoy** → importe → adjuntá un PDF con 📎;
   - en el resumen, **Informar pago**.
2. Hablar con el estudio:
   - **Hablar con el estudio** → motivo → escribí la consulta → **Sin adjunto** → **Enviar al estudio**;
   - escribí otro mensaje: se suma a la misma solicitud;
   - **Volver al asistente**.

**6. El estudio la atiende** (web, como `admin@contadorsmart.local`)

1. **Bandeja**: la solicitud figura con su número S-XXXXXX y "canal WhatsApp".
2. Agregá una **nota interna** y respondé al cliente. En "Avisos por WhatsApp" aparece "Entregado en el simulador".
3. En el simulador llega solo el aviso con el número. Para ver la respuesta: **Mis solicitudes → Ver abiertas** → la solicitud. La nota interna **no** aparece.

**7. Fallas, duplicados y opciones viejas** (simulador)

1. Tocá un botón de un mensaje anterior → "Esa opción es de un mensaje anterior…" y repite las opciones vigentes.
2. **Reenviar el último mensaje (duplicado)** → "Evento duplicado: se descartó".
3. Falla antes de procesar:
   - en "Simular una falla", elegí **Falla antes de procesar** y tocá una opción → "Estoy verificando si quedó registrado…";
   - volvé a "Sin fallas" y tocá **Reintentar fallidos** → llega la respuesta una sola vez.
4. Tildá **Ver como un cliente sin botones**: las opciones se ven numeradas y responder con el número funciona.

**8. Corte de acceso** (web, admin → Accesos)

- **Desvincular WhatsApp** de Bruno → en el simulador, vuelve el saludo de persona sin vincular.
- O bien **Suspender** a Bruno → "Tu acceso no está disponible…".

**9. Volver a empezar**

Con **Reiniciar este número**, un número ficticio vuelve a quedar desvinculado y sin conversación.

**10. Reinicio del servidor**

Cortá `npm run dev`, volvé a levantarlo y recargá el simulador: la conversación y los datos siguen ahí.

## Pruebas automáticas

```bash
npm run verify
```

Incluye los 25 casos del bot, sobre una base aparte. Detalle en `docs/whatsapp-bot-interactivo.md`.

```bash
npm run test:e2e
```

Incluye el recorrido completo en el simulador y el webhook con firma, sobre una copia de la app en el puerto 3100.
