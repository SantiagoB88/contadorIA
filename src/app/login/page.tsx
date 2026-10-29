import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { APP_MODE } from "@/lib/constants";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Ingresar · ContadorSmart" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <AuthShell
      title="ContadorSmart"
      subtitle="Ingresá para ver tu facturación y tu categoría."
      footer={
        <>
          <p className="mt-4 text-center text-sm text-slate-600">
            ¿No tenés cuenta?{" "}
            <Link href="/registro" className="font-medium text-brand-700 hover:underline">
              Creá una
            </Link>
          </p>
          {APP_MODE === "DEMO" && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p className="font-semibold text-navy">Usuarios de demo (contraseña: Demo1234!)</p>
              <ul className="mt-2 space-y-2">
                {[
                  ["admin@contadorsmart.local", "Estudio (administrador)"],
                  ["cliente.a@contadorsmart.local", "Cliente · 2 contribuyentes"],
                  ["cliente.b@contadorsmart.local", "Cliente · 1 contribuyente"],
                ].map(([email, who]) => (
                  <li key={email}>
                    <code className="break-all text-brand-700">{email}</code>
                    <span className="block text-xs text-slate-500">{who}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Son datos ficticios, solo para probar.</p>
            </div>
          )}
        </>
      }
    >
      <LoginForm />
      <p className="mt-4 text-center text-sm">
        <Link href="/recuperar" className="font-medium text-brand-700 hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </AuthShell>
  );
}
