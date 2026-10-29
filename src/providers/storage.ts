import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { prepareBundledDemo, usesBundledDemo } from "@/lib/vercel-demo";

// Almacenamiento de archivos privados. En la V1 local es una carpeta fuera de `public/`
// (por defecto `storage/`, configurable con STORAGE_DIR). Los archivos se guardan con un nombre aleatorio
// y sin extensión: nunca se usa el nombre que subió el usuario ni se expone la ruta física.

export interface FileStorage {
  newKey(): string;
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-f0-9]{40}$/;

export class LocalFileStorage implements FileStorage {
  constructor(private readonly dir: string) {}

  newKey() {
    return randomBytes(20).toString("hex");
  }

  /** La clave se valida antes de armar la ruta: no puede salir de la carpeta. */
  private pathFor(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error("Clave de archivo inválida.");
    return path.join(this.dir, key.slice(0, 2), key);
  }

  async put(key: string, bytes: Uint8Array) {
    const file = this.pathFor(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx" }); // nunca pisa un archivo existente
  }

  async get(key: string) {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async remove(key: string) {
    await rm(this.pathFor(key), { force: true });
  }

  /** Borra todos los archivos guardados (solo lo usa `npm run db:reset`). */
  async clear() {
    let entries: string[] = [];
    try {
      entries = await readdir(this.dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (/^[a-f0-9]{2}$/.test(entry)) await rm(path.join(this.dir, entry), { recursive: true, force: true });
    }
  }
}

// En la demo de Vercel, los archivos van a la copia temporal (ver src/lib/vercel-demo.ts).
export const storageDir = path.resolve(
  process.env.STORAGE_DIR ?? (usesBundledDemo ? prepareBundledDemo().storage : path.join(process.cwd(), "storage")),
);
export const storage = new LocalFileStorage(storageDir);
