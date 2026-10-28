import type { UploadFile } from "@/modules/documents/service";

/** Archivos de un formulario. Un campo de archivo vacío llega como un File sin nombre ni contenido: se ignora. */
export async function readUploads(formData: FormData, key = "files"): Promise<UploadFile[]> {
  const files = formData.getAll(key).filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v);
  const picked = files.filter((f) => f.size > 0 || f.name !== "");
  return Promise.all(picked.map(async (f) => ({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })));
}
