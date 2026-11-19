# Piloto en el VPS Hostinger (Ubuntu 24.04)

Objetivo del piloto:
- alta por WhatsApp;
- pedido de la constancia tocando una opción;
- el contador ve **una** solicitud del cliente correcto, adjunta un PDF y llega al mismo chat;
- todo persiste después de reiniciar y funciona con la notebook apagada.

La demo de Vercel no se toca: sigue en `main`. El piloto sale de la rama `feat/piloto-vps`.

Cada comando dice **dónde** se corre y **qué tendrías que ver**.

## Qué corre en el VPS

- **App:** la misma de la demo (Next.js), arrancada por `scripts/server-start.mjs`.
  - Al iniciar crea o actualiza la base SQLite, sin borrar datos.
  - Si la base está vacía, crea solo el estudio y su administrador: **sin datos ni contraseñas de ejemplo**.
- **Datos:** base y archivos en `/var/lib/contadorsmart`. Sobreviven a reinicios y a actualizaciones del código.
- **Servicio:** `systemd`, para que arranque solo y se reinicie si se cae (`deploy/contadorsmart.service`).
- **HTTPS:** Caddy, con certificado automático de Let's Encrypt (`deploy/Caddyfile`).
- **Secretos:** en `/etc/contadorsmart/contadorsmart.env`, con permisos 600 y dueño root. Nunca en GitHub ni en un chat.
- **Herramientas de demo cerradas:**
  - Ingresar no muestra usuarios de ejemplo.
  - `/dev/correos` solo lo ve un administrador.
  - No hay simulador de WhatsApp.

## 0. Antes de empezar

- Un **dominio o subdominio** (por ejemplo `app.tudominio.com`) con un registro **A** que apunte a la IP del VPS. Se carga en el panel de quien administre el dominio.
- La **app de Meta** con el producto WhatsApp: número de prueba, token, Phone Number ID y App Secret. Agregá tu celular como destinatario de prueba.

**NOTEBOOK** — comprobar que el dominio ya apunta al VPS. Debería mostrar la IP del VPS.
```bash
nslookup app.TUDOMINIO.com
```

## 1. Preparar el servidor (una vez)

**NOTEBOOK** — entrar al VPS. Deberías ver `root@...:~#`.
```bash
ssh root@IP_DEL_VPS
```
**VPS HOSTINGER** — actualizar el sistema. Termina sin errores.
```bash
apt update && apt upgrade -y
```
**VPS HOSTINGER** — Node 22 y git. La última línea muestra `v22.x`.
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs git && node -v
```
**VPS HOSTINGER** — firewall: solo SSH y web. Muestra `Status: active` con 22 (OpenSSH), 80 y 443. Si el panel de Hostinger tiene su propio firewall, también hay que permitir 80 y 443 ahí.
```bash
apt install -y ufw && ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable && ufw status
```
**VPS HOSTINGER** — instalar Caddy desde los repositorios de Ubuntu. En el VPS del piloto falló la clave del repositorio de Caddy, y el paquete de Ubuntu alcanza. La última línea muestra la versión.
```bash
apt update && apt install -y caddy && caddy version
```

**Si la consola web dice `command not found` con comandos básicos** (por ejemplo, `apt` o `ufw`) después de reconectarse, restablecé las rutas:
```bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; umask 022
```
**VPS HOSTINGER** — usuario propio del servicio y carpetas. Termina sin mensajes.
```bash
useradd --system --home /var/lib/contadorsmart --shell /usr/sbin/nologin contadorsmart && mkdir -p /var/lib/contadorsmart /etc/contadorsmart && chown contadorsmart:contadorsmart /var/lib/contadorsmart && chmod 700 /var/lib/contadorsmart
```

## 2. Instalar la app

**VPS HOSTINGER** — bajar el código de la rama del piloto. Muestra `feat/piloto-vps`.
```bash
git clone --branch feat/piloto-vps https://github.com/SantiagoB88/contadorIA.git /opt/contadorsmart && cd /opt/contadorsmart && git branch --show-current
```
**VPS HOSTINGER** — instalar y compilar. Tarda unos minutos y termina con la lista de páginas, sin `Error`.
```bash
cd /opt/contadorsmart && npm ci && npm run build && chown -R contadorsmart:contadorsmart /opt/contadorsmart/.next
```

## 3. Cargar los secretos (privado)

**VPS HOSTINGER** — crear el archivo a partir del ejemplo y dejarlo solo para root. Muestra `-rw------- 1 root root`.
```bash
cp /opt/contadorsmart/deploy/contadorsmart.env.example /etc/contadorsmart/contadorsmart.env && chmod 600 /etc/contadorsmart/contadorsmart.env && ls -l /etc/contadorsmart/contadorsmart.env
```
**VPS HOSTINGER** — completar los valores. Se abre el editor: guardás con Ctrl+O y Enter, y salís con Ctrl+X.
```bash
nano /etc/contadorsmart/contadorsmart.env
```

Qué va en cada uno:
- `APP_URL`: `https://app.TUDOMINIO.com`.
- `PILOT_ADMIN_EMAIL` y `PILOT_ADMIN_PASSWORD`: tu usuario de contador, con una contraseña de 12 caracteres o más. Solo se usan la primera vez, para crear la cuenta.
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_APP_SECRET`: los de Meta.
- `WHATSAPP_VERIFY_TOKEN`: un texto que inventes. El mismo va en Meta (paso 6).

## 4. Arrancar el servicio

**VPS HOSTINGER** — instalar y prender el servicio. Muestra `active (running)`.
```bash
cp /opt/contadorsmart/deploy/contadorsmart.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now contadorsmart && systemctl status contadorsmart --no-pager
```
**VPS HOSTINGER** — ver el arranque. La primera vez aparecen estas líneas:
- `Base nueva: se prepara en modo piloto`;
- `Estudio "..." y administrador ... creados`;
- `Ready`.

```bash
journalctl -u contadorsmart -n 40 --no-pager
```
**VPS HOSTINGER** — la app responde por dentro. Muestra `200`.
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
```

## 5. Publicar con HTTPS

**VPS HOSTINGER** — configurar Caddy para el dominio (piloto: `contadoria.co` y `www.contadoria.co`) y prenderlo. Al final muestra `active` y `certificate obtained successfully` para cada nombre.
```bash
printf 'contadoria.co, www.contadoria.co {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
' > /etc/caddy/Caddyfile && systemctl enable caddy && systemctl restart caddy && sleep 25 && systemctl is-active caddy && journalctl -u caddy -n 40 --no-pager | grep -iE "certificate obtained|error" | tail -4
```

**NOTEBOOK** — abrir `https://app.TUDOMINIO.com/login` en el navegador. Debería verse con candado y sin usuarios de ejemplo. Entrás con `PILOT_ADMIN_EMAIL` y `PILOT_ADMIN_PASSWORD`.

**NOTEBOOK** — la verificación de Meta funciona. Muestra `12345`.
```bash
curl "https://app.TUDOMINIO.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=12345"
```

## 6. Conectar Meta

En developers.facebook.com → tu app → WhatsApp → **Configuración**:
1. Webhook → **Editar**:
   - URL de devolución de llamada: `https://app.TUDOMINIO.com/api/whatsapp/webhook`;
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`;
   - **Verificar y guardar** (tiene que quedar en verde).
2. Campos del webhook: suscribí **messages**.
3. En **Configuración de la API**, agregá tu celular como destinatario de prueba.

## 7. Recorrido del piloto (desde tu celular)

1. Escribí `hola` al número de prueba → **Quiero registrarme** → **Empezar**. Completá nombre, correo, CUIT y actividad, y tocá **Crear mi cuenta**.
2. Escribí `menú` → **Documentos** → **Solicitar un documento** → **Constancia inscripción** → **Pedir documento**.
3. En la web, como contador: **Bandeja** → tiene que haber **una** solicitud "Pido: Constancia de inscripción" con tu nombre. Abrila, escribí una respuesta, adjuntá un PDF y tocá **Enviar**.
4. En tu celular llegan el aviso y el **PDF**.

**Importante:** Meta solo deja mandar mensajes libres (incluido el PDF) **dentro de las 24 horas** desde tu último mensaje. Si pasó más, escribí cualquier cosa al bot y respondé de nuevo desde la web. Fuera de esa ventana hace falta una plantilla aprobada por Meta; todavía no está hecho.

## 8. Comprobar que persiste

**VPS HOSTINGER** — reiniciar solo la app. Muestra `active (running)`. Después, la solicitud y la cuenta siguen ahí.
```bash
systemctl restart contadorsmart && sleep 15 && systemctl status contadorsmart --no-pager
```
**VPS HOSTINGER** — reiniciar todo el servidor. Se corta la conexión SSH; a los 2 o 3 minutos la web y el bot vuelven solos.
```bash
reboot
```

## Si algo falla

**VPS HOSTINGER** — ver los registros en vivo (Ctrl+C para salir).
```bash
journalctl -u contadorsmart -f
```

| Síntoma | Qué mirar |
|---|---|
| El webhook no verifica | `WHATSAPP_VERIFY_TOKEN` igual en el archivo y en Meta; el `curl` del paso 5 tiene que devolver `12345`. |
| Llegan mensajes pero el bot no contesta | Error **131030** ("no está en la lista"): con celulares argentinos, el bot ya prueba solo los formatos 549…, 54… y 54 11 15… y se queda con el que acepta Meta (en el piloto fue 54 11 15). Si los tres fallan, el número no está en la lista de destinatarios de Meta. Para ver qué formato acepta: `set -a; . /etc/contadorsmart/contadorsmart.env; set +a; node scripts/diagnostico-whatsapp.mjs`. |
| El PDF no llega | Pasaron más de 24 horas desde tu último mensaje (error **131047**): escribile al bot y respondé de nuevo. |
| Error al arrancar por la base | Los registros dicen qué cambio de esquema se detuvo. No borres `/var/lib/contadorsmart`. |

## Comprobar la Bandeja y la persistencia sin WhatsApp

**VPS HOSTINGER** — crear una solicitud de prueba (cliente ficticio), reiniciar y volver a contar. Muestra `Solicitudes de prueba en la base: 1` antes y después de `active`. Después aparece en la Bandeja.
```bash
cd /opt/contadorsmart && runuser -u contadorsmart -- env HOME=/var/lib/contadorsmart DATABASE_URL=file:/var/lib/contadorsmart/contadorsmart.db node node_modules/tsx/dist/cli.mjs scripts/solicitud-de-prueba.ts && systemctl restart contadorsmart && sleep 20 && systemctl is-active contadorsmart && runuser -u contadorsmart -- env HOME=/var/lib/contadorsmart DATABASE_URL=file:/var/lib/contadorsmart/contadorsmart.db node node_modules/tsx/dist/cli.mjs scripts/solicitud-de-prueba.ts contar
```

## Actualizar el código después

**VPS HOSTINGER** — bajar los cambios, recompilar y reiniciar. Los datos no se tocan. El `umask 022` y el `chmod` evitan que los archivos nuevos queden solo para root: el servicio no podría leerlos.
```bash
umask 022; cd /opt/contadorsmart && git pull && npm ci && npm run build && chmod -R a+rX /opt/contadorsmart && chown -R contadorsmart:contadorsmart .next && systemctl restart contadorsmart
```

## Ensayo en la notebook (sin Meta ni internet)

**NOTEBOOK** — el mismo arranque del VPS, con un WhatsApp y una API de Meta de prueba. Recorre:
- alta;
- constancia;
- una sola solicitud del cliente correcto;
- PDF al chat;
- reinicio.

Termina con `Ensayo OK: 14 comprobaciones`.
```bash
npm run ensayo:piloto
```
Antes hay que compilar con `NEXT_DIST_DIR=.next-prodtest npm run build`.

## Pendiente antes de datos reales

- Permisos por cliente revisados.
- Secretos cifrados en la base y reautenticación para revelarlos.
- Plantillas de Meta para avisar fuera de las 24 horas.
- Copias de seguridad de `/var/lib/contadorsmart`.
- Correo real (hoy los correos quedan en la bandeja local).
- Después: facturación frecuente, servicios de ARCA y evaluación de Aconpy.
