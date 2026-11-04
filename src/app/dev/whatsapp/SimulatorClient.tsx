"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  simulatorConcurrent,
  simulatorReset,
  simulatorResetDemo,
  simulatorRetry,
  simulatorSend,
  simulatorTranscript,
  simulatorUpload,
  type TranscriptItem,
} from "@/modules/bot/simulator-actions";
import { fallbackText, type BotMessage, type Choice } from "@/modules/bot/ui";
import { inputClass, labelClass } from "@/components/ui";

type Identity = { address: string; label: string };

const STATUS_LABEL: Record<string, string> = {
  PROCESADO: "procesado",
  RECIBIDO: "recibido, sin procesar",
  FALLIDO: "falló",
  SIMULADO: "entregado (simulado)",
  PENDIENTE: "pendiente",
  ENVIADO: "enviado",
};

// WhatsApp marca *negrita*: se muestra igual acá. Los enlaces se pueden abrir.
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-brand-700 underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Botones y listas como los muestra WhatsApp. Los de mensajes viejos se pueden tocar igual (para probar opciones vencidas). */
function Interactive({ message, disabled, onChoose }: { message: BotMessage; disabled: boolean; onChoose: (c: Choice) => void }) {
  const [open, setOpen] = useState(false);
  if (message.kind === "buttons") {
    return (
      <div className="mt-1 flex flex-col gap-1">
        {message.buttons.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(b)}
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-[#027eb5] shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {b.title}
          </button>
        ))}
      </div>
    );
  }
  if (message.kind !== "list") return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-[#027eb5] shadow-sm hover:bg-slate-50 disabled:opacity-60"
      >
        ☰ {message.button}
      </button>
      {open && (
        <ul className="mt-1 divide-y divide-slate-100 rounded-lg bg-white shadow-sm" role="list">
          {message.sections.flatMap((sec) => sec.rows).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onChoose(r);
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-60"
              >
                <span className="block text-sm text-slate-900">{r.title}</span>
                {r.description && <span className="block text-xs text-slate-500">{r.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SimulatorClient({ identities, canResetDemo = false }: { identities: Identity[]; canResetDemo?: boolean }) {
  const [address, setAddress] = useState(identities[0].address);
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [text, setText] = useState("");
  const [fault, setFault] = useState<"" | "antes" | "despues">("");
  const [notice, setNotice] = useState<string | null>(null);
  const [plain, setPlain] = useState(false); // ver como un cliente sin botones (opciones numeradas)
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => setItems(await simulatorTranscript(address)), [address]);

  useEffect(() => {
    refresh();
    // Los avisos que manda el estudio desde la web llegan solos: se refresca cada 4 segundos.
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  const lastInbound = [...items].reverse().find((i) => i.dir === "in");

  const run = (task: () => Promise<string | null>) =>
    startTransition(async () => {
      try {
        setNotice(await task());
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Error");
      }
      await refresh();
    });

  const failed = (r: { outcome: { status: string; error?: string } }) =>
    r.outcome.status === "fallido" ? `El servidor falló (simulado): ${r.outcome.error}. Probá "Reintentar fallidos".` : null;

  const send = (value: string) =>
    run(async () => {
      if (!value.trim()) return null;
      setText("");
      return failed(await simulatorSend(address, value, { fault: fault || undefined }));
    });

  const choose = (c: Choice) => run(async () => failed(await simulatorSend(address, c.title, { choiceId: c.id, fault: fault || undefined })));

  const upload = (file: File) =>
    run(async () => {
      const form = new FormData();
      form.set("file", file);
      if (text.trim()) form.set("caption", text.trim());
      setText("");
      if (fileInput.current) fileInput.current.value = "";
      return failed(await simulatorUpload(address, form));
    });

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <aside className="space-y-4 lg:col-span-1">
        <div>
          <label htmlFor="identity" className={labelClass}>
            Quién escribe
          </label>
          <select id="identity" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass}>
            {identities.map((i) => (
              <option key={i.address} value={i.address}>
                {i.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Número ficticio: {address}</p>
        </div>

        <div>
          <label htmlFor="fault" className={labelClass}>
            Simular una falla del servidor
          </label>
          <select id="fault" value={fault} onChange={(e) => setFault(e.target.value as typeof fault)} className={inputClass}>
            <option value="">Sin fallas</option>
            <option value="antes">Falla antes de procesar el mensaje</option>
            <option value="despues">Falla después de hacer la acción</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending || !lastInbound}
            onClick={() =>
              run(async () => {
                const r = await simulatorSend(address, lastInbound!.text, { repeatOf: lastInbound!.providerId });
                // (si era una opción tocada o un archivo, el reenvío lleva lo mismo)
                return r.outcome.status === "duplicado" ? "Evento duplicado: se descartó (no se procesó dos veces)." : `Resultado: ${r.outcome.status}`;
              })
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Reenviar el último mensaje (duplicado)
          </button>
          <button
            type="button"
            disabled={pending || !text.trim()}
            onClick={() =>
              run(async () => {
                const value = text;
                setText("");
                const r = await simulatorConcurrent(address, value);
                return `Dos entregas simultáneas del mismo evento: ${r.map((o) => o.status).join(" y ")}.`;
              })
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Enviar el texto dos veces a la vez
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(async () => `Reintentados: ${await simulatorRetry(address)}.`)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Reintentar fallidos
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm("¿Reiniciar este número? Se desvincula su WhatsApp y se borra la conversación (solo datos de prueba).")) {
                run(() => simulatorReset(address));
              }
            }}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reiniciar este número
          </button>
          {canResetDemo && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm("¿Restablecer toda la demo? Se borra todo lo que se creó (usuarios, solicitudes, facturas, conversaciones) y se cierran las sesiones.")) {
                  run(async () => {
                    const message = await simulatorResetDemo();
                    window.location.href = "/login?next=/dev/whatsapp";
                    return message;
                  });
                }
              }}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              Restablecer demo (todos los datos)
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={plain} onChange={(e) => setPlain(e.target.checked)} />
            Ver como un cliente sin botones (opciones numeradas)
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <p className="font-medium text-navy">Para revisar en la web</p>
          <ul className="mt-1 space-y-1">
            <li>
              <Link href="/admin/solicitudes" target="_blank" className="text-brand-700 underline">
                Bandeja de solicitudes
              </Link>
            </li>
            <li>
              <Link href="/admin/accesos" target="_blank" className="text-brand-700 underline">
                Accesos (aprobar altas, ver WhatsApp vinculados)
              </Link>
            </li>
            <li>
              <Link href="/perfil" target="_blank" className="text-brand-700 underline">
                Mi perfil → WhatsApp (generar código)
              </Link>
            </li>
            <li>
              <Link href="/dev/correos" target="_blank" className="text-brand-700 underline">
                Correos de prueba
              </Link>
            </li>
          </ul>
        </div>
      </aside>

      <section className="flex min-h-[520px] flex-col rounded-xl border border-slate-200 bg-[#efeae2] lg:col-span-2" aria-label="Conversación">
        <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
          {items.length === 0 && <p className="text-center text-sm text-slate-600">Todavía no hay mensajes. Escribí *hola*.</p>}
          {items.map((m) => (
            <div key={m.id} data-dir={m.dir} className={`flex ${m.dir === "in" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm shadow-sm ${
                  m.dir === "in" ? "bg-[#d9fdd3] text-slate-900" : "bg-white text-slate-900"
                }`}
              >
                {m.file && <p className="mb-1 text-xs font-medium text-slate-700">📎 {m.file}</p>}
                {m.choice && <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Opción tocada</p>}
                <Rich text={plain && m.message ? fallbackText(m.message) : m.text} />
                {!plain && m.message && <Interactive message={m.message} disabled={pending} onChoose={choose} />}
                <p className="mt-1 text-right text-[10px] text-slate-500">
                  {new Date(m.at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · {STATUS_LABEL[m.status] ?? m.status}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        {notice && <p className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="status">{notice}</p>}
        <form
          className="flex gap-2 border-t border-slate-200 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <label htmlFor="sim-text" className="sr-only">
            Mensaje
          </label>
          <input
            ref={fileInput}
            id="sim-file"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <label
            htmlFor="sim-file"
            title="Adjuntar foto o PDF"
            className="flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 text-lg hover:bg-slate-50"
          >
            📎<span className="sr-only">Adjuntar archivo</span>
          </label>
          <input id="sim-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí un mensaje" className={inputClass} autoComplete="off" />
          <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {pending ? "…" : "Enviar"}
          </button>
        </form>
      </section>
    </div>
  );
}
