import { getCurrentUser } from "@/lib/auth";
import { getAuthorizedDocument, readDocumentBytes } from "@/modules/documents/service";

export const dynamic = "force-dynamic";

/**
 * Descarga de un documento privado. Se autoriza en cada pedido con los permisos actuales:
 * una URL guardada deja de servir si se revoca el acceso o si el documento deja de compartirse.
 * Nunca se expone la ruta física ni el nombre interno del archivo.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("No autenticado", { status: 401 });

  const { id } = await params;
  const doc = await getAuthorizedDocument(user, id);
  if (!doc) return new Response("No encontrado", { status: 404 });

  const bytes = await readDocumentBytes(doc);
  if (!bytes) return new Response("El archivo no está disponible", { status: 410 });

  const ascii = doc.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
