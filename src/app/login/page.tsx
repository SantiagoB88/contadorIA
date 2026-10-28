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
              <p className="font-semibold text-slate-800">Usuarios de demo (contraseña: Demo1234!)</p>
              <ul className="mt-2 space-y-1 break-all">
                <li>
                  <code className="text-brand-700">admin@contadorsmart.local</code> · estudio
                </li>
                <li>
                  <code className="text-brand-700">cliente.a@contadorsmart.local</code> · 2 contribuyentes
                </li>
                <li>
                  <code className="text-brand-700">cliente.b@contadorsmart.local</code> · 1 contribuyente
                </li>
              </ul>
              <p className="mt-2 text-xs text-slate-500">Solo existen en esta base local de prueba.</p>
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
