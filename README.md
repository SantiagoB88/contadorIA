# ContadorSmart · V1 local (versión simple)

Portal del contribuyente + backoffice del estudio. Todo corre en tu compu, con datos ficticios y **sin conexión con ARCA**.

## Requisitos

- Node.js 20 o superior (probado con Node 22.16)
- Nada más: la base es un archivo SQLite local (`prisma/dev.db`). No hace falta Docker ni PostgreSQL.

## Arrancar

```bash
npm install
npm run dev
```

Abrí http://localhost:3000.

Antes de levantar, `npm run dev` prepara la base:
- si no existe, la crea con los datos de demo;
- si existe, le aplica los cambios nuevos **sin borrar lo que cargaste**.

> Después de actualizar el código (por ejemplo, con `git pull`), cortá `npm run dev` con Ctrl+C y volvé a levantarlo, así se aplican los cambios de la base.

## Usuarios de demo

Contraseña de todos: `Demo1234!` (solo existen en esta base local).

| Usuario | Rol | Qué ve |
|---|---|---|
| `admin@contadorsmart.local` | Administrador | Los contribuyentes del Estudio Demo, backoffice y accesos |
| `cliente.a@contadorsmart.local` | Cliente | Ana Gómez (normal) y Martín Gómez (próximo al límite) |
| `cliente.b@contadorsmart.local` | Cliente | Bruno Díaz (límite superado). Tiene una solicitud *pendiente* para Elena Paz que **no** le da acceso |
| `admin.otro@contadorsmart.local` | Administrador | Otro estudio (sirve para probar aislamiento) |

Perfiles sembrados: Ana (normal), Elena (preventivo, ~85 %), Martín (próximo, ~98 %), Bruno (superado, ~109 %), Carla (sin actividad: cero real), Diego (información incompleta).

## Correos de prueba

En la demo no se envía ningún correo real. Los correos de verificación y recuperación quedan en **http://localhost:3000/dev/correos** (también hay un enlace abajo del login).

## Recorridos de prueba

**Tablero (entrega 1)**
1. Entrá como `cliente.a`: vas a ver el tablero de Ana. Cambiá a Martín con el selector y probá otro período.
2. Tocá "Ver N comprobantes" en una tarjeta: aparecen los comprobantes que suman ese total. El borrador aparece tachado y no suma.
3. Entrá como admin y copiá la URL del tablero de Bruno. Abrila con `cliente.a`: tiene que decir "No tenés acceso".
4. Como admin, andá a Backoffice → Ana → "Cargar comprobante manual". Volvé al tablero: el total cambió.

**Alta de un cliente nuevo (entrega 2)**
1. En el login tocá "Creá una" y registrate con un correo inventado.
2. Andá a `/dev/correos`, abrí el enlace "Confirmá tu correo" y tocá "Confirmar mi correo".
3. Ingresá. El tablero te pide asociar tu CUIT: cargá uno. Para probar podés usar `20-12345678-6`, que es nuevo, o `27-00000001-4`, que es el de Ana.
4. Vas a ver "solicitud pendiente" y ningún dato fiscal todavía.
5. Entrá como admin, andá a **Accesos** y aprobá la solicitud. Al volver a ingresar como el cliente nuevo, ya ves el contribuyente.
6. En Accesos, **revocá** ese acceso. El cliente lo deja de ver apenas cambia de pantalla.
7. En Accesos → Usuarios, **suspendé** al cliente: se le cierra la sesión y ya no puede ingresar.

**Contraseñas**
- "¿Olvidaste tu contraseña?" → el enlace llega a `/dev/correos` → elegís una nueva. Ese enlace sirve una sola vez.
- En **Mi perfil** podés cambiar tus datos y tu contraseña.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Prepara la base y levanta la app en modo desarrollo |
| `npm run verify` | Corre 37 verificaciones (cálculos, permisos, alta, accesos) en una base **aparte** (`prisma/verify.db`) |
| `npm run typecheck` | Chequeo de tipos |
| `npm run build` | Build de producción |
| `npm run db:reset` | **Borra todo** y vuelve a cargar los datos de demo |
| `npm run db:studio` | Abre Prisma Studio para mirar la base |

## Problemas frecuentes

- **`EPERM` / archivo en uso al instalar o generar Prisma**: cerrá `npm run dev` y cualquier Prisma Studio abierto, y repetí. OneDrive a veces bloquea archivos mientras sincroniza: si persiste, pausá la sincronización un momento.
- **Error de Prisma al arrancar después de actualizar**: cortá y volvé a correr `npm run dev`; si sigue, `npm install` y otra vez `npm run dev`.
- **Quiero empezar de cero**: `npm run db:reset`.
- **El puerto 3000 está ocupado**: `npx next dev -p 3001`.

## Documentación

- `docs/plan-desarrollo.md` – plan de desarrollo por entregas
- `docs/estado.md` – qué está hecho y qué no
- `docs/decisiones.md` – decisiones técnicas y supuestos
- `docs/backlog.md` – pendientes
