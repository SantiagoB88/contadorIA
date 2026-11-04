import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { checkFile, type UploadFile } from "@/modules/documents/service";
import { storage } from "@/providers/storage";

// Archivos que llegan por el bot. Se validan con las mismas reglas que la web (PDF, PNG o JPG; tamaño; contenido
// real) apenas llegan y se guardan en el almacenamiento privado. El paso que los pidió los toma con `takeUpload`,
// que verifica que sean del mismo número; al usarlos se marcan como usados.

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

/** Guarda un archivo recibido. Devuelve el id o el motivo del rechazo (en palabras para la persona). */
export async function saveBotUpload(
  address: string,
  file: { name: string | null; mimeType: string; bytes: Uint8Array },
): Promise<{ ok: true; id: string; fileName: string } | { ok: false; message: string }> {
  // WhatsApp no siempre manda nombre (por ejemplo, en fotos): se arma uno a partir del tipo.
  const ext = EXT[file.mimeType.toLowerCase()];
  const name = file.name?.trim() || (ext ? `archivo-whatsapp.${ext}` : "archivo");
  const checked = checkFile({ name, type: file.mimeType, bytes: file.bytes });
  if (!checked.ok) return { ok: false, message: checked.message };
  const storageKey = storage.newKey();
  await storage.put(storageKey, checked.file.bytes);
  const row = await prisma.botUpload.create({
    data: {
      address,
      storageKey,
      fileName: checked.file.fileName,
      mimeType: checked.file.mimeType,
      sizeBytes: checked.file.bytes.length,
      sha256: createHash("sha256").update(checked.file.bytes).digest("hex"),
    },
  });
  return { ok: true, id: row.id, fileName: row.fileName };
}

/** Archivo listo para pasarle a los servicios de la web (createRequest, addMessage, informPayment). */
export async function takeUpload(id: string | undefined, address: string): Promise<UploadFile | null> {
  if (!id) return null;
  const row = await prisma.botUpload.findUnique({ where: { id } });
  if (!row || row.address !== address) return null;
  const bytes = await storage.get(row.storageKey);
  if (!bytes) return null;
  return { name: row.fileName, type: row.mimeType, bytes: new Uint8Array(bytes) };
}

export async function markUploadUsed(id: string | undefined) {
  if (id) await prisma.botUpload.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
}

/** Los archivos del bot se conservan este tiempo: alcanza para terminar un recorrido y para los reintentos. */
export const UPLOAD_KEEP_HOURS = 24;

/**
 * Borra los archivos recibidos por el bot con más de UPLOAD_KEEP_HOURS horas, usados o no. Los servicios de la web
 * guardan su propia copia al crear la solicitud, el mensaje o el pago: esta copia es solo de paso.
 */
export async function cleanupOldUploads(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UPLOAD_KEEP_HOURS * 60 * 60 * 1000);
  const rows = await prisma.botUpload.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true, storageKey: true }, take: 200 });
  for (const row of rows) {
    await storage.remove(row.storageKey).catch(() => undefined); // si ya no estaba, igual se borra el registro
    await prisma.botUpload.delete({ where: { id: row.id } }).catch(() => undefined);
  }
  return rows.length;
}

// Se corre como mucho una vez por hora, aprovechando la llegada de mensajes (no hay un proceso periódico).
const lastCleanup = globalThis as unknown as { botUploadCleanupAt?: number };
export async function maybeCleanupUploads(): Promise<void> {
  const now = Date.now();
  if (lastCleanup.botUploadCleanupAt && now - lastCleanup.botUploadCleanupAt < 60 * 60 * 1000) return;
  lastCleanup.botUploadCleanupAt = now;
  await cleanupOldUploads().catch((err) => console.error("[bot] Falló la limpieza de archivos:", err instanceof Error ? err.message : err));
}
