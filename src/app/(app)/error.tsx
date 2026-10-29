"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-navy">No pudimos cargar esta pantalla</h1>
      <p className="mt-2 text-sm text-slate-600">
        Ocurrió un error inesperado. Probá de nuevo; si sigue pasando, avisale al estudio.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
      >
        Reintentar
      </button>
    </div>
  );
}
