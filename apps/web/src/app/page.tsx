import Link from 'next/link';
import { BarChart3, Package, Receipt, Users } from 'lucide-react';
import type { HealthResponse } from '@dashgobo/contracts';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';

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

const FEATURES = [
  { icon: Users, label: 'Clientes', description: 'Datos fiscales y contacto en un solo lugar.' },
  { icon: Package, label: 'Productos', description: 'Catálogo con precio e IVA por ítem.' },
  { icon: Receipt, label: 'Facturación', description: 'Comprobantes con numeración y CAE.' },
  { icon: BarChart3, label: 'Dashboard', description: 'Facturación y actividad al día.' },
];

export default async function LandingPage() {
  const status = await getApiStatus();

  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[var(--color-accent)] opacity-[0.1] blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-12 px-6 py-16">
        <header className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-sm font-bold text-[var(--color-accent-fg)]">
              D
            </span>
            <span className="text-lg font-semibold tracking-tight">DashGoBo</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-balance">
              Facturación simple para tu negocio
            </h1>
            <p className="max-w-prose text-[var(--color-muted)]">
              Gestioná clientes, productos y comprobantes desde un solo lugar. La autorización de
              facturas usa un proveedor simulado hasta integrar ARCA.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <Button asChild size="lg">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/register">Crear cuenta</Link>
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {FEATURES.map(({ icon: Icon, label, description }) => (
            <div key={label} className="space-y-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-[var(--color-muted)]">{description}</p>
            </div>
          ))}
        </section>

        {!status.reachable && (
          <section
            className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] p-4 text-sm"
            aria-live="polite"
          >
            <p className="font-medium text-[var(--color-danger)]">API no disponible</p>
            <p className="mt-1 text-[var(--color-muted)]">
              {status.reason}. Verificá que esté levantada (<code>pnpm dev</code>).
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
