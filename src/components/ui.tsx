// Piezas visuales simples y reutilizables (sin lógica de negocio).

/** Marca de ContadorSmart: cuadrado azul profundo con la "S" en turquesa. */
export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 rounded-xl text-xl" : "h-8 w-8 rounded-lg text-sm";
  return (
    <span aria-hidden="true" className={`flex ${box} shrink-0 items-center justify-center bg-navy font-bold text-white`}>
      C<span className="text-accent">S</span>
    </span>
  );
}

export function Card({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Notice({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children?: React.ReactNode;
  tone?: "info" | "warning" | "danger";
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-slate-600">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-600">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-navy placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

export const labelClass = "mb-1 block text-sm font-medium text-slate-700";
