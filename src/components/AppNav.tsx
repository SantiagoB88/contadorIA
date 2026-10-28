"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; exact?: boolean };

function navItems(isAdmin: boolean): Item[] {
  return [
    { href: "/dashboard", label: "Inicio", exact: true },
    { href: "/dashboard/movimientos", label: "Movimientos" },
    { href: "/dashboard/categoria", label: "Categoría" },
    { href: "/dashboard/deudas", label: "Deudas" },
    { href: "/facturas", label: "Facturación" },
    ...(isAdmin ? [] : [{ href: "/solicitudes", label: "Solicitudes" }]),
    { href: "/documentos", label: "Documentos" },
    ...(isAdmin
      ? [
          { href: "/admin", label: "Backoffice", exact: true },
          { href: "/admin/solicitudes", label: "Bandeja" },
          { href: "/admin/escalas", label: "Escalas" },
          { href: "/admin/accesos", label: "Accesos" },
        ]
      : []),
    { href: "/perfil", label: "Mi perfil" },
  ];
}

function isActive(item: Item, pathname: string) {
  return item.exact
    ? pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin/contribuyentes"))
    : pathname.startsWith(item.href);
}

function NavLinks({ items, pathname }: { items: Item[]; pathname: string }) {
  return (
    <>
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

/** Menú lateral de escritorio. */
export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1">
      <NavLinks items={navItems(isAdmin)} pathname={pathname} />
    </nav>
  );
}

/** Celular y tablet: un botón "Menú" que despliega todas las secciones, la cuenta y el cierre de sesión. */
export function MobileNav({ isAdmin, account, logout }: { isAdmin: boolean; account: React.ReactNode; logout: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = navItems(isAdmin);
  const current = items.find((i) => isActive(i, pathname))?.label;

  // Al cambiar de pantalla, el menú se cierra.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-movil"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          {open ? (
            <path d="M5.3 4.3a1 1 0 0 1 1.4 0L10 7.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 9l3.3 3.3a1 1 0 0 1-1.4 1.4L10 10.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 9 5.3 5.7a1 1 0 0 1 0-1.4Z" />
          ) : (
            <path d="M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H4Z" />
          )}
        </svg>
        {open ? "Cerrar" : "Menú"}
      </button>
      {!open && current && <span className="sr-only">Sección actual: {current}</span>}
      {open && (
        <div id="menu-movil" className="absolute inset-x-0 top-full z-20 border-b border-slate-200 bg-white px-4 pb-4 pt-2 shadow-lg">
          <nav aria-label="Navegación principal" className="grid grid-cols-2 gap-1">
            <NavLinks items={items} pathname={pathname} />
          </nav>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <div className="min-w-0">{account}</div>
            {logout}
          </div>
        </div>
      )}
    </div>
  );
}
