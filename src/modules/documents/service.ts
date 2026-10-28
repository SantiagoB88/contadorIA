import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  DOC_CATEGORY_LABEL,
  DOC_VISIBILITY,
  MAX_FILE_BYTES,
  MAX_FILES_PER_UPLOAD,
  ROLES,
} from "@/lib/constants";
import type { CurrentUser } from "@/lib/auth";
import type { ServiceResult } from "@/modules/access/service";
import { getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { storage } from "@/providers/storage";

// Documentos privados y adjuntos. Sin dependencias de Next, para poder probarlo con `npm run verify`.
// Reglas: solo PDF, PNG y JPEG; se valida extensión, tipo declarado y contenido real (firma del archivo).
// La descarga se autoriza en cada pedido contra los permisos actuales.

export type UploadFile = { name: string; type: string; bytes: Uint8Array };

type Kind = { mime: string; extensions: string[]; matches: (b: Uint8Array) => boolean };

const KINDS: Kind[] = [
  {
    mime: "application/pdf",
    extensions: ["pdf"],
    matches: (b) => b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-",
  },
  {
    mime: "image/png",
    extensions: ["png"],
    matches: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  {
    mime: "image/jpeg",
    extensions: ["jpg", "jpeg"],
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
];

// Tipos que algunos navegadores informan cuando no saben el tipo: no se usan para decidir, pero se toleran.
const GENERIC_TYPES = ["", "application/octet-stream"];

export type CheckedFile = { fileName: string; mimeType: string; bytes: Uint8Array };

/** Nombre visible seguro: sin carpetas, sin caracteres de control y con largo acotado. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").trim();
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - ext.length) + ext;
}

/** Valida un archivo. Devuelve el tipo detectado por contenido o el motivo del rechazo. */
export function checkFile(file: UploadFile): { ok: true; file: CheckedFile } | { ok: false; message: string } {
  const fileName = cleanFileName(file.name);
  if (!fileName) return { ok: false, message: "El archivo no tiene nombre." };
  if (file.bytes.length === 0) return { ok: false, message: `"${fileName}" está vacío.` };
  if (file.bytes.length > MAX_FILE_BYTES) return { ok: false, message: `"${fileName}" supera los 10 MB.` };

  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const byExtension = KINDS.find((k) => k.extensions.includes(ext));
  if (!byExtension) return { ok: false, message: `"${fileName}": solo se aceptan archivos PDF, PNG o JPG.` };
  if (!byExtension.matches(file.bytes)) {
    return { ok: false, message: `"${fileName}": el contenido no corresponde a un ${ext.toUpperCase()} válido.` };
  }
  const declared = file.type.toLowerCase();
  if (!GENERIC_TYPES.includes(declared) && declared !== byExtension.mime && !(declared === "image/jpg" && byExtension.mime === "image/jpeg")) {
    return { ok: false, message: `"${fileName}": el tipo de archivo no coincide con su extensión.` };
  }
  return { ok: true, file: { fileName, mimeType: byExtension.mime, bytes: file.bytes } };
}

/** Valida un grupo de archivos de un mismo envío. */
export function checkFiles(files: UploadFile[]): { ok: true; files: CheckedFile[] } | { ok: false; message: string } {
  if (files.length > MAX_FILES_PER_UPLOAD) return { ok: false, message: `Podés adjuntar hasta ${MAX_FILES_PER_UPLOAD} archivos por vez.` };
  const checked: CheckedFile[] = [];
  for (const f of files) {
    const r = checkFile(f);
    if (!r.ok) return r;
    checked.push(r.file);
  }
  return { ok: true, files: checked };
}

export type StoredFile = CheckedFile & { storageKey: string; sha256: string };

/**
 * Escribe los archivos en el almacenamiento antes de crear las filas en la base.
 * Si después falla la base, `discardStored` borra lo escrito para no dejar huérfanos.
 */
export async function storeFiles(files: CheckedFile[]): Promise<StoredFile[]> {
  const stored: StoredFile[] = [];
  try {
    for (const f of files) {
      const storageKey = storage.newKey();
      await storage.put(storageKey, f.bytes);
      stored.push({ ...f, storageKey, sha256: createHash("sha256").update(f.bytes).digest("hex") });
    }
  } catch (err) {
    await discardStored(stored);
    throw err;
  }
  return stored;
}

export async function discardStored(files: StoredFile[]) {
  for (const f of files) await storage.remove(f.storageKey).catch(() => undefined);
}

const CATEGORIES = Object.keys(DOC_CATEGORY_LABEL);

function assertAdmin(user: CurrentUser) {
  if (user.role !== ROLES.ADMIN) throw new Error("Solo un administrador puede hacer esto.");
}

/** Carga del estudio en la ficha del contribuyente. */
export async function uploadTaxpayerDocuments(
  admin: CurrentUser,
  taxpayerId: string,
  files: UploadFile[],
  input: { category: string; visibility: string; note: string },
): Promise<ServiceResult> {
  assertAdmin(admin);
  const taxpayer = await prisma.taxpayer.findFirst({ where: { id: taxpayerId, studyId: admin.studyId } });
  if (!taxpayer) return { ok: false, message: "No encontramos el contribuyente en tu estudio." };

  const note = input.note.trim();
  const fieldErrors: Record<string, string> = {};
  if (!CATEGORIES.includes(input.category)) fieldErrors.category = "Elegí una categoría.";
  if (input.visibility !== DOC_VISIBILITY.CLIENTE && input.visibility !== DOC_VISIBILITY.INTERNO) {
    fieldErrors.visibility = "Elegí quién puede verlo.";
  }
  if (note.length > 300) fieldErrors.note = "Máximo 300 caracteres.";
  if (files.length === 0) fieldErrors.files = "Elegí al menos un archivo.";
  const checked = checkFiles(files);
  if (!checked.ok) fieldErrors.files = checked.message;
  if (Object.keys(fieldErrors).length > 0 || !checked.ok) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  const stored = await storeFiles(checked.files);
  try {
    await prisma.$transaction(async (tx) => {
      for (const f of stored) {
        const doc = await tx.document.create({
          data: {
            studyId: admin.studyId,
            taxpayerId: taxpayer.id,
            storageKey: f.storageKey,
            fileName: f.fileName,
            mimeType: f.mimeType,
            sizeBytes: f.bytes.length,
            sha256: f.sha256,
            category: input.category,
            visibility: input.visibility,
            note: note || null,
            uploadedById: admin.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            studyId: admin.studyId,
            actorId: admin.id,
            action: "DOCUMENT_UPLOAD",
            entity: "Document",
            entityId: doc.id,
            detail: `${taxpayer.name}: ${f.fileName} (${input.visibility === DOC_VISIBILITY.CLIENTE ? "visible para el cliente" : "interno"})`,
          },
        });
      }
    });
  } catch (err) {
    await discardStored(stored);
    throw err;
  }
  return { ok: true, message: stored.length === 1 ? "Documento cargado." : `${stored.length} documentos cargados.` };
}

/** Compartir o dejar de compartir un documento con el cliente. */
export async function setDocumentVisibility(admin: CurrentUser, documentId: string, visibility: string): Promise<ServiceResult> {
  assertAdmin(admin);
  if (visibility !== DOC_VISIBILITY.CLIENTE && visibility !== DOC_VISIBILITY.INTERNO) return { ok: false, message: "Visibilidad inválida." };
  const doc = await prisma.document.findFirst({
    where: { id: documentId, studyId: admin.studyId },
    include: { taxpayer: true, message: true },
  });
  if (!doc) return { ok: false, message: "El documento no existe en tu estudio." };
  // Un adjunto de una nota interna nunca se comparte: se respeta la visibilidad del mensaje.
  if (doc.message && doc.message.visibility === "INTERNA" && visibility === DOC_VISIBILITY.CLIENTE) {
    return { ok: false, message: "Es un adjunto de una nota interna: no se puede compartir con el cliente." };
  }
  if (doc.visibility === visibility) return { ok: false, message: "El documento ya tiene esa visibilidad." };

  await prisma.document.update({ where: { id: doc.id }, data: { visibility } });
  await prisma.auditEvent.create({
    data: {
      studyId: admin.studyId,
      actorId: admin.id,
      action: "DOCUMENT_VISIBILITY",
      entity: "Document",
      entityId: doc.id,
      detail: `${doc.taxpayer.name}: ${doc.fileName} → ${visibility === DOC_VISIBILITY.CLIENTE ? "visible para el cliente" : "solo el estudio"}`,
    },
  });
  return { ok: true, message: visibility === DOC_VISIBILITY.CLIENTE ? "Ahora el cliente lo puede ver." : "El cliente ya no lo ve." };
}

export type DocumentFilters = { taxpayerId?: string; category?: string; q?: string };

/**
 * Documentos que el usuario puede ver.
 * - CLIENTE: solo de contribuyentes habilitados y con visibilidad CLIENTE.
 * - ADMIN: todos los de su estudio.
 */
export async function listDocuments(user: CurrentUser, filters: DocumentFilters) {
  const isAdmin = user.role === ROLES.ADMIN;
  const where = {
    studyId: user.studyId,
    ...(filters.taxpayerId ? { taxpayerId: filters.taxpayerId } : {}),
    ...(filters.category && CATEGORIES.includes(filters.category) ? { category: filters.category } : {}),
    ...(filters.q?.trim() ? { fileName: { contains: filters.q.trim() } } : {}),
    ...(isAdmin
      ? {}
      : {
          visibility: DOC_VISIBILITY.CLIENTE,
          taxpayer: { accesses: { some: { userId: user.id, status: "APROBADO" } } },
        }),
  };
  return prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      taxpayerId: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      category: true,
      visibility: true,
      note: true,
      createdAt: true,
      messageId: true,
      taxpayer: { select: { name: true } },
      uploadedBy: { select: { name: true, role: true } },
      message: { select: { requestId: true, visibility: true } },
    },
  });
}

/** Documento si el usuario puede descargarlo ahora; si no, null. Nunca devuelve la ruta física. */
export async function getAuthorizedDocument(user: CurrentUser, documentId: string) {
  if (!documentId) return null;
  const doc = await prisma.document.findFirst({ where: { id: documentId, studyId: user.studyId }, include: { message: true } });
  if (!doc) return null;
  if (user.role === ROLES.ADMIN) return doc;
  if (doc.visibility !== DOC_VISIBILITY.CLIENTE) return null;
  if (doc.message && doc.message.visibility !== "PUBLICA") return null;
  const taxpayer = await getAuthorizedTaxpayer(user, doc.taxpayerId);
  return taxpayer ? doc : null;
}

/** Lee el archivo y comprueba que no haya cambiado desde que se subió. */
export async function readDocumentBytes(doc: { storageKey: string; sha256: string }): Promise<Buffer | null> {
  const bytes = await storage.get(doc.storageKey);
  if (!bytes) return null;
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== doc.sha256) throw new Error("El archivo guardado no coincide con su huella (hash).");
  return bytes;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}
