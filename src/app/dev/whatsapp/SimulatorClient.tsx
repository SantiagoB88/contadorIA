"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  simulatorConcurrent,
  simulatorRetry,
  simulatorSend,
  simulatorTranscript,
  type TranscriptItem,
} from "@/modules/bot/simulator-actions";
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

export function SimulatorClient({ identities }: { identities: Identity[] }) {
  const [address, setAddress] = useState(identities[0].address);
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [text, setText] = useState("");
  const [fault, setFault] = useState<"" | "antes" | "despues">("");
  const [notice, setNotice] = useState<string | null>(null);
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

  const send = (value: string) =>
    run(async () => {
      if (!value.trim()) return null;
      setText("");
      const r = await simulatorSend(address, value, { fault: fault || undefined });
      return r.outcome.status === "fallido" ? `El servidor falló (simulado): ${r.outcome.error}. Probá "Reintentar fallidos".` : null;
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
            <div key={m.id} className={`flex ${m.dir === "in" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm shadow-sm ${
                  m.dir === "in" ? "bg-[#d9fdd3] text-slate-900" : "bg-white text-slate-900"
                }`}
              >
                <Rich text={m.text} />
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
          <input id="sim-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí un mensaje" className={inputClass} autoComplete="off" />
          <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {pending ? "…" : "Enviar"}
          </button>
        </form>
      </section>
    </div>
  );
}
