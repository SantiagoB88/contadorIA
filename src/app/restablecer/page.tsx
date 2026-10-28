import Link from "next/link";
import { TOKEN_TYPE } from "@/lib/constants";
import { isTokenUsable } from "@/modules/auth/service";
import { AuthShell } from "@/components/AuthShell";
import { ResetPasswordForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Nueva contraseña · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RestablecerPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const usable = await isTokenUsable(token, TOKEN_TYPE.RESTABLECER_CLAVE);

  return (
    <AuthShell title="Elegí una contraseña nueva">
      {usable ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4 text-sm text-slate-600">
          <p role="alert">El enlace no es válido, ya se usó o venció.</p>
          <Link href="/recuperar" className="font-medium text-brand-700 hover:underline">
            Pedir un enlace nuevo
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
