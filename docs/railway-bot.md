# Bot de WhatsApp real en Railway (prueba temporal)

La web y el simulador siguen en Vercel. Railway se usa solo para probar el bot con WhatsApp real, porque corre un servidor siempre prendido con su propia base (SQLite en su disco). Vercel no sirve para esto: sus copias tienen bases temporales y Meta no pasa por el navegador.

**Importante:** la base de Railway es aparte. No se comparte con la compu (`dev.db`) ni con la demo de Vercel. Lo que hagas por WhatsApp (altas, solicitudes, facturas simuladas) se ve entrando a la web con la dirección de Railway. Sigue en modo DEMO: facturas simuladas, sin ARCA y sin correos reales.

## Qué ya está preparado en el código

- `railway.json`: cómo compilar (`npm run build`) y cómo arrancar (`node scripts/railway-start.mjs`).
- `scripts/railway-start.mjs`, al arrancar:
  - crea la base si no existe y carga los datos de ejemplo;
  - si ya existe, aplica los cambios de esquema sin borrar datos;
  - después levanta la app.
- `.nvmrc`: Node 22.

## Pasos en Railway

1. **New Project → Deploy from GitHub repo** → `SantiagoB88/contadorIA`.
2. En el servicio: **Settings → Source → Branch**: `feat/whatsapp-bot`.
3. **Variables**: cargá estas cuatro. Los valores salen de Meta (WhatsApp → Configuración de la API) y no se comparten por chat.
   - `WHATSAPP_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_APP_SECRET` (Meta → Configuración de la app → Básica → Clave secreta)
   - `WHATSAPP_VERIFY_TOKEN`: un texto que inventes vos, por ejemplo `contadorsmart-prueba-2026`.
4. **Settings → Networking → Generate Domain**. Queda algo como `https://contadorsmart-production.up.railway.app`.
5. Opcional: **Add Volume** montado en `/data`, para que los datos sobrevivan a un redeploy. Sin volumen, cada deploy vuelve a los datos de ejemplo; para una prueba corta alcanza.

## Pasos en Meta (developers.facebook.com → tu app → WhatsApp → Configuración)

1. **Webhook → Editar**:
   - URL de devolución de llamada: `https://<tu-dominio>.up.railway.app/api/whatsapp/webhook`;
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`.
2. En los campos del webhook, suscribí **messages**.
3. Con el número de prueba de Meta, agregá tu celular como destinatario permitido.

## Probar

- Escribí `hola` al número de prueba desde tu celular.
- Para ver lo que hizo el bot, entrá a `https://<tu-dominio>.up.railway.app` con `admin@contadorsmart.local` / `Demo1234!` (datos de ejemplo de esa base).
- Si no responde: en Railway → **Deployments → Logs**. Al arrancar avisa si falta alguna variable de WhatsApp.

## Al terminar

Borrá el proyecto en Railway, o pausá el servicio, y quitá la URL del webhook en Meta.

## Probado en la compu (sin Meta real)

Se hizo el mismo arranque que en Railway, con valores de prueba:
- crea la base y la reutiliza al reiniciar;
- la verificación de Meta responde con el token correcto y da 403 con otro;
- un mensaje con firma inválida da 401;
- un `hola` firmado se procesa y deja la respuesta lista para enviar.

**No probado:** el envío real a Meta y el formato del número argentino al responder. Si el bot recibe pero no contesta, mirar en los logs el error que devuelve Meta.
