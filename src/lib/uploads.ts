import type { UploadFile } from "@/modules/documents/service";

/**
 * Archivos de un formulario. Un campo de archivo sin elegir llega como un archivo vacío sin nombre
 * (según cómo se serialice, el nombre puede llegar como "", "blob" o "undefined"): se ignora.
 */
export async function readUploads(formData: FormData, key = "files"): Promise<UploadFile[]> {
  const files = formData.getAll(key).filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v);
  const picked = files.filter((f) => f.size > 0 || !["", "blob", "undefined"].includes(f.name ?? ""));
  return Promise.all(picked.map(async (f) => ({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })));
}
