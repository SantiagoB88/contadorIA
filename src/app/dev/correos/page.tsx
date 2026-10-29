import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { APP_MODE } from "@/lib/constants";
import { formatDateTimeAR } from "@/lib/dates";
import { DemoBanner } from "@/components/DemoBanner";

export const metadata = { title: "Correos de prueba · ContadorSmart" };
export const dynamic = "force-dynamic";

// Convierte las URL del texto en enlaces (sin HTML del correo: se muestra como texto plano).
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} className="break-all font-medium text-brand-700 underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Bandeja de correo local. Solo existe en modo DEMO: en un entorno real esta página da 404. */
export default async function CorreosPage() {
  if (APP_MODE !== "DEMO") notFound();
  const emails = await prisma.outboxEmail.findMany({ orderBy: { createdAt: "desc" }, take: 30 });

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Correos de prueba</h1>
            <p className="mt-1 text-sm text-slate-600">
              En la demo no se envían correos reales: quedan acá. Se muestran los últimos 30.
            </p>
          </div>
          <Link href="/login" className="text-sm font-medium text-brand-700 hover:underline">
            Ir a ingresar
          </Link>
        </div>

        {emails.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
            Todavía no hay correos. Creá una cuenta o pedí recuperar la contraseña.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {emails.map((m) => (
              <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">Para: {m.to}</span>
                  <span className="tabular text-slate-500">{formatDateTimeAR(m.createdAt)}</span>
                </div>
                <p className="mt-1 font-semibold text-navy">{m.subject}</p>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                  <Linkified text={m.body} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
