import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { DOC_TYPE_LABEL, TAX_CONDITION_LABEL } from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatDateAR, formatDateTimeAR } from "@/lib/dates";
import { formatARS, formatQuantity } from "@/lib/money";
import { formatInvoiceNumber } from "./service";

type PdfInvoice = {
  invoiceType: string | null;
  pointOfSale: number | null;
  number: number | null;
  issueDate: string;
  issuedAt: Date | null;
  recipientName: string;
  recipientDocType: string | null;
  recipientDocNumber: string | null;
  recipientTaxCondition: string | null;
  amountCents: bigint;
  items: { description: string; quantityMilli: number; unitPriceCents: bigint; subtotalCents: bigint }[];
  taxpayer: { name: string; cuit: string; activity: string; startDate: string };
};

const WATERMARK = "SIMULACIÓN SIN VALIDEZ FISCAL";
const GRAY = rgb(0.35, 0.38, 0.42);
const DARK = rgb(0.1, 0.13, 0.16);
const RED = rgb(0.75, 0.1, 0.1);

// Las fuentes estándar usan WinAnsi: se reemplazan caracteres fuera de ese juego para que no falle el PDF.
function safe(text: string): string {
  return text
    .replace(/[ -​ ]/g, " ") // espacios finos que usa Intl
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E -ÿ]/g, "?");
}

/** Corta un texto en líneas que entran en el ancho dado. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function textRight(page: PDFPage, text: string, xRight: number, y: number, font: PDFFont, size: number, color = DARK) {
  const t = safe(text);
  page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
}

/** PDF de demostración: marca de agua, sin CAE ni QR. No imita un comprobante oficial. */
export async function buildInvoicePdf(invoice: PdfInvoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Factura de demostración ${formatInvoiceNumber(invoice.invoiceType, invoice.pointOfSale, invoice.number)}`);
  doc.setProducer("ContadorSmart (modo DEMO)");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const width = 595.28; // A4
  const height = 841.89;
  const margin = 48;
  const right = width - margin;

  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = doc.addPage([width, height]);
    // Marca de agua diagonal en cada página.
    p.drawText(safe(WATERMARK), {
      x: 60,
      y: 190,
      size: 33,
      font: bold,
      color: rgb(0.85, 0.2, 0.2),
      opacity: 0.18,
      rotate: degrees(40),
    });
    // Franja superior.
    p.drawRectangle({ x: 0, y: height - 28, width, height: 28, color: rgb(0.99, 0.93, 0.8) });
    const banner = safe(`${WATERMARK} · Documento de prueba generado en modo DEMO · Sin CAE`);
    p.drawText(banner, { x: (width - regular.widthOfTextAtSize(banner, 9)) / 2, y: height - 18, size: 9, font: bold, color: RED });
    pages.push(p);
    return p;
  };

  let page = newPage();
  let y = height - 70;

  // Encabezado
  page.drawText("FACTURA C", { x: margin, y, size: 20, font: bold, color: DARK });
  textRight(page, formatInvoiceNumber(invoice.invoiceType, invoice.pointOfSale, invoice.number), right, y + 4, bold, 13);
  y -= 18;
  page.drawText(safe("Comprobante de demostración - numeración interna, no fiscal"), { x: margin, y, size: 9, font: regular, color: RED });
  textRight(page, `Fecha: ${formatDateAR(invoice.issueDate)}`, right, y, regular, 10);
  y -= 30;

  // Emisor y receptor
  const col2 = margin + (right - margin) / 2 + 10;
  page.drawText("EMISOR", { x: margin, y, size: 8, font: bold, color: GRAY });
  page.drawText("RECEPTOR", { x: col2, y, size: 8, font: bold, color: GRAY });
  y -= 14;
  const doc2 =
    invoice.recipientDocType === "CUIT" && invoice.recipientDocNumber
      ? `CUIT ${formatCuit(invoice.recipientDocNumber)}`
      : invoice.recipientDocNumber
        ? `${DOC_TYPE_LABEL[invoice.recipientDocType ?? ""] ?? ""} ${invoice.recipientDocNumber}`
        : "Documento: sin identificar";
  const left = [
    invoice.taxpayer.name,
    `CUIT ${formatCuit(invoice.taxpayer.cuit)}`,
    "Responsable Monotributo",
    `Actividad: ${invoice.taxpayer.activity}`,
    `Inicio de actividades: ${formatDateAR(invoice.taxpayer.startDate)}`,
  ];
  const rightCol = [invoice.recipientName, doc2, TAX_CONDITION_LABEL[invoice.recipientTaxCondition ?? ""] ?? ""];
  const colWidth = (right - margin) / 2 - 10;
  let yl = y;
  left.forEach((t, i) =>
    wrap(t, i === 0 ? bold : regular, 10, colWidth).forEach((line) => {
      page.drawText(line, { x: margin, y: yl, size: 10, font: i === 0 ? bold : regular, color: DARK });
      yl -= 13;
    }),
  );
  let yr = y;
  rightCol.forEach((t, i) =>
    wrap(t, i === 0 ? bold : regular, 10, colWidth).forEach((line) => {
      page.drawText(line, { x: col2, y: yr, size: 10, font: i === 0 ? bold : regular, color: DARK });
      yr -= 13;
    }),
  );
  y = Math.min(yl, yr) - 16;

  // Tabla de conceptos
  const cols = { desc: margin, qty: right - 230, price: right - 120, sub: right };
  const header = () => {
    page.drawRectangle({ x: margin - 4, y: y - 5, width: right - margin + 8, height: 18, color: rgb(0.94, 0.95, 0.96) });
    page.drawText("Concepto", { x: cols.desc, y, size: 9, font: bold, color: GRAY });
    textRight(page, "Cantidad", cols.qty, y, bold, 9, GRAY);
    textRight(page, "Precio unitario", cols.price, y, bold, 9, GRAY);
    textRight(page, "Subtotal", cols.sub, y, bold, 9, GRAY);
    y -= 20;
  };
  header();

  for (const item of invoice.items) {
    const lines = wrap(item.description, regular, 10, cols.qty - cols.desc - 70);
    const needed = lines.length * 13 + 10;
    if (y - needed < 120) {
      page = newPage();
      y = height - 70;
      header();
    }
    lines.forEach((line, i) => page.drawText(line, { x: cols.desc, y: y - i * 13, size: 10, font: regular, color: DARK }));
    textRight(page, formatQuantity(item.quantityMilli), cols.qty, y, regular, 10);
    textRight(page, formatARS(item.unitPriceCents), cols.price, y, regular, 10);
    textRight(page, formatARS(item.subtotalCents), cols.sub, y, regular, 10);
    // Separador entre el renglón y el siguiente (debajo de los descendentes, arriba de las mayúsculas).
    const sepY = y - lines.length * 13 + 4;
    page.drawLine({ start: { x: margin - 4, y: sepY }, end: { x: right + 4, y: sepY }, thickness: 0.5, color: rgb(0.88, 0.89, 0.9) });
    y -= needed;
  }

  // Total
  y -= 10;
  page.drawText("TOTAL", { x: cols.price - 60, y, size: 12, font: bold, color: DARK });
  textRight(page, formatARS(invoice.amountCents), cols.sub, y, bold, 13);

  // Pie en todas las páginas
  pages.forEach((p, i) => {
    const lines = [
      "Este documento fue generado por ContadorSmart en modo DEMO. No fue informado a ARCA, no tiene CAE ni código QR",
      "y no tiene validez fiscal. No sirve como comprobante para el receptor.",
      `Generado el ${formatDateTimeAR(invoice.issuedAt ?? new Date())} · Página ${i + 1} de ${pages.length}`,
    ];
    lines.forEach((t, j) => p.drawText(safe(t), { x: margin, y: 70 - j * 12, size: 8, font: j < 2 ? bold : regular, color: j < 2 ? RED : GRAY }));
  });

  return doc.save();
}
