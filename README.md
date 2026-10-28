# ContadorSmart · V1 local (versión simple)

Portal del contribuyente + backoffice mínimo del estudio. Todo corre en tu compu, con datos ficticios y **sin conexión con ARCA**.

## Requisitos

- Node.js 20 o superior (probado con Node 22.16)
- Nada más: la base es un archivo SQLite local (`prisma/dev.db`). No hace falta Docker ni PostgreSQL.

## Arrancar

```bash
npm install
npm run dev
```

Abrí http://localhost:3000.

La primera vez, `npm run dev` crea la base y carga los datos de demo automáticamente. Las veces siguientes no toca nada: lo que cargues se conserva entre reinicios.

## Usuarios de demo

Contraseña de todos: `Demo1234!` (solo existen en esta base local).

| Usuario | Rol | Qué ve |
|---|---|---|
| `admin@contadorsmart.local` | Administrador | Los 6 contribuyentes del Estudio Demo + backoffice |
| `cliente.a@contadorsmart.local` | Cliente | Ana Gómez (normal) y Martín Gómez (próximo al límite) |
| `cliente.b@contadorsmart.local` | Cliente | Bruno Díaz (límite superado). Tiene un acceso *pendiente* a Elena Paz que **no** lo habilita |
| `admin.otro@contadorsmart.local` | Administrador | Otro estudio (sirve para probar aislamiento) |

Perfiles sembrados: Ana (normal), Elena (preventivo, ~85 %), Martín (próximo, ~98 %), Bruno (superado, ~109 %), Carla (sin actividad: cero real), Diego (información incompleta).

## Recorrido de prueba sugerido

1. Entrá como `cliente.a` → ves el tablero de Ana. Cambiá a Martín con el selector. Cambiá el período.
2. Tocá "Ver N comprobantes" en una tarjeta → ves el detalle que explica el total (el borrador aparece tachado y no suma).
3. Copiá la URL del tablero de Bruno (entrando como admin) y abrila con `cliente.a` → "No tenés acceso".
4. Entrá como `admin` → Backoffice → Ana → "Cargar comprobante manual". Volvé al tablero: el total cambió.
5. Cortá `npm run dev` (Ctrl+C), volvé a levantarlo: el comprobante sigue ahí.
6. En el backoffice, Diego → "Cobertura de datos": poné una fecha de hace más de 12 meses y marcá "completos" → aparece su margen.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la app en modo desarrollo (crea la base si no existe) |
| `npm run verify` | Corre las verificaciones de cálculos, umbrales y permisos contra la base local |
| `npm run typecheck` | Chequeo de tipos |
| `npm run build` | Build de producción |
| `npm run db:reset` | **Borra todo** y vuelve a cargar los datos de demo |
| `npm run db:studio` | Abre Prisma Studio para mirar la base |

`npm run verify` asume los datos de demo originales; si cargaste mucho a mano, corré antes `npm run db:reset`.

## Problemas frecuentes

- **`EPERM` / archivo en uso al instalar o generar Prisma**: cerrá `npm run dev` y cualquier Prisma Studio abierto, y repetí. OneDrive a veces bloquea archivos mientras sincroniza: si persiste, pausá la sincronización un momento.
- **Quiero empezar de cero**: `npm run db:reset`.
- **El puerto 3000 está ocupado**: `npx next dev -p 3001`.

## Documentación

- `docs/plan-desarrollo.md` – plan de desarrollo por pasos
- `docs/estado.md` – qué está hecho y qué no
- `docs/decisiones.md` – decisiones técnicas y supuestos
- `docs/backlog.md` – pendientes
