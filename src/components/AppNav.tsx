"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; exact?: boolean };

export function AppNav({ isAdmin, orientation }: { isAdmin: boolean; orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const items: Item[] = [
    { href: "/dashboard", label: "Inicio", exact: true },
    { href: "/dashboard/movimientos", label: "Movimientos" },
    { href: "/dashboard/categoria", label: "Categoría" },
    { href: "/dashboard/deudas", label: "Deudas" },
    { href: "/facturas", label: "Facturación" },
    ...(isAdmin
      ? [
          { href: "/admin", label: "Backoffice", exact: true },
          { href: "/admin/escalas", label: "Escalas" },
          { href: "/admin/accesos", label: "Accesos" },
        ]
      : []),
    { href: "/perfil", label: "Mi perfil" },
  ];

  const isActive = (item: Item) =>
    item.exact
      ? pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin/contribuyentes"))
      : pathname.startsWith(item.href);

  if (orientation === "horizontal") {
    return (
      <nav aria-label="Navegación principal" className="flex gap-1 overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              isActive(item) ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item) ? "page" : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            isActive(item) ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
