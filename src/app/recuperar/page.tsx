import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { mailReachesPeople, NO_MAIL_HELP } from "@/lib/mail-status";
import { RequestResetForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Recuperar contraseña · ContadorIA" };

export default function RecuperarPage() {
  return (
    <AuthShell
      title="Recuperar contraseña"
      subtitle={mailReachesPeople() ? "Te enviamos un enlace para elegir una nueva." : NO_MAIL_HELP}
      footer={
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Volver a ingresar
          </Link>
        </p>
      }
    >
      <RequestResetForm />
    </AuthShell>
  );
}
