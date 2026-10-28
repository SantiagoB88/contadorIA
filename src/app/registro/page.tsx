import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Crear cuenta · ContadorSmart" };

export default async function RegistroPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Después vas a poder asociar tu CUIT."
      footer={
        <p className="mt-4 text-center text-sm text-slate-600">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Ingresá
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
