"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { moduleForPath, type ModuleKey } from "@/modules/plans/catalog";

// Menú agrupado por lo que la persona quiere hacer, con una línea que explica cada sección (ver docs/propuesta-ux.md).
// Los nombres que también usa el asistente de WhatsApp (Facturación, Deudas, Solicitudes, Mi perfil) no cambian.

type Item = {
  href: string;
  label: string;
  desc?: string;
  exact?: boolean;
  newTab?: boolean;
  /** Rutas extra donde la sección se marca como actual. */
  also?: string[];
  /** Pendientes (lo calcula el servidor). */
  count?: number;
  countLabel?: string;
};
type Group = { title?: string; items: Item[] };

/** Contadores del menú, calculados en el servidor con la sesión. */
export type NavCounts = { waitingForClient?: number; unassignedRequests?: number; pendingAccesses?: number };

function clientGroups(counts: NavCounts): Group[] {
  return [
    { items: [{ href: "/dashboard", label: "Inicio", desc: "Lo pendiente y tu resumen", exact: true }] },
    {
      title: "Mi monotributo",
      items: [
        { href: "/facturas", label: "Facturación", desc: "Hacer y ver tus facturas" },
        { href: "/dashboard/movimientos", label: "Mis ingresos", desc: "Todo lo facturado que suma" },
        { href: "/dashboard/categoria", label: "Categoría y límites", desc: "Cuánto podés facturar todavía" },
        { href: "/dashboard/deudas", label: "Deudas y vencimientos", desc: "Qué vence y qué debés" },
      ],
    },
    {
      title: "Con mi estudio",
      items: [
        {
          href: "/solicitudes",
          label: "Solicitudes al estudio",
          desc: "Consultas y pedidos con archivos",
          count: counts.waitingForClient,
          countLabel: "esperan tu respuesta",
        },
        { href: "/documentos", label: "Documentos", desc: "Constancias y archivos del estudio" },
      ],
    },
    {
      title: "Mi cuenta",
      items: [
        { href: "/perfil", label: "Mi perfil", desc: "Contraseña, WhatsApp y tus CUIT" },
        { href: "/plan", label: "Mi plan", desc: "Qué incluye tu suscripción" },
      ],
    },
  ];
}

function adminGroups(counts: NavCounts): Group[] {
  return [
    {
      items: [
        {
          href: "/admin",
          label: "Hoy en el estudio",
          desc: "Lo que hay que atender",
          exact: true,
          // La ficha de un contribuyente y las pantallas "como el cliente" se abren desde acá.
          also: ["/admin/contribuyentes", "/dashboard", "/facturas"],
        },
      ],
    },
    {
      title: "Clientes",
      items: [
        {
          href: "/admin/solicitudes",
          label: "Bandeja de solicitudes",
          desc: "Consultas y pedidos de clientes",
          count: counts.unassignedRequests,
          countLabel: "sin asignar",
        },
        { href: "/documentos", label: "Documentos", desc: "Archivos de todos los clientes" },
        {
          href: "/admin/accesos",
          label: "Accesos y usuarios",
          desc: "Pedidos de CUIT, claves y planes",
          count: counts.pendingAccesses,
          countLabel: "pedidos por validar",
        },
      ],
    },
    {
      title: "Configuración del estudio",
      items: [
        { href: "/admin/planes", label: "Planes", desc: "Qué módulos ve cada cliente" },
        { href: "/admin/escalas", label: "Escalas", desc: "Límites de cada categoría" },
      ],
    },
    { title: "Mi cuenta", items: [{ href: "/perfil", label: "Mi perfil", desc: "Datos y contraseña" }] },
  ];
}

/** Secciones del menú. `allowed`: módulos del plan del cliente (el estudio ve todo). */
function navGroups(isAdmin: boolean, showBot: boolean, counts: NavCounts, allowed?: ModuleKey[]): Group[] {
  const groups = (isAdmin ? adminGroups(counts) : clientGroups(counts))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const key = moduleForPath(item.href);
        return isAdmin || !key || !allowed || allowed.includes(key);
      }),
    }))
    .filter((g) => g.items.length > 0);
  // Simulador del bot de WhatsApp: solo en la demo (se abre aparte para probarlo al lado de la web).
  if (showBot) {
    groups.push({
      title: "Demo",
      items: [{ href: "/dev/whatsapp", label: "Probar bot de WhatsApp (DEMO)", desc: "Simulador, se abre aparte", newTab: true }],
    });
  }
  return groups;
}

function isActive(item: Item, pathname: string) {
  const match = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return match(item.href, item.exact) || (item.also ?? []).some((p) => match(p));
}

// "dark": barra lateral azul profundo (escritorio). "light": menú desplegable del celular.
const LINK_STYLE = {
  dark: {
    active: "bg-white/10 shadow-[inset_3px_0_0_var(--color-accent)]",
    idle: "hover:bg-white/5",
    label: "text-slate-100",
    labelActive: "text-white",
    desc: "text-slate-400",
    group: "text-slate-400",
    focus: "focus-visible:outline-accent",
  },
  light: {
    active: "bg-soft shadow-[inset_3px_0_0_var(--color-accent)]",
    idle: "hover:bg-slate-100",
    label: "text-slate-700",
    labelActive: "text-navy",
    desc: "text-slate-500",
    group: "text-slate-500",
    focus: "",
  },
} as const;

function NavItem({ item, pathname, tone }: { item: Item; pathname: string; tone: keyof typeof LINK_STYLE }) {
  const style = LINK_STYLE[tone];
  const active = !item.newTab && isActive(item, pathname);
  const descId = useId();
  // El nombre del enlace es solo el título (más pendientes y "otra pestaña"); la descripción se anuncia como ayuda
  // aparte, para que no se mezcle con el nombre (p. ej. "informar pagos" no es un enlace para informar un pago).
  const name = [
    item.label,
    item.count ? `${item.count} ${item.countLabel ?? "pendientes"}` : null,
    item.newTab ? "se abre en otra pestaña" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const body = (
    <>
      <span className={`flex items-center gap-2 text-sm font-semibold ${active ? style.labelActive : style.label}`}>
        {item.label}
        {item.newTab && <span aria-hidden="true">↗</span>}
        {!!item.count && (
          <span aria-hidden="true" className="tabular rounded-full bg-accent px-1.5 text-xs font-bold leading-5 text-navy">
            {item.count}
          </span>
        )}
      </span>
      {item.desc && (
        <span id={descId} className={`block text-xs leading-snug ${style.desc}`}>
          {item.desc}
        </span>
      )}
    </>
  );
  const props = {
    "aria-label": name,
    "aria-describedby": item.desc ? descId : undefined,
    className: `block rounded-lg px-3 py-1.5 ${style.focus} ${active ? style.active : style.idle}`,
  };
  if (item.newTab) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" {...props}>
        {body}
      </a>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} {...props}>
      {body}
    </Link>
  );
}

function NavGroups({ groups, pathname, tone }: { groups: Group[]; pathname: string; tone: keyof typeof LINK_STYLE }) {
  const style = LINK_STYLE[tone];
  return (
    <>
      {groups.map((g, i) => (
        <div key={g.title ?? i} className="flex flex-col gap-0.5">
          {g.title && (
            <p className={`mb-0.5 mt-3 px-3 text-[0.7rem] font-semibold uppercase tracking-wider ${style.group}`}>{g.title}</p>
          )}
          {g.items.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} tone={tone} />
          ))}
        </div>
      ))}
    </>
  );
}

type NavProps = { isAdmin: boolean; showBot?: boolean; allowed?: ModuleKey[]; counts?: NavCounts };

/** Menú lateral de escritorio. */
export function AppNav({ isAdmin, showBot = false, allowed, counts = {} }: NavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal" className="flex flex-col">
      <NavGroups groups={navGroups(isAdmin, showBot, counts, allowed)} pathname={pathname} tone="dark" />
    </nav>
  );
}

/** Celular y tablet: un botón "Menú" que despliega todas las secciones, la cuenta y el cierre de sesión. */
export function MobileNav({
  isAdmin,
  showBot = false,
  allowed,
  counts = {},
  account,
  logout,
}: NavProps & { account: React.ReactNode; logout: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = navGroups(isAdmin, showBot, counts, allowed);
  const current = groups.flatMap((g) => g.items).find((i) => !i.newTab && isActive(i, pathname))?.label;
  const pending = (counts.waitingForClient ?? 0) + (counts.unassignedRequests ?? 0) + (counts.pendingAccesses ?? 0);

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
        {!open && pending > 0 && (
          <span aria-hidden="true" className="tabular rounded-full bg-accent px-1.5 text-xs font-bold leading-5 text-navy">
            {pending}
          </span>
        )}
      </button>
      {!open && current && <span className="sr-only">Sección actual: {current}</span>}
      {open && (
        <div
          id="menu-movil"
          className="absolute inset-x-0 top-full z-20 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-slate-200 bg-white px-4 pb-4 pt-2 shadow-lg"
        >
          <nav aria-label="Navegación principal" className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4">
            <NavGroups groups={groups} pathname={pathname} tone="light" />
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
