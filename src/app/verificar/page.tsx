import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { VerifyEmailForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Confirmar correo · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// La confirmación se hace con un botón (POST) y no al abrir el enlace,
// para que una vista previa del correo no consuma el token.
export default async function VerificarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <AuthShell title="Confirmar correo">
      {token ? (
        <VerifyEmailForm token={token} />
      ) : (
        <div className="space-y-4 text-sm text-slate-600">
          <p>El enlace está incompleto. Abrilo de nuevo desde el correo que te enviamos.</p>
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Volver a ingresar
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
