import { APP_MODE } from "@/lib/constants";

export function DemoBanner() {
  if (APP_MODE !== "DEMO") return null;
  return (
    <div role="note" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      <strong className="font-semibold">MODO DEMO</strong> · Datos ficticios · Sin conexión con ARCA · Nada de lo que ves
      tiene validez fiscal
    </div>
  );
}
