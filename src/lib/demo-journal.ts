import { cookies } from "next/headers";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { demoSecret } from "./demo-secret";
import { usesBundledDemo } from "./vercel-demo";

// Datos creados durante la demo de Vercel, en todas las copias del servidor (sin base compartida).
//
// En Vercel cada copia del servidor tiene su propia base de demo y Vercel reparte los pedidos entre copias: una
// solicitud creada en una copia no aparecía en la Bandeja ni en "Mis solicitudes" si las atendía otra. Igual que con
// las cuentas (demo-accounts.ts), el navegador lleva una copia cifrada de lo que se creó o cambió en la demo:
// solicitudes y mensajes, facturas, receptores, documentos (sin el archivo), pagos informados, vencimientos, escalas,
// categorías, avisos del bot, etc. Cada pedido reconstruye en su copia lo que falta (o está más viejo) y cada acción
// guarda al terminar lo nuevo de su copia.
//
// - Qué se guarda: las filas creadas o modificadas después de armar la base de demo (marca "demo-built-at").
// - Gana lo más nuevo (updatedAt) cuando la tabla lo tiene; si no, lo que trae el navegador (es lo último que hizo
//   la persona, que trabaja de a una cosa por vez).
// - Lo borrado (por ejemplo, un borrador) viaja como "borrado" para que otra copia no lo vuelva a mostrar.
// - Los archivos no viajan: un documento subido en otra copia se lista, pero su archivo puede no estar disponible.
// - Cifrado con AES-GCM y una clave derivada del secreto de la demo: nadie puede leerlo ni fabricarlo.
// Solo en la demo de Vercel (usesBundledDemo). En la compu y en una instalación real no hace nada.

const COOKIE_PREFIX = "cs_demo_datos";
const MAX_CHUNKS = 3; // hasta 3 cookies de 3 KB
const CHUNK = 3000; // unos 9 KB en total: junto con las demás cookies queda lejos del límite de cabeceras
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const BUILT_AT_KEY = "demo-built-at";

// Tablas en orden de dependencia (primero las que otras referencian).
const MODELS = [
  "Plan",
  "User",
  "Taxpayer",
  "TaxpayerAccess",
  "AccessRequest",
  "TaxScaleVersion",
  "TaxCategoryLimit",
  "CategoryHistory",
  "DataCoverage",
  "DebtReview",
  "Obligation",
  "InvoiceRecipient",
  "InvoiceSequence",
  "Invoice",
  "InvoiceItem",
  "InvoiceAttempt",
  "ServiceRequest",
  "RequestMessage",
  "Document",
  "IdempotencyKey",
  "NotificationPreference",
  "ChannelLink",
  "BotUpload",
  "OutboundMessage",
] as const;
type ModelName = (typeof MODELS)[number];

type Row = Record<string, unknown>;
type Journal = { rows: Record<string, Row[]>; deleted: string[] }; // deleted: "Modelo:id"

const meta = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const idField = (model: ModelName) => meta.get(model)!.fields.find((f) => f.isId)!.name;
const has = (model: ModelName, field: string) => meta.get(model)!.fields.some((f) => f.name === field && f.kind === "scalar");
const delegate = (model: ModelName) =>
  (prisma as unknown as Record<string, { findMany: Function; findUnique: Function; create: Function; update: Function; deleteMany: Function }>)[
    model[0].toLowerCase() + model.slice(1)
  ];

// ───────────── Serialización (fechas y BigInt) ─────────────

function encodeRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue; // los nulos no viajan (se reconstruyen como null)
    out[k] = v instanceof Date ? { $d: v.toISOString() } : typeof v === "bigint" ? { $n: v.toString() } : v;
  }
  return out;
}
function decodeRow(model: ModelName, row: Row): Row {
  const out: Row = {};
  for (const f of meta.get(model)!.fields) {
    if (f.kind !== "scalar") continue;
    const v = row[f.name] as unknown;
    if (v === undefined) {
      if (!f.isRequired) out[f.name] = null;
      continue;
    }
    if (v && typeof v === "object" && "$d" in (v as Row)) out[f.name] = new Date((v as { $d: string }).$d);
    else if (v && typeof v === "object" && "$n" in (v as Row)) out[f.name] = BigInt((v as { $n: string }).$n);
    else out[f.name] = v;
  }
  return out;
}

// ───────────── Cookie cifrada (en varias partes) ─────────────

const keyFor = (secret: string) => createHash("sha256").update(`${secret}:datos-demo`).digest();

async function readRaw(): Promise<string> {
  const store = await cookies();
  let raw = "";
  for (let i = 0; i < MAX_CHUNKS; i++) raw += store.get(`${COOKIE_PREFIX}_${i}`)?.value ?? "";
  return raw;
}

function decrypt(raw: string, secret: string): Journal | null {
  if (!raw) return null;
  try {
    const data = Buffer.from(raw, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
    return JSON.parse(inflateRawSync(plain).toString("utf8")) as Journal;
  } catch {
    return null; // alterada, de otro deploy o incompleta: se ignora
  }
}

function encrypt(journal: Journal, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(journal)))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

async function writeRaw(raw: string) {
  const store = await cookies();
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const part = raw.slice(i * CHUNK, (i + 1) * CHUNK);
    const name = `${COOKIE_PREFIX}_${i}`;
    if (part) {
      store.set(name, part, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE_SECONDS });
    } else if (store.get(name)) {
      store.delete(name);
    }
  }
}

async function readJournal(): Promise<{ raw: string; journal: Journal | null }> {
  const secret = await demoSecret();
  const raw = await readRaw();
  return { raw, journal: secret ? decrypt(raw, secret) : null };
}

// ───────────── Reconstruir en esta copia ─────────────

// Por copia del servidor: el último contenido aplicado (si el navegador trae lo mismo, no hay nada que hacer).
const applied = globalThis as unknown as { contadorSmartDemoJournal?: string };

/** Reconstruye en esta copia lo que el navegador trae y acá falta (o está más viejo). Devuelve lo que no se pudo. */
export async function restoreDemoData(): Promise<Set<string>> {
  const failed = new Set<string>();
  if (!usesBundledDemo) return failed;
  let raw: string;
  let journal: Journal | null;
  try {
    ({ raw, journal } = await readJournal());
  } catch {
    return failed; // fuera de un pedido del navegador
  }
  if (!journal || applied.contadorSmartDemoJournal === raw) return failed;

  for (const key of journal.deleted) {
    const [model, id] = key.split(":") as [ModelName, string];
    if (!MODELS.includes(model)) continue;
    await delegate(model).deleteMany({ where: { [idField(model)]: id } }).catch(() => undefined);
  }
  // Filas que en esta copia ya existían con otro identificador: lo que les apunta se redirige a la de esta copia.
  const remap = new Map<string, string>();
  for (const model of MODELS) {
    const pk = idField(model);
    for (const encoded of journal.rows[model] ?? []) {
      const row = decodeRow(model, encoded);
      const id = row[pk] as string;
      for (const [k, v] of Object.entries(row)) if (k !== pk && typeof v === "string" && remap.has(v)) row[k] = remap.get(v);
      try {
        const localId = await upsert(model, row);
        if (localId !== id) {
          remap.set(id, localId);
          failed.add(`${model}:${id}`); // se conserva tal cual en el navegador (no es un borrado)
        }
      } catch (err) {
        failed.add(`${model}:${id}`);
        console.error(`[demo] No se pudo reconstruir ${model} ${id}:`, err instanceof Error ? err.message.split("\n").slice(-1)[0] : err);
      }
    }
  }
  if (failed.size === remap.size) applied.contadorSmartDemoJournal = raw; // todo quedó aplicado
  return failed;
}

/**
 * Crea o actualiza una fila. Si choca con otra que ya existe con otro identificador (por ejemplo, el mismo acceso
 * creado en las dos copias, o dos pedidos reconstruyendo a la vez), se actualiza esa.
 */
async function upsert(model: ModelName, row: Row): Promise<string> {
  const pk = idField(model);
  const { [pk]: id, ...data } = row;
  const apply = async (existing: Row) => {
    // Se conserva el identificador de esta copia (otras filas pueden apuntarle).
    if (newer(model, row, existing)) await delegate(model).update({ where: { [pk]: existing[pk] }, data });
    return existing[pk] as string;
  };
  const byId = (await delegate(model).findUnique({ where: { [pk]: id } })) as Row | null;
  if (byId) return apply(byId);
  try {
    await delegate(model).create({ data: row });
    return id as string;
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    for (const fields of uniqueKeys(model)) {
      const where = Object.fromEntries(fields.map((f) => [f, row[f]]));
      if (Object.values(where).some((v) => v === null || v === undefined)) continue;
      const other = (await delegate(model).findMany({ where, take: 1 })) as Row[];
      if (other[0]) return apply(other[0]);
    }
    throw err;
  }
}

/** Claves únicas de la tabla (identificador, campos @unique y @@unique). */
function uniqueKeys(model: ModelName): string[][] {
  const m = meta.get(model)!;
  return [
    m.fields.filter((f) => f.isId).map((f) => f.name),
    ...m.fields.filter((f) => f.isUnique).map((f) => [f.name]),
    ...m.uniqueFields.map((u) => [...u]),
  ].filter((k) => k.length > 0);
}

/** ¿Lo que trae el navegador es más nuevo que lo de esta copia? */
function newer(model: ModelName, incoming: Row, existing: Row): boolean {
  if (has(model, "updatedAt")) return (incoming.updatedAt as Date) > (existing.updatedAt as Date);
  if (model === "AccessRequest") {
    const at = (r: Row) => ((r.reviewedAt as Date | null) ?? (r.createdAt as Date)).getTime();
    return at(incoming) > at(existing);
  }
  if (model === "InvoiceSequence") return (incoming.lastNumber as number) > (existing.lastNumber as number);
  // Sin fecha de modificación: lo que trae el navegador es lo último que hizo la persona.
  return JSON.stringify(encodeRow(incoming)) !== JSON.stringify(encodeRow(existing));
}

// ───────────── Guardar lo de esta copia ─────────────

async function builtAt(): Promise<Date | null> {
  const row = await prisma.appMeta.findUnique({ where: { key: BUILT_AT_KEY } });
  return row ? new Date(row.value) : null;
}

/** Filas creadas o cambiadas en la demo, en esta copia. */
async function snapshot(since: Date): Promise<Record<string, Row[]>> {
  const rows: Record<string, Row[]> = {};
  const changed = (model: ModelName) => {
    const or: Row[] = [];
    if (has(model, "createdAt")) or.push({ createdAt: { gt: since } });
    if (has(model, "updatedAt")) or.push({ updatedAt: { gt: since } });
    return or.length ? { OR: or } : null;
  };
  for (const model of MODELS) {
    let where: Row | null = changed(model);
    if (model === "InvoiceItem") where = { invoiceId: { in: (rows.Invoice ?? []).map((r) => r.id as string) } };
    if (model === "TaxCategoryLimit") where = { scaleVersionId: { in: (rows.TaxScaleVersion ?? []).map((r) => r.id as string) } };
    if (model === "InvoiceSequence") where = { taxpayerId: { in: [...new Set((rows.Invoice ?? []).map((r) => r.taxpayerId as string))] } };
    if (model === "OutboundMessage") where = { kind: "AVISO", createdAt: { gt: since } }; // avisos del estudio al chat
    if (model === "ChannelLink") where = { OR: [{ linkedAt: { gt: since } }, { unlinkedAt: { gt: since } }] };
    if (!where) continue;
    const found = (await delegate(model).findMany({ where })) as Row[];
    if (found.length) rows[model] = found;
  }
  return rows;
}

/**
 * Guarda en el navegador lo creado o cambiado en esta copia. `before` es lo que traía el navegador al empezar la
 * acción: lo que ya no está en esta copia (y se había podido reconstruir) se borró y viaja como borrado.
 */
async function saveDemoData(before: Journal | null, failed: Set<string>): Promise<void> {
  const secret = await demoSecret();
  const since = await builtAt();
  if (!secret || !since) return;
  const rows = await snapshot(since);
  const present = new Set(MODELS.flatMap((m) => (rows[m] ?? []).map((r) => `${m}:${r[idField(m)]}`)));
  const deleted = new Set(before?.deleted ?? []);
  for (const model of MODELS) {
    for (const encoded of before?.rows[model] ?? []) {
      const key = `${model}:${encoded[idField(model)]}`;
      if (present.has(key)) continue;
      if (failed.has(key)) {
        // No se pudo reconstruir acá: se conserva como venía.
        (rows[model] ??= []).push(decodeRow(model, encoded));
        continue;
      }
      // Estaba y ya no está (o dejó de cumplir el filtro): se confirma si de verdad se borró.
      const still = await delegate(model).findUnique({ where: { [idField(model)]: encoded[idField(model)] } });
      if (!still) deleted.add(key);
    }
  }
  for (const key of present) deleted.delete(key);

  // Lo más nuevo primero: si no entra en las cookies, se deja afuera lo más viejo.
  const stamp = (r: Row) => Math.max((r.updatedAt as Date | undefined)?.getTime() ?? 0, (r.createdAt as Date | undefined)?.getTime() ?? 0);
  const all = MODELS.flatMap((m) => (rows[m] ?? []).map((r) => ({ m, r, t: stamp(r) }))).sort((a, b) => b.t - a.t);
  const build = (count: number): Journal => {
    const out: Journal = { rows: {}, deleted: [...deleted].slice(-200) };
    for (const { m, r } of all.slice(0, count)) (out.rows[m] ??= []).push(encodeRow(r));
    // Ítems y límites sin fecha van con su factura o su escala aunque queden "viejos".
    return out;
  };
  let count = all.length;
  // Sin cambios respecto de lo que trajo el navegador: no se reescribe (escribir una cookie hace que Next vuelva a
  // dibujar la página, y el simulador consulta cada pocos segundos).
  if (before && JSON.stringify(build(count)) === JSON.stringify(before)) return;
  if (!before && all.length === 0 && deleted.size === 0) return;
  let raw = encrypt(build(count), secret);
  while (raw.length > CHUNK * MAX_CHUNKS && count > 0) {
    count = Math.floor(count * 0.8);
    raw = encrypt(build(count), secret);
    console.warn(`[demo] Datos de la demo recortados a ${count} filas para que entren en el navegador.`);
  }
  await writeRaw(raw);
  applied.contadorSmartDemoJournal = raw; // esta copia ya tiene exactamente esto
}

/**
 * Envuelve una Server Action: antes reconstruye lo que trae el navegador y al terminar (aunque redirija o falle)
 * guarda lo nuevo de esta copia. Fuera de la demo de Vercel devuelve la acción tal cual.
 */
export function demoAction<A extends unknown[], R>(action: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  if (!usesBundledDemo) return action;
  return async (...args: A) => {
    let before: Journal | null = null;
    let failed = new Set<string>();
    try {
      failed = await restoreDemoData();
      before = (await readJournal()).journal;
    } catch (err) {
      console.error("[demo] No se pudieron reconstruir los datos de la demo:", err);
    }
    try {
      return await action(...args);
    } finally {
      await saveDemoData(before, failed).catch((err) => console.error("[demo] No se pudieron guardar los datos de la demo:", err));
    }
  };
}

/** Marca de cuándo se armó la base de demo (lo anterior es de ejemplo y no viaja). */
export const DEMO_BUILT_AT_KEY = BUILT_AT_KEY;
