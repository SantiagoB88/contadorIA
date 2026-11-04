# Cómo probar el asistente de WhatsApp (demo)

Esta demo muestra cómo funciona el asistente de WhatsApp de ContadorSmart. Todos los datos son ficticios: no hay conexión con ARCA y nada tiene validez fiscal.

## Antes de empezar

- **Hacé el recorrido de corrido.** Es una demo: si queda un rato sin uso, vuelve sola a los datos de ejemplo. Si aparece el aviso **"La demo se reinició"**, tocá **Recargar y empezar de nuevo**.
- **Usuario del estudio:** `admin@contadorsmart.local`, contraseña `Demo1234!`.

## 1. Abrir el simulador

1. Entrá a la web con el usuario del estudio.
2. En el menú tocá **Probar bot de WhatsApp (DEMO)**. Se abre en otra pestaña una pantalla que imita WhatsApp.
3. Arriba a la izquierda dice **Tu WhatsApp de prueba**: es tu propio número ficticio y empieza sin cuenta, como alguien que le escribe al estudio por primera vez.

## 2. Darte de alta por el chat

1. Escribí `hola` y tocá **Quiero registrarme** → **Empezar**.
2. El asistente te pide, de a uno:
   - nombre y apellido;
   - correo;
   - CUIT;
   - a qué te dedicás;
   - desde qué mes y año facturás (por ejemplo `05/2023`).

   Si cargás algo mal (un correo incompleto, un CUIT con el último número equivocado), te lo dice y te lo vuelve a pedir.

   El CUIT no se busca en ningún padrón: se valida con su dígito verificador. Si inventás uno, el asistente te dice qué último número corresponde. Uno de prueba que funciona: `20-12345678-6`.
3. Revisá el resumen. Si querés, tocá **Corregir**. Para confirmar tocá **Crear mi cuenta**: escribir "sí" no alcanza, hay que tocar el botón.
4. El asistente crea tu cuenta, vincula ese WhatsApp y te da una **contraseña temporal** para entrar a la web (vence en 72 horas). Nunca te pide la clave fiscal.
5. Mientras el estudio no apruebe tu acceso, el asistente solo te deja ver el estado, consultar al estudio o pedir otra contraseña temporal.

## 3. Aprobar como estudio

1. Volvé a la pestaña de la web (usuario del estudio) y entrá a **Accesos**.
2. Vas a ver tu pedido con el CUIT que cargaste. Tocá **Aprobar acceso**.
3. En el chat te llega solo el aviso: **"El estudio aprobó tu acceso"**. Escribí `menú` y ya ves el menú completo.

## 4. Entrar a la web con tu cuenta nueva

1. Abrí una **ventana privada** del navegador, para no mezclarla con la sesión del estudio.
   - Si usás la misma ventana, la página de ingreso te muestra con qué cuenta estás y te ofrece **Cerrar sesión y entrar con otra cuenta**.
2. Ingresá con tu correo y la contraseña temporal. Para copiarla sin errores, usá el botón **Copiar contraseña** del simulador. La web te pide elegir una contraseña propia.

## 5. Recorrer todo con datos cargados

En **Quién escribe** elegí **Ana Gómez · clienta de ejemplo**. Ana ya tiene facturación, vencimientos y documentos cargados. Probá:
- **Mi resumen**: facturación del período, margen de categoría y próximo vencimiento.
- **Facturación → Preparar factura**: guiada paso a paso. Al final muestra un resumen y se confirma con un botón. Es una factura simulada.
- **Deudas y vencimientos → Informar un pago**: adjuntá cualquier PDF o foto con el clip 📎.
- **Hablar con el estudio**: mandá una consulta.

Después, en la web del estudio, entrá a **Bandeja**: vas a ver la consulta con su número (S-XXXXXX). Si la respondés, el aviso le llega a Ana en el simulador.

## Volver a empezar

- **Usar un número nuevo**: empezás de cero, como otra persona.
- **Restablecer demo**, en **Herramientas de prueba técnicas**, solo para el estudio: vuelve todo a los datos de ejemplo.

## Lo que en la demo no funciona igual que en producción

- **Correos:** no salen a internet; se ven en `/dev/correos` dentro de la demo.
- **WhatsApp real:** el simulador usa el mismo asistente que WhatsApp, pero los mensajes no van a un celular.
- **Datos:** son temporales y vuelven a los de ejemplo cuando la demo se reinicia.
