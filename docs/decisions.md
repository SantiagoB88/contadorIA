# Decisiones técnicas (ADR ligero)

Registro breve de decisiones y desvíos respecto del stack solicitado. Formato:
contexto → decisión → motivo.

## ADR-014 · Postgres gestionado por Supabase en vez de contenedor local

**Decisión:** la base de datos es un proyecto de Supabase (Postgres gestionado),
no un contenedor `postgres` en `docker-compose.yml`. Se sacó ese servicio del
compose. `docker-compose.yml` ahora solo trae Mailpit (opcional) y, bajo el
profile `apps`, las imágenes de api/web para levantar el stack completo en
contenedores si hace falta.
**Motivo:** pedido explícito del owner (no quiere depender de Docker Desktop
para el día a día). Supabase es Postgres estándar — Prisma no distingue.
**Implicancia técnica:** Supabase expone dos connection strings. Se usa
`DATABASE_URL` (pooled, puerto `6543`, pgbouncer) para las queries en runtime y
`DIRECT_URL` (puerto `5432`, sin pooling) para `prisma migrate`, porque
pgbouncer en modo transacción no soporta bien el DDL de las migraciones. El
schema declara ambas (`datasource db { url = env("DATABASE_URL") directUrl =
env("DIRECT_URL") }`); si `DIRECT_URL` no se define, cae a `DATABASE_URL`.
Docker queda totalmente opcional hasta que haga falta para otra cosa (email
real, stack completo en contenedores).

## ADR-001 · Monorepo con pnpm workspaces + Turborepo

**Decisión:** monorepo `apps/*` + `packages/*`, orquestado con Turborepo.
**Motivo:** el pedido lo permite ("Turborepo si aporta valor"). Aporta cache de
build/lint/test y comparte tipos vía `@dashgobo/contracts` con costo de setup
bajo. Sin Turborepo cada cambio en contracts obligaría a rebuilds manuales.

## ADR-002 · Representación de dinero: enteros en unidades menores

**Decisión:** montos como enteros en centavos (`BigInt` en Prisma) + código de
moneda; nunca floating point. Un value object `Money` en el backend encapsula
aritmética y redondeo.
**Motivo:** el pedido exige "no floating point" y ofrece "Decimal o
representación apropiada". Enteros evitan por completo el error de redondeo y son
portables a JS sin depender del tipo `Decimal` del driver. `Decimal` de Prisma
queda como alternativa si contabilidad exige >2 decimales de forma generalizada.
**Confirmado en uso:** validado de punta a punta en Fase 7 (conversión
pesos↔centavos en un único punto del frontend, `apps/web/src/lib/money.ts`).

## ADR-003 · Refresh token en cookie httpOnly (web)

**Decisión:** en la aplicación web, el refresh token viaja en cookie `httpOnly` +
`SameSite=Lax` + `Secure` (en prod); el access token vive en memoria del cliente.
**Motivo:** el pedido prohíbe secretos en el frontend y exige protección XSS. Un
refresh token en `localStorage` es exfiltrable por XSS. El futuro bot de WhatsApp
usará credenciales de servicio, no cookies, así que la API soporta ambos modos.
**Confirmado en uso:** el frontend de Fase 7 (`apps/web/src/lib/auth-context.tsx`)
guarda el access token solo en memoria y renueva en silencio vía la cookie.

## ADR-004 · Contratos compartidos con Zod, sin exponer Prisma

**Decisión:** `@dashgobo/contracts` define request/response con Zod y tipos
derivados. El backend valida entrada y salida contra estos esquemas; el frontend
los importa. Las entidades Prisma no se serializan directamente.
**Motivo:** una sola fuente de verdad del contrato de red, desacoplada del modelo
de persistencia. Permite evolucionar la DB sin romper clientes.

## ADR-005 · Versionado de API por URI desde el día 1

**Decisión:** `app.setGlobalPrefix('api')` + versioning URI con `defaultVersion:
'1'` → rutas `/api/v1/...`.
**Motivo:** el pedido lo exige. Permite `/api/v2` conviviendo sin romper
integraciones antiguas (WhatsApp, móvil).

## ADR-006 · NestJS con adaptador Express

**Decisión:** NestJS 11 sobre Express (default), no Fastify.
**Motivo:** máxima compatibilidad con librerías y ejemplos durante el MVP. La
migración a Fastify es de bajo riesgo si más adelante se necesita throughput.

## ADR-007 · Tailwind CSS v4

**Decisión:** Tailwind v4 (config CSS-first, `@theme` en `globals.css`).
**Motivo:** menos archivos de configuración, tokens de diseño co-ubicados con el
CSS. shadcn/ui (Fase 7) es compatible con v4.

## ADR-008 · Sin Redis / colas en el MVP

**Decisión:** rate limiting en memoria (`@nestjs/throttler`), sin Redis ni
BullMQ. La cola de jobs se define como interfaz con implementación in-process.
**Motivo:** el pedido dice explícitamente no incorporar Redis si no es necesario
para el MVP. Se agrega en la fase de jobs asíncronos.

## ADR-009 · `@dashgobo/contracts` compila a CommonJS

**Decisión:** el paquete de contratos emite CJS.
**Motivo:** lo consume NestJS (CommonJS) y Next.js (bundler, indiferente).
Emitir ESM obligaría a interop `require(esm)` frágil en el backend.

## ADR-010 · Errores: `DomainError` tipado + filtro global

**Decisión:** las fallas esperadas de negocio son subclases de `DomainError`
(cada una con `code: ApiErrorCode` y `httpStatus`). Un único
`AllExceptionsFilter` global traduce `DomainError`, `HttpException` y errores
conocidos de Prisma (P2002/P2025/P2003) a la envoltura estándar
`{ error: { code, message, details, requestId } }`. Cualquier otra cosa es un
fallo inesperado: se loguea completo y se responde 500 opaco.
**Motivo:** contrato de error consistente para web y para el futuro bot; los
controllers no arman respuestas de error a mano; no se filtran detalles internos.

## ADR-012 · Refresh token opaco (no JWT) con rotación por familia

**Decisión:** el access token es un JWT corto (`JWT_SECRET`, TTL 15 min). El
refresh token es un valor aleatorio opaco (48 bytes), guardado como HMAC-SHA256
(peppered con `JWT_REFRESH_SECRET`) en la tabla `RefreshToken`. Cada uso lo
revoca y emite un sucesor en la misma `familyId`; presentar un token ya revocado
revoca toda la familia (detección de reuso). Viaja en cookie httpOnly
(`path=/api/v1/auth`, `SameSite=Lax`, `Secure` fuera de dev).
**Motivo:** revocación inmediata y real (un JWT no se puede revocar sin lista
negra), detección de robo, y superficie mínima en el cliente. El bot de WhatsApp
usará credenciales de servicio, no esta cookie.

## ADR-013 · RBAC: matriz de permisos en `@dashgobo/contracts`

**Decisión:** `ROLE_PERMISSIONS` (rol → permisos) vive en el paquete de
contratos y es la única fuente de verdad. El backend la aplica con
`OrgScopeGuard` (resuelve y valida la organización) + `PermissionsGuard`
(`@RequirePermission(...)`); el frontend puede derivar de ella qué mostrar.
**Motivo:** una sola definición de autorización, consistente entre capas y
extensible agregando permisos sin tocar los guards.

## ADR-011 · Timestamps `timestamptz` en UTC, dinero `BigInt`, `Decimal` para tasas

**Decisión:** todas las fechas son `@db.Timestamptz(6)` en UTC. Los montos son
`BigInt` (centavos). `taxRate` y `quantity` usan `Decimal` (`5,2` y `14,4`).
`Organization` lleva `timezone` y `defaultCurrency`; ninguna lógica interna
asume ARS ni el huso de Buenos Aires.
**Motivo:** requisitos §41/§42 del pedido; evita ambigüedad de huso y errores de
redondeo, y deja el multi-moneda abierto sin refactor.
