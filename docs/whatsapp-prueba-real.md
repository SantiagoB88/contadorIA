# Probar el bot con WhatsApp de verdad (número de prueba de Meta)

Esta guía conecta tu `npm run dev` con WhatsApp usando el **número de prueba gratuito de Meta**. No hace falta base online: todo corre en tu compu y Meta le manda los mensajes a través de un túnel HTTPS.

Documentación oficial consultada el 04/11/2026: Get started, Create webhook endpoint, Webhooks overview, Send messages, Access tokens y Error codes de WhatsApp Cloud API (developers.facebook.com/documentation/business-messaging/whatsapp/). Si Meta cambia algún paso, vale lo que diga su documentación.

> Nunca pegues los tokens en un chat ni los subas a GitHub. Van solo en tu archivo `.env`, que no se sube.

## Qué necesitás

- Una cuenta de Facebook para entrar a **Meta for Developers** (developers.facebook.com).
- Tu celular con WhatsApp, para recibir los mensajes de prueba.
- Un túnel HTTPS hacia tu compu. Meta exige HTTPS con certificado válido; no acepta certificados autofirmados. Dos opciones:
  - **cloudflared**, sin cuenta: `cloudflared tunnel --url http://localhost:3000`
  - **ngrok**, con cuenta gratuita: `ngrok http 3000`

## 1. Crear la app y el número de prueba

1. En developers.facebook.com/apps, creá una app con el caso de uso **"Connect with customers through WhatsApp"** y entrá a **Start using the API**.
2. En **WhatsApp → API Setup**:
   - Conectá una cuenta de mensajería (puede ser nueva).
   - Tocá **Generate access token**: es el token temporal, que vence en pocas horas.
   - En **From** elegí el número de prueba.
   - En **To** cargá tu número de celular.
   - Mandá el mensaje de prueba para confirmar que te llega.
3. Anotá el **Phone number ID** del número de prueba (aparece en esa misma pantalla).
4. En **App settings → Basic**, copiá el **App Secret**.

## 2. Configurar `.env` (en tu compu)

Agregá estas líneas al archivo `.env`, con tus valores:

```
WHATSAPP_TOKEN="(el token temporal)"
WHATSAPP_PHONE_NUMBER_ID="(el Phone number ID)"
WHATSAPP_VERIFY_TOKEN="(un texto cualquiera que elijas, por ejemplo contadorsmart-prueba-2026)"
WHATSAPP_APP_SECRET="(el App Secret)"
APP_URL="https://(la URL de tu túnel)"
```

`APP_URL` hace que los enlaces que manda el bot (crear cuenta, vincular) apunten al túnel y se puedan abrir desde el celular.

## 3. Levantar la app y el túnel

En una terminal:

```bash
npm run dev
```

En otra terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copiá la URL `https://….trycloudflare.com` que muestra, ponela en `APP_URL` y reiniciá `npm run dev`.

## 4. Configurar el webhook en Meta

1. En **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL**: `https://(tu túnel)/api/whatsapp/webhook`
   - **Verify token**: el mismo valor que `WHATSAPP_VERIFY_TOKEN`
2. Tocá **Verify and save**. Meta hace un GET con `hub.mode`, `hub.verify_token` y `hub.challenge`, y la app le devuelve el `hub.challenge`. Para eso la app tiene que estar corriendo.
3. En **Webhook fields**, suscribite a **messages**. Ese campo trae tanto los mensajes entrantes como los estados de los enviados.

## 5. Primer mensaje

Desde tu celular, escribile **hola** al número de prueba. Deberías recibir:

> ¡Hola! Soy el asistente de Estudio Demo. Este WhatsApp todavía no está vinculado a una cuenta…

Para vincularlo con un usuario de la demo:
1. Entrá a la web como `cliente.a@contadorsmart.local` (contraseña `Demo1234!`), en **Mi perfil → WhatsApp → Generar código**.
2. Mandá los 6 números por WhatsApp. El bot responde "Listo, vinculamos este WhatsApp con tu cuenta".
3. Escribí **menú**.

En la demo, Ana ya tiene vinculado el número ficticio del simulador. Tu número real es otro, así que no hay conflicto.

## 6. Cómo comprobar que anduvo

- **Llegó el mensaje**: en la base queda en `InboundEvent`, con estado `PROCESADO`. Podés mirarlo con `npm run db:studio`.
- **Respuesta enviada**: queda en `OutboundMessage`, con estado `ENVIADO` y el id de Meta. Si Meta informa un error, pasa a `FALLIDO` con su código.
- **Solicitud del bot**: en la web, en **Bandeja**, figura con "canal WhatsApp".
- **Aviso al responder**: cuando el estudio responde, la solicitud muestra "Avisos por WhatsApp" con el estado real del envío.

## Lo que hay que saber

- **Ventana de 24 horas**: WhatsApp solo deja mandar texto libre dentro de las 24 h del último mensaje del cliente. Fuera de esa ventana hace falta una plantilla aprobada por Meta (error `131047`). La app registra el envío como `FALLIDO`; las plantillas no están implementadas.
- **Duplicados**: Meta reintenta los envíos al webhook hasta 7 días y puede mandar el mismo mensaje dos veces. La app los descarta por su id.
- **Token temporal**: vence en pocas horas. Para algo estable hace falta un **System User token** (Business settings → System Users), con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
- **Números argentinos (el "9" después del 54)**: la documentación de Meta no dice nada específico. La app responde al mismo número que informa WhatsApp. Si una respuesta no te llega y Meta devuelve un error de destinatario, avisame con el código que figura en `OutboundMessage`.
- **App en modo desarrollo**: la documentación de Meta advierte que algunos webhooks no se envían si la app no está en modo "Live". Para el número de prueba con destinatarios cargados en **To** suele alcanzar; si no llegan los mensajes, revisá ese punto.
- **Vercel**: no configures este webhook en la demo de Vercel. Cada instancia tiene su propia copia de la base, así que se perderían vínculos y conversaciones. Para tener el bot en un link público hace falta una base compartida (PostgreSQL).

## Qué queda bloqueado sin credenciales

Sin una cuenta de Meta y un túnel, no se pudo comprobar:
- la entrega real a un celular;
- el formato del número argentino al responder;
- los estados `delivered` y `read` que manda Meta.

Todo lo demás está comprobado con el simulador y las pruebas automáticas: recepción, firma, duplicados, conversación, permisos y solicitudes.
