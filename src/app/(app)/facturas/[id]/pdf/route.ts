import { getCurrentUser } from "@/lib/auth";
import { INVOICE_SOURCE, INVOICE_STATUS } from "@/lib/constants";
import { getAuthorizedInvoice } from "@/modules/billing/service";
import { buildInvoicePdf } from "@/modules/billing/pdf";

export const dynamic = "force-dynamic";

/** Descarga del PDF. Se autoriza en cada pedido: una URL guardada deja de servir si se revoca el acceso. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("No autenticado", { status: 401 });

  const { id } = await params;
  const invoice = await getAuthorizedInvoice(user, id);
  if (!invoice || invoice.source !== INVOICE_SOURCE.FACTURADOR || invoice.status !== INVOICE_STATUS.SIMULADO) {
    return new Response("No encontrado", { status: 404 });
  }

  const bytes = await buildInvoicePdf(invoice);
  const file = `factura-demo-${invoice.invoiceType ?? "C"}-${String(invoice.pointOfSale ?? 1).padStart(5, "0")}-${String(
    invoice.number ?? 0,
  ).padStart(8, "0")}.pdf`;

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
