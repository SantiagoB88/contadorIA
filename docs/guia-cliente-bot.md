# Cómo probar el asistente de WhatsApp (demo)

Esta demo muestra cómo funciona el asistente de WhatsApp de ContadorSmart. Todos los datos son ficticios. No hay conexión con ARCA y nada tiene validez fiscal.

## Antes de empezar

- Hacé el recorrido de corrido. Es una demo: si queda un rato sin uso, vuelve sola a los datos de ejemplo.
- Si aparece el aviso **"La demo se reinició"**, tocá **Recargar y empezar de nuevo**.
- Usuarios de prueba (contraseña `Demo1234!` para todos):
  - `admin@contadorsmart.local`: el estudio contable.
  - `cliente.a@contadorsmart.local`: Ana Gómez, cliente con WhatsApp ya vinculado.

## 1. Abrir el simulador

1. Entrá a la web e ingresá con `admin@contadorsmart.local`.
2. En el menú tocá **Probar bot de WhatsApp (DEMO)**. Se abre en otra pestaña una pantalla que imita WhatsApp.
3. En **Quién escribe** elegís el número desde el que le escribís al asistente. Son números de prueba.

## 2. Una clienta que ya usa el servicio (Ana)

1. En **Quién escribe** elegí **Ana Gómez**, escribí `hola` y tocá los botones que aparecen.
2. Probá desde el menú:
   - **Mi resumen**: facturación del período, margen de categoría y próximo vencimiento.
   - **Facturación → Preparar factura**: el asistente te guía paso a paso. Al final muestra un resumen y se confirma con un botón. Es una factura simulada.
   - **Deudas y vencimientos → Informar un pago**: adjuntá cualquier PDF o foto con el clip 📎.
   - **Hablar con el estudio**: mandá una consulta.
3. Volvé a la pestaña de la web: en **Bandeja** aparece la consulta, con su número (S-XXXXXX) y "canal WhatsApp". Respondela, y en el simulador le llega el aviso a Ana.

## 3. Una persona nueva que se da de alta

1. En **Quién escribe** elegí **Persona nueva**. Para empezar de cero, tocá **Reiniciar este número**.
2. Escribí `hola` y tocá **Quiero registrarme**. El asistente te da un enlace para crear la cuenta en la web. Nunca pide datos fiscales ni contraseñas por chat.
3. Abrí ese enlace en una ventana privada del navegador, así no se mezcla con la sesión del estudio:
   - creá la cuenta;
   - confirmá el correo desde **/dev/correos** (los correos de la demo no salen a internet);
   - volvé al enlace del asistente para vincular el WhatsApp;
   - en **Mi perfil**, pedí asociarte a un CUIT.
4. Mientras el estudio no aprueba, el asistente solo permite ver el estado o consultar al estudio.
5. Como estudio (`admin@…`), en **Accesos** aprobá la solicitud. Desde ese momento, el asistente muestra el menú completo.

## 4. Volver a empezar

Como administrador, en el simulador está **Restablecer demo (todos los datos)**, que vuelve todo a los datos de ejemplo.
