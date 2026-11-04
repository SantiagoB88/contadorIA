import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getBotInvite, getUserLink } from "@/modules/bot/links";
import { maskPhone } from "@/lib/phone";
import { AuthShell } from "@/components/AuthShell";
import { ConfirmInviteForm } from "@/components/bot/WhatsAppForms";
import { Notice } from "@/components/ui";

export const metadata = { title: "Vincular WhatsApp · ContadorSmart" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Enlace que manda el bot. Hace falta la sesión iniciada (prueba la cuenta) y el enlace solo llegó a ese WhatsApp
 * (prueba el número). Nada se vincula hasta que la persona confirma.
 */
export default async function VincularWhatsAppPage({ searchParams }: { searchParams: SearchParams }) {
  const token = (await searchParams).t;
  const valid = typeof token === "string" ? await getBotInvite(token) : null;
  const user = await getCurrentUser();
  const here = typeof token === "string" ? `/whatsapp/vincular?t=${encodeURIComponent(token)}` : "/whatsapp/vincular";

  if (!valid || typeof token !== "string") {
    return (
      <AuthShell title="Vincular WhatsApp">
        <Notice tone="warning" title="El enlace no es válido">
          Venció, ya se usó o está incompleto. Escribile al bot “hola” y elegí “vincular” para recibir uno nuevo.
        </Notice>
      </AuthShell>
    );
  }

  if (!user) {
    return (
      <AuthShell title="Vincular WhatsApp" subtitle={`Número ${valid.maskedAddress}`}>
        <div className="space-y-4 text-sm text-slate-700">
          <p>Para vincular este WhatsApp necesitás iniciar sesión con tu cuenta. Si todavía no tenés, creala y confirmá tu correo.</p>
          <Link
            href={`/login?next=${encodeURIComponent(here)}`}
            className="flex w-full justify-center rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            Ingresar y vincular
          </Link>
          <Link href="/registro" className="block text-center font-medium text-brand-700 hover:underline">
            Crear una cuenta
          </Link>
          <p className="text-xs text-slate-500">Después de crearla, volvé a abrir el enlace que te mandó el bot (vence en 24 horas).</p>
        </div>
      </AuthShell>
    );
  }

  const current = await getUserLink(user.id);
  return (
    <AuthShell title="Vincular WhatsApp" subtitle={`Cuenta: ${user.email}`}>
      {user.role !== "CLIENTE" ? (
        <Notice tone="warning" title="Solo para clientes">
          Las cuentas del estudio no se vinculan al bot de WhatsApp.
        </Notice>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Vas a vincular el WhatsApp <strong className="tabular">{valid.maskedAddress}</strong> a tu cuenta. Desde ese número vas a
            poder consultar la información de tus contribuyentes habilitados.
          </p>
          {current && current.address !== valid.address && (
            <Notice tone="warning" title="Ya tenés otro WhatsApp vinculado">
              Si confirmás, se desvincula {maskPhone(current.address)} y queda este.
            </Notice>
          )}
          <ConfirmInviteForm token={token} />
          <p className="text-xs text-slate-500">Si no pediste este enlace, cerrá esta página: no se vincula nada.</p>
        </div>
      )}
    </AuthShell>
  );
}
