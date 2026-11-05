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

/** Copia la contraseña temporal entera (en WhatsApp se copia tocando el mensaje; acá, con un botón). */
function CopyPassword({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const password = text.match(/Contraseña temporal: (\S+)/)![1];
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(password);
          setCopied(true);
        } catch {
          window.prompt("Copiá la contraseña:", password);
        }
      }}
      className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {copied ? "Contraseña copiada" : "Copiar contraseña"}
    </button>
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

// Cada navegador tiene su propio número de prueba (se guarda en el navegador): arranca sin cuenta, como una persona
// que le escribe por primera vez al estudio. Rango del simulador +54 9 11 5555-0100 a 0999 (los anteriores son de ejemplo).
const OWN_KEY = "contadorsmart-sim-numero";
const newOwnNumber = () => `+5491155550${String(100 + Math.floor(Math.random() * 900))}`;
const pretty = (a: string) => `+54 9 11 ${a.slice(-8, -4)}-${a.slice(-4)}`;
function readOwn(): string {
  try {
    const saved = window.localStorage.getItem(OWN_KEY);
    if (saved && /^\+5491155550[1-9]\d{2}$/.test(saved)) return saved;
  } catch {
    // sin almacenamiento del navegador: igual funciona con un número nuevo
  }
  return saveOwn(newOwnNumber());
}
function saveOwn(n: string): string {
  try {
    window.localStorage.setItem(OWN_KEY, n);
  } catch {
    // no se pudo guardar: el número dura mientras la página esté abierta
  }
  return n;
}

// Demo de Vercel: copia cifrada de la conversación de cada número (ver simulator-backup.ts). Si Vercel reinicia o
// atiende otra copia del servidor, la conversación sigue. En la compu el servidor no manda copia (null).
const chatKey = (address: string) => `contadorsmart-sim-chat:${address}`;
function readBackup(address: string): string | null {
  try {
    return window.localStorage.getItem(chatKey(address));
  } catch {
    return null;
  }
}
function saveBackup(address: string, backup: string | null | undefined) {
  if (!backup) return;
  try {
    window.localStorage.setItem(chatKey(address), backup);
  } catch {
    // sin almacenamiento del navegador: la conversación depende de la copia del servidor
  }
}
function forgetBackup(address: string) {
  try {
    window.localStorage.removeItem(chatKey(address));
  } catch {
    // nada que borrar
  }
}

export function SimulatorClient({ examples, canResetDemo = false }: { examples: Identity[]; canResetDemo?: boolean }) {
  const [own, setOwn] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    const n = readOwn();
    setOwn(n);
    setAddress(n);
  }, []);
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [text, setText] = useState("");
  const [fault, setFault] = useState<"" | "antes" | "despues">("");
  const [notice, setNotice] = useState<string | null>(null);
  const [plain, setPlain] = useState(false); // ver como un cliente sin botones (opciones numeradas)
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  // Si la conversación vuelve con menos mensajes que antes, se perdieron datos (por ejemplo, la demo se reinició y el
  // navegador no tenía la copia): se avisa en lugar de mostrar un chat cortado sin explicación.
  const shown = useRef(0);
  // Cada acción sube la versión: una actualización automática que salió antes no pisa lo que trajo la acción.
  const version = useRef(0);
  const [restarted, setRestarted] = useState(false);
  const refresh = useCallback(async () => {
    if (!address) return;
    const started = version.current;
    try {
      const r = await simulatorTranscript(address, readBackup(address));
      if (started !== version.current) return;
      saveBackup(address, r.backup);
      if (r.items.length < shown.current) setRestarted(true);
      shown.current = r.items.length;
      setItems(r.items);
    } catch {
      // Sin conexión, o la sesión ya no vale: se avisa en lugar de fallar en silencio.
      if (started === version.current) setRestarted(true);
    }
  }, [address]);

  useEffect(() => {
    shown.current = 0;
  }, [address]);

  /** Guarda la copia de la conversación que devuelve una acción. */
  const keep = <T extends { backup: string | null }>(r: T): T => {
    version.current += 1;
    saveBackup(address!, r.backup);
    return r;
  };

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
      return failed(keep(await simulatorSend(address!, value, { fault: fault || undefined }, readBackup(address!))));
    });

  const choose = (c: Choice) => run(async () => failed(keep(await simulatorSend(address!, c.title, { choiceId: c.id, fault: fault || undefined }, readBackup(address!)))));

  const upload = (file: File) =>
    run(async () => {
      const form = new FormData();
      form.set("file", file);
      if (text.trim()) form.set("caption", text.trim());
      const backup = readBackup(address!);
      if (backup) form.set("backup", backup);
      setText("");
      if (fileInput.current) fileInput.current.value = "";
      return failed(keep(await simulatorUpload(address!, form)));
    });

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <aside className="space-y-4 lg:col-span-1">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label htmlFor="identity" className={labelClass}>
            Quién escribe
          </label>
          <select id="identity" value={address ?? ""} onChange={(e) => setAddress(e.target.value)} className={inputClass} disabled={!own}>
            {own && <option value={own}>Tu WhatsApp de prueba</option>}
            {examples.map((i) => (
              <option key={i.address} value={i.address}>
                {i.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-600">
            {address ? <span className="block font-medium text-slate-700">Número ficticio: {pretty(address)}</span> : null}
            {address === own
              ? "Arranca como una persona sin cuenta: escribí hola y date de alta por el chat."
              : "Clienta de ejemplo con cuenta y datos cargados, para recorrer todo el menú."}
          </p>
          <button
            type="button"
            disabled={pending || !own}
            onClick={() => {
              const n = saveOwn(newOwnNumber());
              setOwn(n);
              setAddress(n);
              setNotice("Número nuevo: empezás de cero, como otra persona.");
            }}
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Usar un número nuevo
          </button>
        </div>

        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-navy">Herramientas de prueba técnicas</summary>
          <div className="mt-3 space-y-3">
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
                    // Si era una opción tocada o un archivo, el reenvío lleva lo mismo.
                    const r = keep(await simulatorSend(address!, lastInbound!.text, { repeatOf: lastInbound!.providerId }, readBackup(address!)));
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
                    const r = keep(await simulatorConcurrent(address!, value, undefined, readBackup(address!)));
                    return `Dos entregas simultáneas del mismo evento: ${r.outcomes.map((o) => o.status).join(" y ")}.`;
                  })
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Enviar el texto dos veces a la vez
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(async () => `Reintentados: ${keep(await simulatorRetry(address!, readBackup(address!))).count}.`)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Reintentar fallidos
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("¿Reiniciar este número? Se desvincula su WhatsApp y se borra la conversación (solo datos de prueba).")) {
                    run(async () => {
                      const message = await simulatorReset(address!);
                      version.current += 1;
                      forgetBackup(address!);
                      shown.current = 0;
                      return message;
                    });
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
          </div>
        </details>

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
                {m.dir === "out" && /Contraseña temporal: (\S+)/.test(m.text) && <CopyPassword text={m.text} />}
                {!plain && m.message && <Interactive message={m.message} disabled={pending} onChoose={choose} />}
                <p className="mt-1 text-right text-[10px] text-slate-500">
                  {new Date(m.at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · {STATUS_LABEL[m.status] ?? m.status}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        {restarted && (
          <div className="border-t border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900" role="alert">
            Se cortó la conexión o la demo se reinició y se perdió parte de la conversación.{" "}
            <button type="button" className="font-medium underline" onClick={() => window.location.reload()}>
              Recargar y empezar de nuevo
            </button>
          </div>
        )}
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
