import type { HealthResponse } from '@dashgobo/contracts';
import { apiFetch, ApiRequestError } from '@/lib/api';

type ApiStatus = { reachable: true; health: HealthResponse } | { reachable: false; reason: string };

async function getApiStatus(): Promise<ApiStatus> {
  try {
    const health = await apiFetch<HealthResponse>('/health', { cache: 'no-store' });
    return { reachable: true, health };
  } catch (error) {
    const reason =
      error instanceof ApiRequestError ? error.message : 'No se pudo conectar con la API';
    return { reachable: false, reason };
  }
}

export default async function LandingPage() {
  const status = await getApiStatus();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-[var(--color-accent)] uppercase">
          Fase 0 · Fundaciones
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">DashGoBo</h1>
        <p className="max-w-prose text-[var(--color-muted)]">
          Plataforma de facturación para Argentina. El monorepo está en pie: API central (NestJS),
          aplicación web (Next.js) y contratos compartidos. Las funciones de negocio se incorporan
          por fases.
        </p>
      </header>

      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              status.reachable ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            aria-hidden
          />
          <h2 className="text-lg font-medium">
            {status.reachable ? 'API conectada' : 'API no disponible'}
          </h2>
        </div>

        {status.reachable ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <dt className="text-[var(--color-muted)]">Servicio</dt>
            <dd>{status.health.service}</dd>
            <dt className="text-[var(--color-muted)]">Versión</dt>
            <dd>{status.health.version}</dd>
            <dt className="text-[var(--color-muted)]">Base de datos</dt>
            <dd>{status.health.checks.database}</dd>
            <dt className="text-[var(--color-muted)]">Uptime</dt>
            <dd>{status.health.uptimeSeconds}s</dd>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            {status.reason}. Verificá que la API esté levantada (<code>pnpm dev</code> o{' '}
            <code>docker compose up</code>).
          </p>
        )}
      </section>

      <footer className="text-sm text-[var(--color-muted)]">
        Próximo: Fase 1 — esquema Prisma, modelo de datos y capa base del backend.
      </footer>
    </main>
  );
}
