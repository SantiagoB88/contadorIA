import Link from "next/link";
import { logoutAction } from "@/app/actions";

/**
 * Se muestra en Ingresar y en Crear cuenta cuando ya hay una sesión abierta. Antes la página redirigía sin avisar, y
 * quien quería entrar con otra cuenta (por ejemplo, la que creó desde WhatsApp) terminaba en la dashboard de la sesión
 * anterior.
 */
export function SignedInNotice({
  name,
  email,
  continueHref,
  action,
  after = "/login",
}: {
  name: string;
  email: string;
  continueHref: string;
  action: string;
  after?: "/login" | "/registro";
}) {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p>
        Ya ingresaste como <strong>{name}</strong> ({email}).
      </p>
      <Link
        href={continueHref}
        className="block w-full rounded-lg bg-brand-600 px-4 py-2.5 text-center font-medium text-white hover:bg-brand-700"
      >
        Seguir como {name.split(" ")[0]}
      </Link>
      <form action={logoutAction}>
        <input type="hidden" name="next" value={after} />
        <button
          type="submit"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          Cerrar sesión y {action}
        </button>
      </form>
    </div>
  );
}
