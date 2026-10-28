"use client";

import { useFormStatus } from "react-dom";
import { useActionFormPending } from "@/components/ActionForm";

type Props = {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
};

/** Botón que se deshabilita mientras se envía el formulario (evita doble envío). */
export function SubmitButton({ children, pendingText = "Procesando…", className = "" }: Props) {
  const status = useFormStatus();
  const pending = useActionFormPending() ?? status.pending;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
