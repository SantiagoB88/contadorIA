# DashGoBo

Plataforma SaaS de facturación para Argentina. El **backend/API** es el núcleo del
sistema; la web (y más adelante un bot de WhatsApp, app móvil e IA) son clientes de
esa misma API. Ninguna lógica de negocio crítica vive fuera del backend.

> Estado actual: **Fase 7 — Frontend completo (MVP)**. Backend con auth +
> multi-tenancy + RBAC, CRUD de clientes/productos, facturación con
> `MockInvoiceProvider` (CAE simulado) e idempotencia, dashboard, y recuperación
> de contraseña. Frontend Next.js conectado al API real: landing, login,
> registro, recuperar/resetear contraseña, shell autenticado, dashboard,
> clientes, productos y el flujo completo de facturación. Queda pendiente la
> Fase 8 — seed de datos demo y documentación de cierre (ver
> [`docs/roadmap.md`](docs/roadmap.md)).

## Stack

| Capa          | Tecnología                                                     |
| ------------- | -------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo                                    |
| Frontend      | Next.js (App Router) · React 19 · TypeScript · Tailwind CSS v4 |
| Backend       | NestJS 11 · TypeScript · REST · OpenAPI/Swagger                |
| Base de datos | PostgreSQL 16 gestionado por **Supabase** · Prisma ORM         |
| Contratos     | `@dashgobo/contracts` (Zod + tipos compartidos)                |
| Infra dev     | Docker Compose (Mailpit, opcional)                             |
| Calidad       | ESLint · Prettier · Jest (api) · Vitest (web/contracts)        |

## Requisitos

- Node.js `>= 22.11` (ver [`.nvmrc`](.nvmrc))
- pnpm `>= 10` (`corepack enable`)
- Una cuenta de [Supabase](https://supabase.com) (plan free alcanza) y un proyecto creado
- Docker es **opcional** (solo para Mailpit, correo de prueba local — nada lo requiere todavía)

## Puesta en marcha

```bash
# 1. Instalar dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Después, en el dashboard de Supabase: **Project Settings → Database → Connection
string** y pegá en `apps/api/.env` (y en `.env` si vas a usar Docker):

- `DATABASE_URL` = la cadena de **"Connection pooling"** (puerto `6543`, agregale `?pgbouncer=true`)
- `DIRECT_URL` = la cadena de conexión **directa** (puerto `5432`, sin pooling)

```bash
# 3. Crear la base de datos (primera vez: genera la migración inicial)
pnpm db:migrate:init

# 4. Levantar api + web en modo desarrollo
pnpm dev
```

> En corridas posteriores, `pnpm db:migrate` aplica migraciones nuevas y
> `pnpm db:migrate:deploy` aplica solo las ya versionadas (útil en CI/servidores).
> `pnpm db:studio` abre Prisma Studio.

- Web: <http://localhost:3000>
- API health: <http://localhost:3001/api/v1/health>
- Swagger: <http://localhost:3001/docs>

### Mailpit (opcional, correo de prueba local)

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d
```

Mailpit queda en <http://localhost:8025>. No hace falta hasta que se implemente
el envío de emails (Fase 8 en adelante); nada se rompe si no lo levantás.

### Stack completo en Docker (opcional)

```bash
docker compose -f infra/docker-compose.yml --env-file .env --profile apps up -d --build
```

## Scripts (raíz)

| Comando                | Descripción                                    |
| ---------------------- | ---------------------------------------------- |
| `pnpm dev`             | api + web + watchers en paralelo (Turborepo)   |
| `pnpm build`           | Build de todos los paquetes                    |
| `pnpm lint`            | ESLint en todo el monorepo                     |
| `pnpm typecheck`       | `tsc --noEmit` por paquete                     |
| `pnpm test`            | Tests (Jest + Vitest)                          |
| `pnpm format`          | Prettier `--write`                             |
| `pnpm db:migrate:init` | Primera migración (crea `prisma/migrations/…`) |
| `pnpm db:migrate`      | Aplica/crea migraciones (desarrollo)           |
| `pnpm db:studio`       | Prisma Studio                                  |
| `pnpm db:seed`         | Seed de datos demo (Fase 8)                    |

## Estructura del repositorio

```
DashGoBo/
├── apps/
│   ├── api/            # NestJS — API central (núcleo del sistema)
│   └── web/            # Next.js — aplicación web
├── packages/
│   ├── contracts/      # Zod + tipos compartidos (contrato de la API)
│   └── config/         # tsconfig base compartido
├── infra/              # Docker Compose + Dockerfiles
├── docs/               # Arquitectura y roadmap
└── .github/workflows/  # CI (install · lint · typecheck · test · build)
```

## Documentación

- [`docs/architecture.md`](docs/architecture.md) — arquitectura, multi-tenancy,
  InvoiceProvider, integraciones futuras (ARCA, WhatsApp), seguridad.
- [`docs/roadmap.md`](docs/roadmap.md) — plan por fases y estado.
- [`docs/decisions.md`](docs/decisions.md) — decisiones técnicas (ADR ligero).

## Seguridad

Los secretos van **solo** en variables de entorno; nunca en el frontend ni en el
repositorio. `.env` está en `.gitignore`. Las credenciales sensibles (ARCA) se
cifrarán en reposo cuando se implemente esa integración.
