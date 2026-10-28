import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-semibold text-brand-700">Error 404</p>
      <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
      <p className="text-slate-600">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
      <Link href="/" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
        Volver al inicio
      </Link>
    </main>
  );
}
