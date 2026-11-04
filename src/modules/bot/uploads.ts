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
