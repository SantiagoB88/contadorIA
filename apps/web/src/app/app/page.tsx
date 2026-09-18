'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

/**
 * Placeholder authenticated screen — proves the login/session loop end to
 * end. The real authenticated shell (sidebar, dashboard widgets, etc.)
 * arrives in Fase 7; this page will be replaced, not extended.
 */
export default function AppPlaceholderPage() {
  const { status, user, memberships, logout } = useAuth();

  if (status === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="text-sm text-[var(--color-muted)]">Cargando sesión…</p>
      </main>
    );
  }

  if (status === 'anonymous') {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-[var(--color-muted)]">No iniciaste sesión.</p>
        <Link
          href="/login"
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)]"
        >
          Ir a login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium tracking-wide text-[var(--color-accent)] uppercase">
            Vista previa (Fase 2)
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Hola, {user?.firstName ?? 'usuario'}
          </h1>
        </div>
        <button
          onClick={() => void logout()}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
        >
          Cerrar sesión
        </button>
      </header>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-lg font-medium">Tu cuenta</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <dt className="text-[var(--color-muted)]">Nombre</dt>
          <dd>
            {user?.firstName} {user?.lastName}
          </dd>
          <dt className="text-[var(--color-muted)]">Email</dt>
          <dd>{user?.email}</dd>
          <dt className="text-[var(--color-muted)]">Estado</dt>
          <dd>{user?.status}</dd>
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-lg font-medium">Tus organizaciones</h2>
        {memberships.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No pertenecés a ninguna todavía.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {memberships.map((m) => (
              <li key={m.organizationId} className="flex items-center justify-between">
                <span>{m.organizationName}</span>
                <span className="text-[var(--color-muted)]">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-[var(--color-muted)]">
        Esta pantalla es un adelanto para probar el login — el dashboard real (con clientes,
        productos y facturas) llega en la Fase 7.
      </p>
    </main>
  );
}
