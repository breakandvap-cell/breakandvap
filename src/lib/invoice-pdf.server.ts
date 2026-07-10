// Génération de PDF de facture, edge-compatible via pdf-lib.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { INVOICE_SELLER } from "./invoice-config";

export type InvoiceItem = {
  product_name: string;
  quantity: number;
  unit_price_cents: number;
};

export type InvoiceBuyer = {
  full_name: string;
  email: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  postal_code: string;
  city: string;
  country: string;
};

export type InvoiceData = {
  number: string;
  issued_at: Date;
  order_number: string;
  currency: string;
  subtotal_cents: number;
  tax_rate: number;
  tax_cents: number;
  total_cents: number;
  buyer: InvoiceBuyer;
  items: InvoiceItem[];
};

function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2).replace(".", ",");
  return `${amount} ${currency}`;
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const marginX = 40;
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.85, 0.85, 0.85);

  let y = height - 50;
  const draw = (text: string, x: number, yy: number, size = 10, f = font, color = black) =>
    page.drawText(text, { x, y: yy, size, font: f, color });

  // En-tête vendeur
  draw(INVOICE_SELLER.company, marginX, y, 14, bold);
  y -= 16;
  draw(INVOICE_SELLER.address_line1, marginX, y, 9, font, gray);
  y -= 12;
  if (INVOICE_SELLER.address_line2) {
    draw(INVOICE_SELLER.address_line2, marginX, y, 9, font, gray);
    y -= 12;
  }
  draw(`${INVOICE_SELLER.postal_code} ${INVOICE_SELLER.city}, ${INVOICE_SELLER.country}`, marginX, y, 9, font, gray);
  y -= 12;
  draw(`SIRET : ${INVOICE_SELLER.siret}`, marginX, y, 9, font, gray);
  y -= 12;
  draw(`N° TVA : ${INVOICE_SELLER.vat_number}`, marginX, y, 9, font, gray);
  y -= 12;
  if (INVOICE_SELLER.email) {
    draw(INVOICE_SELLER.email, marginX, y, 9, font, gray);
    y -= 12;
  }

  // Titre + numéro facture (à droite)
  draw("FACTURE", width - marginX - 130, height - 55, 20, bold);
  draw(`N° ${data.number}`, width - marginX - 130, height - 78, 11, bold);
  draw(
    `Date : ${data.issued_at.toLocaleDateString("fr-FR")}`,
    width - marginX - 130,
    height - 94,
    9,
    font,
    gray,
  );
  draw(
    `Commande : ${data.order_number}`,
    width - marginX - 130,
    height - 108,
    9,
    font,
    gray,
  );

  // Séparateur
  y -= 10;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: width - marginX, y },
    thickness: 0.5,
    color: line,
  });

  // Bloc acheteur
  y -= 20;
  draw("Facturé à", marginX, y, 10, bold);
  y -= 14;
  draw(data.buyer.full_name, marginX, y, 10);
  y -= 12;
  draw(data.buyer.email, marginX, y, 9, font, gray);
  y -= 12;
  if (data.buyer.phone) {
    draw(data.buyer.phone, marginX, y, 9, font, gray);
    y -= 12;
  }
  draw(data.buyer.line1, marginX, y, 9, font, gray);
  y -= 12;
  if (data.buyer.line2) {
    draw(data.buyer.line2, marginX, y, 9, font, gray);
    y -= 12;
  }
  draw(
    `${data.buyer.postal_code} ${data.buyer.city}, ${data.buyer.country}`,
    marginX,
    y,
    9,
    font,
    gray,
  );

  // Tableau articles
  y -= 30;
  const colX = {
    name: marginX,
    qty: width - marginX - 220,
    unit: width - marginX - 150,
    total: width - marginX - 70,
  };
  page.drawRectangle({
    x: marginX,
    y: y - 4,
    width: width - marginX * 2,
    height: 20,
    color: rgb(0.95, 0.95, 0.95),
  });
  draw("Désignation", colX.name + 4, y + 4, 9, bold);
  draw("Qté", colX.qty, y + 4, 9, bold);
  draw("PU TTC", colX.unit, y + 4, 9, bold);
  draw("Total TTC", colX.total, y + 4, 9, bold);
  y -= 12;

  for (const it of data.items) {
    y -= 16;
    // Truncate name
    const name = it.product_name.length > 55 ? it.product_name.slice(0, 52) + "…" : it.product_name;
    draw(name, colX.name + 4, y, 10);
    draw(String(it.quantity), colX.qty, y, 10);
    draw(formatMoney(it.unit_price_cents, data.currency), colX.unit, y, 10);
    draw(
      formatMoney(it.unit_price_cents * it.quantity, data.currency),
      colX.total,
      y,
      10,
    );
    page.drawLine({
      start: { x: marginX, y: y - 4 },
      end: { x: width - marginX, y: y - 4 },
      thickness: 0.3,
      color: line,
    });
  }

  // Totaux
  y -= 30;
  const totalsX = width - marginX - 220;
  const totalsValX = width - marginX - 70;
  draw("Total HT", totalsX, y, 10);
  draw(formatMoney(data.subtotal_cents, data.currency), totalsValX, y, 10);
  y -= 14;
  draw(`TVA (${data.tax_rate.toFixed(2).replace(".", ",")} %)`, totalsX, y, 10);
  draw(formatMoney(data.tax_cents, data.currency), totalsValX, y, 10);
  y -= 14;
  page.drawLine({
    start: { x: totalsX, y: y + 8 },
    end: { x: width - marginX, y: y + 8 },
    thickness: 0.5,
    color: line,
  });
  draw("Total TTC", totalsX, y - 4, 12, bold);
  draw(formatMoney(data.total_cents, data.currency), totalsValX, y - 4, 12, bold);

  // Mentions légales bas de page
  const footerY = 60;
  draw(
    "TVA acquittée selon les débits. Pas d'escompte pour paiement anticipé.",
    marginX,
    footerY + 14,
    8,
    font,
    gray,
  );
  draw(
    `En cas de retard de paiement, indemnité forfaitaire de 40 € (art. L441-10 C. com.).`,
    marginX,
    footerY,
    8,
    font,
    gray,
  );
  draw(
    `${INVOICE_SELLER.company} · SIRET ${INVOICE_SELLER.siret} · TVA ${INVOICE_SELLER.vat_number}`,
    marginX,
    footerY - 14,
    8,
    font,
    gray,
  );

  return await doc.save();
}
