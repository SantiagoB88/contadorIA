"use client";

import { createContext, useActionState, useContext, useEffect, useRef, startTransition } from "react";

// Formularios que se envían a una Server Action sin que React los vacíe solo.
// Con <form action={...}>, React 19 restablece el formulario después de cada envío: los <select> vuelven al valor
// con el que se dibujaron y los radios quedan sin marcar, aunque la pantalla diga otra cosa. Acá el envío se hace
// a mano: lo que se ve en el formulario es siempre lo que se va a enviar. Si hace falta vaciarlo después de guardar
// (por ejemplo, una respuesta ya enviada), se pide con `resetOnSuccess`.

type FormAction<S> = (prev: S, formData: FormData) => Promise<S>;
type Handle<S> = { dispatch: (formData: FormData) => void; pending: boolean; state: S };

const PendingContext = createContext<boolean | null>(null);

/** Igual que useActionState, pero devuelve un objeto para pasarle a <ActionForm form={...}>. */
export function useActionForm<S>(action: FormAction<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial);
  return [state, { dispatch, pending, state } as Handle<S>] as const;
}

type Props<S> = { form: Handle<S>; resetOnSuccess?: boolean; confirmMessage?: string } & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit">;

export function ActionForm<S>({ form, resetOnSuccess, confirmMessage, children, ...rest }: Props<S>) {
  const ref = useRef<HTMLFormElement>(null);
  const previous = useRef(form.state);

  useEffect(() => {
    const changed = previous.current !== form.state;
    previous.current = form.state;
    const ok = (form.state as { ok?: boolean } | null)?.ok;
    if (resetOnSuccess && changed && ok) ref.current?.reset();
  }, [form.state, resetOnSuccess]);

  return (
    <PendingContext.Provider value={form.pending}>
      <form
        ref={ref}
        {...rest}
        onSubmit={(event) => {
          event.preventDefault();
          if (form.pending) return; // evita el doble envío
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const data = new FormData(event.currentTarget, submitter);
          // Un campo de archivo sin elegir llega como un archivo vacío y sin nombre: no se envía.
          for (const [key, value] of [...data.entries()]) {
            if (value instanceof File && value.size === 0 && value.name === "") data.delete(key);
          }
          startTransition(() => form.dispatch(data));
        }}
      >
        {children}
      </form>
    </PendingContext.Provider>
  );
}

/** Estado de envío del ActionForm que contiene al componente (null fuera de uno). */
export function useActionFormPending() {
  return useContext(PendingContext);
}
