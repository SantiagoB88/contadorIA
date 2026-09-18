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
          Fase 2 · Auth + multi-tenancy + RBAC
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">DashGoBo</h1>
        <p className="max-w-prose text-[var(--color-muted)]">
          Plataforma de facturación para Argentina. El backend ya tiene registro, login,
          organizaciones y permisos por rol funcionando — todavía sin interfaz propia (llega en la
          Fase 7). Mientras tanto podés probarlo desde{' '}
          <a
            href="http://localhost:3001/docs"
            className="text-[var(--color-accent)] underline underline-offset-2"
          >
            Swagger
          </a>
          .
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
        Próximo: Fase 3 — CRUD de clientes.
      </footer>
    </main>
  );
}
