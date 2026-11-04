# Demo en Vercel con base compartida (Turso)

Con Turso, todas las copias del servidor que levanta Vercel usan la misma base. Eso permite usar el bot de WhatsApp desde la web, con el simulador. También hace que lo que se crea en la demo (usuarios, solicitudes, facturas, archivos) no desaparezca entre clics.

Sin Turso, la demo sigue funcionando como antes, con la base incluida en el deploy. En ese caso el simulador no se muestra.

## Qué cambia y qué no

| | En tu compu (`npm run dev`) | Vercel sin Turso | Vercel con Turso |
|---|---|---|---|
| Base | `prisma/dev.db` | Copia por instancia (se pierde) | Turso, compartida |
| Archivos adjuntos | Carpeta `storage/` | Copia por instancia | Dentro de la base (tabla `StoredFile`) |
| Sesión | En la base | Cookie firmada | En la base |
| Simulador del bot | Sí | No | Sí, desde el menú **Probar bot de WhatsApp (DEMO)** |

El código es el mismo en los tres casos. Solo cambia la conexión (`src/lib/db.ts`) y dónde se guardan los archivos (`src/providers/storage.ts`). Los datos de demo se cargan con el mismo código (`src/modules/demo/seed-data.ts`).

## Pasos (una sola vez)

Nunca pegues el token en el chat: va solo en la configuración de Vercel.

1. **Creá la base en Turso.**
   - Entrá a <https://turso.tech>, creá una cuenta (el plan gratis alcanza) y tocá **Create Database**.
   - Nombre: por ejemplo `contadorsmart-demo`.
   - Ubicación: la más cercana a Vercel. Las funciones de Vercel corren por defecto en Washington (`iad1`), así que conviene **AWS US East (Virginia)**.
2. **Copiá los dos datos de conexión.** En la base, tocá **Connect** (o **Create Token**):
   - la URL, que empieza con `libsql://`;
   - un token de acceso con permiso de lectura y escritura, sin vencimiento o con uno largo.
3. **Cargalos en Vercel.**
   - En el proyecto, entrá a **Settings → Environment Variables**.
   - Agregá `TURSO_DATABASE_URL` con la URL y `TURSO_AUTH_TOKEN` con el token.
   - Marcá al menos **Production**.
4. **Publicá.** Al pasar el cambio a `main`, Vercel compila. En el deploy de producción, `scripts/turso-prepare.mjs` crea las tablas y carga los datos de demo. Si las variables ya estaban y querés aplicarlas sin un cambio nuevo, en **Deployments** tocá **Redeploy** en el último deploy de producción.

Cargá las variables **antes** de pasar a `main`. Si no, ese deploy usa la base incluida y el simulador no aparece; se arregla con un **Redeploy**.

## Cómo se mantiene la base

- **Deploy de producción** (`VERCEL_ENV=production`): si la base ya tiene el esquema de esta versión, no se toca nada y los datos se conservan. Si está vacía o el esquema cambió (`SCHEMA_VERSION`), se borran las tablas, se crea el esquema nuevo y se cargan los datos de demo.
- **Vistas previas** (otras ramas): usan la base tal como está, sin modificarla, para no borrar la demo publicada.
- **Restablecer demo**: en el simulador, un administrador puede volver todo a los datos de ejemplo con **Restablecer demo (todos los datos)**. Borra todo lo creado y cierra las sesiones. Como la base es compartida, cualquier persona que entre a la demo ve y cambia los mismos datos.

## Probar en la compu sin Turso real

El adaptador también abre una base libSQL local, así que todo el modo Turso se puede probar sin cuenta:

```bash
npm run verify:turso
```

Corre las mismas verificaciones que `npm run verify`, pero conectadas por el adaptador de Turso, sobre `prisma/verify-turso.db` (no toca `dev.db`).

## Límites conocidos

- Cada consulta a la base viaja por la red: las pantallas tardan unos milisegundos más que en la compu.
- Los mensajes de un mismo número se ordenan dentro de cada instancia. Si dos mensajes del mismo número llegaran a la vez a dos instancias distintas, se procesarían en paralelo. Las claves de idempotencia evitan duplicados, pero el orden no está garantizado. Con el simulador no pasa, porque manda de a un mensaje.
- Los adjuntos siguen limitados a 4 MB por envío en Vercel.
- El bot con WhatsApp real (Meta) también funcionaría sobre esta base, pero no está probado: ver `docs/whatsapp-prueba-real.md`.
