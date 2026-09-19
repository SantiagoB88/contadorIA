/**
 * Client-side estimate only — shown so the user sees totals before
 * confirming. The API always recomputes authoritatively on submit (§44);
 * this never has to match it to the cent.
 */
export interface PreviewLine {
  quantity: number;
  unitPrice: number; // minor units
  taxRate: number; // percent
}

export interface PreviewTotals {
  subtotal: number;
  taxes: number;
  total: number;
}

export function previewInvoiceTotals(lines: PreviewLine[]): PreviewTotals {
  let subtotal = 0;
  let taxes = 0;
  for (const line of lines) {
    const lineSubtotal = Math.round(line.unitPrice * line.quantity);
    const lineTax = Math.round(lineSubtotal * (line.taxRate / 100));
    subtotal += lineSubtotal;
    taxes += lineTax;
  }
  return { subtotal, taxes, total: subtotal + taxes };
}
