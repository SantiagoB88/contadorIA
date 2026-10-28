import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { APP_MODE } from "@/lib/constants";
import { DemoBanner } from "@/components/DemoBanner";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Ingresar · ContadorSmart" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
              CS
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">ContadorSmart</h1>
            <p className="mt-1 text-sm text-slate-600">Ingresá para ver tu facturación y tu categoría.</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <LoginForm />
            <p className="mt-4 text-center text-xs text-slate-500">
              La recuperación de contraseña y el alta de usuarios llegan en el próximo paso.
            </p>
          </div>

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
        </div>
      </main>
    </div>
  );
}
